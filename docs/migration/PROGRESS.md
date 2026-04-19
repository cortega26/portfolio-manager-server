# Migration Progress Tracker

Actualizar este archivo en tiempo real durante la ejecución.
Formato: `- [x]` completado · `- [ ]` pendiente · `- [~]` en progreso

**Fecha inicio:** 2026-04-17
**Última actualización:** 2026-04-18 (Fase 3 completada)
**Fase actual:** Fase 4 — Cutover

---

## Resumen de fases

| Fase               | Estado | Fecha inicio | Fecha fin  |
| ------------------ | ------ | ------------ | ---------- |
| 0 — Tooling        | [x]    | 2026-04-17   | 2026-04-17 |
| 1 — Domain types   | [x]    | 2026-04-17   | 2026-04-17 |
| 2 — Fastify shadow | [x]    | 2026-04-17   | 2026-04-18 |
| 3 — Test migration | [x]    | 2026-04-18   | 2026-04-18 |
| 4 — Cutover        | [ ]    |              |            |
| 5 — Hardening      | [ ]    |              |            |

---

## Fase 0 — Fundación tooling

- [x] 0.1 — Instalar dependencias runtime (`fastify`, `@fastify/cors`, `@fastify/helmet`, `@fastify/compress`, `fastify-type-provider-zod`)
- [x] 0.2 — Instalar dependencias dev (`@types/node`, `tsx`)
- [x] 0.3 — Ejecutar `codacy_cli_analyze` con trivy tras npm install
- [x] 0.4 — Resolver vulnerabilidades si las hay (bloqueante) — trivy: 0 vulnerabilidades
- [x] 0.5 — Crear `tsconfig.server.json`
- [x] 0.6 — Agregar script `verify:typecheck:server` en `package.json`
- [x] 0.7 — Verificar baseline: `npm run verify:typecheck:server` pasa (sin archivos .ts aún)
- [x] 0.8 — Verificar baseline: `npm test` verde — 349 pass, 0 fail, 1 skip
- [x] 0.9 — Verificar baseline: `npm run electron:smoke` pasa
- [x] 0.10 — Commit: `chore: add fastify + ts toolchain for backend migration`

---

## Fase 1 — Tipos de dominio

### Tipos compartidos

- [x] 1.0 — Crear `server/types/domain.ts` (tipos financieros base)
- [x] 1.1 — Crear `server/types/config.ts` (tipos del config)
- [x] 1.2 — Crear `server/types/providers.ts` (interfaces de price providers)

### config.js

- [x] 1.3 — Crear `server/config.ts` con tipos completos
- [x] 1.4 — `verify:typecheck:server` pasa
- [x] 1.5 — `npm test` verde

### finance/decimal.js

- [x] 1.6 — Crear `server/finance/decimal.ts`
- [x] 1.7 — `verify:typecheck:server` pasa
- [x] 1.8 — `npm test` verde

### finance/cash.js

- [x] 1.9 — Crear `server/finance/cash.ts`
- [x] 1.10 — `verify:typecheck:server` pasa
- [x] 1.11 — `npm test` verde

### finance/portfolio.js

- [x] 1.12 — Crear `server/finance/portfolio.ts`
- [x] 1.13 — `verify:typecheck:server` pasa
- [x] 1.14 — `npm test` verde

### finance/returns.js

- [x] 1.15 — Crear `server/finance/returns.ts`
- [x] 1.16 — `verify:typecheck:server` pasa
- [x] 1.17 — `npm test` verde

### auth/localPinAuth.js

- [x] 1.18 — Crear `server/auth/localPinAuth.ts`
- [x] 1.19 — `verify:typecheck:server` pasa
- [x] 1.20 — `npm test` verde

### cache/priceCache.js

- [x] 1.21 — Crear `server/cache/priceCache.ts`
- [x] 1.22 — `verify:typecheck:server` pasa
- [x] 1.23 — `npm test` verde

### Cierre Fase 1

- [x] 1.24 — `npm run lint` sin warnings
- [x] 1.25 — Commit: `feat(types): add domain type layer for server modules`

---

## Fase 2 — App Fastify (shadow)

### Pre-infraestructura

- [x] 2.0 — Resolver límite `shared/`: actualizar `tsconfig.server.json` para incluir `shared/` en `paths` o mover `rootDir` al root del repo y eliminar las constantes inlineadas de `server/config.ts`

### Infraestructura

