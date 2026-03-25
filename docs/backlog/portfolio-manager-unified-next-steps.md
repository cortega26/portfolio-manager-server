# Portfolio Manager Unified — Backlog operativo

Fecha de actualización: 2026-03-20

## Estado actual

| Componente | Estado |
|---|---|
| Baseline R1 + Node 20.19.0 | ✅ PASS |
| Storage SQLite-only | ✅ PASS — sin JSON legacy |
| Shell Electron | ✅ PASS |
| Seguridad HTTP pública (bruteForce, auditLog, rateLimit) | ✅ REMOVIDA |
| Importador CSV (4 archivos) | ✅ PASS — 990 tx, reconciliación exacta |
| Auth multi-portafolio con PIN | ✅ PASS — PIN local por portafolio integrado en Electron |
| Señales y notificaciones UI | 🔶 PARTIAL |
| Precios en tiempo real + scheduler | ✅ PASS — configuración externa y scheduler unificados |
| Benchmarks históricos | ✅ PASS — catálogo `/api/benchmarks` y ROI conectado |
| Email notifications | ⏳ PENDIENTE |
| UI: tabs Prices + Signals | ⏳ PENDIENTE |
| Packaging electron-builder | ⏳ PENDIENTE |

---

## Criterio operativo

* App 100% desktop local — **nada de seguridad orientada a red pública**.
* Persistencia 100% SQLite — **nada de archivos JSON como datos**.
* Auth multi-portafolio vía PIN local, sin servidor de identidad.
* Port selectivo desde R2 solo sobre base reconciliada y simplificada.

Nota vigente sobre reconciliación:

* Holding objetivo de `NVDA` desde los 4 CSV: `0.815097910` tras aplicar split `10:1` a todas las operaciones pre-`2024-06-10`.
* La caja bootstrap queda reconciliada en `196.71 USD` al sumar a los 4 CSV dos movimientos confirmados posteriormente por soporte:
  * `USD 1.00` de gift card como `DEPOSIT` inicial.
  * `USD 4.96` de HYCA como `INTEREST` mensual.
* Desviación documentada: `AGENTS.md` todavía refleja `190.75 USD`, pero el monto operativo correcto fue confirmado explícitamente por el usuario.

---

## Trabajo pendiente priorizado

### 1. Fase 1.5 — Auth multi-portafolio con PIN

Estado: `PASS`

Cerrado en código real:

* Tabla `portfolio_pins` creada por migración `006_portfolio_pins` en `server/migrations/index.js`.
* Hash y verificación con `crypto.scrypt` en `server/auth/localPinAuth.js`.
* Electron `main` lista portafolios, crea PIN y desbloquea sesión antes de inyectar config al renderer.
* UI React arranca con selector de portafolio + flujo de setup/unlock local.
* Tests agregados para hash/verificación, bootstrap desktop y merge de runtime config post-login.

### 2. Fase 5B — Precios en tiempo real, scheduler y benchmarks

Estado: `PASS`

Condición previa: Fase 1.5 completada.
Estado de la condición: `SATISFECHA`

Implementado en código real:

* `server/data/prices.js` con `YahooPriceProvider`, `StooqPriceProvider` y `DualPriceProvider`.
* `server/data/priceProviderFactory.js` para resolver el chain real de proveedores desde configuración externa compartida.
* `server/jobs/daily_close.js` para poblar `prices`, `nav_snapshots` y `returns_daily`.
* `server/jobs/scheduler.js` + `server/runtime/startServer.js` para scheduler nocturno.
* `server/cli/backfill.js` para recalcular históricos vía CLI.
* Endpoints REST: `/api/prices/:symbol`, `/api/prices/bulk`, `/api/benchmarks/summary`.
* Nuevo endpoint REST `GET /api/benchmarks` para catálogo de metadata con `available`, `derived`, `defaults` y `priceSymbols`.
* `server/config.js` ahora soporta:
  * `PRICE_PROVIDER_PRIMARY`
  * `PRICE_PROVIDER_FALLBACK`
  * `BENCHMARK_TICKERS`
  * `BENCHMARK_DEFAULT_SELECTION`
  * `JOB_NIGHTLY_ENABLED`
* `runDailyClose()` y el backfill ahora incluyen holdings reales, `CASH`, benchmarks configurados y `SPY` como benchmark interno obligatorio mientras `returns_daily` siga calculando `r_spy_100`.
* El dashboard ROI consume metadata remota de benchmarks y mantiene fallback local seguro a `spy`, `qqq` y `blended`.

Decisiones cerradas en esta fase:

* No se creó `/api/benchmarks/:ticker`.
* El contrato histórico de series sigue apoyado en `/api/prices/:symbol` y `/api/prices/bulk`.
* `blended` permanece como benchmark derivado disponible siempre.

### 3. Fase 5C — Completar señales

Estado: `PARTIAL`

Tareas:

* Crear endpoint `/api/signals` en Express que compute señales desde posiciones + precio.
* Decidir si la configuración de señales (bandas BUY/TRIM) migra a backend/SQLite.
* Revisar si las notificaciones de señales deben moverse al scheduler (backend) en lugar de solo el renderer.

### 4. Fase 6 — Dividendos, benchmarks y email

Estado: `PENDIENTE`

Tareas:

* Email notifications via `nodemailer`.
* Revisar si faltan alertas o resúmenes asociados a dividendos neto/bruto para reporting desktop.
* Definir alcance final de notificaciones por email sin degradar el modelo desktop-first.

### 5. Fase 7 — UI completa

Estado: `PARTIAL`

Tareas:

* Tab `Prices` con precios en tiempo real consumiendo la capa ya cerrada en Fase 5B.
* Tab `Signals` conectado al backend (depende de Fase 5C).
* Settings con configuración de scheduler y alertas.

### 6. Fase 8 — Packaging y CI

Estado: `PENDIENTE`

Tareas:

* Configurar `electron-builder` para distribución.
* Script de build de producción completo.
* CI pipeline.

---

## Archivos clave a leer al retomar

1. `AGENTS.md`
2. `docs/reference/portfolio-manager-unified-status.md`
3. este backlog (`docs/backlog/portfolio-manager-unified-next-steps.md`)
4. `server/app.js`
5. `server/data/storage.js`
6. `server/migrations/index.js`
7. `electron/main.cjs`
8. `electron/preload.cjs`

---

## Criterios para una nueva conversación

Si se retoma en una conversación nueva, el agente debe:

1. Usar Node `20.19.0` real desde `.tools/node-v20.19.0-linux-x64`.
2. Correr `npm test` antes de editar.
3. Leer primero:
   * `AGENTS.md`
   * `docs/reference/portfolio-manager-unified-status.md`
   * `docs/backlog/portfolio-manager-unified-next-steps.md`
4. El CSV ya está importado en `./data/storage.sqlite` — no reimportar salvo que el usuario lo indique.
5. Continuar desde `Fase 5C` (señales) o desde el siguiente bloque que el usuario priorice.
