# Mapa de Rutas — Express → Fastify

Referencia completa de todas las rutas del servidor. Usar durante Fase 2 para verificar que ninguna ruta quede sin migrar.

---

## Leyenda

- **Auth:** `public` (sin token) · `token` (requiere `x-session-token`)
- **ETag:** si la ruta soporta 304 Not Modified
- **Fase 2 ref:** sección del archivo `phase-2-fastify-shadow.md` que cubre esta ruta

---

## Rutas públicas (sin autenticación)

| #   | Método | Ruta Express          | Ruta Fastify          | Auth   | ETag | Archivo destino        | Migrado |
| --- | ------ | --------------------- | --------------------- | ------ | ---- | ---------------------- | ------- |
| 1   | GET    | `/api/benchmarks`     | `/api/benchmarks`     | public | No   | `routes/benchmarks.ts` | [ ]     |
| 2   | GET    | `/api/cache/stats`    | `/api/cache/stats`    | public | No   | `routes/cache.ts`      | [ ]     |
| 3   | GET    | `/api/monitoring`     | `/api/monitoring`     | public | No   | `routes/monitoring.ts` | [ ]     |
| 4   | GET    | `/api/prices/:symbol` | `/api/prices/:symbol` | public | Sí   | `routes/prices.ts`     | [ ]     |
| 5   | GET    | `/api/prices/bulk`    | `/api/prices/bulk`    | public | No   | `routes/prices.ts`     | [ ]     |

---

## Rutas de portfolio (autenticación requerida)

| #   | Método | Ruta Express                      | Ruta Fastify                      | Auth  | ETag | Archivo destino       | Migrado |
| --- | ------ | --------------------------------- | --------------------------------- | ----- | ---- | --------------------- | ------- |
| 6   | GET    | `/api/portfolio/:id`              | `/api/portfolio/:id`              | token | Sí   | `routes/portfolio.ts` | [ ]     |
| 7   | POST   | `/api/portfolio/:id`              | `/api/portfolio/:id`              | token | No   | `routes/portfolio.ts` | [ ]     |
| 8   | GET    | `/api/portfolio/:id/transactions` | `/api/portfolio/:id/transactions` | token | No   | `routes/portfolio.ts` | [ ]     |
| 9   | POST   | `/api/portfolio/:id/transactions` | `/api/portfolio/:id/transactions` | token | No   | `routes/portfolio.ts` | [ ]     |
| 10  | GET    | `/api/portfolio/:id/performance`  | `/api/portfolio/:id/performance`  | token | Sí   | `routes/portfolio.ts` | [ ]     |
| 11  | GET    | `/api/portfolio/:id/holdings`     | `/api/portfolio/:id/holdings`     | token | Sí   | `routes/portfolio.ts` | [ ]     |
| 12  | GET    | `/api/portfolio/:id/cashRates`    | `/api/portfolio/:id/cashRates`    | token | No   | `routes/portfolio.ts` | [ ]     |
| 13  | POST   | `/api/portfolio/:id/cashRates`    | `/api/portfolio/:id/cashRates`    | token | No   | `routes/portfolio.ts` | [ ]     |

---

## Rutas de operaciones

| #   | Método | Ruta Express      | Ruta Fastify      | Auth  | ETag | Archivo destino     | Migrado |
| --- | ------ | ----------------- | ----------------- | ----- | ---- | ------------------- | ------- |
| 14  | POST   | `/api/signals`    | `/api/signals`    | token | No   | `routes/signals.ts` | [ ]     |
| 15  | POST   | `/api/import/csv` | `/api/import/csv` | token | No   | `routes/import.ts`  | [ ]     |

---

## Ruta especial — SPA Fallback

| #   | Método          | Comportamiento Express                   | Comportamiento Fastify                   |
| --- | --------------- | ---------------------------------------- | ---------------------------------------- |
| 16  | `*` (cualquier) | Si no es `/api/*`, devuelve `index.html` | `setNotFoundHandler` + `@fastify/static` |

---

## Middleware → Plugin mapping

