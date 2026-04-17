# Fase 3 — Migración de Tests

**Objetivo:** Los 43 test files pasan contra la nueva app Fastify. Sin cambios en las assertions — solo se actualiza la forma en que se monta el app en los tests.
**Duración estimada:** 2–3 horas
**Riesgo:** Bajo
**Prerequisito:** Fase 2 completada. `app.fastify.ts` compila. `npm test` verde (con Express).

---

## Estrategia: `app.inject()` en lugar de `supertest`

Fastify tiene un cliente HTTP embebido (`app.inject()`) que no abre un socket real. Es más rápido que `supertest` y produce el mismo contrato de test: método, URL, headers, body, statusCode, response body.

```javascript
// Antes — supertest sobre Express
import request from 'supertest';
const app = createApp({ ... });
const res = await request(app).get('/api/benchmarks');
expect(res.status).toBe(200);

// Después — inject nativo de Fastify
import { buildTestApp } from './helpers/fastifyTestApp.js';
const app = await buildTestApp();
const res = await app.inject({ method: 'GET', url: '/api/benchmarks' });
expect(res.statusCode).toBe(200);
```

**Diferencia de API a notar:**
| supertest | Fastify inject |
|-----------|---------------|
| `res.status` | `res.statusCode` |
| `res.body` (auto-parsed) | `res.json()` (method call) |
| `res.headers['x-foo']` | `res.headers['x-foo']` (igual) |
| `.set('Header', 'val')` | `headers: { 'header': 'val' }` |
| `.send({ ... })` | `payload: { ... }` |

---

## 3.1 — Helper: `server/__tests__/helpers/fastifyTestApp.js`

Crear el helper de test que construye la app Fastify con configuración segura para tests:

```javascript
// server/__tests__/helpers/fastifyTestApp.js
import pino from 'pino';
import { createFastifyApp } from '../../app.fastify.js';

/** Configuración base para tests — misma que usaba createApp() en Express */
const TEST_DEFAULTS = {
  dataDir: ':memory:',
  fetchTimeoutMs: 5000,
  config: {
    cors: { allowedOrigins: ['*'] },
    benchmarks: { tickers: ['SPY', 'QQQ'], defaultSelection: 'SPY' },
    cache: {
      ttlSeconds: 60,
      price: {
        ttlSeconds: 60,
        checkPeriodSeconds: 120,
        liveOpenTtlSeconds: 30,
        liveClosedTtlSeconds: 900,
      },
    },
    freshness: { maxStaleTradingDays: 3 },
    security: {
      auth: { sessionToken: 'test-token-abc123', headerName: 'x-session-token' },
      bruteForce: { maxAttempts: 10, lockoutSeconds: 60, multiplier: 2 },
      audit: { maxEvents: 100 },
    },
    rateLimit: {
      general: { windowMs: 60000, max: 1000 },
      portfolio: { windowMs: 60000, max: 500 },
      prices: { windowMs: 60000, max: 500 },
    },
    emailDelivery: { enabled: false },
    jobs: { nightlyHour: 23, nightlyEnabled: false },
    featureFlags: { cashBenchmarks: false, monthlyCashPosting: false },
  },
  spaFallback: false,
};

/**
 * Construye una instancia Fastify para tests.
 * @param {object} overrides - Sobrescribir partes de la config base
 * @param {object} mocks - Mocks de price providers, storage, etc.
 */
export async function buildTestApp(overrides = {}, mocks = {}) {
  const app = await createFastifyApp({
    ...TEST_DEFAULTS,
    ...overrides,
    config: {
      ...TEST_DEFAULTS.config,
      ...(overrides.config ?? {}),
    },
    logger: pino({ level: 'silent' }),
    priceProvider: mocks.priceProvider ?? createMockPriceProvider(),
    fetchImpl: mocks.fetchImpl ?? globalThis.fetch,
  });

  // Esperar a que Fastify esté listo (registra plugins)
  await app.ready();
  return app;
}

/** Header de auth para rutas protegidas */
export const AUTH_HEADER = { 'x-session-token': 'test-token-abc123' };

/** Mock básico de price provider para tests */
function createMockPriceProvider() {
  return {
    getHistoricalPrices: async () => ({ symbol: 'TEST', prices: [], source: 'mock' }),
    getLatestPrice: async () => null,
    getName: () => 'mock',
    isHealthy: () => true,
  };
}
```

---

## 3.2 — Helper: `server/__tests__/helpers/testFixtures.js`

Fixtures de datos de test reutilizables:

```javascript
// server/__tests__/helpers/testFixtures.js

export const PORTFOLIO_ID = 'test-portfolio-001';

export const SAMPLE_TRANSACTION = {
  date: '2024-01-15',
  type: 'BUY',
  ticker: 'AAPL',
  shares: 10,
  pricePerShare: 18500, // en centavos: $185.00
  amount: 1850000, // en centavos
  currency: 'USD',
};

export const SAMPLE_PORTFOLIO_STATE = {
  id: PORTFOLIO_ID,
  transactions: [SAMPLE_TRANSACTION],
  cashRates: [],
  createdAt: '2024-01-15T00:00:00.000Z',
  updatedAt: '2024-01-15T00:00:00.000Z',
};

export const SAMPLE_PRICE_SERIES = {
  symbol: 'AAPL',
  prices: [
    { date: '2024-01-15', close: 185.0 },
    { date: '2024-01-16', close: 186.5 },
  ],
  source: 'yahoo',
};
```

