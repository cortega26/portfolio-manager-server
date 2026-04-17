# TASK_ENTRYPOINTS.md

Carga este archivo cuando necesites aterrizar rápido en el repo por tipo de tarea
antes de hacer búsqueda amplia.

## Propósito

Dar atajos prácticos hacia archivos, tests y comandos de validación por flujo de
trabajo.
No reemplaza la lectura del código real ni `context/MODULE_INDEX.md`.

## Bootstrap y tooling

| Tarea                            | Leer primero                                                                                         | Verificar con                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Arranque local del repo          | `SETUP.md`, `AGENTS_QUICKSTART.md`, `package.json`, `scripts/doctor.mjs`                             | `npm run doctor`, `npm run verify:docs` |
| Entender gates de calidad reales | `docs/reference/QUALITY_GATES.md`, `docs/reference/VALIDATION_MATRIX.md`, `.github/workflows/ci.yml` | `npm run quality:gates`                 |

## Desktop auth y boundary Electron

| Tarea                             | Leer primero                                                                                                             | Tests guía                                                                                                                                                                        | Verificar con                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Sesión desktop / unlock / preload | `electron/main.cjs`, `electron/preload.cjs`, `server/middleware/sessionAuth.js`, `src/components/DesktopSessionGate.jsx` | `server/__tests__/session_auth.test.js`, `server/__tests__/desktop_runtime_config.test.js`, `src/__tests__/App.bootstrap.test.tsx`, `src/__tests__/apiClient.sessionAuth.test.ts` | `npm test`, `npm run electron:smoke` |
| Runtime config entre procesos     | `electron/runtimeConfig.js`, `src/lib/runtimeConfig.js`, `server/runtime/startServer.js`                                 | `server/__tests__/desktop_runtime_config.test.js`, `src/__tests__/runtimeConfig.test.ts`                                                                                          | `npm test`                           |

## API backend y contratos

| Tarea                                | Leer primero                                                                                                 | Tests guía                                                                                                                                                        | Verificar con |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Rutas Express / middleware / headers | `server/app.js`, `server/middleware/validation.js`, `server/middleware/requestContext.js`                    | `server/__tests__/api_contract.test.js`, `server/__tests__/api_validation.test.js`, `server/__tests__/api_errors.test.js`, `server/__tests__/compression.test.js` | `npm test`    |
| Arranque backend y scheduler         | `server/index.js`, `server/runtime/startServer.js`, `server/jobs/scheduler.js`, `server/jobs/daily_close.js` | `server/__tests__/start_server.test.js`, `server/__tests__/daily_close.test.js`                                                                                   | `npm test`    |

## Storage y finanzas

| Tarea                                  | Leer primero                                                                                                 | Tests guía                                                                                                                                                                                          | Verificar con                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Persistencia SQLite / JsonTableStorage | `server/data/storage.js`, `server/data/portfolioState.js`, `docs/adr/008-json-table-storage-on-sqljs.md`     | `server/__tests__/storage_concurrency.test.js`, `server/__tests__/integration.test.js`                                                                                                              | `npm test`                                                |
| Holdings / cash / ROI / benchmarks     | `server/finance/portfolio.js`, `server/finance/cash.js`, `server/finance/returns.js`, `shared/benchmarks.js` | `server/__tests__/portfolio.test.js`, `server/__tests__/cash.test.js`, `server/__tests__/returns.test.js`, `server/__tests__/returns.property.test.js`, `server/__tests__/golden_financial.test.js` | `npm test`, `npm run test:perf`, `npm run mutate:changed` |

## Importación y reconciliación

| Tarea                                             | Leer primero                                                                                                                                                  | Tests guía                                                                                                                                 | Verificar con                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Importador CSV / corporate actions / idempotencia | `server/import/csvPortfolioImport.js`, `scripts/import-csv-portfolio.mjs`, `server/data/corporateActions.json`, `docs/adr/006-csv-reconciliation-strategy.md` | `server/__tests__/csv_portfolio_import.test.js`, `server/__tests__/csv_corporate_actions.test.js`, `server/__tests__/csv_sanitize.test.js` | `npm test`, `node scripts/import-csv-portfolio.mjs --dry-run` |

## Renderer y UX

| Tarea                                           | Leer primero                                                                                                                                | Tests guía                                                                                                                                                                   | Verificar con                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Bootstrap del frontend y orquestación principal | `src/App.jsx`, `src/PortfolioManagerApp.jsx`, `src/lib/apiClient.js`, `src/lib/runtimeConfig.js`                                            | `src/__tests__/App.bootstrap.test.tsx`, `src/__smoke__/app.boot.test.tsx`                                                                                                    | `npm test`, `npm run smoke:test` |
| Dashboard / holdings / transactions / settings  | `src/components/DashboardTab.jsx`, `src/components/HoldingsTab.jsx`, `src/components/TransactionsTab.jsx`, `src/components/SettingsTab.jsx` | `src/__tests__/DashboardTab.test.tsx`, `src/__tests__/HoldingsTable.test.tsx`, `src/__tests__/Transactions.integration.test.jsx`, `src/__tests__/PortfolioControls.test.tsx` | `npm test`                       |
| ROI y fallbacks frontend                        | `src/utils/roi.js`, `src/utils/api.js`, `src/components/DashboardTab.jsx`                                                                   | `src/__tests__/AppRoiFallback.test.tsx`, `src/__tests__/roi.test.js`, `src/__tests__/roi.property.test.js`, `src/__tests__/DashboardSummary.test.tsx`                        | `npm test`                       |

## Hotspots a tratar con cuidado

- `server/app.js`: composición de API, middleware, caché, pricing y contratos en un archivo muy grande.
- `src/PortfolioManagerApp.jsx`: bootstrap, efectos de carga, tabs y fallbacks cruzados en un solo shell.
- `server/import/csvPortfolioImport.js`: reglas sensibles de reconciliación e idempotencia.

## Regla de uso

- Si esta tabla te da el camino correcto, abre luego `context/MODULE_INDEX.md` y el
  código real.
- Si una tarea cruza varias filas, validar por la unión de sus comandos, no solo por
  el mínimo común.
