# Fase 2 — App Fastify (Shadow)

**Objetivo:** Construir `server/app.fastify.ts` con todas las rutas de `app.js` migradas, tipadas con Zod end-to-end, coexistiendo con Express hasta que la Fase 3 confirme que los tests pasan.
**Duración estimada:** 6–8 horas
**Riesgo:** Medio (mayor archivo del proyecto)
**Prerequisito:** Fase 1 completada. `npm test` verde.

---

## Estrategia general

`app.fastify.ts` es una **shadow app** — una implementación paralela que no reemplaza `app.js` aún. Al final de esta fase, ambos archivos existen. El runtime sigue usando `app.js`. La shadow app se usa solo en tests (Fase 3) y se activa en producción en Fase 4 (Cutover).

Esto garantiza que en cualquier momento se puede hacer rollback descartando los archivos `.ts` nuevos.

---

## 2.1 — Plugin: `server/plugins/requestContext.ts`

Equivalente a `server/middleware/requestContext.js`.

```typescript
// server/plugins/requestContext.ts
import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

const requestContextPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    // 1. Attach unique request ID
    const requestId = randomUUID();
    request.id = requestId;
    reply.header('X-Request-Id', requestId);

    // 2. Legacy API rewrite: /v1/api/* → /api/*
    if (request.url.startsWith('/v1/api/')) {
      request.raw.url = request.url.replace('/v1/api/', '/api/');
    }

    // 3. Ensure API version header
    if (!request.headers['x-api-version']) {
      reply.header('X-API-Version', '1');
    }
  });
};

export default fp(requestContextPlugin, {
  name: 'requestContext',
  fastify: '5.x',
});
```

**Nota:** Se necesita instalar `fastify-plugin`:

```bash
npm install fastify-plugin
```

---

## 2.2 — Plugin: `server/plugins/sessionAuth.ts`

Equivalente a `server/middleware/sessionAuth.js`. **CRÍTICO: mantener `timingSafeEqual`.**

```typescript
// server/plugins/sessionAuth.ts
import fp from 'fastify-plugin';
import { timingSafeEqual, createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

interface SessionAuthOptions {
  sessionToken: string;
  headerName: string;
  devBypass?: boolean;
  logger: { warn: (msg: string) => void };
}

const sessionAuthPlugin: FastifyPluginAsync<SessionAuthOptions> = async (app, opts) => {
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    // Development bypass (logs warning, never silently)
    if (opts.devBypass) {
      opts.logger.warn('SESSION AUTH BYPASS ACTIVE — development only');
      return;
    }

    const incoming = request.headers[opts.headerName.toLowerCase()];

    if (!incoming || typeof incoming !== 'string') {
      reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing session token' });
      return;
    }

    // Timing-safe comparison — MUST use buffers of same length
    const expectedBuf = Buffer.from(createHash('sha256').update(opts.sessionToken).digest('hex'));
    const incomingBuf = Buffer.from(createHash('sha256').update(incoming).digest('hex'));

    // Buffers must be same length for timingSafeEqual
    if (expectedBuf.length !== incomingBuf.length || !timingSafeEqual(expectedBuf, incomingBuf)) {
      reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid session token' });
    }
  });
};

export default fp(sessionAuthPlugin, {
  name: 'sessionAuth',
  fastify: '5.x',
});
```

**Nota de seguridad:** El hash SHA256 antes del `timingSafeEqual` asegura que los buffers siempre tienen el mismo tamaño (64 bytes), independientemente de la longitud del token. Esto es el mismo patrón seguro del `sessionAuth.js` original.

---

## 2.3 — Plugin: `server/plugins/etagHandler.ts`

Equivalente a la función `sendJsonWithEtag` y `computeEtag` de `app.js`.

