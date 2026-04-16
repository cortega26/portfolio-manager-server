# Portfolio Manager Unified — Backlog operativo

Fecha de actualización: 2026-04-10

## Estado actual

| Componente                                               | Estado                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| Baseline R1 + Node 20.19.0                               | ✅ PASS                                                          |
| Storage SQLite-only                                      | ✅ PASS — sin JSON legacy                                        |
| Shell Electron                                           | ✅ PASS                                                          |
| Seguridad HTTP pública (bruteForce, auditLog, rateLimit) | ✅ REMOVIDA + archivos zombi eliminados                          |
| Limpieza código muerto (Phase A)                         | ✅ PASS — 16 archivos, 13 ediciones, express-rate-limit removido |
| Importador CSV (4 archivos)                              | ✅ PASS — 990 tx, reconciliación exacta                          |
| Auth multi-portafolio con PIN                            | ✅ PASS — PIN local por portafolio integrado en Electron         |
| Señales y notificaciones UI                              | 🔶 PARTIAL — motor + tabs OK, canal persistente pendiente        |
| Precios en tiempo real + scheduler                       | ✅ PASS — configuración externa y scheduler unificados           |
| Benchmarks históricos                                    | ✅ PASS — catálogo `/api/benchmarks` y ROI conectado             |
| UI: tab Prices                                           | ✅ PASS — vista dedicada conectada a latest-only pricing         |
| UI: tab Signals                                          | ✅ PASS — vista dedicada conectada al preview backend            |
| UI: Settings de alertas + estado scheduler               | ✅ PASS — persistencia real y estado runtime visible             |
| AdminTab (R1 público)                                    | ✅ REMOVIDO — componente + rutas + tests eliminados              |
| README + .env.example                                    | ✅ ACTUALIZADO para desktop                                      |
| CI pipeline                                              | ✅ SIMPLIFICADO — sin Playwright admin, sin deploy.yml           |
| Email notifications                                      | ⏳ PENDIENTE                                                     |
| Packaging electron-builder                               | ⏳ PENDIENTE                                                     |

---

## Criterio operativo

- App 100% desktop local — **nada de seguridad orientada a red pública**.
- Persistencia 100% SQLite — **nada de archivos JSON como datos**.
- Auth multi-portafolio vía PIN local, sin servidor de identidad.
- Port selectivo desde R2 solo sobre base reconciliada y simplificada.

Nota vigente sobre reconciliación:

- Holding objetivo de `NVDA` desde los 4 CSV: `0.815097910` tras aplicar split `10:1` a todas las operaciones pre-`2024-06-10`.
- La caja bootstrap queda reconciliada en `196.71 USD` al sumar a los 4 CSV dos movimientos confirmados posteriormente por soporte:
  - `USD 1.00` de gift card como `DEPOSIT` inicial.
  - `USD 4.96` de HYCA como `INTEREST` mensual.
- Desviación documentada: `AGENTS.md` todavía refleja `190.75 USD`, pero el monto operativo correcto fue confirmado explícitamente por el usuario.

---

## Trabajo pendiente priorizado

### 1. Fase 1.5 — Auth multi-portafolio con PIN

Estado: `PASS`

Cerrado en código real:

- Tabla `portfolio_pins` creada por migración `006_portfolio_pins` en `server/migrations/index.js`.
- Hash y verificación con `crypto.scrypt` en `server/auth/localPinAuth.js`.
- Electron `main` lista portafolios, crea PIN y desbloquea sesión antes de inyectar config al renderer.
- UI React arranca con selector de portafolio + flujo de setup/unlock local.
- Tests agregados para hash/verificación, bootstrap desktop y merge de runtime config post-login.

### 2. Fase 5B — Precios en tiempo real, scheduler y benchmarks

Estado: `PASS`

Condición previa: Fase 1.5 completada.
Estado de la condición: `SATISFECHA`

Implementado en código real:

- `server/data/prices.js` con `YahooPriceProvider`, `StooqPriceProvider` y `DualPriceProvider`.
- `server/data/priceProviderFactory.js` para resolver el chain real de proveedores desde configuración externa compartida.
- `server/jobs/daily_close.js` para poblar `prices`, `nav_snapshots` y `returns_daily`.
- `server/jobs/scheduler.js` + `server/runtime/startServer.js` para scheduler nocturno.
- `server/cli/backfill.js` para recalcular históricos vía CLI.
- Endpoints REST: `/api/prices/:symbol`, `/api/prices/bulk`, `/api/benchmarks/summary`.
- Nuevo endpoint REST `GET /api/benchmarks` para catálogo de metadata con `available`, `derived`, `defaults` y `priceSymbols`.
- `server/config.js` ahora soporta:
  - `PRICE_PROVIDER_PRIMARY`
  - `PRICE_PROVIDER_FALLBACK`
  - `BENCHMARK_TICKERS`
  - `BENCHMARK_DEFAULT_SELECTION`
  - `JOB_NIGHTLY_ENABLED`
- `runDailyClose()` y el backfill ahora incluyen holdings reales, `CASH`, benchmarks configurados y `SPY` como benchmark interno obligatorio mientras `returns_daily` siga calculando `r_spy_100`.
- El dashboard ROI consume metadata remota de benchmarks y mantiene fallback local seguro a `spy`, `qqq` y `blended`.

Decisiones cerradas en esta fase:

- No se creó `/api/benchmarks/:ticker`.
- El contrato histórico de series sigue apoyado en `/api/prices/:symbol` y `/api/prices/bulk`.
- `blended` permanece como benchmark derivado disponible siempre.

### 3. Phase A — Limpieza de código muerto

Estado: `PASS`

Cerrado 2026-04-10:

- 16 archivos zombi eliminados (bruteForce, auditLog, eventsStore, rateLimitMetrics, apiKey, AdminTab, CNAME, backlog.csv, etc.)
- 13 archivos fuente/test editados para remover imports y mocks de módulos eliminados.
- `express-rate-limit` removido de dependencias.
- Package renombrado a `portfolio-manager-unified`.
- CI simplificado: removido Playwright admin fallback check y deploy.yml.
- Tests: node:test 325 pass, Vitest 79 pass, coverage 56.19%.

### 4. Fase 5C — Completar señales

Estado: `PARTIAL`

Tareas:

Ya implementado en código real:

- `POST /api/signals` en Express para preview backend.
- Motor compartido en `shared/signals.js`.
- Holdings consume el preview backend y dispara toasts según transición de estado.
- La configuración de señales persiste dentro del payload del portafolio.
- Nueva tab `Signals` dedicada conectada al mismo preview backend y reutilizando la matriz de señales compartida.

Pendiente:

- Revisar si las notificaciones de señales deben moverse al scheduler (backend) o a otro canal persistente.
- Definir el canal persistente final para alertas recurrentes ahora que las preferencias de usuario ya quedan guardadas en el payload real del portafolio.

### 4. Fase 6 — Dividendos, benchmarks y email

Estado: `PENDIENTE`

Tareas:

- Email notifications via `nodemailer`.
- Revisar si faltan alertas o resúmenes asociados a dividendos neto/bruto para reporting desktop.
- Definir alcance final de notificaciones por email sin degradar el modelo desktop-first.

### 6. Fase 7 — UI completa

Estado: `PASS`

Ya implementado:

- Tab `Prices` con precios en tiempo real consumiendo la capa cerrada en Fase 5B.
- Tab `Signals` conectada al preview backend con superficie dedicada y reutilización de la tabla de señales en `Holdings`.
- `Settings` con persistencia real de alertas y visibilidad del scheduler runtime.
- AdminTab removido — la UI es 100% desktop-first sin artefactos públicos.

### 7. Fase 8 — Packaging y CI

Estado: `PENDIENTE`

Tareas:

- Configurar `electron-builder` para distribución (AppImage/deb, dmg, nsis).
- Scripts de build de producción (`dist:linux`, `dist:mac`, `dist:win`).
- Release workflow en GitHub Actions (tag → build → upload).
- Electron smoke test en CI.

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
   - `AGENTS.md`
   - `docs/reference/portfolio-manager-unified-status.md`
   - `docs/backlog/portfolio-manager-unified-next-steps.md`
4. El CSV ya está importado en `./data/storage.sqlite` — no reimportar salvo que el usuario lo indique.
5. Continuar desde cierre del alcance backend/persistente de alertas de `Fase 5C` o desde settings de scheduler/alertas si el usuario prioriza esa rama.
