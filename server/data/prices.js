import fetch from 'node-fetch';

import { toDateKey } from '../finance/cash.js';

const STOOQ_SYMBOL_ALIASES = Object.freeze({
  'BRK.B': 'brk-b.us',
  'BRK/B': 'brk-b.us',
  'BF.B': 'bf-b.us',
  'BF/B': 'bf-b.us',
});

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

function createNoDataError(symbol) {
  const error = new Error(`No price data available for ${symbol}`);
  error.code = 'PRICE_NOT_FOUND';
  error.status = 404;
  return error;
}

function normalizeStooqSymbol(symbol) {
  const normalized = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
  if (!normalized) {
    return '';
  }

  const aliased = STOOQ_SYMBOL_ALIASES[normalized];
  if (aliased) {
    return aliased;
  }

  const marketQualified = normalized.match(/^([A-Z0-9-]+)\.([A-Z]{2,3})$/);
  if (marketQualified) {
    return `${marketQualified[1].toLowerCase()}.${marketQualified[2].toLowerCase()}`;
  }

  return `${normalized.replace(/[/.]/g, '-').toLowerCase()}.us`;
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
    const normalizedSymbol = normalizeStooqSymbol(symbol);
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
      const csv = (await response.text()).trim();
      if (!csv || /^no data$/i.test(csv)) {
        throw createNoDataError(symbol);
      }
      const lines = csv.trim().split('\n');
      if (lines.length <= 1) {
        throw createNoDataError(symbol);
      }
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
      if (result.length === 0) {
        throw createNoDataError(symbol);
      }
      result.sort((a, b) => a.date.localeCompare(b.date));
      const durationMs = Date.now() - startedAt;
      this.logger?.info?.('price_provider_latency', {
        symbol,
        stooq_symbol: normalizedSymbol,
        from,
        to,
        duration_ms: durationMs,
        rows: result.length,
      });
      return result;
    } catch (error) {
      this.logger?.error?.('price_provider_failed', {
        symbol,
        stooq_symbol: normalizedSymbol,
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

function normalizeQuoteDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return toDateKey(new Date(value * 1000));
  }
  if (typeof value !== 'string') {
    return toDateKey(new Date());
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return toDateKey(new Date());
  }
  const candidate = trimmed.includes('T') ? trimmed : `${trimmed.replace(' ', 'T')}`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return toDateKey(new Date());
  }
  return toDateKey(parsed);
}

function resolveLatestQuotePrice(payload) {
  const candidates = [
    payload?.price,
    payload?.close,
    payload?.last,
    payload?.previous_close,
  ];
  for (const candidate of candidates) {
    const parsed = Number.parseFloat(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export class TwelveDataQuoteProvider {
  constructor({
    fetchImpl = fetch,
    timeoutMs = 5000,
    logger,
    apiKey = '',
    prepost = true,
  } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = normalizeLogger(logger, { provider: 'twelvedata' });
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    this.prepost = prepost !== false;
  }

  async getLatestQuote(symbol) {
    if (!this.apiKey) {
      const error = new Error('Twelve Data API key is required');
      error.code = 'PRICE_PROVIDER_MISCONFIGURED';
      throw error;
    }

    const url = new URL('https://api.twelvedata.com/quote');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('apikey', this.apiKey);
    if (this.prepost) {
      url.searchParams.set('prepost', 'true');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Failed to fetch latest quote for ${symbol}`);
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      if (payload?.status === 'error') {
        const error = new Error(payload?.message ?? `Failed to fetch latest quote for ${symbol}`);
        error.code = payload?.code ?? 'PRICE_FETCH_FAILED';
        throw error;
      }
      const price = resolveLatestQuotePrice(payload);
      if (!Number.isFinite(price)) {
        throw createNoDataError(symbol);
      }
      const date = normalizeQuoteDate(
        payload?.datetime
        ?? payload?.timestamp
        ?? payload?.last_trade_time,
      );
      const durationMs = Date.now() - startedAt;
      this.logger?.info?.('latest_quote_provider_latency', {
        symbol,
        duration_ms: durationMs,
        date,
        prepost: this.prepost,
      });
      return {
        date,
        adjClose: price,
      };
    } catch (error) {
      this.logger?.error?.('latest_quote_provider_failed', {
        symbol,
        error: error.message,
        prepost: this.prepost,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default YahooPriceProvider;
