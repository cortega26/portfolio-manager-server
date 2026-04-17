# Migration Progress Tracker

Actualizar este archivo en tiempo real durante la ejecución.
Formato: `- [x]` completado · `- [ ]` pendiente · `- [~]` en progreso

**Fecha inicio:** 2026-04-17
**Última actualización:** 2026-04-17
**Fase actual:** Fase 0 — completada

---

## Resumen de fases

| Fase               | Estado | Fecha inicio | Fecha fin  |
| ------------------ | ------ | ------------ | ---------- |
| 0 — Tooling        | [x]    | 2026-04-17   | 2026-04-17 |
| 1 — Domain types   | [ ]    |              |            |
| 2 — Fastify shadow | [ ]    |              |            |
| 3 — Test migration | [ ]    |              |            |
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

- [ ] 1.0 — Crear `server/types/domain.ts` (tipos financieros base)
- [ ] 1.1 — Crear `server/types/config.ts` (tipos del config)
- [ ] 1.2 — Crear `server/types/providers.ts` (interfaces de price providers)

### config.js

- [ ] 1.3 — Crear `server/config.ts` con tipos completos
- [ ] 1.4 — `verify:typecheck:server` pasa
- [ ] 1.5 — `npm test` verde

### finance/decimal.js

- [ ] 1.6 — Crear `server/finance/decimal.ts`
- [ ] 1.7 — `verify:typecheck:server` pasa
- [ ] 1.8 — `npm test` verde

### finance/cash.js

- [ ] 1.9 — Crear `server/finance/cash.ts`
- [ ] 1.10 — `verify:typecheck:server` pasa
- [ ] 1.11 — `npm test` verde

### finance/portfolio.js

- [ ] 1.12 — Crear `server/finance/portfolio.ts`
- [ ] 1.13 — `verify:typecheck:server` pasa
- [ ] 1.14 — `npm test` verde

### finance/returns.js

- [ ] 1.15 — Crear `server/finance/returns.ts`
- [ ] 1.16 — `verify:typecheck:server` pasa
- [ ] 1.17 — `npm test` verde

### auth/localPinAuth.js

- [ ] 1.18 — Crear `server/auth/localPinAuth.ts`
- [ ] 1.19 — `verify:typecheck:server` pasa
- [ ] 1.20 — `npm test` verde

### cache/priceCache.js

- [ ] 1.21 — Crear `server/cache/priceCache.ts`
- [ ] 1.22 — `verify:typecheck:server` pasa
- [ ] 1.23 — `npm test` verde

### Cierre Fase 1

- [ ] 1.24 — `npm run lint` sin warnings
- [ ] 1.25 — Commit: `feat(types): add domain type layer for server modules`

---

## Fase 2 — App Fastify (shadow)

### Infraestructura

- [ ] 2.1 — Crear `server/plugins/requestContext.ts`
- [ ] 2.2 — Crear `server/plugins/sessionAuth.ts`
- [ ] 2.3 — Crear `server/plugins/etagHandler.ts`
- [ ] 2.4 — Crear `server/plugins/spaFallback.ts`
- [ ] 2.5 — Crear `server/app.fastify.ts` (factory vacío, sin rutas aún)
- [ ] 2.6 — `verify:typecheck:server` pasa

### Rutas — Grupo público (sin auth)

- [ ] 2.7 — Crear `server/routes/benchmarks.ts`
- [ ] 2.8 — Tests de benchmarks pasan contra Fastify
- [ ] 2.9 — Crear `server/routes/cache.ts` (`/api/cache/stats`)
- [ ] 2.10 — Tests de cache pasan
- [ ] 2.11 — Crear `server/routes/monitoring.ts`
- [ ] 2.12 — Tests de monitoring pasan
- [ ] 2.13 — Crear `server/routes/prices.ts` (`GET /api/prices/:symbol`)
- [ ] 2.14 — Tests de prices (single) pasan, ETag funciona
- [ ] 2.15 — Agregar `GET /api/prices/bulk` a `routes/prices.ts`
- [ ] 2.16 — Tests de bulk prices pasan

