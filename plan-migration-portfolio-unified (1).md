# PLAN DE INTEGRACION: `portfolio-manager-unified`
## Fusion de `portfolio-manager-server` (R1) + `mi_portfolio` (R2) con importacion inicial desde 4 CSV

```text
Version        : 2.0.0
Fecha          : 2026-03-18
Estado         : Revisado contra los repos reales y contra los 4 CSV locales
Destino        : Nueva conversacion con un agente LLM con acceso a filesystem, git, bash y npm
R1             : https://github.com/cortega26/portfolio-manager-server
R2             : https://github.com/cortega26/mi_portfolio
Node requerido : >= 20.19.0
Plataformas    : macOS, Windows, Linux
Objetivo       : Aplicacion desktop unica con React + Express + Electron + SQLite
```

---

## 0. Proposito de este documento

Este documento reemplaza al plan anterior. Su objetivo es que un agente pueda abrir una conversacion nueva, desde cero, y tenga contexto suficiente para:

1. partir desde el repositorio R1 real;
2. portar la funcionalidad relevante de R2;
3. poblar el portafolio inicial usando como fuente de verdad los 4 archivos CSV ya disponibles;
4. entregar una app desktop unica, empaquetable y verificable.

Este plan ya incorpora correcciones importantes detectadas al contrastar el plan previo contra el codigo real de R1 y R2.

---

## 1. Resumen ejecutivo

La integracion debe hacerse sobre `portfolio-manager-server` como base, no sobre un proyecto nuevo vacio. R1 ya contiene:

- frontend React + Vite;
- backend Express;
- validacion con Zod;
- logica financiera con `decimal.js`;
- tests amplios en `server/__tests__` y `src/__tests__`.

R2 aporta:

- scheduler de mercado;
- motor de senales BUY/SELL;
- scraper de precios;
- notificaciones por email;
- benchmarks historicos;
- configuracion YAML;
- dashboard con tabs de precios y senales;
- logica de importacion desde datos historicos.

La carga inicial del portafolio NO debe depender del workbook `.xlsx` de R2 como camino principal. La fuente de verdad confirmada para el poblado inicial son estos 4 CSV ya presentes localmente:

- `32996_asset_market_buys.csv`
- `32996_asset_market_sells.csv`
- `32996_forex_buys.csv`
- `tailormade-broker-dividends-2026-03-18.csv`

---

## 2. Hechos verificados contra los repos reales

### 2.1 R1 real

Hechos importantes ya verificados:

- `package.json` de R1 exige Node `>=20.19.0`.
- R1 usa ESM (`"type": "module"`).
- R1 tiene `server/app.js`, `server/index.js`, `src/lib/apiClient.js`, `src/utils/api.js`, `server/data/storage.js`, `server/middleware/bruteForce.js`, `server/middleware/auditLog.js`, `server/security/eventsStore.js`.
- R1 tiene un cliente API ya estructurado con `requestApi()` y `requestJson()`. No se debe asumir que el frontend usa `fetch('/api/...')` directo en todos lados.
- R1 ya tiene una bateria de tests extensa. El baseline debe mantenerse verde fase a fase.

Correccion clave respecto del plan anterior:

- `server/data/storage.js` NO exporta `readPortfolio()` / `writePortfolio()` / `appendPortfolioLogEntry()` como API publica principal.
- R1 real expone una clase `JsonTableStorage` con metodos tipo `readTable()`, `writeTable()`, `upsertRow()`, `deleteWhere()`.
- Por tanto, la migracion a SQLite debe preservar el contrato observable a nivel de aplicacion, rutas y tests, no una firma ficticia.

### 2.2 R2 real

Hechos importantes ya verificados:

- R2 contiene `signals.py`, `scheduler.py`, `scraper.py`, `notifier.py`, `config.yaml`, `database.py`, `migrate.py`, `dashboard.py`, `sync_benchmark_history.py`.
- `signals.py` implementa bandas BUY/SELL y sanity check de +/-25%.
- `config.yaml` real incluye `notifications`, `scheduler`, `market`, `data_sources`, `stocks`, `benchmarks`, `portfolio`.
- `migrate.py` real importa desde hojas `Datos`, `Portafolio` y `Config`; no solo desde una hoja "Stocks".
- `dashboard.py` real expone al menos tabs equivalentes a Portfolio, Prices, Senales, Operaciones y Config.

Correccion clave respecto del plan anterior:

- el plan nuevo NO debe reducir la importacion a una sola hoja ni asumir que el frontend se limita a un port simple de tabs; hay que adaptar selectivamente la funcionalidad de R2 al modelo y UI de R1.

---

## 3. Fuente de verdad para poblado inicial: 4 CSV

### 3.1 Archivos

Los archivos verificados son:

