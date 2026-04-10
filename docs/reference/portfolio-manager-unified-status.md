# Portfolio Manager Unified — Estado de integración

Fecha de actualización: 2026-04-10

## Objetivo de este archivo

Dejar contexto suficiente para retomar la integración en una conversación nueva sin reconstruir historial oral.

---

## Base real verificada

Repositorio base: `portfolio-manager-unified` en `/home/carlos/VS_Code_Projects/portafolio-unificado`

Repositorio de referencia R2: `mi_portfolio` clonado en `/home/carlos/VS_Code_Projects/mi_portfolio-reference`

Hechos verificados:

* R1 usa ESM y exige Node `>=20.19.0`.
* El storage es `JsonTableStorage` sobre SQLite — **cero dependencia en JSON** en runtime.
* El cliente API real del frontend entra por `requestApi()` y `requestJson()`.
* El baseline fue estabilizado antes de avanzar con integración.

---

## Runtime reproducible

```bash
env PATH="/home/carlos/VS_Code_Projects/portafolio-unificado/.tools/node-v20.19.0-linux-x64/bin:$PATH" node -v
env PATH="/home/carlos/VS_Code_Projects/portafolio-unificado/.tools/node-v20.19.0-linux-x64/bin:$PATH" npm ci --no-fund --no-audit
env PATH="/home/carlos/VS_Code_Projects/portafolio-unificado/.tools/node-v20.19.0-linux-x64/bin:$PATH" npm test
```

Resultado vigente:

* `node -v` → `v20.19.0`
* `npm ci` → OK
* `npm test` → OK (`node:test` 325 pass, 0 fail, 1 skipped; Vitest 79 pass, 0 fail; coverage 56.19%)

---

## Fases completadas

### Fase 0 — Bootstrap

Estado: `PASS`

R1 como base real. R2 disponible solo como referencia.

### Fase 0.5 — Baseline triage

Estado: `PASS`

Baseline estabilizado. Tests corridos y mantenidos verdes.

### Fase 1 — Seguridad desktop (session token)

Estado: `PASS`

* Middleware `server/middleware/sessionAuth.js` implementado.
* Auth configurable en `createApp()` con modo `session`.
* `requestApi()` propaga el token automáticamente.
* El token se genera en Electron `main` y se inyecta al renderer vía preload.
* **No hay ningún rastro de `portfolio-key` en el codebase.**

### Fase 1.5 — Auth multi-portafolio con PIN local

Estado: `PASS`

Implementado y validado:

* Hash y verificación de PIN local con `crypto.scrypt` en `server/auth/localPinAuth.js`.
* Tabla `portfolio_pins` creada por migración `006_portfolio_pins` en `server/migrations/index.js`.
* Electron `main` expone handlers seguros para listar portafolios, crear PIN y desbloquear sesión.
* `preload` expone el bridge mínimo al renderer sin filtrar acceso directo a SQLite.
* El token de sesión por proceso se mantiene en memoria y no se expone al renderer hasta que el PIN del portafolio se valida.
* La UI React arranca con una pantalla explícita de desbloqueo local y mezcla el runtime config solo después del unlock.
* Copy bilingüe agregado para el flujo de setup/unlock.

Cobertura agregada:

* `server/__tests__/local_pin_auth.test.js`
* `src/__tests__/App.bootstrap.test.tsx`
* `src/__tests__/runtimeConfig.test.ts`

### Fase 2 — Storage SQLite-only

Estado: `PASS`

* `JsonTableStorage` sobre SQLite opera sin ninguna referencia a archivos JSON en runtime.
* `server/data/storage.js` es 100% SQLite.
* `server/migrations/index.js` simplificado: **no lee ni escribe archivos JSON legacy** — arranca desde cero completamente limpio.
* La migración `002_portfolio_keys` existe por compatibilidad de esquema pero la tabla está vacía y no tiene consumidores en runtime.
* El directorio `data/` solo contiene `storage.sqlite` (generado por el importador).

Limpieza adicional completada:

* Eliminados módulos de seguridad HTTP públicos de `app.js`:
  * `bruteForce`, `auditLog`, `eventsStore`, tres rate-limiters, y los endpoints `/api/security/events` y `/api/security/stats`.
* Eliminados tests asociados: `audit_log.test.js`, `bruteForce.test.js`, `security_events.test.js`, `rate_limit_monitoring.test.js`.
* Tests afectados actualizados: `api_validation.test.js`, `compression.test.js`.

Archivos de seguridad HTTP que ya no se usan en `app.js` (existen en disco como módulos inertes):

* `server/middleware/bruteForce.js`
* `server/middleware/auditLog.js`
* `server/security/eventsStore.js`

