import fetch from 'node-fetch';

import { toDateKey } from '../finance/cash.js';

function toUnixStart(date) {
  return Math.floor(new Date(`${toDateKey(date)}T00:00:00Z`).getTime() / 1000);
}

function toUnixEnd(date) {
  return Math.floor(new Date(`${toDateKey(date)}T23:59:59Z`).getTime() / 1000);
}

function normalizeLogger(logger, bindings = {}) {
  if (!logger) {
    return null;
  }
  if (typeof logger.child === 'function') {
    return logger.child(bindings);
  }
  return {
    info(message, meta = {}) {
      logger.info?.(message, { ...bindings, ...meta });
    },
    warn(message, meta = {}) {
      logger.warn?.(message, { ...bindings, ...meta });
    },
    error(message, meta = {}) {
      logger.error?.(message, { ...bindings, ...meta });
    },
    child(childBindings = {}) {
      return normalizeLogger(logger, { ...bindings, ...childBindings });
    },
  };
}

export class YahooPriceProvider {
  constructor({ fetchImpl = fetch, timeoutMs = 5000, logger } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = normalizeLogger(logger, { provider: 'yahoo' });
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
    const startedAt = Date.now();
    try {
      const response = await this.fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Failed to fetch prices for ${symbol}`);
        error.status = response.status;
        throw error;
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
        if (Number.isFinite(adjClose) && date) {
          result.push({ date, adjClose });
        }
      }
      const durationMs = Date.now() - startedAt;
      this.logger?.info?.('price_provider_latency', {
        symbol,
        from,
        to,
        duration_ms: durationMs,
        rows: result.length,
      });
      return result;
    } catch (error) {
      this.logger?.error?.('price_provider_failed', {
        symbol,
        from,
        to,
        error: error.message,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class StooqPriceProvider {
  constructor({ fetchImpl = fetch, timeoutMs = 5000, logger } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = normalizeLogger(logger, { provider: 'stooq' });
  }

  async getDailyAdjustedClose(symbol, from, to) {
    const normalizedSymbol = symbol.trim().toLowerCase().replace('.', '').replace('/', '');
    const url = `https://stooq.com/q/d/l/?s=${normalizedSymbol}&i=d`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Failed to fetch prices for ${symbol}`);
        error.status = response.status;
        throw error;
      }
      const csv = await response.text();
      const lines = csv.trim().split('\n');
      const result = [];
      for (let i = 1; i < lines.length; i += 1) {
        const parts = lines[i].split(',');
        if (parts.length < 5) {
          continue;
        }
        const [date, , , , closeRaw] = parts;
        if (date < from || date > to) {
          continue;
        }
        const adjClose = Number.parseFloat(closeRaw);
        if (Number.isFinite(adjClose) && date) {
          result.push({ date, adjClose });
        }
      }
      result.sort((a, b) => a.date.localeCompare(b.date));
      const durationMs = Date.now() - startedAt;
      this.logger?.info?.('price_provider_latency', {
        symbol,
        from,
        to,
        duration_ms: durationMs,
        rows: result.length,
      });
      return result;
    } catch (error) {
      this.logger?.error?.('price_provider_failed', {
        symbol,
        from,
        to,
        error: error.message,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class DualPriceProvider {
  constructor({ primary, fallback, logger } = {}) {
    this.primary = primary;
    this.fallback = fallback;
    this.logger = normalizeLogger(logger, { provider: 'dual' });
  }

  async getDailyAdjustedClose(symbol, from, to) {
    if (!this.primary && !this.fallback) {
      throw new Error('No price providers configured');
    }

    const attempts = [];
    if (this.primary) {
      attempts.push({ role: 'primary', provider: this.primary });
    }
    if (this.fallback) {
      attempts.push({ role: 'fallback', provider: this.fallback });
    }

    let lastError;
    for (const attempt of attempts) {
      const providerName = attempt.provider?.constructor?.name ?? attempt.role;
      const startedAt = Date.now();
      this.logger?.info?.('price_provider_attempt', {
        symbol,
        from,
        to,
        provider: providerName,
        role: attempt.role,
      });
      try {
        const result = await attempt.provider.getDailyAdjustedClose(symbol, from, to);
        const durationMs = Date.now() - startedAt;
        this.logger?.info?.('price_provider_success', {
          symbol,
          from,
          to,
          provider: providerName,
          role: attempt.role,
          duration_ms: durationMs,
          rows: result.length,
        });
        return result;
      } catch (error) {
        lastError = error;
        const durationMs = Date.now() - startedAt;
        this.logger?.warn?.('price_provider_failure', {
          symbol,
          from,
          to,
          provider: providerName,
          role: attempt.role,
          duration_ms: durationMs,
          error: error.message,
        });
        if (attempt.role === 'primary' && this.fallback) {
          this.logger?.warn?.('price_provider_fallback', {
            symbol,
            from,
            to,
            failed_provider: providerName,
          });
        }
      }
    }

    throw lastError ?? new Error('All price providers failed');
  }
}

export default YahooPriceProvider;