```text
32996_asset_market_buys.csv
32996_asset_market_sells.csv
32996_forex_buys.csv
tailormade-broker-dividends-2026-03-18.csv
```

### 3.2 Conteos validados

- Compras de activos: 465 filas de datos
- Ventas de activos: 482 filas de datos
- Compras de USD / fondeo forex: 2 filas de datos
- Dividendos: 20 filas de datos

### 3.3 Reglas confirmadas por el usuario

Estas reglas ya estan decididas y no deben reabrirse:

1. `NVDA` debe ajustarse por split `10:1` para operaciones anteriores a `2024-06-10`.
2. `LRCX` debe ajustarse por reconciliacion historica para que la posicion final quede en `0`.
3. Los dividendos deben importarse como `DIVIDEND` bruto mas una transaccion separada de impuesto / retencion.

### 3.4 Reconciliacion economica confirmada

Suma de flujos a partir de los 4 CSV:

- Compras: `7211.25 USD`
- Ventas: `6971.90 USD`
- Forex: `426.82 USD`
- Dividendos brutos: `3.74 USD`
- Impuesto dividendos: `0.46 USD`
- Dividendos netos: `3.28 USD`

Caja resultante esperada despues de importar todo:

```text
190.75 USD
```

Posiciones finales reconciliadas esperadas despues de aplicar los ajustes de split aprobados:

```text
AMD   0.305562260
DELL  0.454749913
GLD   0.001016562
NVDA  3.392359240
TSLA  0.783956628
Cash  190.75 USD
```

Estas cifras son criterio de aceptacion obligatorio del importador CSV.

---

## 4. Invariantes del agente

```text
INV-01  Nunca usar aritmetica nativa de JS para calculos financieros.
        Usar decimal.js para montos, cantidades, promedios, bandas y ROI.

INV-02  Mantener R1 como base de trabajo. No recrear frontend ni backend desde cero.

INV-03  Cada fase termina con el baseline de R1 en verde.
        Comando minimo: npm test

INV-04  El importador CSV debe ser idempotente.
        Reejecutarlo no puede duplicar transacciones.

INV-05  Las 4 fuentes CSV son la verdad para el poblado inicial del portafolio.
        El workbook xlsx de R2 queda como fuente opcional futura, no primaria.

INV-06  La importacion de dividendos debe preservar bruto e impuesto por separado.

INV-07  El ajuste de split de NVDA y LRCX debe quedar codificado de forma explicita,
        documentada y testeada; nunca implito "a mano".

INV-08  El renderer de Electron nunca accede directo a SQLite.
        Toda lectura/escritura va via API Express local.

INV-09  La seguridad desktop reemplaza el modelo de API keys de R1.
        Usar session token por proceso.

INV-10  Antes de dar por bueno el import, verificar contra el saldo de caja
        y las posiciones finales esperadas.
```

---

## 5. Objetivo funcional final

El sistema final debe ser una app desktop unica que:

- corre localmente como Electron;
- embebe el frontend React de R1;
- embebe el backend Express de R1;
- usa SQLite para persistencia;
- sincroniza precios, senales, benchmarks y notificaciones inspiradas en R2;
- importa el historial inicial del usuario a partir de los 4 CSV;
- deja el portafolio real ya poblado al primer arranque.

---

## 6. Arquitectura objetivo

### 6.1 Base del proyecto

Tomar R1 como repositorio base y evolucionarlo a `portfolio-manager-unified`.

### 6.2 Persistencia

Migrar del almacenamiento actual basado en JSON/archivos de R1 a SQLite.

### 6.3 Desktop

Usar Electron, no Tauri.

### 6.4 Precios y senales

Portar desde R2:

- scraping de precios;
- sanity check de +/-25%;
- scheduler de mercado;
- senales BUY/SELL;
- notificaciones por email;
- benchmarks historicos.

### 6.5 Configuracion

Usar `config.yaml` inspirado en R2, pero adaptado al proyecto unificado.

### 6.6 Importacion inicial

La importacion inicial se hace desde CSV y escribe transacciones en el modelo unificado.

---

## 7. Mapeo de datos CSV al modelo unificado

### 7.1 `32996_asset_market_buys.csv`

Mapear cada fila a una transaccion `BUY`.

Campos:

- `date`: `Fecha de compra`
- `ticker`: `Simbolo activo`
- `amount`: `Aporte en dolares`
- `quantity`: `Acciones compradas`
- `price`: `amount / quantity`
- `note`: incluir `Nombre activo`, `Categoria activo`, nombre de archivo y numero de linea

### 7.2 `32996_asset_market_sells.csv`

Mapear cada fila a una transaccion `SELL`.

Campos:

- `date`: `Fecha de venta`
- `ticker`: `Simbolo activo`
- `amount`: `Rescate en dolares`
- `quantity`: cantidad negativa equivalente a `Acciones vendidas`
- `price`: `amount / abs(quantity)`
- `note`: incluir `Nombre activo`, `Categoria activo`, nombre de archivo y numero de linea

### 7.3 `32996_forex_buys.csv`

Mapear cada fila a una transaccion `DEPOSIT` en USD.

Campos:

- `date`: `Fecha de compra`
- `amount`: `Dolares comprados`
- `ticker`: `null`
- `note`: incluir monto CLP, tipo de cambio implicito, nombre de archivo y numero de linea

No crear una segunda transaccion en CLP. El sistema objetivo es USD-centrico.

### 7.4 `tailormade-broker-dividends-2026-03-18.csv`

Por cada fila crear 2 transacciones:

1. `DIVIDEND` por el bruto
2. `FEE` o `WITHHOLDING_TAX` por el impuesto retenido

Campos:

- `date`: derivada de `Date` en formato `dd-mm-yy`
- `amount dividend`: `Gross capital cents / 100`
- `amount fee`: `Tax capital cents / 100`
- `ticker`: `null` porque el CSV no lo provee
- `note`: incluir `Id`, `Created at`, nombre de archivo y numero de linea

No intentar inferir ticker de dividendos sin evidencia adicional.

### 7.5 Idempotencia

Cada transaccion importada desde CSV debe tener una clave de idempotencia determinista. Recomendacion:

```text
csv:{filename}:{lineNumber}
```

Para dividendos:

```text
csv:tailormade-broker-dividends-2026-03-18.csv:{lineNumber}:gross
csv:tailormade-broker-dividends-2026-03-18.csv:{lineNumber}:tax
```

### 7.6 Ajustes de split

Aplicar antes de construir la transaccion normalizada:

```text
NVDA  : factor 10 para compras anteriores a 2024-06-10
LRCX  : factor 10 para compras anteriores a 2024-10-03
```

Nota sobre LRCX:

- este ajuste queda aceptado por requerimiento del usuario para reconciliar el dataset y dejar la posicion final en cero;
- debe documentarse como "ajuste de reconciliacion del dataset" en codigo y tests.

---

## 8. Fases de implementacion

## Fase 0 - Bootstrap y baseline

### Objetivo

Crear el repositorio unificado partiendo de R1 y dejar el baseline verificable.

### Tareas

1. clonar R1;
2. agregar R2 como referencia;
3. ejecutar `npm ci --no-fund --no-audit`;
4. ejecutar `npm test`;
5. no avanzar si el baseline falla.

### Entregable

- repositorio base listo;
- baseline verde.

---

## Fase 1 - Seguridad desktop

### Objetivo

Eliminar el modelo de API key de R1 y reemplazarlo por session token por proceso, adecuado para Electron.

### Tareas

1. retirar dependencia funcional de:
   - `server/middleware/bruteForce.js`
   - `server/middleware/auditLog.js`
   - `server/security/eventsStore.js`
2. crear middleware `sessionAuth`;
3. generar token desde Electron main process;
4. inyectarlo al renderer via preload;
5. propagarlo a traves de `src/lib/apiClient.js` y `src/utils/api.js`.

### Importante

No asumir un wrapper nuevo trivial sobre `fetch`. R1 real ya usa `requestApi()` / `requestJson()` y esa es la integracion correcta.

---

## Fase 2 - Storage a SQLite

### Objetivo

Migrar R1 de almacenamiento actual a SQLite preservando el comportamiento observable del sistema y manteniendo tests verdes.

### Tareas

1. introducir capa SQLite en `server/data/`;
2. adaptar las rutas y servicios que hoy dependen de `JsonTableStorage`;
3. no perseguir una firma ficticia de funciones inexistentes;
4. cubrir con tests de regresion.

### Nota

La prioridad es preservar:

- payloads API;
- semantica de lectura/escritura;
- comportamiento de tests;
- calculos financieros.

---

## Fase 3 - Shell Electron

### Objetivo

Empaquetar la app React + Express como desktop.

### Tareas

1. crear `electron/main.ts`, `electron/preload.ts` y soporte de build;
2. arrancar Express internamente en loopback;
3. servir React en desarrollo y produccion;
4. exponer session token al renderer;
5. dejar scripts de build y release.

---

## Fase 4 - Importador CSV inicial

### Objetivo

Poblar el portafolio real del usuario desde los 4 CSV antes de portar el resto de la logica avanzada de R2.

### Tareas

1. crear `scripts/import-csv-portfolio.mjs`;
2. soportar los 4 archivos exactos ya presentes;
3. normalizar delimitadores y formatos de fecha;
4. aplicar ajustes de split;
5. crear transacciones normalizadas;
6. usar claves de idempotencia;
7. soportar `--dry-run`;
8. emitir resumen final de:
   - compras;
   - ventas;
   - deposits;
   - dividendos;
   - fees;
   - posiciones abiertas;
   - caja final.