- [x] 2.1 — Crear `server/plugins/requestContext.ts`
- [x] 2.2 — Crear `server/plugins/sessionAuth.ts`
- [x] 2.3 — Crear `server/plugins/etagHandler.ts`
- [x] 2.4 — Crear `server/plugins/spaFallback.ts`
- [x] 2.5 — Crear `server/app.fastify.ts` (factory vacío, sin rutas aún; incluye graceful shutdown: `closeGracefully()` drena requests en vuelo y cierra SQLite antes de exit)
- [x] 2.6 — `verify:typecheck:server` pasa
- [x] 2.6a — Crear `server/types/errors.ts` (`AppError`, `NotFoundError`, `ValidationError`, `AuthError`) — dominio de errores unificado para todos los handlers
- [~] 2.6b — Crear `server/cache/computeCache.ts` (memoización de `computeDailyStates` y `computeDailyReturnRows` por `portfolioId + lastTxTimestamp`) — **diferido a Fase 5**
- [x] 2.6c — Configurar `@fastify/compress` con threshold `1024` bytes en `app.fastify.ts` (evitar overhead de gzip en respuestas pequeñas)

### Rutas — Grupo público (sin auth)

- [x] 2.7 — Crear `server/routes/benchmarks.ts`
- [x] 2.8 — Tests de benchmarks pasan contra Fastify
- [x] 2.9 — Crear `server/routes/cache.ts` (`/api/cache/stats`)
- [x] 2.10 — Tests de cache pasan
- [x] 2.11 — Crear `server/routes/monitoring.ts`
- [x] 2.12 — Tests de monitoring pasan
- [x] 2.13 — Crear `server/routes/prices.ts` (`GET /api/prices/:symbol`)
- [x] 2.14 — Tests de prices (single) pasan, ETag funciona
- [x] 2.15 — Agregar `GET /api/prices/bulk` a `routes/prices.ts`
- [x] 2.16 — Tests de bulk prices pasan
- [~] 2.16a — Definir `FetchPolicy` en `server/types/providers.ts` (`maxRetries: number`, `backoffMs: number`) y aplicar en el handler de prices — **diferido a Fase 5**

### Rutas — Portfolio (con auth)

- [x] 2.17 — Crear `server/routes/portfolio.ts` (`GET/POST /api/portfolio/:id`)
- [x] 2.18 — Tests de portfolio base pasan
- [x] 2.19 — Agregar `GET/POST /api/portfolio/:id/transactions`
- [x] 2.20 — Tests de transactions pasan, paginación cursor funciona
- [x] 2.21 — Agregar `GET /api/portfolio/:id/performance`
- [x] 2.22 — Tests de performance (MWR, drawdown) pasan
- [x] 2.23 — Agregar `GET /api/portfolio/:id/holdings`
- [x] 2.24 — Tests de holdings pasan
- [x] 2.25 — Agregar `GET/POST /api/portfolio/:id/cashRates`
- [x] 2.26 — Tests de cashRates pasan

### Rutas — Auth y operaciones

- [x] 2.27 — Crear `server/routes/signals.ts` (`POST /api/signals`)
- [x] 2.28 — Tests de signals pasan
- [x] 2.29 — Crear `server/routes/import.ts` (`POST /api/import/csv`)
- [x] 2.30 — Tests de import/csv pasan

### Cierre Fase 2

- [x] 2.31 — Error handler global implementado con mismo formato de respuesta que Express; usa `server/types/errors.ts` para mapear `AppError` a códigos HTTP
- [x] 2.31a — **Gate Serialización**: verificar que todas las rutas declaran `response` schema Zod (Política de Serialización) — `grep -r 'response:' server/routes/` debe cubrir el 100% de handlers GET
- [x] 2.31b — **Gate DB Write**: verificar que todos los handlers con >1 escritura SQLite usan `db.transaction()` (Política DB Write) — revisar `import.ts`, `portfolio.ts` POST, `cashRates.ts` POST
- [x] 2.32 — `verify:typecheck:server` sin errores
- [x] 2.33 — `npm test` verde (tests aún apuntan a Express — eso está bien)
- [x] 2.34 — Commit: `feat(fastify): add shadow fastify app with all routes typed`

---

## Fase 3 — Migración de tests

### Infraestructura de tests

- [x] 3.1 — Crear `server/__tests__/helpers/fastifyTestApp.js` (en .js — tsx/esm resuelve los imports .ts en runtime)
- [x] 3.2 — Crear `server/__tests__/helpers/testFixtures.js` (fixtures reutilizables)

### Migración por grupo

