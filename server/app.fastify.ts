// server/app.fastify.ts
// Shadow Fastify app — coexists with app.js. Runtime still uses app.js.
// Activated in production during Phase 4 (Cutover).
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { FastifyError } from 'fastify';
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

import type { ServerConfig } from './types/config.js';
import type { HistoricalPriceLoader } from './routes/prices.js';
import type { StorageAdapter } from './routes/portfolio.js';
import { runMigrations } from './migrations/index.js';

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
  const { dataDir, config, logger, historicalPriceLoader } = options;

  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    disableRequestLogging: false,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod provider: validates requests AND serializes responses with full TS types
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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

  // ── Shared route context ──────────────────────────────────────────────────
  const routeContext = {
    dataDir,
    config,
    marketClock: options.marketClock,
    getStorage,
    historicalPriceLoader,
  };

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(benchmarksRoutes, { prefix: '/api', ...routeContext });
  await app.register(cacheRoutes, { prefix: '/api', ...routeContext });
  await app.register(monitoringRoutes, { prefix: '/api', ...routeContext });
  await app.register(pricesRoutes, { prefix: '/api', ...routeContext });
  await app.register(portfolioRoutes, { prefix: '/api', ...routeContext });
  await app.register(signalsRoutes, { prefix: '/api', ...routeContext });
  await app.register(importRoutes, { prefix: '/api', ...routeContext });

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
    const code = error.code ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    const details = error.details;

    // Fastify/Zod validation errors
    if (error.validation) {
      return reply.code(422).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.validation.map((v: { instancePath?: string; message?: string }) => ({
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
