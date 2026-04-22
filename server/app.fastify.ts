// server/app.fastify.ts
// Canonical Fastify app factory used by the runtime entrypoint.
// Activated in production during Phase 4 (Cutover).
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import { serializerCompiler, validatorCompiler, hasZodFastifySchemaValidationErrors, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { FastifyError, FastifyBaseLogger } from 'fastify';
import type { Logger } from 'pino';

import requestContextPlugin from './plugins/requestContext.js';
import sessionAuthPlugin from './plugins/sessionAuth.js';
import etagPlugin from './plugins/etagHandler.js';

import pricesRoutes from './routes/prices.js';
import benchmarksRoutes from './routes/benchmarks.js';
import portfolioRoutes from './routes/portfolio.js';
import importRoutes from './routes/import.js';
import signalsRoutes from './routes/signals.js';
import monitoringRoutes from './routes/monitoring.js';
import cacheRoutes from './routes/cache.js';
import analyticsRoutes from './routes/analytics.js';

import type { ServerConfig } from './types/config.js';
import type { HistoricalPriceLoader } from './routes/prices.js';
import type { StorageAdapter } from './routes/portfolio.js';
import { runMigrations } from './migrations/index.js';
import { configurePriceCache } from './cache/priceCache.js';

// ── Public types ─────────────────────────────────────────────────────────────

export interface AppOptions {
  dataDir: string;
  logger: Logger;
  config: ServerConfig;
  /**
   * Pre-built historical price loader.
   * Caller constructs it (via createHistoricalPriceLoader) and injects it here.
   * This keeps the factory free of provider-factory type complexity and makes testing clean.
   */
  historicalPriceLoader: HistoricalPriceLoader;
  staticDir?: string;
  spaFallback?: boolean;
  marketClock?: () => {
    isOpen: boolean;
    isBeforeOpen?: boolean;
    lastTradingDate?: string | null;
    nextTradingDate?: string | null;
  };
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createFastifyApp(options: AppOptions) {
  const { dataDir, config, historicalPriceLoader } = options;
  // Wrap the external logger in a child that applies the app's HTTP redact config.
  // This ensures req.headers["x-session-token"] is censored to "[REDACTED]" in all
  // request log lines regardless of what censor the caller's pino instance uses.
  const logger = options.logger.child({}, {
    redact: {
      paths: ['req.headers["x-session-token"]', 'req.headers["x-api-key"]'],
      censor: '[REDACTED]',
    },
  } as Record<string, unknown>);

  // Initialise (and reset) the module-level price cache with the app's config.
  const priceCacheConfig = config?.cache?.price ?? {};
  const priceCacheTtl = (priceCacheConfig as unknown as Record<string, unknown>).ttlSeconds as number | undefined;
  const priceCacheCheckPeriod = (priceCacheConfig as unknown as Record<string, unknown>).checkPeriodSeconds as number | undefined;
  configurePriceCache({
    ...(priceCacheTtl !== undefined ? { ttlSeconds: priceCacheTtl } : {}),
    ...(priceCacheCheckPeriod !== undefined ? { checkPeriodSeconds: priceCacheCheckPeriod } : {}),
  });

  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    disableRequestLogging: true,
    // Override Fastify's child logger factory to include req.headers in req serializer
    childLoggerFactory(parentLogger, bindings, opts) {
      const serializers = {
        req(req: Record<string, unknown>) {
          return {
            method: req['method'],
            url: req['url'],
            headers: (req['headers'] as Record<string, string>) ?? undefined,
            remoteAddress: req['ip'] ?? req['remoteAddress'],
            remotePort: (req['socket'] as Record<string, unknown>)?.['remotePort'],
          };
        },
        ...(opts.serializers as Record<string, unknown>),
      };
      return (parentLogger as { child: (b: unknown, o: unknown) => FastifyBaseLogger }).child(bindings, { ...opts, serializers });
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Custom request logging hooks (replaces Fastify's built-in request logging
  // so we can control message names to match the app's log schema).
  app.addHook('onRequest', (request, _reply, done) => {
    const raw = request.raw;
    request.log.info({
      req: { method: raw.method, url: raw.url, headers: raw.headers, remoteAddress: request.ip },
    }, 'request_received');
    done();
  });
  app.addHook('onResponse', (request, reply, done) => {
    const raw = request.raw;
    request.log.info({
      req: { method: raw.method, url: raw.url, headers: raw.headers, remoteAddress: request.ip },
      res: { statusCode: reply.statusCode },
      responseTime: reply.elapsedTime,
    }, 'request_complete');
    done();
  });
  app.addHook('onError', (request, reply, error, done) => {
    request.log.error({
      req: { method: request.raw.method, url: request.raw.url, headers: request.raw.headers },
      res: { statusCode: reply.statusCode },
      err: error,
    }, 'request_error');
    done();
  });

  // Zod provider: validates requests AND serializes responses with full TS types
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Format validation errors in the app's standard envelope
  app.setSchemaErrorFormatter((errors, dataVar) => {
    const details = (errors as Array<{ instancePath?: string; message?: string }>).map((v) => {
      const path = (v.instancePath ?? '').split('/').filter(Boolean);
      // For params validation, strip the top-level field name from the path
      // so callers can't infer which param name was rejected (matches Express behavior).
      const normalizedPath = dataVar === 'params' ? path.slice(1) : path;
      return {
        path: normalizedPath,
        message: v.message ?? 'Invalid value',
      };
    });
    const err = new Error(`Validation failed on ${dataVar}`) as Error & {
      statusCode: number;
      code: string;
      validation: typeof errors;
      validationContext: string;
    };
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    // Encode details in message for recovery by onSend hook
    (err as unknown as Record<string, unknown>)['message'] =
      `VALIDATION_ERROR:${JSON.stringify(details)}`;
    return err;
  });

  // Reformat validation error responses into the app's standard envelope.
  // This hook runs after the error serializer, so we can intercept the JSON.
  const FASTIFY_CODE_REMAP: Record<string, string> = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    FST_ERR_CTP_INVALID_JSON: 'INVALID_JSON',
    FST_ERR_CTP_INVALID_JSON_BODY: 'INVALID_JSON',
    FST_ERR_CTP_BODY_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  };
  app.addHook('onSend', async (_request, reply, payload) => {
    if (typeof payload === 'string') {
      try {
        const body = JSON.parse(payload) as Record<string, unknown>;
        const rawCode = typeof body.code === 'string' ? body.code : '';
        if (rawCode === 'VALIDATION_ERROR' && typeof body.message === 'string' && body.message.startsWith('VALIDATION_ERROR:')) {
          const details = JSON.parse(body.message.slice('VALIDATION_ERROR:'.length)) as unknown[];
          return JSON.stringify({
            error: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details,
          });
        }
        if (rawCode in FASTIFY_CODE_REMAP && body.error !== FASTIFY_CODE_REMAP[rawCode]) {
          const remapped = FASTIFY_CODE_REMAP[rawCode];
          return JSON.stringify({ ...body, error: remapped });
        }
      } catch {
        // not JSON, pass through
      }
    }
    return payload;
  });

  // ── Global plugins ────────────────────────────────────────────────────────
  await app.register(requestContextPlugin);

  await app.register(compress, {
    threshold: 1024,
    encodings: ['gzip', 'deflate'],
  });

  await app.register(cors, {
    origin: config.cors.allowedOrigins,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  const sessionToken = config.security.auth?.sessionToken ?? process.env['PORTFOLIO_SESSION_TOKEN'] ?? '';
  const headerName = config.security.auth?.headerName ?? 'x-session-token';

  await app.register(sessionAuthPlugin, {
    sessionToken,
    headerName,
    devBypass:
      process.env['NODE_ENV'] === 'development' && sessionToken.length === 0,
    logger: {
      warn: (msg: string, meta?: Record<string, unknown>) => {
        logger.warn({ ...meta }, msg);
      },
    },
  });

  await app.register(etagPlugin);

  // ── Storage (lazy singleton, shared across all routes) ────────────────────
  let storagePromise: Promise<StorageAdapter> | null = null;
  const getStorage = (): Promise<StorageAdapter> => {
    if (!storagePromise) {
      storagePromise = runMigrations({ dataDir, logger }) as Promise<StorageAdapter>;
    }
    return storagePromise;
  };

  // ── Analytics response cache ──────────────────────────────────────────────
  // Simple in-memory cache for analytics route responses (mirrors Express responseCache).
  // Keyed by a string built from query params; flushed on portfolio save.
  const cacheTtlMs = (() => {
    const ttl = (config as unknown as { cache?: { ttlSeconds?: number } }).cache?.ttlSeconds;
    return typeof ttl === 'number' && ttl > 0 ? ttl * 1000 : 0;
  })();
  const analyticsResponseCache = new Map<string, { payload: unknown; expiresAt: number }>();
  const analyticsCache = {
    get(key: string): unknown | undefined {
      const entry = analyticsResponseCache.get(key);
      if (!entry) return undefined;
      if (cacheTtlMs > 0 && Date.now() > entry.expiresAt) {
        analyticsResponseCache.delete(key);
        return undefined;
      }
      return entry.payload;
    },
    set(key: string, payload: unknown): void {
      if (cacheTtlMs <= 0) return;
      analyticsResponseCache.set(key, { payload, expiresAt: Date.now() + cacheTtlMs });
    },
    flush(): void {
      analyticsResponseCache.clear();
    },
  };

  // ── Shared route context ──────────────────────────────────────────────────
  // Wrap historicalPriceLoader to persist latest closes to storage after each fetch.
  // This mirrors Express's persistHistoricalLatestClose() behavior.
  const wrappedPriceLoader: HistoricalPriceLoader = {
    async fetchSeries(symbol: string, opts?: Record<string, unknown>) {
      const result = await historicalPriceLoader.fetchSeries(symbol, opts);
      const resolution = result.resolution as { source?: string } | null | undefined;
      if (resolution?.source === 'historical') {
        const prices = Array.isArray(result.prices) ? result.prices : [];
        const latest = prices[prices.length - 1] as { date?: string; close?: number; adjClose?: number } | undefined;
        const date = typeof latest?.date === 'string' ? latest.date.trim() : '';
        const close = Number.isFinite(latest?.close) ? (latest?.close as number) : Number.isFinite(latest?.adjClose) ? (latest?.adjClose as number) : NaN;
        if (date && Number.isFinite(close) && close > 0) {
          try {
            const storage = await getStorage();
            await (storage as { ensureTable: (t: string, r: unknown[]) => Promise<void>; upsertRow: (t: string, r: unknown, k: string[]) => Promise<void> }).ensureTable('prices', []);
            await (storage as { upsertRow: (t: string, r: unknown, k: string[]) => Promise<void> }).upsertRow('prices', {
              ticker: symbol,
              date,
              adj_close: close,
              updated_at: new Date().toISOString(),
            }, ['ticker', 'date']);
          } catch (err) {
            logger.warn({ error: (err as Error).message, symbol }, 'persist_historical_latest_close_failed');
          }
        }
      }
      return result;
    },
  };

  const routeContext = {
    dataDir,
    config,
    ...(options.marketClock !== undefined ? { marketClock: options.marketClock } : {}),
    getStorage,
    historicalPriceLoader: wrappedPriceLoader,
    analyticsCache,
  };

  // ── Routes ────────────────────────────────────────────────────────────────
  for (const prefix of ['/api', '/api/v1'] as const) {
    await app.register(benchmarksRoutes, { prefix, ...routeContext });
    await app.register(cacheRoutes, { prefix, ...routeContext });
    await app.register(monitoringRoutes, { prefix, ...routeContext });
    await app.register(pricesRoutes, { prefix, ...routeContext });
    await app.register(portfolioRoutes, { prefix, ...routeContext });
    await app.register(signalsRoutes, { prefix, ...routeContext });
    await app.register(importRoutes, { prefix, ...routeContext });
    await app.register(analyticsRoutes, { prefix, ...routeContext });
  }

  // ── SPA Fallback ──────────────────────────────────────────────────────────
  if (options.spaFallback && options.staticDir) {
    const { default: fastifyStatic } = await import('@fastify/static');
    await app.register(fastifyStatic, {
      root: options.staticDir,
      prefix: '/',
    });

    const { default: spaFallback } = await import('./plugins/spaFallback.js');
    await app.register(spaFallback, { staticDir: options.staticDir });
  }

  // ── Error handler ─────────────────────────────────────────────────────────
  // Produces the same format the React frontend expects:
  // { error: "ERROR_CODE", message: "...", details?: [...] }
  type AppFastifyError = FastifyError & {
    statusCode?: number;
    code?: string;
    details?: unknown;
    expose?: boolean;
  };

  app.setErrorHandler((error: AppFastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const details = error.details;

    // Map Fastify internal error codes to app-level codes expected by tests / clients
    const FASTIFY_CODE_MAP: Record<string, string> = {
      FST_ERR_CTP_INVALID_JSON: 'INVALID_JSON',
      FST_ERR_CTP_INVALID_JSON_BODY: 'INVALID_JSON',
      FST_ERR_CTP_BODY_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
    };
    const rawCode = error.code ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    const code = FASTIFY_CODE_MAP[rawCode] ?? rawCode;

    // Fastify/Zod validation errors
    if (hasZodFastifySchemaValidationErrors(error) || error.validation || error.code === 'FST_ERR_VALIDATION') {
      const validationItems: Array<{ instancePath?: string; message?: string }> = error.validation ?? [];
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: validationItems.map((v) => ({
          path: v.instancePath?.split('/').filter(Boolean) ?? [],
          message: v.message ?? 'Invalid value',
        })),
      });
    }

    if (statusCode >= 500) {
      app.log.error({ err: error }, 'Internal server error');
    }

    const expose = statusCode < 500 || error.expose === true;
    const message = expose ? (error.message ?? 'Request could not be processed') : 'Unexpected server error';

    return reply.code(statusCode).send({
      error: code,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  });

  return app;
}

/**
 * Graceful shutdown: drain in-flight requests and close SQLite before exit.
 */
export async function closeGracefully(
  app: Awaited<ReturnType<typeof createFastifyApp>>,
): Promise<void> {
  await app.close();
}