### Resultado esperado

El importador debe dejar exactamente:

```text
AMD   0.305562260
DELL  0.454749913
GLD   0.001016562
NVDA  3.392359240
TSLA  0.783956628
Cash  190.75 USD
```

Si el resultado difiere, no continuar.

---

## Fase 5 - Precios, scheduler y senales

### Objetivo

Portar el nucleo util de R2 para seguimiento y alertas.

### Tareas

1. portar `scraper.py` a `priceEngine.js`;
2. portar `signals.py` a `signals.js`;
3. portar scheduler de mercado;
4. usar `config.yaml`;
5. soportar fallback de precios y sanity check de +/-25%.

### Importante

Mantener el uso de `decimal.js` en calculos financieros y bandas.

---

## Fase 6 - Dividendos, benchmarks y notificaciones

### Objetivo

Completar la funcionalidad de seguimiento de portafolio inspirada en R2.

### Tareas

1. email notifications via `nodemailer`;
2. benchmarks historicos;
3. endpoints REST para precios, senales y benchmarks;
4. integracion con dashboard.

---

## Fase 7 - UI unificada

### Objetivo

Mantener el frontend de R1 y extenderlo con las piezas utiles de R2 sin degradar UX ni tests existentes.

### Tareas

1. agregar tabs de Prices y Signals;
2. extender Settings con configuracion relevante;
3. integrar benchmark lines en dashboard;
4. mantener modelo visual de R1;
5. no recrear el dashboard de R2 uno-a-uno salvo que sea estrictamente necesario.

---

## Fase 8 - Packaging y CI

### Objetivo

Distribuir y verificar la app unificada.

### Tareas

1. build React;
2. typecheck Electron;
3. empaquetado con `electron-builder`;
4. CI con:
   - `npm test`
   - typecheck
   - coverage
   - `npm audit --audit-level=critical`

---

## 9. Configuracion esperada

El proyecto unificado debe tener un `config.yaml` inspirado en el real de R2. Debe incluir como minimo:

- `notifications`
- `scheduler`
- `market`
- `data_sources`
- `stocks`
- `benchmarks`
- `portfolio`

Para el arranque inicial:

- `google_sheets_prices_url` puede quedar vacio;
- la importacion principal se hace desde CSV, no desde workbook;
- el workbook de R2 puede quedar como fuente opcional posterior.

---

## 10. Riesgos y decisiones ya tomadas

### Riesgos ya resueltos

- Split de NVDA: confirmado por el usuario.
- Reconciliacion de LRCX: aprobada por el usuario para dejar posicion final en cero.
- Dividendos: confirmado `bruto + impuesto`.

### Riesgos a no reabrir

- no reintroducir API keys como modelo principal de auth desktop;
- no depender del `.xlsx` como carga inicial principal;
- no portar R2 ignorando la estructura real de R1.

---

## 11. Criterios de aceptacion globales

El plan se considera correctamente ejecutado solo si se cumplen todos:

1. `npm test` de R1 sigue verde tras cada fase relevante.
2. La app corre como desktop Electron.
3. El importador CSV es idempotente.
4. El importador deja exactamente las posiciones finales esperadas.
5. El importador deja exactamente `190.75 USD` de caja.
6. NVDA y LRCX no generan posiciones negativas tras aplicar las reglas aprobadas.
7. Los dividendos quedan preservados como bruto e impuesto por separado.
8. No hay acceso directo del renderer a SQLite.
9. El sistema puede volver a correr el import en `--dry-run` sin side effects.

---

## 12. Orden recomendado de trabajo

```text
Fase 0  Bootstrap + baseline
Fase 1  Seguridad desktop
Fase 2  SQLite
Fase 3  Electron
Fase 4  Importador CSV inicial
Fase 5  Precios + scheduler + senales
Fase 6  Dividendos + benchmarks + notificaciones
Fase 7  UI unificada
Fase 8  Packaging + CI
```

---

## 13. Instruccion final para una nueva conversacion

Si este documento se entrega a un nuevo agente, ese agente debe:

1. asumir que este plan ya es la version vigente;
2. partir desde R1 como base real;
3. validar baseline antes de editar;
4. implementar primero lo necesario para importar correctamente los 4 CSV;
5. usar como verificacion obligatoria las posiciones finales y caja esperadas;
6. no reabrir decisiones ya confirmadas por el usuario;
7. documentar cualquier desviacion solo si el codigo real obliga a ello.

---

*Fin del plan de integracion. Version 2.0.0 - 2026-03-18*
*Revisado contra los repos reales R1/R2 y contra los 4 CSV locales que poblaran el portafolio inicial.*