| Middleware Express              | Plugin Fastify              | Archivo                                |
| ------------------------------- | --------------------------- | -------------------------------------- |
| `compression`                   | `@fastify/compress`         | Registrado en `app.fastify.ts`         |
| `cors`                          | `@fastify/cors`             | Registrado en `app.fastify.ts`         |
| `helmet`                        | `@fastify/helmet`           | Registrado en `app.fastify.ts`         |
| `requestContext.js` (onRequest) | `plugins/requestContext.ts` | Hook `onRequest`                       |
| `sessionAuth.js` (middleware)   | `plugins/sessionAuth.ts`    | Decorator `requireAuth` + `preHandler` |
| `validation.js` (middleware)    | `fastify-type-provider-zod` | Schema en cada ruta                    |
| `pino-http` (HTTP logging)      | Nativo en Fastify           | `loggerInstance: pino(...)` en factory |

---

## Parámetros de query por ruta

### GET `/api/prices/:symbol`

```
from?:       ISODate   — inicio del rango histórico
to?:         ISODate   — fin del rango
adjusted?:   boolean   — precios ajustados por splits/dividendos (default: true)
```

### GET `/api/prices/bulk`

```
symbols:     string    — tickers separados por coma, e.g. "AAPL,MSFT,GOOGL"
from?:       ISODate
to?:         ISODate
```

### GET `/api/portfolio/:id/transactions`

```
page?:       number    — página (default: 1)
per_page?:   number    — registros por página (default: 50, max: 500)
cursor?:     string    — cursor de paginación (alternativa a page)
type?:       TransactionType — filtrar por tipo
from?:       ISODate
to?:         ISODate
```

### GET `/api/portfolio/:id/performance`

```
from?:       ISODate   — inicio del período de cálculo
to?:         ISODate   — fin del período (default: hoy)
benchmark?:  Ticker    — ticker de benchmark para comparación (e.g. "SPY")
```

---

## Headers requeridos

### Rutas con `token` auth

```http
x-session-token: <64-char hex token>
```

### Todas las rutas (set por el servidor)

```http
X-Request-Id:   <uuid>     — generado por requestContext plugin
X-API-Version:  1          — versión del API
ETag:           "<sha256>"  — solo en rutas con ETag: Sí
Cache-Control:  private, no-cache — solo en rutas con ETag
```

---

## Códigos de respuesta por ruta

| Ruta                                 | 200 | 201 | 204 | 304 | 400 | 401 | 404 | 422 | 429 | 500 |
| ------------------------------------ | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET /api/benchmarks                  | ✓   |     |     |     |     |     |     |     |     | ✓   |
| GET /api/prices/:symbol              | ✓   |     |     | ✓   | ✓   |     | ✓   |     | ✓   | ✓   |
| GET /api/prices/bulk                 | ✓   |     |     |     | ✓   |     |     |     | ✓   | ✓   |
| GET /api/portfolio/:id               | ✓   |     |     | ✓   |     | ✓   | ✓   |     | ✓   | ✓   |
| POST /api/portfolio/:id              | ✓   |     |     |     | ✓   | ✓   |     | ✓   | ✓   | ✓   |
| GET /api/portfolio/:id/transactions  | ✓   |     |     |     | ✓   | ✓   | ✓   |     | ✓   | ✓   |
| POST /api/portfolio/:id/transactions |     | ✓   |     |     | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| GET /api/portfolio/:id/performance   | ✓   |     |     | ✓   | ✓   | ✓   | ✓   |     | ✓   | ✓   |
| GET /api/portfolio/:id/holdings      | ✓   |     |     | ✓   |     | ✓   | ✓   |     | ✓   | ✓   |
| POST /api/signals                    | ✓   |     |     |     | ✓   | ✓   | ✓   |     | ✓   | ✓   |
| POST /api/import/csv                 | ✓   |     |     |     | ✓   | ✓   |     | ✓   | ✓   | ✓   |

---

## Verificación de completitud

Al terminar Fase 2, marcar `[x]` en la tabla de rutas para confirmar que las 15 rutas están implementadas en Fastify. Ninguna puede quedar pendiente.

```bash
# Contar rutas registradas en Fastify
grep -r "app\.\(get\|post\|put\|delete\|patch\)" server/routes/ --include="*.ts" | wc -l
# Debe ser >= 15
```