### Rutas — Portfolio (con auth)

- [ ] 2.17 — Crear `server/routes/portfolio.ts` (`GET/POST /api/portfolio/:id`)
- [ ] 2.18 — Tests de portfolio base pasan
- [ ] 2.19 — Agregar `GET/POST /api/portfolio/:id/transactions`
- [ ] 2.20 — Tests de transactions pasan, paginación cursor funciona
- [ ] 2.21 — Agregar `GET /api/portfolio/:id/performance`
- [ ] 2.22 — Tests de performance (MWR, drawdown) pasan
- [ ] 2.23 — Agregar `GET /api/portfolio/:id/holdings`
- [ ] 2.24 — Tests de holdings pasan
- [ ] 2.25 — Agregar `GET/POST /api/portfolio/:id/cashRates`
- [ ] 2.26 — Tests de cashRates pasan

### Rutas — Auth y operaciones

- [ ] 2.27 — Crear `server/routes/signals.ts` (`POST /api/signals`)
- [ ] 2.28 — Tests de signals pasan
- [ ] 2.29 — Crear `server/routes/import.ts` (`POST /api/import/csv`)
- [ ] 2.30 — Tests de import/csv pasan

### Cierre Fase 2

- [ ] 2.31 — Error handler global implementado con mismo formato de respuesta que Express
- [ ] 2.32 — `verify:typecheck:server` sin errores
- [ ] 2.33 — `npm test` verde (tests aún apuntan a Express — eso está bien)
- [ ] 2.34 — Commit: `feat(fastify): add shadow fastify app with all routes typed`

---

## Fase 3 — Migración de tests

### Infraestructura de tests

- [ ] 3.1 — Crear `server/__tests__/helpers/fastifyTestApp.ts`
- [ ] 3.2 — Crear `server/__tests__/helpers/testFixtures.ts` (fixtures reutilizables)

### Migración por grupo

- [ ] 3.3 — Migrar tests de contrato (`api_contract.test.js`)
- [ ] 3.4 — Migrar tests de validación (`api_validation.test.js`)
- [ ] 3.5 — Migrar tests de prices (`pricing_resilience.test.js`)
- [ ] 3.6 — Migrar tests de portfolio
- [ ] 3.7 — Migrar tests de transactions
- [ ] 3.8 — Migrar tests de performance
- [ ] 3.9 — Migrar tests de holdings
- [ ] 3.10 — Migrar tests de cashRates
- [ ] 3.11 — Migrar tests de signals
- [ ] 3.12 — Migrar tests de import
- [ ] 3.13 — Migrar tests de auth (session, PIN)
- [ ] 3.14 — Migrar tests de integración (`integration.test.js`)
- [ ] 3.15 — Migrar resto de tests (finance, decimal, cash, returns)

### Cierre Fase 3

- [ ] 3.16 — Los 43 test files pasan contra Fastify
- [ ] 3.17 — `verify:typecheck:server` limpio
- [ ] 3.18 — Commit: `test: migrate all 43 backend tests to fastify`

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
- [ ] 5.9 — Ejecutar `codacy_cli_analyze` (seguridad y calidad)
- [ ] 5.10 — Ejecutar `npm run leaks:repo` (gitleaks)
- [ ] 5.11 — `npm audit --audit-level=moderate`
- [ ] 5.12 — `npm test` verde final
- [ ] 5.13 — `npm run electron:smoke` final
- [ ] 5.14 — Commit: `refactor(types): strict ts hardening, branded financial types`

---

## Notas durante ejecución

> Usar esta sección para registrar decisiones, bloqueos y resoluciones encontradas en el camino.

| Fecha | Fase | Nota |
| ----- | ---- | ---- |
|       |      |      |
