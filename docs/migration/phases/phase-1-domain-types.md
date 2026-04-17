# Fase 1 — Tipos de Dominio

**Objetivo:** Tipar los módulos de dominio puro que no tienen acoplamiento con Express. Son los módulos de mayor riesgo financiero y los que más se benefician de tipos estáticos.
**Duración estimada:** 4–6 horas
**Riesgo:** Bajo
**Prerequisito:** Fase 0 completada. `npm test` verde.

---

## Estrategia de coexistencia

Durante esta fase, los archivos `.ts` **coexisten** con los `.js` originales. Los tests existentes continúan apuntando a los archivos `.js`. Los archivos `.ts` son la versión nueva tipada que se irá usando en Fase 2 cuando se construya el app Fastify.

**No se elimina ningún `.js` en esta fase.** La eliminación ocurre en Fase 4 (Cutover).

Patrón de trabajo para cada archivo:

```
1. Leer el .js original completamente
2. Crear el .ts nuevo al lado con los mismos exports + tipos
3. Verificar typecheck: npm run verify:typecheck:server
4. Verificar tests: npm test
5. Si todo verde → avanzar al siguiente archivo
```

---

## Orden de migración (dependencias primero)

```
server/types/domain.ts        ← tipos base (sin dependencias)
server/types/config.ts        ← tipos de config
server/types/providers.ts     ← interfaces de price providers
server/config.ts              ← depende de types/config.ts
server/finance/decimal.ts     ← sin dependencias
server/finance/cash.ts        ← depende de decimal.ts
server/finance/portfolio.ts   ← depende de cash.ts, decimal.ts
server/finance/returns.ts     ← depende de portfolio.ts
server/auth/localPinAuth.ts   ← depende de types/domain.ts
server/cache/priceCache.ts    ← sin dependencias de dominio
```

---

## 1.0 — `server/types/domain.ts`

Crear este archivo con todos los tipos financieros base del dominio. Son el corazón del sistema.

```typescript
// server/types/domain.ts

/**
 * Tipo nominal para valores monetarios almacenados en centavos.
 * Ejemplo: $10.50 = 1050 Cents
 * NUNCA mezclar directamente con MicroShares en operaciones aritméticas.
 */
export type Cents = number;

/**
 * Tipo nominal para posiciones en micro-unidades de participación.
 * 1 share = 1_000_000 MicroShares (precisión de 6 decimales).
 */
export type MicroShares = number;

/** Fecha en formato ISO 8601: YYYY-MM-DD */
export type ISODate = string;

/** Símbolo de ticker normalizado a mayúsculas */
export type Ticker = string;

/** Identificador único de portafolio: alphanumeric + guión/underscore, 1-64 chars */
export type PortfolioId = string;

export type TransactionType =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'INTEREST'
  | 'SPLIT';

export interface Transaction {
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

export interface CashRate {
  from: ISODate;
  to?: ISODate;
  apy: number; // porcentaje, e.g. 4.5 = 4.5%
}

export interface Holding {
  ticker: Ticker;
  shares: MicroShares;
  avgCostBasis: Cents;
  currentValue?: Cents;
  unrealizedGain?: Cents;
  weight?: number; // 0-1
}

export interface NavSnapshot {
  date: ISODate;
  nav: Cents;
  cashBalance: Cents;
  portfolioValue: Cents;
}

export interface PortfolioState {
  id: PortfolioId;
  transactions: Transaction[];
  cashRates: CashRate[];
  createdAt: string;
  updatedAt: string;
}

export interface ReturnsResult {
  moneyWeightedReturn: number;
  totalReturn: number;
  maxDrawdown: number;
  fromDate: ISODate;
  toDate: ISODate;
  benchmarkComparison?: BenchmarkComparison;
}

export interface BenchmarkComparison {
  ticker: Ticker;
  moneyWeightedReturn: number;
  totalReturn: number;
}

export interface PricePoint {
  date: ISODate;
  close: number;
  adjustedClose?: number;
  volume?: number;
}

export interface PriceSeriesResult {
  symbol: Ticker;
  prices: PricePoint[];
  source: string;
  stale?: boolean;
}

export interface HttpError {
  error: string;
  message: string;
  details?: Array<{ path: (string | number)[]; message: string }>;
}
```

---

## 1.1 — `server/types/config.ts`

