# MODULE_INDEX.md

Carga este archivo cuando necesites ubicar entrypoints y módulos antes de leer código.

## Propósito

Dar un mapa compacto por concern.
No reemplaza la inspección del código real.

## Start here por área

### Backend bootstrap y API

- `server/app.js`
  - composición principal de Express, middleware y rutas
- `server/runtime/startServer.js`
  - arranque del backend y política de scheduler
- `server/index.js`
  - entrypoint standalone del servidor

### Auth y boundary desktop

- `server/middleware/sessionAuth.js`
  - enforcement del session token local
- `server/auth/localPinAuth.js`
  - hash y verificación de PIN local
- `electron/main.cjs`
  - orquestación del proceso desktop
- `electron/preload.cjs`
  - bridge seguro hacia el renderer
- `electron/runtimeConfig.js`
  - handoff de config runtime

### Storage y lógica financiera

- `server/data/storage.js`
  - persistencia SQLite
- `server/data/portfolioState.js`
  - composición de estado del portafolio
- `server/finance/decimal.js`
  - helpers canónicos de Decimal
- `server/finance/portfolio.js`
  - holdings y estado de portfolio
- `server/finance/cash.js`
  - lógica de caja
- `server/finance/returns.js`
  - ROI, benchmarks y retornos

### Importación y reconciliación

- `server/import/csvPortfolioImport.js`
  - importador CSV y reglas de reconciliación
- `scripts/import-csv-portfolio.mjs`
  - CLI de importación
- `server/__tests__/csv_portfolio_import.test.js`
  - cobertura principal del importador

### Precios, scheduler y benchmarks

- `server/data/prices.js`
  - proveedores de precios
- `server/data/priceProviderFactory.js`
  - resolución de proveedor desde config
- `server/jobs/daily_close.js`
  - recomputación de precios, NAV y returns
- `server/jobs/scheduler.js`
  - scheduling nocturno
- `server/cli/backfill.js`
  - recálculo histórico por CLI
- `shared/benchmarks.js`
  - metadata compartida de benchmarks

### Renderer y shell de aplicación

- `src/App.jsx`
  - bootstrap/root del frontend (rutas simplificadas, sin admin)
- `src/PortfolioManagerApp.jsx`
  - shell principal de la app
- `src/lib/apiClient.js`
  - cliente API canónico del renderer
- `src/lib/runtimeConfig.js`
  - manejo de config runtime en frontend
- `src/components/DesktopSessionGate.jsx`
  - boundary de unlock/bootstrap desktop
- `src/components/DashboardTab.jsx`
- `src/components/HoldingsTab.jsx`
- `src/components/TransactionsTab.jsx`
- `src/components/PricesTab.jsx`
- `src/components/SignalsTab.jsx`
- `src/components/SettingsTab.jsx`
- `src/components/SignalTableCard.jsx`
  - componente compartido de matriz de señales

## Tests guía por área

- Runtime y contratos backend:
  - `server/__tests__/api_contract.test.js`
  - `server/__tests__/start_server.test.js`
  - `server/__tests__/session_auth.test.js`
  - `server/__tests__/desktop_runtime_config.test.js`
- Finanzas y storage:
  - `server/__tests__/cash.test.js`
  - `server/__tests__/portfolio.test.js`
  - `server/__tests__/returns.test.js`
  - `server/__tests__/storage_concurrency.test.js`
- Importador:
  - `server/__tests__/csv_portfolio_import.test.js`
- Bootstrap/auth frontend:
  - `src/__tests__/App.bootstrap.test.tsx`
  - `src/__tests__/apiClient.sessionAuth.test.ts`
  - `src/__tests__/runtimeConfig.test.ts`
- UI portfolio/dashboard:
  - `src/__tests__/DashboardSummary.test.tsx`
  - `src/__tests__/Transactions.integration.test.jsx`
  - `src/__tests__/HoldingsTable.test.tsx`

### Scripts y automatización

- `scripts/import-csv-portfolio.mjs`
  - CLI de importación (ver también `server/import/csvPortfolioImport.js`)
- `scripts/electron-dev.mjs`
  - dev server Electron con hot-reload de renderer
- `scripts/run-electron.mjs`
  - launcher de producción y smoke test de Electron
- `scripts/write-commit-stamp.mjs`
  - postbuild: escribe `dist/commit.txt` con el hash actual
- `scripts/bisect-build.sh` / `scripts/bisect-smoke.sh`
  - bisect de regresiones de build/smoke por commit

### Módulos compartidos (renderer + backend)

- `shared/benchmarks.js`
  - metadata de benchmarks usada por ambos lados del boundary
- `shared/constants.js`
  - constantes compartidas
- `shared/precision.js`
  - utilidades de precisión numérica compartidas
- `shared/settings.js`
  - esquema de settings compartido
- `shared/signals.js`
  - definiciones de señales compartidas

### Tests E2E

- `playwright.config.ts`
  - configuración de Playwright; corre con `npm run test:e2e`
- `tests/e2e/dashboard-smoke.spec.ts`
  - smoke de dashboard
- `tests/e2e/bootstrap-auth-recovery.spec.ts`
  - auth y recuperación de sesión

### Herramientas internas

- `tools/run-tests.mjs`
  - runner de `node:test` con cobertura opcional (usado por `npm run test:node`)
- `tools/perf/run-perf-suite.mjs`
  - suite de rendimiento (usado por `npm run test:perf`)
- `tools/perf/syntheticLedger.js`
  - generador de datos sintéticos para tests de perf
- `tools/gitleaks/`
  - binario de gitleaks para `npm run leaks:repo`

## Regla de mantenimiento

- Mantener este archivo en nivel módulo/entrypoint.
- No convertirlo en inventario completo del árbol.
- Si un entrypoint cambia, actualizar solo la línea necesaria.