### Fase 3 — Shell Electron

Estado: `PASS`

* `electron/main.cjs`, `electron/preload.cjs`, `electron/runtimeConfig.js` implementados.
* Backend Express embebido en loopback.
* Session token por proceso generado en `main`.
* Renderer sin acceso directo a SQLite.

Archivos Electron:

* `electron/main.cjs`
* `electron/preload.cjs`
* `electron/runtimeConfig.js`
* `electron/package.json`
* `scripts/run-electron.mjs`
* `scripts/electron-dev.mjs`

Nota: Electron `main` y `preload` son CommonJS por exigencia del runtime real.

### Fase 4 — Importador CSV

Estado: `PASS`

* Importador en `server/import/csvPortfolioImport.js`.
* CLI en `scripts/import-csv-portfolio.mjs`.
* Script npm: `npm run import:csv`.
* Idempotente por IDs deterministas `csv:<archivo>:<linea>`.
* Soporta `--dry-run`.
* **CSV importado exitosamente** en `./data/storage.sqlite` con 990 transacciones.

Reconciliación validada (real ejecutado 2026-03-20):

```text
AMD   0.305562260
DELL  0.454749913
GLD   0.001016562
NVDA  0.815097910
TSLA  0.783956628
Cash  196.71 USD
```

Nota operativa:

* `NVDA` quedó corregido para aplicar el split `10:1` a todas las operaciones pre-`2024-06-10`, incluidas ventas.
* `LRCX` quedó ajustado explícitamente para reconciliar la posición final en `0`.
* La caja `196.71 USD` queda reconciliada al agregar dos ajustes sintéticos confirmados posteriormente por soporte:
  * `USD 1.00` como `DEPOSIT` inicial por gift card, tratado como aporte externo.
  * `USD 4.96` como `INTEREST` HYCA mensual, tratado como rendimiento del portafolio.
* Desviación documentada: `AGENTS.md` sigue mencionando `190.75 USD` y solo 4 CSV como base primaria, pero el monto operativo correcto del portafolio quedó confirmado por el usuario y por soporte en `196.71 USD`.

### Fase 5 — Señales y notificaciones

Estado: `PARTIAL`

Ya implementado:

* Motor compartido de señales en `shared/signals.js`.
* Endpoint `POST /api/signals` en Express para preview backend sobre transacciones + precios.
* Señales calculadas desde última operación BUY/SELL.
* Sanity check +/-25% en renderer.
* Holdings consume el preview backend y muestra las señales calculadas.
* Nueva pestaña `Signals` dedicada reutiliza la misma matriz de señales y permite editar ventanas por ticker desde una superficie separada.
* Notificaciones tipo toast para BUY zone y TRIM zone.
* La configuración de señales ya viaja dentro del payload persistido del portafolio.
* `Settings` ya controla toasts de transición de señales, banners de mercado y banners de fallback ROI.
* `Settings` también muestra el estado runtime del scheduler nocturno expuesto por Electron (`JOB_NIGHTLY_ACTIVE`, `JOB_NIGHTLY_HOUR_UTC`).

Pendiente:

* Definir si las notificaciones/alertas de señales deben moverse al scheduler o a un canal persistente.
* Implementar el canal persistente final para email/notificaciones fuera del renderer.

### Fase 5A — Limpieza SQLite-only

Estado: `PASS` (completada)

Todo el legacy JSON y toda la seguridad HTTP pública fue removida. Codebase 100% SQLite y 100% desktop-first.

### Fase 5B — Precios, scheduler y benchmarks

Estado: `PASS`

Implementado y validado:

* `loadConfig()` ahora centraliza proveedores, benchmarks monitoreados, selección default y scheduler con:
  * `PRICE_PROVIDER_PRIMARY`
  * `PRICE_PROVIDER_FALLBACK`
  * `BENCHMARK_TICKERS`
  * `BENCHMARK_DEFAULT_SELECTION`
  * `JOB_NIGHTLY_ENABLED`
* `server/data/priceProviderFactory.js` unifica la construcción de proveedores para `createApp()` y `runDailyClose()`, con soporte `yahoo`, `stooq` y `none`.
* `startServer()` respeta `config.jobs.nightlyEnabled` cuando no recibe override explícito, y `server/index.js` dejó de forzar `startScheduler: true`.
* Electron conserva override explícito con `startScheduler: false`, evitando regresiones en desktop.
* `runDailyClose()` y el backfill siguen poblando `prices`, `nav_snapshots` y `returns_daily`, pero ahora garantizan seguimiento para:
  * holdings reales
  * `CASH`
  * benchmarks configurados
  * `SPY` aunque no esté en `BENCHMARK_TICKERS`, mientras `returns_daily` siga usando `r_spy_100` y `r_bench_blended`
