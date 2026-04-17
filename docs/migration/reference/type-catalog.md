# Catálogo de Tipos

Referencia de todos los tipos TypeScript a definir durante la migración, organizados por módulo. Usar durante Fase 1 y Fase 2 para no duplicar tipos ni crear inconsistencias.

---

## Ubicación de los tipos

```
server/types/
├── domain.ts      ← tipos del dominio financiero (entidades, valores)
├── config.ts      ← tipos de configuración del servidor
└── providers.ts   ← interfaces de price providers y market clock
```

Los tipos de Fastify (request, reply, plugin options) se definen inline en cada plugin/ruta.

---

## `server/types/domain.ts`

### Tipos primitivos del dominio

| Tipo          | Base     | Descripción                                     | Ejemplos                 |
| ------------- | -------- | ----------------------------------------------- | ------------------------ |
| `Cents`       | `number` | Valor monetario en centavos. $10.50 = 1050      | `1050`, `18500`          |
| `MicroShares` | `number` | Posición en micro-unidades. 1 share = 1_000_000 | `10000000` (= 10 shares) |
| `ISODate`     | `string` | Fecha YYYY-MM-DD                                | `"2024-01-15"`           |
| `Ticker`      | `string` | Símbolo en mayúsculas                           | `"AAPL"`, `"SPY"`        |
| `PortfolioId` | `string` | ID alfanumérico, 1-64 chars                     | `"my-portfolio-001"`     |

### Enums y uniones

```typescript
type TransactionType =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'INTEREST'
  | 'SPLIT';
```

### Entidades

```typescript
interface Transaction {
  id: string;
  date: ISODate;
  type: TransactionType;
  ticker?: Ticker;
  shares?: MicroShares;
  pricePerShare?: Cents;
  amount: Cents;
  currency: 'USD';
  notes?: string;
}

interface CashRate {
  from: ISODate;
  to?: ISODate;
  apy: number; // porcentaje: 4.5 = 4.5% APY
}

interface Holding {
  ticker: Ticker;
  shares: MicroShares;
  avgCostBasis: Cents;
  currentValue?: Cents;
  unrealizedGain?: Cents;
  weight?: number; // 0.0 a 1.0
}

interface NavSnapshot {
  date: ISODate;
  nav: Cents;
  cashBalance: Cents;
  portfolioValue: Cents;
}

interface PortfolioState {
  id: PortfolioId;
  transactions: Transaction[];
  cashRates: CashRate[];
  createdAt: string; // ISO 8601 datetime
  updatedAt: string;
}
```

### Resultados de cálculos

```typescript
interface ReturnsResult {
  moneyWeightedReturn: number; // decimal, e.g. 0.12 = 12%
  totalReturn: number;
  maxDrawdown: number; // decimal negativo, e.g. -0.08 = -8%
  fromDate: ISODate;
  toDate: ISODate;
  benchmarkComparison?: BenchmarkComparison;
}

interface BenchmarkComparison {
  ticker: Ticker;
  moneyWeightedReturn: number;
  totalReturn: number;
}

interface PricePoint {
  date: ISODate;
  close: number;
  adjustedClose?: number;
  volume?: number;
}

interface PriceSeriesResult {
  symbol: Ticker;
  prices: PricePoint[];
  source: string; // "yahoo" | "stooq" | "twelvedata" | "mock"
  stale?: boolean;
}
```

### Errores HTTP (formato canónico)

```typescript
interface HttpError {
  error: string; // código: "VALIDATION_ERROR", "NOT_FOUND", etc.
  message: string; // mensaje human-readable
  details?: Array<{
    path: (string | number)[];
    message: string;
  }>;
}
```

---

## `server/types/config.ts`

Ver sección 1.1 en [phase-1-domain-types.md](../phases/phase-1-domain-types.md) para el contenido completo.

Resumen de interfaces:

| Interface          | Descripción                      |
| ------------------ | -------------------------------- |
| `ServerConfig`     | Config completo del servidor     |
| `FeatureFlags`     | Feature flags booleanos          |
| `BenchmarksConfig` | Tickers de benchmark disponibles |
| `CorsConfig`       | Lista de orígenes permitidos     |
| `CacheConfig`      | TTL y estrategia de caché        |
| `FreshnessConfig`  | Días máximos de datos stale      |
| `SecurityConfig`   | Auth, brute force, audit         |
| `RateLimitConfig`  | Ventanas y máximos por endpoint  |
| `EmailConfig`      | Configuración de nodemailer      |
| `JobsConfig`       | Scheduler nightly                |

---

## `server/types/providers.ts`

```typescript
interface PriceProvider {
  getHistoricalPrices(symbol: Ticker, from: ISODate, to: ISODate): Promise<PriceSeriesResult>;
  getLatestPrice(symbol: Ticker): Promise<PricePoint | null>;
  getName(): string;
  isHealthy(): boolean;
}

interface ProviderHealthRecord {
  name: string;
  healthy: boolean;
  lastCheck: string; // ISO 8601 datetime
  consecutiveFailures: number;
}

interface MarketClock {
  isMarketOpen(): boolean;
  getCurrentDate(): ISODate;
}
```

---

## Tipos Fastify (inline en plugins/rutas)

Estos tipos NO van en `server/types/` — se declaran con `declare module 'fastify'` en el plugin que los agrega.

### Extensiones del FastifyInstance (decorators)

```typescript
// En plugins/sessionAuth.ts
declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// En plugins/etagHandler.ts
declare module 'fastify' {
  interface FastifyInstance {
    sendWithEtag: (req: FastifyRequest, reply: FastifyReply, payload: unknown) => Promise<void>;
  }
}
```

### Opciones de plugins

```typescript
// En cada plugin que acepta opciones
interface SessionAuthOptions {
  sessionToken: string;
  headerName: string;
  devBypass?: boolean;
  logger: { warn: (msg: string) => void };
}
```

---

## Schemas Zod (reutilizables en rutas)

Ubicación: `server/routes/_schemas.ts`

| Schema                       | Tipo inferido                                     | Usado en                        |
| ---------------------------- | ------------------------------------------------- | ------------------------------- |
| `isoDateSchema`              | `string`                                          | Params y query de fechas        |
| `portfolioIdSchema`          | `string`                                          | Params `:id`                    |
| `tickerSchema`               | `string`                                          | Params `:symbol`, body `ticker` |
| `paginationSchema`           | `{ page, per_page, cursor? }`                     | Query de listas                 |
| `transactionTypeSchema`      | `TransactionType`                                 | Body de transacciones           |
| `inputTransactionTypeSchema` | `TransactionType` (normaliza WITHDRAW→WITHDRAWAL) | Input body                      |
| `transactionSchema`          | `Transaction` (parcial, para input)               | Body POST transactions          |
| `cashRateSchema`             | `CashRate`                                        | Body POST cashRates             |
| `portfolioBodySchema`        | `{ transactions, cashRates }`                     | Body POST portfolio             |

---

## Reglas de nombres

1. **Interfaces de dominio:** PascalCase sin prefijo (`Transaction`, `Holding`, no `ITransaction`).
2. **Tipos primitivos branded:** PascalCase (`Cents`, `MicroShares`), no sufijo `Type`.
3. **Interfaces de config:** PascalCase con sufijo `Config` (`ServerConfig`, `CacheConfig`).
4. **Interfaces de plugins:** PascalCase con sufijo `Options` (`SessionAuthOptions`).
5. **Schemas Zod:** camelCase con sufijo `Schema` (`transactionSchema`, `portfolioIdSchema`).
6. **Tipos inferidos de Zod:** PascalCase sin sufijo (`z.infer<typeof transactionSchema>` → `Transaction`).

---

## Qué tipos NO crear

- No crear tipos para Express (`Request`, `Response`, `NextFunction`) — Express se elimina.
- No crear tipos para `pino` — ya tiene su propia declaración en `@types/pino`.
- No crear tipos para `Decimal.js` — ya tiene su propia declaración.
- No crear tipos para `NodeCache` — ya tiene `@types/node-cache`.
- No crear tipos duplicados de los que exporta `fastify` — importar directamente: `import type { FastifyRequest } from 'fastify'`.
