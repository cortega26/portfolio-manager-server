/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

const DESKTOP_RUNTIME_CONFIG_ARG_PREFIX = "--portfolio-desktop-runtime-config=";
const DESKTOP_RUNTIME_CONFIG_ENV = "PORTFOLIO_DESKTOP_RUNTIME_CONFIG";
const IPC_CHANNELS = Object.freeze({
  LIST_PORTFOLIOS: "portfolio-desktop:list-portfolios",
  SETUP_PIN: "portfolio-desktop:setup-pin",
  UNLOCK_SESSION: "portfolio-desktop:unlock-session",
});

function readDesktopRuntimeConfig() {
  const encodedConfig =
    readDesktopRuntimeConfigArg(process.argv) ?? process.env[DESKTOP_RUNTIME_CONFIG_ENV];
  if (typeof encodedConfig !== "string" || encodedConfig.trim().length === 0) {
    return Object.freeze({});
  }
  try {
    const raw = Buffer.from(encodedConfig, "base64").toString("utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return Object.freeze({});
    }
    return Object.freeze(parsed);
  } catch {
    return Object.freeze({});
  }
}

function readDesktopRuntimeConfigArg(argv) {
  if (!Array.isArray(argv)) {
    return undefined;
  }
  const serializedConfig = argv.find(
    (entry) =>
      typeof entry === "string" && entry.startsWith(DESKTOP_RUNTIME_CONFIG_ARG_PREFIX),
  );
  if (!serializedConfig) {
    return undefined;
  }
  return serializedConfig.slice(DESKTOP_RUNTIME_CONFIG_ARG_PREFIX.length);
}

async function invokeDesktopChannel(channel, payload) {
  const response = await ipcRenderer.invoke(channel, payload);
  if (response?.ok) {
    return response.data;
  }
  const error = new Error(
    typeof response?.error?.message === "string" && response.error.message.trim().length > 0
      ? response.error.message
      : "Desktop session request failed.",
  );
  if (typeof response?.error?.code === "string" && response.error.code.trim().length > 0) {
    error.code = response.error.code.trim();
  }
  throw error;
}

contextBridge.exposeInMainWorld("__APP_CONFIG__", readDesktopRuntimeConfig());
contextBridge.exposeInMainWorld("portfolioDesktop", Object.freeze({
  isAvailable: true,
  listPortfolios() {
    return invokeDesktopChannel(IPC_CHANNELS.LIST_PORTFOLIOS);
  },
  setupPin(payload) {
    return invokeDesktopChannel(IPC_CHANNELS.SETUP_PIN, payload);
  },
  unlockSession(payload) {
    return invokeDesktopChannel(IPC_CHANNELS.UNLOCK_SESSION, payload);
  },
}));
