# KNOWN_INVARIANTS.md

Carga este archivo cuando la tarea toque finanzas, importación, auth, storage, Electron o contratos sensibles.

## Propósito

Registrar únicamente hechos confirmados y estables que sería costoso olvidar.

## Invariantes confirmados

### Base del sistema

- `portfolio-manager-unified` sigue siendo una app desktop local con React + Vite, Fastify, Electron y SQLite.
- R1 (`portfolio-manager-server`) es la base obligatoria.
- R2 (`mi_portfolio`) es solo fuente selectiva de funcionalidades.

### Finanzas y dominio

- Nunca usar aritmética nativa de JavaScript para cálculos financieros.
- Usar `decimal.js` para montos, cantidades, costos promedio, ROI, reconciliaciones y agregaciones monetarias.
- La lógica financiera debe permanecer desacoplada de la UI.
- Reglas de importación y reconciliación deben ser explícitas, centralizadas y testeables.
- La idempotencia debe basarse en claves deterministas.
- Los dividendos deben preservarse como bruto e impuesto/retención por separado.
- **Precisión de fracciones de acciones**: el broker Fintual opera con resolución de 9 decimales (NanoShares: 1 share = 1_000_000_000 NanoShares). El tipo `MicroShares` (6 decimales) aplica a otros brokers. Usar `NanoShares` y `fromNanoShares`/`toNanoShares` de `server/finance/decimal.ts` para operaciones con Fintual.

### Persistencia y desktop

- El renderer nunca accede directo a SQLite.
- Toda lectura y escritura pasa por la API local Fastify y el boundary seguro de Electron.
- La seguridad desktop no depende del modelo de API keys público heredado.
- La autenticación local usa session token por proceso.

### Importación histórica

- La carga inicial del portafolio parte de estos CSV locales:
  - `32996_asset_market_buys.csv`
  - `32996_asset_market_sells.csv`
  - `32996_forex_buys.csv`
  - `tailormade-broker-dividends-2026-03-18.csv`
- `NVDA` se ajusta por split `10:1` para operaciones anteriores a `2024-06-10`, incluyendo compras y ventas.
- `LRCX` requiere reconciliación histórica explícita para dejar posición final en `0`.
- Las posiciones finales solo se consideran reconciliadas si coinciden exactamente con:
  - `AMD 0.305562260`
  - `DELL 0.454749913`
  - `GLD 0.001016562`
  - `NVDA 0.815097910`
  - `TSLA 0.783956628`

### Calidad operativa

- Cada fase relevante termina con baseline verde.
- La validación mínima obligatoria es `npm test`.
- No avanzar a funcionalidades avanzadas si el import inicial todavía no reconcilia exacto.

## Conflictos confirmados o contexto no estable

Estos hechos existen en el repo, pero no deben congelarse aquí como verdad estable:

- El target de caja del importador está en conflicto documental:
  - `AGENTS.md` histórico: `190.75 USD`
  - `status/backlog` actuales: `196.71 USD`
- El orden de backlog, estado de fases, conteos exactos de tests y paths locales de tooling pertenecen a contexto runtime.
- La disponibilidad de herramientas como vexp `run_pipeline` depende del entorno y no es un invariante del proyecto.

## Regla de actualización

Agregar algo aquí solo si cumple las tres condiciones:

- está confirmado por código, tests o decisión explícita del usuario
- es estable entre conversaciones
- omitirlo aumentaría el riesgo de regresión o decisión incorrecta
