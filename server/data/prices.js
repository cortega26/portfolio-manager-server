import fetch from 'node-fetch';

import { toDateKey } from '../finance/cash.js';

function toUnixStart(date) {
  return Math.floor(new Date(`${toDateKey(date)}T00:00:00Z`).getTime() / 1000);
}

function toUnixEnd(date) {
  return Math.floor(new Date(`${toDateKey(date)}T23:59:59Z`).getTime() / 1000);
}

export class YahooPriceProvider {
  constructor({ fetchImpl = fetch, timeoutMs = 5000, logger } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  async getDailyAdjustedClose(symbol, from, to) {
    const start = toUnixStart(from);
    const end = toUnixEnd(to);
    const url = new URL(`https://query1.finance.yahoo.com/v7/finance/download/${symbol}`);
    url.searchParams.set('period1', String(start));
    url.searchParams.set('period2', String(end));
    url.searchParams.set('interval', '1d');
    url.searchParams.set('events', 'history');
    url.searchParams.set('includeAdjustedClose', 'true');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch prices for ${symbol}`);
      }
      const text = await response.text();
      const lines = text.trim().split('\n');
      const result = [];
      for (let i = 1; i < lines.length; i += 1) {
        const parts = lines[i].split(',');
        if (parts.length < 6) {
          continue;
        }
        const [date, , , , , adjCloseRaw] = parts;
        const adjClose = Number.parseFloat(adjCloseRaw);
        if (Number.isFinite(adjClose)) {
          result.push({ date, adjClose });
        }
      }
      return result;
    } catch (error) {
      if (this.logger?.error) {
        this.logger.error('price_provider_failed', {
          symbol,
          error: error.message,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default YahooPriceProvider;