---

## 3.3 — Patrón de migración por test file

Para cada test file, el proceso es:

1. Abrir el test file original.
2. Reemplazar `import request from 'supertest'` y la creación del app Express por `import { buildTestApp, AUTH_HEADER }`.
3. Actualizar la sintaxis de llamadas (ver tabla de diferencias arriba).
4. Correr solo ese test: `vitest run server/__tests__/nombre.test.js`.
5. Si pasa → avanzar al siguiente.

---

## 3.4 — Orden de migración de tests

### Grupo 1: Tests sin auth (más simples, migrar primero)

```
api_contract.test.js       → Verifica que las rutas existen y responden
api_validation.test.js     → Verifica schemas de request
benchmarks.test.js         → GET /api/benchmarks
cache.test.js              → GET /api/cache/stats
monitoring.test.js         → GET /api/monitoring
```

Ejemplo de `api_contract.test.js` migrado:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp } from './helpers/fastifyTestApp.js';

describe('API Contract', () => {
  let app;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /api/benchmarks returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/benchmarks' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('tickers');
  });

  it('GET /api/prices/AAPL returns 200 or 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/prices/AAPL' });
    expect([200, 404]).toContain(res.statusCode);
  });
});
```

### Grupo 2: Tests de precios (con mocks de providers)

```
pricing_resilience.test.js
prices_bulk.test.js
price_cache.test.js
```

### Grupo 3: Tests de portfolio (con auth)

```
portfolio.test.js
transactions.test.js
performance.test.js
holdings.test.js
cashRates.test.js
```

Ejemplo con auth:

```javascript
const res = await app.inject({
  method: 'GET',
  url: `/api/portfolio/${PORTFOLIO_ID}`,
  headers: AUTH_HEADER,
});
expect(res.statusCode).toBe(200);
```

### Grupo 4: Tests de autenticación

```
session_auth.test.js
local_pin_auth.test.js
```

Para `session_auth.test.js` — los tests de auth verifican el comportamiento de 401:

```javascript
it('returns 401 without token', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/portfolio/${PORTFOLIO_ID}`,
    // Sin headers de auth
  });
  expect(res.statusCode).toBe(401);
  expect(res.json()).toMatchObject({ error: 'UNAUTHORIZED' });
});
```

### Grupo 5: Tests de dominio puro (no necesitan migración del transport)

Estos tests prueban funciones puras sin HTTP. **No necesitan cambios** mientras los archivos `.js` existan. Se revisarán en Fase 4 cuando los `.js` se eliminen.

```
decimal.test.js
cash.test.js
portfolio.test.js       ← el de lógica de dominio, no la ruta
returns.test.js
returns.snapshot.test.js
migrations_*.test.js
```

### Grupo 6: Tests de integración

```
integration.test.js      ← Flujos end-to-end completos
```

Este es el más complejo. Migrar al final del grupo. Puede requerir setup de storage en memoria.

---

## 3.5 — Tests que usan storage real

Algunos tests de integración pueden necesitar instanciar el storage SQLite en memoria. El patrón en Express era pasar `dataDir: ':memory:'`. Fastify hereda el mismo patrón:

```javascript
const app = await buildTestApp({
  dataDir: ':memory:', // SQLite in-memory — ya es el default en TEST_DEFAULTS
});
```

Si el test necesita storage con datos pre-cargados:

```javascript
import { buildTestApp } from './helpers/fastifyTestApp.js';
import { createStorage } from '../../data/storage.js';

const storage = createStorage(':memory:');
await storage.runMigrations();
await storage.insert('transactions', SAMPLE_TRANSACTION);

const app = await buildTestApp({}, { storage });
```

---

## 3.6 — Limpieza entre tests

Fastify requiere `app.close()` después de cada test suite para cerrar el servidor correctamente:

```javascript
// En cada describe block
afterAll(async () => {
  await app.close();
});
```

Si no se hace, los tests pueden dejar handles abiertos y Vitest reportará "Test suite not terminated cleanly".

---

## 3.7 — Verificación de que no hay `supertest` residual

Al terminar todos los tests:

```bash
grep -r "supertest" server/__tests__/ | grep -v "node_modules"
# Debe retornar vacío
```

Si `supertest` no se usa en ningún otro lugar del proyecto, desinstalarlo:

```bash
npm uninstall supertest
```

---

## Verificación de salida de Fase 3

```bash
npm test    # Los 43 test files pasan contra Fastify
```

- [ ] 0 tests fallando
- [ ] 0 imports de `supertest` en `server/__tests__/`
- [ ] `app.close()` en todos los `afterAll`
- [ ] `verify:typecheck:server` limpio

---

## Commit de cierre de Fase 3

```bash
git add server/__tests__/
git commit -m "test: migrate all backend tests from supertest/express to fastify inject

- Add server/__tests__/helpers/fastifyTestApp.js
- Add server/__tests__/helpers/testFixtures.js
- Migrate 43 test files to use app.inject()
- Remove supertest dependency
- All tests green against Fastify shadow app"
```

---

## Siguiente paso

→ [Phase 4 — Cutover](./phase-4-cutover.md)
