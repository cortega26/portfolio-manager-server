// server/runtime/startServer.ts
// Phase 4 cutover: production entry point now uses Fastify instead of Express.
// All public exports preserved for backward-compat with electron/main.cjs and tests.
import path from 'path';
import type { AddressInfo } from 'net';

import pino from 'pino';
import type { Logger } from 'pino';
import fetch from 'node-fetch';

import { createFastifyApp } from '../app.fastify.js';
import type { HistoricalPriceLoader } from '../routes/prices.js';
import { loadConfig } from '../config.js';
import type { ServerConfig } from '../types/config.js';
import { scheduleNightlyClose } from '../jobs/scheduler.js';
import {
  createConfiguredPriceProvider,
  createConfiguredLatestQuoteProvider,
} from '../data/priceProviderFactory.js';
import { createHistoricalPriceLoader } from '../services/historicalPriceLoader.js';
import JsonTableStorage from '../data/storage.js';
import { getMarketClock } from '../../src/utils/marketHours.js';

// Re-exported so callers that previously imported from middleware/sessionAuth.js
// can get it here after that file is removed in Phase 4.
export const DEFAULT_SESSION_AUTH_HEADER = 'x-session-token';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalizePort(
  value: string | number | null | undefined,
  fallback = 3000,
): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function normalizeStaticDir(staticDir: unknown): string | null {
  if (typeof staticDir !== 'string') {
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
}: {
  env?: NodeJS.ProcessEnv;
  auth?: Record<string, unknown> | null;
  cors?: Record<string, unknown> | null;
} = {}): ServerConfig {
  const baseConfig = loadConfig(env);
  return {
    ...baseConfig,
    cors: {
      ...baseConfig.cors,
      ...(cors ?? {}),
    },
    security: {
      ...baseConfig.security,
      ...(auth
        ? {
            auth: {
              ...(baseConfig.security?.auth ?? { sessionToken: '', headerName: DEFAULT_SESSION_AUTH_HEADER }),
              ...auth,
            },
          }
        : {}),
    },
  } as ServerConfig;
}

export function getBaseUrl({
  address,
  host,
}: {
  address: AddressInfo | string | null;
  host?: string;
}): string {
  if (!address || typeof address === 'string') {
    const normalizedHost = host ?? '127.0.0.1';
    return `http://${normalizedHost}`;
  }
  const resolvedHost =
    host && host !== '0.0.0.0' && host !== '::'
      ? host
      : address.address === '::' || address.address === '0.0.0.0'
        ? '127.0.0.1'
        : address.address;
  return `http://${resolvedHost}:${address.port}`;
}

export function resolveSchedulerEnabled(
  startScheduler: boolean | undefined,
  config: { jobs?: { nightlyEnabled?: boolean } } | null | undefined,
): boolean {
  if (typeof startScheduler === 'boolean') {
    return startScheduler;
  }
  return config?.jobs?.nightlyEnabled !== false;
}

// Recursively merges source into target. Arrays and primitives in source replace target.
// Used to fill in defaults when a partial ServerConfig is provided to startServer.
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

// ── Server factory ────────────────────────────────────────────────────────────