```typescript
// server/plugins/etagHandler.ts
import fp from 'fastify-plugin';
import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    sendWithEtag: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
      payload: unknown
    ) => Promise<void>;
  }
}

const etagPlugin: FastifyPluginAsync = async (app) => {
  app.decorate(
    'sendWithEtag',
    async (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
      payload: unknown
    ) => {
      const body = JSON.stringify(payload);
      const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;

      reply.header('ETag', etag);
      reply.header('Cache-Control', 'private, no-cache');

      if (request.headers['if-none-match'] === etag) {
        reply.code(304).send();
        return;
      }

      reply.code(200).type('application/json').send(body);
    }
  );
};

export default fp(etagPlugin, { name: 'etagHandler', fastify: '5.x' });
```

---

## 2.4 — Plugin: `server/plugins/spaFallback.ts`

Equivalente al SPA fallback de Express.

```typescript
// server/plugins/spaFallback.ts
import fp from 'fastify-plugin';
import { join } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';

interface SpaFallbackOptions {
  staticDir: string;
}

const spaFallbackPlugin: FastifyPluginAsync<SpaFallbackOptions> = async (app, opts) => {
  // Serve index.html for all non-API routes (SPA client-side routing)
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
      return;
    }
    return reply.sendFile('index.html', opts.staticDir);
  });
};

export default fp(spaFallbackPlugin, { name: 'spaFallback', fastify: '5.x' });
```

---

## 2.5 — App Factory: `server/app.fastify.ts`

El factory principal que ensambla todos los plugins y rutas.

```typescript
// server/app.fastify.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
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
import type { PriceProvider, MarketClock } from './types/providers.js';

export interface AppOptions {
  dataDir: string;
  fetchImpl?: typeof globalThis.fetch;
  logger: Logger;
  fetchTimeoutMs: number;
  config: ServerConfig;
  priceProvider: PriceProvider;
  staticDir?: string;
  spaFallback?: boolean;
  marketClock?: MarketClock;
}

export async function createFastifyApp(options: AppOptions) {
  const app = Fastify({
    loggerInstance: options.logger,
    trustProxy: true,
    disableRequestLogging: false,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod type provider — valida requests Y serializa responses con tipos TS
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ── Plugins globales ────────────────────────────────────────────────────
  await app.register(requestContextPlugin);

  await app.register(compress, {
    threshold: 1024,
    encodings: ['gzip', 'deflate'],
  });

  await app.register(cors, {
    origin: options.config.cors.allowedOrigins,
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

  await app.register(sessionAuthPlugin, {
    sessionToken: options.config.security.auth.sessionToken,
    headerName: options.config.security.auth.headerName,
    devBypass: process.env.NODE_ENV === 'development' && !options.config.security.auth.sessionToken,
    logger: options.logger,
  });

  await app.register(etagPlugin);

  // ── Rutas ───────────────────────────────────────────────────────────────
  // Contexto compartido que se inyecta en todas las rutas
  const routeContext = {
    dataDir: options.dataDir,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    fetchTimeoutMs: options.fetchTimeoutMs,
    config: options.config,
    priceProvider: options.priceProvider,
    marketClock: options.marketClock,
  };

  await app.register(benchmarksRoutes, { prefix: '/api', ...routeContext });
  await app.register(cacheRoutes, { prefix: '/api', ...routeContext });
  await app.register(monitoringRoutes, { prefix: '/api', ...routeContext });
  await app.register(pricesRoutes, { prefix: '/api', ...routeContext });
  await app.register(portfolioRoutes, { prefix: '/api', ...routeContext });
  await app.register(signalsRoutes, { prefix: '/api', ...routeContext });
  await app.register(importRoutes, { prefix: '/api', ...routeContext });

  // ── SPA Fallback ────────────────────────────────────────────────────────
  if (options.spaFallback && options.staticDir) {
    await app.register(import('@fastify/static'), {
      root: options.staticDir,
      prefix: '/',
    });
    // El spaFallback plugin maneja el 404 → index.html
    // Se registra dentro del plugin de static con setNotFoundHandler
  }

  // ── Error handler global ────────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const code = (error as { code?: string }).code ?? 'INTERNAL_ERROR';
    const details = (error as { details?: unknown }).details;

    if (statusCode >= 500) {
      app.log.error({ err: error }, 'Internal server error');
    }

    reply.code(statusCode).send({
      error: code,
      message: error.message,
      ...(details ? { details } : {}),
    });
  });

  return app;
}
```