* Se mantiene sin cambios el contrato histórico sobre:
  * `GET /api/prices/:symbol`
  * `GET /api/prices/bulk`
  * `GET /api/benchmarks/summary`
* Se agregó `GET /api/benchmarks` como catálogo mínimo de metadata con:
  * `available`
  * `derived`
  * `defaults`
  * `priceSymbols`
* `blended` quedó definido como benchmark derivado estable y la UI del dashboard ya consume el catálogo remoto con fallback local seguro.

Cobertura agregada/actualizada:

* `server/__tests__/config.test.js`
* `server/__tests__/start_server.test.js`
* `server/__tests__/daily_close.test.js`
* `server/__tests__/api_contract.test.js`
* tests frontend de bootstrap, ROI y dashboard ajustados para cargar metadata de benchmarks

### Fase 5D — Prices tab

Estado: `PASS`

Implementado y validado:

* Nueva pestaña `Prices` integrada al shell principal vía `src/components/TabBar.jsx`.
* Vista dedicada en `src/components/PricesTab.jsx`.
* `PortfolioManagerApp.jsx` refresca precios latest-only con `fetchBulkPrices(..., { latestOnly: true })`.
* La pestaña lista holdings abiertos y benchmarks monitorizados en una sola tabla.
* El refresh manual reutiliza la misma capa backend de pricing y sincroniza `currentPrices` para el resto de la app.
* Copy bilingüe agregado para la nueva vista.

Cobertura agregada/actualizada:

* `src/__tests__/PricesTab.test.tsx`
* `src/__tests__/DashboardNavigation.test.tsx`

### Fase 5E — Signals tab

Estado: `PASS`

Implementado y validado:

* Nueva pestaña `Signals` integrada al shell principal vía `src/components/TabBar.jsx`.
* Vista dedicada en `src/components/SignalsTab.jsx`.
* Nueva pieza compartida `src/components/SignalTableCard.jsx` para reutilizar la matriz de señales entre `Holdings` y `Signals`.
* `HoldingsTab.jsx` dejó de duplicar la lógica de señales y ahora consume el componente compartido.
* `PortfolioManagerApp.jsx` enruta la nueva pestaña y reutiliza el mismo estado/backend preview ya existente.
* Copy bilingüe agregado para la nueva vista.

Cobertura agregada/actualizada:

* `src/__tests__/SignalsTab.test.tsx`
* `src/__tests__/DashboardNavigation.test.tsx`

### Fase 5F — Settings de alertas y scheduler

Estado: `PASS`

Implementado y validado:

* La forma canónica de `settings` quedó centralizada en `shared/settings.js` para eliminar drift entre renderer, validación API y storage.
* `POST /api/portfolio/:id` ya no descarta preferencias persistidas: backend guarda e hidrata el payload completo de `settings`.
* `SettingsTab.jsx` ahora controla:
  * toasts de transición de señales
  * banners de mercado cerrado/último cierre
  * banners de fallback ROI
* `PortfolioManagerApp.jsx` conecta esos toggles a comportamiento real, sin dejar preferencias huérfanas.
* Electron inyecta metadata runtime del scheduler nocturno para que `Settings` muestre el estado efectivo del shell desktop.

Cobertura agregada/actualizada:

* `server/__tests__/integration.test.js`
* `server/__tests__/portfolio.test.js`
* `server/__tests__/desktop_runtime_config.test.js`
* `src/__tests__/App.settingsPersistence.test.jsx`
* `src/__tests__/App.pricing.test.jsx`
* `src/__tests__/runtimeConfig.test.ts`
* `src/__tests__/portfolioSchema.test.js`

---

## Próximos pasos — Consultar el backlog

* [docs/backlog/portfolio-manager-unified-next-steps.md](/home/carlos/VS_Code_Projects/portafolio-unificado/docs/backlog/portfolio-manager-unified-next-steps.md)

---

## Invariantes vigentes a respetar

* No usar aritmética nativa JS en cálculos financieros (`decimal.js`).
* No romper el baseline verde.
* No introducir acceso directo del renderer a SQLite.
* No reintroducir archivos JSON como persistencia de datos.
* No reintroducir rate limiting ni seguridad HTTP orientada a exposición pública.
* La reconciliación exacta operativa del importador queda en `196.71 USD` por instrucción explícita del usuario y confirmación de soporte.
* El siguiente bloque activo pasa a ser cierre backend/persistente de alertas de señales (`Fase 5C`) o settings de scheduler/alertas, con `Fase 5D` y `Fase 5E` ya cerradas en `PASS`.