export async function startServer({
  env = process.env,
  host,
  port,
  logger = null,
  config = null,
  startScheduler,
  staticDir = null,
  spaFallback = false,
}: {
  env?: NodeJS.ProcessEnv;
  host?: string;
  port?: number;
  logger?: Logger | null;
  config?: ServerConfig | null;
  startScheduler?: boolean;
  staticDir?: string | null;
  spaFallback?: boolean;
} = {}) {
  const resolvedPort = port ?? normalizePort(env['PORT'], 3000);
  const rootLogger = logger ?? pino({ base: { module: 'server' } });
  const appLogger =
    typeof rootLogger.child === 'function'
      ? rootLogger.child({ module: 'http' })
      : rootLogger;
  const schedulerLogger =
    typeof rootLogger.child === 'function'
      ? rootLogger.child({ module: 'scheduler' })
      : rootLogger;

  const defaultConfig = loadConfig(env);
  const resolvedConfig: ServerConfig = config
    ? (deepMerge(
        defaultConfig as unknown as Record<string, unknown>,
        config as unknown as Record<string, unknown>,
      ) as unknown as ServerConfig)
    : defaultConfig;
  const resolvedStaticDir = normalizeStaticDir(staticDir);
  const dataDir = path.resolve(resolvedConfig.dataDir);

  // ── Build price loader ────────────────────────────────────────────────────
  const fetchTimeoutMs = resolvedConfig.fetchTimeoutMs ?? 5000;

  const priceProvider = (createConfiguredPriceProvider as (opts: Record<string, unknown>) => unknown)({
    config: resolvedConfig,
    fetchImpl: fetch,
    timeoutMs: fetchTimeoutMs,
    logger: appLogger,
  });

  const latestQuoteProvider = (createConfiguredLatestQuoteProvider as (opts: Record<string, unknown>) => unknown)({
    config: resolvedConfig,
    fetchImpl: fetch,
    timeoutMs: fetchTimeoutMs,
    logger: appLogger,
  });

  // Lazy persisted-close lookup — reads the 'prices' table as a last-resort
  // fallback when live providers are unavailable (mirrors app.js behavior).
  let storageInstance: InstanceType<typeof JsonTableStorage> | null = null;
  const persistedLatestCloseLookup = async (symbol: string): Promise<Record<string, unknown> | null> => {
    if (!storageInstance) {
      storageInstance = new JsonTableStorage({ dataDir, logger: appLogger });
    }
    try {
      const rows = (await (storageInstance as unknown as { readTable(t: string): Promise<unknown[]> }).readTable('prices')) as Array<Record<string, unknown>>;
      if (!Array.isArray(rows)) return null;
      const normalizedSymbol = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
      const matching = rows
        .filter(
          (row) =>
            typeof row['ticker'] === 'string' &&
            (row['ticker'] as string).toUpperCase() === normalizedSymbol,
        )
        .sort((a, b) => String(a['date']).localeCompare(String(b['date'])));
      return (matching[matching.length - 1] as Record<string, unknown>) ?? null;
    } catch {
      return null;
    }
  };

  const historicalPriceLoader = (createHistoricalPriceLoader as (opts: Record<string, unknown>) => unknown)({
    priceProvider,
    latestQuoteProvider,
    persistedLatestCloseLookup,
    logger: appLogger,
    marketClock: getMarketClock,
  });

  // ── Create Fastify app ────────────────────────────────────────────────────
  const app = await createFastifyApp({
    dataDir,
    logger: appLogger,
    config: resolvedConfig,
    historicalPriceLoader: historicalPriceLoader as HistoricalPriceLoader,
    staticDir: resolvedStaticDir ?? undefined,
    spaFallback: Boolean(resolvedStaticDir && spaFallback),
    marketClock: getMarketClock,
  });

  if (resolveSchedulerEnabled(startScheduler, resolvedConfig)) {
    scheduleNightlyClose({ config: resolvedConfig, logger: schedulerLogger });
  }

  await app.listen({ port: resolvedPort, host });

  const address = app.server.address() as AddressInfo | string | null;
  const baseUrl = getBaseUrl({ address, host });

  rootLogger.info(
    {
      event: 'server_listening',
      port: typeof address === 'object' && address ? address.port : resolvedPort,
      host:
        host ??
        (typeof address === 'object' && address ? address.address : undefined),
      staticDir: resolvedStaticDir,
      spaFallback: Boolean(resolvedStaticDir && spaFallback),
    },
    'server_listening',
  );

  return {
    app,
    config: resolvedConfig,
    baseUrl,
    host:
      host ??
      (typeof address === 'object' && address ? address.address : undefined),
    port:
      typeof address === 'object' && address ? address.port : resolvedPort,
    async close() {
      await app.close();
    },
  };
}

export default startServer;