- [x] 3.3 — Migrar tests de contrato (`api_contract.test.js`)
- [x] 3.4 — Migrar tests de validación (`api_validation.test.js`)
- [x] 3.5 — Migrar tests de prices (`pricing_resilience.test.js`)
- [x] 3.6 — Migrar tests de portfolio
- [x] 3.7 — Migrar tests de transactions
- [x] 3.8 — Migrar tests de performance
- [x] 3.9 — Migrar tests de holdings
- [x] 3.10 — Migrar tests de cashRates
- [x] 3.11 — Migrar tests de signals
- [x] 3.12 — Migrar tests de import
- [x] 3.13 — Migrar tests de auth (session, PIN)
- [x] 3.14 — Migrar tests de integración (`integration.test.js`)
- [x] 3.15 — Migrar resto de tests (finance, decimal, cash, returns)

### Cierre Fase 3

- [x] 3.16 — 350 pass, 0 fail, 1 skip (51 test files pasan contra Fastify)
- [x] 3.17 — `verify:typecheck:server` limpio
- [x] 3.18 — Commit: `test: migrate all backend tests to fastify`

---

## Fase 4 — Cutover

- [ ] 4.1 — Actualizar `server/runtime/startServer.js` → `startServer.ts` (importa `createFastifyApp`)
- [ ] 4.2 — `npm test` verde
- [ ] 4.3 — `npm run electron:smoke` — Electron arranca
- [ ] 4.4 — Verificar manualmente que la UI carga y las rutas responden
- [ ] 4.5 — `npm uninstall express compression cors helmet`
- [ ] 4.6 — `npm test` verde (confirmación post-uninstall)
- [ ] 4.7 — Eliminar `server/app.js`
- [ ] 4.8 — Eliminar `server/middleware/validation.js`
- [ ] 4.9 — Eliminar `server/middleware/sessionAuth.js`
- [ ] 4.10 — Eliminar `server/middleware/requestContext.js`
- [ ] 4.11 — Eliminar archivos `.js` de dominio que tienen su par `.ts` (finance/, auth/, cache/)
- [ ] 4.12 — `npm test` verde post-limpieza
- [ ] 4.13 — `verify:typecheck:server` limpio
- [ ] 4.14 — `npm run electron:smoke` final
- [ ] 4.15 — Commit: `feat!: replace express with fastify, remove js domain files`

---

## Fase 5 — Hardening TypeScript

- [ ] 5.1 — Activar `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` en `tsconfig.server.json`
- [ ] 5.2 — Resolver errores que emergen del strict mode
- [ ] 5.3 — Implementar branded types (`Cents`, `MicroShares`) en `server/types/domain.ts`
- [ ] 5.4 — Aplicar branded types en `finance/decimal.ts`, `finance/cash.ts`, `finance/portfolio.ts`
- [ ] 5.5 — `verify:typecheck:server` pasa con branded types
- [ ] 5.6 — Activar schemas de response Zod en todas las rutas (validación de output)
- [ ] 5.7 — `npm test` verde con response validation activa
- [ ] 5.8 — Eliminar todos los `any` explícitos — reemplazar por tipos precisos
- [ ] 5.8a — **Gate `catch (e: unknown)`**: grep audit — `grep -rn 'catch (e: any)\|catch(e: any)' server/**/*.ts` debe retornar 0 resultados antes de continuar
- [ ] 5.9 — Ejecutar `codacy_cli_analyze` (seguridad y calidad)
- [ ] 5.10 — Ejecutar `npm run leaks:repo` (gitleaks)
- [ ] 5.11 — `npm audit --audit-level=moderate`
- [ ] 5.12 — `npm test` verde final
- [ ] 5.13 — `npm run electron:smoke` final
- [ ] 5.14 — Commit: `refactor(types): strict ts hardening, branded financial types`

---

## Notas durante ejecución

> Usar esta sección para registrar decisiones, bloqueos y resoluciones encontradas en el camino.

| Fecha      | Fase | Nota                                                                                                                     |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-17 | 2    | `server/routes/analytics.ts` agregado durante migración (TWR + holdings analytics, no estaba en el plan original)        |
| 2026-04-17 | 2    | `server/services/portfolioTransactions.js` extraído como servicio reutilizable                                           |
| 2026-04-18 | 3    | Helpers creados como .js (no .ts): tsx/esm loader en `tools/run-tests.mjs` permite importar .ts como .js en node:test    |
| 2026-04-18 | 3    | Commit fix posterior: nullable market fields en openapi.yaml + signals.ts, normalizeBenchmarkConfig en fastifyTestApp.js |
| 2026-04-18 | 3    | 2.6b (computeCache) y 2.16a (FetchPolicy) diferidos — no bloquearon Fase 3; se revalúan en Fase 5                        |
