import path from "path";
import pino from "pino";

import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { scheduleNightlyClose } from "../jobs/scheduler.js";

function normalizePort(value, fallback = 3000) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function normalizeStaticDir(staticDir) {
  if (typeof staticDir !== "string") {
    return null;
  }
  const trimmed = staticDir.trim();
  if (!trimmed) {
    return null;
  }
  return path.resolve(trimmed);
}

export function buildServerConfig({
  env = process.env,
  auth = null,
  cors = null,
} = {}) {
  const baseConfig = loadConfig(env);
  return {
    ...baseConfig,
    cors: {
      ...(baseConfig.cors ?? {}),
      ...(cors ?? {}),
    },
    security: {
      ...(baseConfig.security ?? {}),
      ...(auth
        ? {
            auth: {
              ...(baseConfig.security?.auth ?? {}),
              ...auth,
            },
          }
        : {}),
    },
  };
}

export function listen(serverApp, { port, host } = {}) {
  return new Promise((resolve, reject) => {
    const server = serverApp.listen(port, host, () => resolve(server));
    server.on("error", reject);
  });
}

export function getBaseUrl({ address, host }) {
  if (!address || typeof address === "string") {
    const normalizedHost = host || "127.0.0.1";
    return `http://${normalizedHost}`;
  }
  const resolvedHost =
    host && host !== "0.0.0.0" && host !== "::"
      ? host
      : address.address === "::" || address.address === "0.0.0.0"
        ? "127.0.0.1"
        : address.address;
  return `http://${resolvedHost}:${address.port}`;
}

export function resolveSchedulerEnabled(startScheduler, config) {
  if (typeof startScheduler === "boolean") {
    return startScheduler;
  }
  return config?.jobs?.nightlyEnabled !== false;
}

export async function startServer({
  env = process.env,
  host,
  port = normalizePort(env.PORT, 3000),
  logger = null,
  config = null,
  startScheduler,
  staticDir = null,
  spaFallback = false,
} = {}) {
  const rootLogger = logger ?? pino({ base: { module: "server" } });
  const appLogger =
    typeof rootLogger.child === "function"
      ? rootLogger.child({ module: "http" })
      : rootLogger;
  const schedulerLogger =
    typeof rootLogger.child === "function"
      ? rootLogger.child({ module: "scheduler" })
      : rootLogger;
  const resolvedConfig = config ?? loadConfig(env);
  const resolvedStaticDir = normalizeStaticDir(staticDir);
  const app = createApp({
    config: resolvedConfig,
    logger: appLogger,
    dataDir: resolvedConfig.dataDir,
    staticDir: resolvedStaticDir,
    spaFallback,
  });

  if (resolveSchedulerEnabled(startScheduler, resolvedConfig)) {
    scheduleNightlyClose({ config: resolvedConfig, logger: schedulerLogger });
  }

  const server = await listen(app, { host, port });
  const address = server.address();
  const baseUrl = getBaseUrl({ address, host });

  rootLogger.info(
    {
      event: "server_listening",
      port: typeof address === "object" && address ? address.port : port,
      host: host ?? (typeof address === "object" && address ? address.address : undefined),
      apiVersions: ["v1", "legacy"],
      staticDir: resolvedStaticDir,
      spaFallback: Boolean(resolvedStaticDir && spaFallback),
    },
    "server_listening",
  );

  return {
    app,
    server,
    config: resolvedConfig,
    baseUrl,
    host: host ?? (typeof address === "object" && address ? address.address : undefined),
    port: typeof address === "object" && address ? address.port : port,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

export default startServer;