```typescript
// server/types/config.ts

export interface FeatureFlags {
  cashBenchmarks: boolean;
  monthlyCashPosting: boolean;
}

export interface BenchmarksConfig {
  tickers: string[];
  defaultSelection: string;
}

export interface CorsConfig {
  allowedOrigins: string[];
}

export interface CacheConfig {
  ttlSeconds: number;
  price: {
    ttlSeconds: number;
    checkPeriodSeconds: number;
    liveOpenTtlSeconds: number;
    liveClosedTtlSeconds: number;
  };
}

export interface FreshnessConfig {
  maxStaleTradingDays: number;
}

export interface SecurityConfig {
  auth: {
    sessionToken: string;
    headerName: string;
  };
  bruteForce: {
    maxAttempts: number;
    lockoutSeconds: number;
    multiplier: number;
  };
  audit: {
    maxEvents: number;
  };
}

export interface RateLimitConfig {
  general: { windowMs: number; max: number };
  portfolio: { windowMs: number; max: number };
  prices: { windowMs: number; max: number };
}

export interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  replyTo?: string;
  subjectPrefix: string;
}

export interface JobsConfig {
  nightlyHour: number;
  nightlyEnabled: boolean;
}

export interface ServerConfig {
  dataDir: string;
  fetchTimeoutMs: number;
  featureFlags: FeatureFlags;
  benchmarks: BenchmarksConfig;
  cors: CorsConfig;
  cache: CacheConfig;
  freshness: FreshnessConfig;
  security: SecurityConfig;
  rateLimit: RateLimitConfig;
  emailDelivery: EmailConfig;
  jobs: JobsConfig;
}
```

---

## 1.2 — `server/types/providers.ts`

```typescript
// server/types/providers.ts
import type { PricePoint, PriceSeriesResult, Ticker, ISODate } from './domain.js';

export interface PriceProvider {
  getHistoricalPrices(symbol: Ticker, from: ISODate, to: ISODate): Promise<PriceSeriesResult>;

  getLatestPrice(symbol: Ticker): Promise<PricePoint | null>;
  getName(): string;
  isHealthy(): boolean;
}

export interface ProviderHealthRecord {
  name: string;
  healthy: boolean;
  lastCheck: string;
  consecutiveFailures: number;
}

export interface MarketClock {
  isMarketOpen(): boolean;
  getCurrentDate(): ISODate;
}
```

---

## 1.3 — `server/config.ts`

Crear la versión tipada de `server/config.js`. **No reescribir la lógica** — solo agregar los tipos de retorno.

Leer primero el archivo original:

```bash
# Revisar antes de crear el .ts
```

El archivo `.ts` debe tener exactamente la misma función `getConfig()` pero con retorno `ServerConfig`:

```typescript
// server/config.ts
import type { ServerConfig } from './types/config.js';

export function getConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  // ... mismo cuerpo que config.js ...
  // Solo agregar el tipo de retorno
}
```

---

## 1.4 — `server/finance/decimal.ts`

Leer `server/finance/decimal.js` y crear `decimal.ts` con los tipos exactos de cada función pública.

Funciones a tipar:

```typescript
import Decimal from 'decimal.js';
import type { Cents, MicroShares } from '../types/domain.js';

export function d(value: number | string | Decimal): Decimal;

export function toCents(value: number | string | Decimal): Cents;
export function fromCents(cents: Cents): Decimal;

export function toMicroShares(value: number | string | Decimal): MicroShares;
export function fromMicroShares(micro: MicroShares): Decimal;

export function roundDecimal(value: number | string | Decimal, places: number): number;
```

---

## 1.5 — `server/finance/cash.ts`

Leer `server/finance/cash.js` y crear `cash.ts`. Funciones a tipar:

```typescript
import type { Cents, ISODate, CashRate } from '../types/domain.js';

/** Normaliza una fecha a clave de día (YYYY-MM-DD) */
export function normalizeDateKey(date: string | Date): ISODate;

/**
 * Calcula el interés acumulado sobre el saldo de efectivo
 * para un rango de fechas, aplicando la tasa APY activa.
 */
export function computeCashInterest(
  balance: Cents,
  cashRates: CashRate[],
  from: ISODate,
  to: ISODate
): Cents;

// ... resto de funciones con sus firmas exactas
```

---

## 1.6 — `server/finance/portfolio.ts`

