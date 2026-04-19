/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const { randomBytes } = require('crypto');

const { app, BrowserWindow, ipcMain } = require('electron');
const pino = require('pino');

const HOST = '127.0.0.1';
const DEFAULT_ACTIVE_PORTFOLIO_ID = 'desktop';
const IPC_CHANNELS = Object.freeze({
  LIST_PORTFOLIOS: 'portfolio-desktop:list-portfolios',
  SETUP_PIN: 'portfolio-desktop:setup-pin',
  UNLOCK_SESSION: 'portfolio-desktop:unlock-session',
});
const rootLogger = pino({ base: { module: 'electron' } });
const isSmokeTest =
  typeof process.env.ELECTRON_SMOKE_TEST === 'string' &&
  process.env.ELECTRON_SMOKE_TEST.trim().length > 0;

let desktopModulesPromise = null;

function createSessionToken() {
  return randomBytes(32).toString('hex');
}

function resolveStaticDir() {
  return path.resolve(__dirname, '../dist');
}

function resolveRendererUrl(baseUrl) {
  const startUrl =
    typeof process.env.ELECTRON_START_URL === 'string' ? process.env.ELECTRON_START_URL.trim() : '';
  if (startUrl) {
    return startUrl;
  }
  return baseUrl;
}

function resolveRendererOrigin(rendererUrl) {
  try {
    return new URL(rendererUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Inline HTML shown while the server and database are initialising.
 * Deliberately minimal — no external resources, matches the app background colour.
 */
function buildLoadingHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Portfolio Manager</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;background:#0f172a;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif}
.wrap{display:flex;flex-direction:column;align-items:center;gap:20px}
.spinner{width:40px;height:40px;border:3px solid #1e293b;border-top-color:#38bdf8;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.label{color:#64748b;font-size:14px;letter-spacing:.03em}
</style>
</head>
<body>
<div class="wrap">
  <div class="spinner"></div>
  <span class="label">Starting…</span>
</div>
</body>
</html>`;
}

function createWindow({ rendererUrl }) {
  const browserWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments:
        typeof process.env.PORTFOLIO_DESKTOP_RUNTIME_CONFIG_ARG === 'string' &&
        process.env.PORTFOLIO_DESKTOP_RUNTIME_CONFIG_ARG.trim().length > 0
          ? [process.env.PORTFOLIO_DESKTOP_RUNTIME_CONFIG_ARG]
          : [],
      preload: path.resolve(__dirname, './preload.cjs'),
    },
  });
  if (!isSmokeTest) {
    browserWindow.once('ready-to-show', () => {
      browserWindow.show();
    });
  }
  void browserWindow.loadURL(rendererUrl);
  return browserWindow;
}

/**
 * Creates the main BrowserWindow and immediately shows a loading screen.
 * The preload script is attached from the start; when the real app URL is
 * later loaded via loadURL() the preload re-runs and reads __APP_CONFIG__
 * from process.env[DESKTOP_RUNTIME_CONFIG_ENV] (set before loadURL).
 */
function createLoadingWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // additionalArguments intentionally omitted — runtime config not
      // available yet.  The real config is injected via process.env before
      // loadURL() is called with the final renderer URL.
      preload: path.resolve(__dirname, './preload.cjs'),
    },
  });
  const loadingHtml = buildLoadingHtml();
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);
  return win;
}

async function loadDesktopModules() {
  if (!desktopModulesPromise) {
    desktopModulesPromise = Promise.all([
      import('./runtimeConfig.js'),
      import('../server/runtime/startServer.js'),
      import('../server/migrations/index.js'),
      import('../server/data/portfolioState.js'),
      import('../server/auth/localPinAuth.js'),
    ]).then(
      ([
        runtimeConfigModule,
        serverRuntimeModule,
        migrationsModule,
        portfolioStateModule,
        localPinAuthModule,
      ]) => ({
        ...runtimeConfigModule,
        ...serverRuntimeModule,
        ...migrationsModule,
        ...portfolioStateModule,
        ...localPinAuthModule,
      })
    );
  }
  return desktopModulesPromise;
}

function normalizeDesktopBridgeError(error, fallbackCode = 'DESKTOP_SESSION_ERROR') {
  return {
    code:
      typeof error?.code === 'string' && error.code.trim().length > 0
        ? error.code.trim()
        : fallbackCode,
    message:
      typeof error?.message === 'string' && error.message.trim().length > 0
        ? error.message.trim()
        : 'Desktop session request failed.',
  };
}

function sortPortfolioEntries(entries, preferredId) {
  return [...entries].sort((left, right) => {
    if (left.id === preferredId) {
      return -1;
    }
    if (right.id === preferredId) {
      return 1;
    }
    return left.id.localeCompare(right.id);
  });
}

function registerDesktopSessionHandlers({
  storage,
  buildDesktopRuntimeConfig,
  apiBaseUrl,
  sessionToken,
  sessionAuthHeader,
  jobNightlyHourUtc,
  preferredPortfolioId,
  listPortfolioStates,
  hasPin,
  setPin,
  verifyPin,
}) {
  const listKnownPortfolios = async () => {
    const states = await listPortfolioStates(storage);
    const ids = new Set(
      states.map((row) => (typeof row?.id === 'string' ? row.id.trim() : '')).filter(Boolean)
    );
    ids.add(preferredPortfolioId);
    const entries = await Promise.all(
      Array.from(ids).map(async (id) => ({
        id,
        hasPin: await hasPin(storage, id),
      }))
    );
    const portfolios = sortPortfolioEntries(entries, preferredPortfolioId);
    return {
      portfolios,
      defaultPortfolioId:
        portfolios.find((entry) => entry.id === preferredPortfolioId)?.id ??
        portfolios[0]?.id ??
        preferredPortfolioId,
    };
  };

  const createUnlockedSession = (portfolioId) => ({
    portfolioId,
    runtimeConfig: buildDesktopRuntimeConfig({
      apiBaseUrl,
      sessionToken,
      activePortfolioId: portfolioId,
      sessionAuthHeader,
      jobNightlyActive: false,
      jobNightlyHourUtc,
    }),
  });

  const resolvePortfolioId = async (rawPortfolioId) => {
    const requestedId = typeof rawPortfolioId === 'string' ? rawPortfolioId.trim() : '';
    if (!requestedId) {
      const error = new Error('Select a portfolio before continuing.');
      error.code = 'PORTFOLIO_REQUIRED';
      throw error;
    }
    const { portfolios } = await listKnownPortfolios();
    if (!portfolios.some((entry) => entry.id === requestedId)) {
      const error = new Error('Selected portfolio is not provisioned yet.');
      error.code = 'PORTFOLIO_NOT_FOUND';
      throw error;
    }
    return requestedId;
  };

  ipcMain.removeHandler(IPC_CHANNELS.LIST_PORTFOLIOS);
  ipcMain.handle(IPC_CHANNELS.LIST_PORTFOLIOS, async () => {
    try {
      return {
        ok: true,
        data: await listKnownPortfolios(),
      };
    } catch (error) {
      return {
        ok: false,
        error: normalizeDesktopBridgeError(error),
      };
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.SETUP_PIN);
  ipcMain.handle(IPC_CHANNELS.SETUP_PIN, async (_event, payload) => {
    try {
      const portfolioId = await resolvePortfolioId(payload?.portfolioId);
      if (await hasPin(storage, portfolioId)) {
        const error = new Error('A PIN already exists for this portfolio.');
        error.code = 'PIN_ALREADY_SET';
        throw error;
      }
      await setPin(storage, portfolioId, payload?.pin);
      return {
        ok: true,
        data: createUnlockedSession(portfolioId),
      };
    } catch (error) {
      return {
        ok: false,
        error: normalizeDesktopBridgeError(error),
      };
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.UNLOCK_SESSION);
  ipcMain.handle(IPC_CHANNELS.UNLOCK_SESSION, async (_event, payload) => {
    try {
      const portfolioId = await resolvePortfolioId(payload?.portfolioId);
      const isValid = await verifyPin(storage, portfolioId, payload?.pin);
      if (!isValid) {
        const error = new Error('The PIN does not match the selected portfolio.');
        error.code = 'INVALID_PIN';
        throw error;
      }
      return {
        ok: true,
        data: createUnlockedSession(portfolioId),
      };
    } catch (error) {
      return {
        ok: false,
        error: normalizeDesktopBridgeError(error),
      };
    }
  });
}

async function runSmokeProbe(mainWindow) {
  const probe = await mainWindow.webContents.executeJavaScript(`
    (async () => {
      const config = window.__APP_CONFIG__ ?? {};
      const desktop = window.portfolioDesktop ?? null;
      try {
        let unlockedConfig = config;
        let smokePortfolioId = "desktop";
        if (desktop && desktop.isAvailable) {
          const listing = await desktop.listPortfolios();
          const selected =
            Array.isArray(listing?.portfolios) && listing.portfolios.length > 0
              ? listing.portfolios[0]
              : null;
          smokePortfolioId = selected?.id || listing?.defaultPortfolioId || "desktop";
        }
        const headerName = unlockedConfig.SESSION_AUTH_HEADER || config.SESSION_AUTH_HEADER || "x-session-token";
        const url = \`\${unlockedConfig.API_BASE_URL || config.API_BASE_URL}/api/v1/portfolio/\${smokePortfolioId}\`;
        const response = await fetch(
          url,
          {
            headers: {
              [headerName]: unlockedConfig.API_SESSION_TOKEN || config.API_SESSION_TOKEN || "",
              Accept: "application/json",
            },
          },
        );
        let body = null;
        try {
          body = await response.json();
        } catch (_error) {
          body = null;
        }
        return {
          locationHref: window.location.href,
          hasAppConfig: typeof window.__APP_CONFIG__ !== "undefined",
          hasDesktopBridge: Boolean(desktop && desktop.isAvailable),
          appConfigKeys: Object.keys(config),
          apiBaseUrl: unlockedConfig.API_BASE_URL || config.API_BASE_URL,
          sessionAuthHeader: headerName,
          hasSessionToken: Boolean(unlockedConfig.API_SESSION_TOKEN || config.API_SESSION_TOKEN),
          portfolioId: smokePortfolioId,
          status: response.status,
          transactionCount: Array.isArray(body?.transactions) ? body.transactions.length : null,
        };
      } catch (error) {
        return {
          locationHref: window.location.href,
          hasAppConfig: typeof window.__APP_CONFIG__ !== "undefined",
          hasDesktopBridge: Boolean(desktop && desktop.isAvailable),
          appConfigKeys: Object.keys(config),
          apiBaseUrl: config.API_BASE_URL ?? null,
          hasSessionToken: Boolean(config.API_SESSION_TOKEN),
          errorName: error?.name ?? null,
          errorMessage: error?.message ?? String(error),
        };
      }
    })();
  `);
  process.stdout.write(`${JSON.stringify({ smoke: 'electron', ...probe })}\n`);
}

async function bootstrapDesktopShell() {
  const {
    buildDesktopRuntimeConfigArg,
    buildDesktopRuntimeConfig,
    buildServerConfig,
    DEFAULT_SESSION_AUTH_HEADER,
    DESKTOP_RUNTIME_CONFIG_ENV,
    encodeDesktopRuntimeConfig,
    hasPin,
    listPortfolioStates,
    runMigrations,
    setPin,
    startServer,
    verifyPin,
  } = await loadDesktopModules();
  const sessionToken = createSessionToken();
  const sessionAuthHeader = DEFAULT_SESSION_AUTH_HEADER;
  const startUrl =
    typeof process.env.ELECTRON_START_URL === 'string' ? process.env.ELECTRON_START_URL.trim() : '';
  const rendererOrigin = startUrl ? resolveRendererOrigin(startUrl) : null;
  const desktopConfig = buildServerConfig({
    env: process.env,
    auth: {
      mode: 'session',
      sessionToken,
      headerName: sessionAuthHeader,
    },
    cors: rendererOrigin
      ? {
          allowedOrigins: [rendererOrigin],
        }
      : null,
  });
  const preferredPortfolioId =
    typeof process.env.PORTFOLIO_ACTIVE_ID === 'string' &&
    process.env.PORTFOLIO_ACTIVE_ID.trim().length > 0
      ? process.env.PORTFOLIO_ACTIVE_ID.trim()
      : DEFAULT_ACTIVE_PORTFOLIO_ID;

  // In normal (non-smoke) mode: show a loading screen immediately so the user
  // sees the window in <200ms while migrations + server run in the background.
  // In smoke-test mode: keep the original behaviour (no window until ready).
  const mainWindow = isSmokeTest ? null : createLoadingWindow();

  const storage = await runMigrations({
    dataDir: desktopConfig.dataDir,
    logger: rootLogger.child({ module: 'desktop-auth' }),
  });

  const isDevShell = startUrl.length > 0;
  const staticDir = isDevShell ? null : resolveStaticDir();
  const embeddedServer = await startServer({
    host: HOST,
    port: 0,
    logger: rootLogger.child({ module: 'server' }),
    config: desktopConfig,
    startScheduler: false,
    staticDir,
    spaFallback: Boolean(staticDir),
  });
  const runtimeConfig = buildDesktopRuntimeConfig({
    apiBaseUrl: embeddedServer.baseUrl,
    sessionAuthHeader,
    jobNightlyActive: false,
    jobNightlyHourUtc: desktopConfig?.jobs?.nightlyHour,
  });
  registerDesktopSessionHandlers({
    storage,
    buildDesktopRuntimeConfig,
    apiBaseUrl: embeddedServer.baseUrl,
    sessionToken,
    sessionAuthHeader,
    jobNightlyHourUtc: desktopConfig?.jobs?.nightlyHour,
    preferredPortfolioId,
    listPortfolioStates,
    hasPin,
    setPin,
    verifyPin,
  });
  const encodedRuntimeConfig = encodeDesktopRuntimeConfig(runtimeConfig);
  // Set env vars BEFORE loadURL so the preload can read them when it re-runs.
  process.env[DESKTOP_RUNTIME_CONFIG_ENV] = encodedRuntimeConfig;
  process.env.PORTFOLIO_DESKTOP_RUNTIME_CONFIG_ARG = buildDesktopRuntimeConfigArg(runtimeConfig);

  const rendererUrl = startUrl || resolveRendererUrl(embeddedServer.baseUrl);

  // For normal mode: navigate the existing loading window to the real app URL.
  // The preload re-runs and picks up __APP_CONFIG__ from process.env.
  // For smoke-test mode: create the window the original way (show: false, preload args set).
  const activeWindow = mainWindow ?? createWindow({ rendererUrl });
  if (mainWindow) {
    void mainWindow.loadURL(rendererUrl);
  }

  let shutdownPromise = null;
  const shutdown = async () => {
    if (shutdownPromise) {
      return shutdownPromise;
    }
    shutdownPromise = (async () => {
      try {
        await embeddedServer.close();
      } catch (error) {
        if (error?.message !== 'Server is not running.') {
          rootLogger.warn({ error: error.message }, 'embedded_server_close_failed');
        }
      }
    })();
    try {
      await shutdownPromise;
    } finally {
      shutdownPromise = null;
    }
  };

  app.on('before-quit', () => {
    void shutdown();
  });
  activeWindow.on('closed', () => {
    ipcMain.removeHandler(IPC_CHANNELS.LIST_PORTFOLIOS);
    ipcMain.removeHandler(IPC_CHANNELS.SETUP_PIN);
    ipcMain.removeHandler(IPC_CHANNELS.UNLOCK_SESSION);
    delete process.env[DESKTOP_RUNTIME_CONFIG_ENV];
    delete process.env.PORTFOLIO_DESKTOP_RUNTIME_CONFIG_ARG;
  });
  if (isSmokeTest) {
    activeWindow.webContents.once('did-finish-load', async () => {
      try {
        await runSmokeProbe(activeWindow);
      } finally {
        await shutdown();
        app.quit();
      }
    });
  }
}

async function main() {
  await app.whenReady();
  await bootstrapDesktopShell();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrapDesktopShell();
    }
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
