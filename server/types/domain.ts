// server/types/domain.ts

// ── Brand infrastructure ─────────────────────────────────────────────────────
// Uses a unique symbol so branded types are structurally incompatible with each
// other and with plain `number`/`string`, while still extending those primitives.
declare const _brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [_brand]: B };

/**
 * Tipo nominal para valores monetarios almacenados en centavos.
 * Ejemplo: $10.50 = 1050 Cents
 * NUNCA mezclar directamente con MicroShares en operaciones aritméticas.
 */
export type Cents = Brand<number, 'Cents'>;

/**
 * Tipo nominal para posiciones en micro-unidades de participación.
 * 1 share = 1_000_000 MicroShares (precisión de 6 decimales).
 */
export type MicroShares = Brand<number, 'MicroShares'>;

/**
 * Tipo nominal para posiciones en nano-unidades de participación.
 * 1 share = 1_000_000_000 NanoShares (precisión de 9 decimales).
 * Requerido por el broker Fintual, que opera con resolución de 9 decimales.
 */
export type NanoShares = Brand<number, 'NanoShares'>;

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