Leer `server/finance/portfolio.js` y crear `portfolio.ts`. Funciones críticas a tipar:

```typescript
import type { PortfolioState, Transaction, CashRate, Holding, ISODate } from '../types/domain.js';

export function sortTransactions(transactions: Transaction[]): Transaction[];

export function projectStateUntil(
  state: PortfolioState,
  targetDate: ISODate,
  cashRates: CashRate[]
): PortfolioState;

export function weightsFromState(
  state: PortfolioState,
  prices: Record<string, number>
): Record<string, number>;

export function normalizeMicroShareBalance(state: PortfolioState): PortfolioState;
```

---

## 1.7 — `server/finance/returns.ts`

Leer `server/finance/returns.js` y crear `returns.ts`. Funciones críticas:

```typescript
import type {
  PortfolioState,
  ReturnsResult,
  NavSnapshot,
  ISODate,
  Ticker,
} from '../types/domain.js';

export function computeMoneyWeightedReturn(
  state: PortfolioState,
  to: ISODate,
  from?: ISODate
): number;

export function computeMaxDrawdown(navSeries: NavSnapshot[]): number;

export function computeMatchedBenchmarkMoneyWeightedReturn(
  state: PortfolioState,
  benchmarkTicker: Ticker,
  prices: Record<Ticker, number[]>,
  from: ISODate,
  to: ISODate
): number;

export function summarizeReturns(
  state: PortfolioState,
  navHistory: NavSnapshot[],
  from: ISODate,
  to: ISODate
): ReturnsResult;
```

---

## 1.8 — `server/auth/localPinAuth.ts`

Leer `server/auth/localPinAuth.js` y crear `localPinAuth.ts`:

```typescript
import type { PortfolioId } from '../types/domain.js';

// La storage interface mínima que necesita auth
export interface AuthStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export function hasPin(storage: AuthStorage, portfolioId: PortfolioId): Promise<boolean>;

export function setPin(storage: AuthStorage, portfolioId: PortfolioId, pin: string): Promise<void>;

export function verifyPin(
  storage: AuthStorage,
  portfolioId: PortfolioId,
  pin: string
): Promise<boolean>;
```

---

## 1.9 — `server/cache/priceCache.ts`

Leer `server/cache/priceCache.js` y crear `priceCache.ts`:

```typescript
import type { PriceSeriesResult, Ticker, ISODate } from '../types/domain.js';
import type { CacheConfig } from '../types/config.js';

export interface PriceCacheEntry {
  data: PriceSeriesResult;
  cachedAt: number; // Unix timestamp ms
}

export interface PriceCache {
  get(symbol: Ticker, from: ISODate, to: ISODate): PriceCacheEntry | undefined;
  set(symbol: Ticker, from: ISODate, to: ISODate, data: PriceSeriesResult): void;
  invalidate(symbol: Ticker): void;
  getStats(): { keys: number; hits: number; misses: number };
}

export function createPriceCache(config: CacheConfig['price']): PriceCache;
```

---

## Patrón de verificación después de cada archivo

```bash
# Después de crear cada .ts:
npm run verify:typecheck:server   # Debe pasar sin errores
npm test                          # Debe seguir verde (tests apuntan a .js aún)
```

Si `verify:typecheck:server` falla: revisar el error, corregir solo el archivo `.ts` nuevo. No modificar el `.js` original.

---

## Commit de cierre de Fase 1

```bash
git add server/types/ server/config.ts server/finance/*.ts \
        server/auth/localPinAuth.ts server/cache/priceCache.ts
git commit -m "feat(types): add typescript type layer for server domain modules

- Add server/types/domain.ts with core financial types
- Add server/types/config.ts with ServerConfig interface
- Add server/types/providers.ts with PriceProvider interface
- Add typed counterparts for config, finance/*, auth, cache
- All existing JS files preserved (coexistence strategy)
- npm test green, no functionality changed"
```

---

## Verificación de salida

- [ ] `verify:typecheck:server` — limpio en todos los archivos `.ts` creados
- [ ] `npm test` — verde (los tests siguen usando los `.js`)
- [ ] `npm run lint` — cero warnings
- [ ] Ningún archivo `.js` original fue modificado

---

## Siguiente paso

→ [Phase 2 — Fastify Shadow App](./phase-2-fastify-shadow.md)
