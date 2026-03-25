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
  - bootstrap/root del frontend
- `src/PortfolioManagerApp.jsx`
  - shell principal de la app
- `src/lib/apiClient.js`
  - cliente API canónico del renderer
- `src/lib/runtimeConfig.js`
  - manejo de config runtime en frontend
- `src/components/DesktopSessionGate.jsx`
  - boundary de unlock/bootstrap desktop
- `src/components/DashboardTab.jsx`
- `src/components/TransactionsTab.jsx`
- `src/components/SettingsTab.jsx`

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

## Regla de mantenimiento

- Mantener este archivo en nivel módulo/entrypoint.
- No convertirlo en inventario completo del árbol.
- Si un entrypoint cambia, actualizar solo la línea necesaria.
