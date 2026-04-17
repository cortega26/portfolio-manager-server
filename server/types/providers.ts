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