---

## 2.6 — Schemas Zod reutilizables

Crear `server/routes/_schemas.ts` con todos los schemas de validación (reutilizando los de `middleware/validation.js`):

```typescript
// server/routes/_schemas.ts
import { z } from 'zod';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

const sanitize = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), schema) as T;

export const isoDateSchema = sanitize(z.string().regex(ISO_DATE_REGEX, 'Must be YYYY-MM-DD'));

export const portfolioIdSchema = sanitize(
  z.string().regex(PORTFOLIO_ID_PATTERN, 'Invalid portfolio ID format')
);

export const tickerSchema = sanitize(
  z
    .string()
    .regex(SYMBOL_PATTERN, 'Invalid ticker format')
    .transform((v) => v.toUpperCase())
);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(),
});

export const transactionTypeSchema = z.enum([
  'BUY',
  'SELL',
  'DIVIDEND',
  'DEPOSIT',
  'WITHDRAWAL',
  'INTEREST',
  'SPLIT',
]);

// Input schema acepta 'WITHDRAW' (legacy) y lo normaliza a 'WITHDRAWAL'
export const inputTransactionTypeSchema = transactionTypeSchema.or(
  z.literal('WITHDRAW').transform(() => 'WITHDRAWAL' as const)
);

export const transactionSchema = z.object({
  id: z.string().optional(),
  date: isoDateSchema,
  type: inputTransactionTypeSchema,
  ticker: tickerSchema.optional(),
  shares: z.number().optional(),
  pricePerShare: z.number().positive().optional(),
  amount: z.number().finite(),
  currency: z.literal('USD').default('USD'),
  notes: z.string().max(500).optional(),
});

export const cashRateSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema.optional(),
  apy: z.number().min(0).max(100),
});

export const portfolioBodySchema = z.object({
  transactions: z.array(transactionSchema),
  cashRates: z.array(cashRateSchema).optional().default([]),
});
```

---

## 2.7–2.16 — Rutas públicas (sin auth)

### Patrón de ruta Fastify tipada

Cada archivo de ruta sigue esta estructura:

```typescript
// server/routes/benchmarks.ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

interface BenchmarksRouteContext {
  config: import('../types/config.js').ServerConfig;
}

const benchmarksRoutes: FastifyPluginAsyncZod<BenchmarksRouteContext> = async (app, opts) => {
  app.get(
    '/benchmarks',
    {
      schema: {
        response: {
          200: z.object({
            tickers: z.array(z.string()),
            defaultSelection: z.string(),
          }),
        },
      },
    },
    async (_request, _reply) => {
      return {
        tickers: opts.config.benchmarks.tickers,
        defaultSelection: opts.config.benchmarks.defaultSelection,
      };
    }
  );
};

export default benchmarksRoutes;
```

### `server/routes/prices.ts`

Rutas:

- `GET /api/prices/:symbol` — histórico con ETag
- `GET /api/prices/bulk` — multi-símbolo con resiliencia

Schema de params:

```typescript
params: z.object({ symbol: tickerSchema }),
querystring: z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  adjusted: z.coerce.boolean().default(true),
}),
```

Schema de bulk:

```typescript
querystring: z.object({
  symbols: z.string().transform(s => s.split(',').map(t => t.trim().toUpperCase())),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
}),
```

### `server/routes/cache.ts`

```typescript
// GET /api/cache/stats
response: z.object({
  keys: z.number(),
  hits: z.number(),
  misses: z.number(),
  ksize: z.number(),
  vsize: z.number(),
});
```

### `server/routes/monitoring.ts`

```typescript
// GET /api/monitoring
response: z.object({
  uptime: z.number(),
  memory: z.object({ heapUsed: z.number(), heapTotal: z.number() }),
  timestamp: z.string(),
});
```

---

## 2.17–2.26 — Rutas de portfolio (con auth)

### Patrón de ruta con auth

Todas las rutas de portfolio aplican `app.requireAuth` como `preHandler`:

```typescript
app.get(
  '/portfolio/:id',
  {
    preHandler: app.requireAuth,
    schema: {
      params: z.object({ id: portfolioIdSchema }),
      response: { 200: PortfolioStateSchema },
    },
  },
  async (request, reply) => { ... }
);
```

### `server/routes/portfolio.ts`

Rutas en este archivo:

- `GET /api/portfolio/:id`
- `POST /api/portfolio/:id`
- `GET /api/portfolio/:id/transactions`
- `POST /api/portfolio/:id/transactions`
- `GET /api/portfolio/:id/performance`
- `GET /api/portfolio/:id/holdings`
- `GET /api/portfolio/:id/cashRates`
- `POST /api/portfolio/:id/cashRates`

**Schema de performance query:**

```typescript
querystring: z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  benchmark: z.string().optional(),
}),
```

**Schema de transactions query (paginación):**

```typescript
querystring: paginationSchema.extend({
  type: transactionTypeSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
}),
```

---

## 2.27–2.30 — Rutas de operaciones

### `server/routes/signals.ts`

```typescript
// POST /api/signals — requiere auth
body: portfolioBodySchema,
response: {
  200: z.object({
    signals: z.array(z.object({
      type: z.string(),
      ticker: z.string().optional(),
      message: z.string(),
      severity: z.enum(['INFO', 'WARNING', 'ALERT']),
    })),
  }),
}
```

### `server/routes/import.ts`

```typescript
// POST /api/import/csv — requiere auth
// Multipart o JSON body con CSV content
body: z.object({
  csvContent: z.string(),
  portfolioId: portfolioIdSchema,
}),
response: {
  200: z.object({
    imported: z.number(),
    skipped: z.number(),
    errors: z.array(z.object({ row: z.number(), message: z.string() })),
  }),
}
```

---

## 2.31 — Error handler: mismo formato de respuesta que Express

**CRÍTICO:** El formato de error del frontend React espera exactamente:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Human-readable message",
  "details": [{ "path": ["field"], "message": "..." }]
}
```

Verificar que el `setErrorHandler` global en `app.fastify.ts` produce este mismo formato.

Para ZodError específicamente (errores de validación de Fastify):

```typescript
app.setErrorHandler((error, request, reply) => {
  // Fastify convierte ZodError automáticamente si usamos el validatorCompiler de zod
  // Solo necesitamos mapear el statusCode y el formato
  if (error.validation) {
    // Error de validación de Fastify/Zod
    reply.code(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: error.validation.map((v) => ({
        path: v.instancePath.split('/').filter(Boolean),
        message: v.message,
      })),
    });
    return;
  }
  // ... resto del handler
});
```

---

## Verificación de salida de Fase 2

- [ ] `verify:typecheck:server` — limpio en todos los nuevos archivos `.ts`
- [ ] `app.fastify.ts` compila sin errores
- [ ] Todos los plugins compilan
- [ ] Todas las rutas compilan
- [ ] `npm test` verde (tests aún en Express — eso es correcto)
- [ ] `npm run lint` — cero warnings

### Smoke test de la shadow app (opcional pero recomendado)

Antes de cerrar la fase, crear un script temporal para verificar que la shadow app arranca:

```typescript
// scripts/smoke-fastify.ts (temporal, eliminar tras Fase 4)
import { createFastifyApp } from '../server/app.fastify.js';
// ... configurar con mocks y llamar app.inject({ method: 'GET', url: '/api/benchmarks' })
```

---

## Commit de cierre de Fase 2

```bash
git add server/plugins/ server/routes/ server/app.fastify.ts
git commit -m "feat(fastify): add shadow fastify app with all routes typed

- Add plugins: requestContext, sessionAuth, etagHandler, spaFallback
- Add routes: benchmarks, cache, monitoring, prices, portfolio, signals, import
- Add shared Zod schemas in routes/_schemas.ts
- app.fastify.ts coexists with app.js — runtime unchanged
- All types checked, npm test green"
```

---

## Siguiente paso

→ [Phase 3 — Test Migration](./phase-3-test-migration.md)
