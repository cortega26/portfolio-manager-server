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

export function createNoDataError(symbol) {
  const error = new Error(`No price data available for ${symbol}`);
  error.code = 'PRICE_NOT_FOUND';
  error.status = 404;
  return error;
}

function attachProviderMeta(target, meta) {
  if (!target || typeof target !== 'object' || !meta || typeof meta !== 'object') {
    return target;
  }
  Object.defineProperty(target, 'providerMeta', {
    value: { ...meta },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return target;
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

const YAHOO_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0';

export class YahooPriceProvider {
  constructor({ fetchImpl = fetch, timeoutMs = 5000, logger, crumbTtlMs } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = normalizeLogger(logger, { provider: 'yahoo' });
    this.providerKey = 'yahoo';
    this._crumbCache = null; // { crumb: string, cookies: string, fetchedAt: number }
    this._crumbTtlMs =
      Number.isFinite(crumbTtlMs) && crumbTtlMs > 0 ? crumbTtlMs : 30 * 60 * 1000;
  }

  async _refreshCrumb() {
    const ua = YAHOO_UA;
    const homeRes = await this.fetch('https://finance.yahoo.com', {
      headers: {
        'User-Agent': ua,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    const setCookieHeaders =
      typeof homeRes.headers?.getSetCookie === 'function'
        ? homeRes.headers.getSetCookie()
        : [homeRes.headers?.get?.('set-cookie') ?? ''].filter(Boolean);
    const cookies = setCookieHeaders
      .map((h) => h.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    const crumbRes = await this.fetch(
      'https://query1.finance.yahoo.com/v1/test/getcrumb',
      {
        headers: {
          'User-Agent': ua,
          Accept: 'text/plain,*/*;q=0.9',
          Cookie: cookies,
        },
      },
    );
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length < 4) {
      const err = new Error('Failed to obtain Yahoo Finance crumb');
      err.code = 'PRICE_FETCH_FAILED';
      throw err;
    }
    this._crumbCache = { crumb, cookies, fetchedAt: Date.now() };
    this.logger?.info?.('yahoo_crumb_refreshed', {});
  }

  async _fetchChartOnce(url, crumb, cookies, signal) {
    const chartUrl = new URL(url.toString());
    chartUrl.searchParams.set('crumb', crumb);
    return this.fetch(chartUrl, {
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': YAHOO_UA,
        Cookie: cookies,
      },
    });
  }

  async getDailyAdjustedClose(symbol, from, to) {
    const period1 = toUnixStart(from);
    const period2 = toUnixEnd(to);
    const baseUrl = new URL(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
    );
    baseUrl.searchParams.set('period1', String(period1));
    baseUrl.searchParams.set('period2', String(period2));
    baseUrl.searchParams.set('interval', '1d');
    baseUrl.searchParams.set('events', 'history');
    baseUrl.searchParams.set('includePrePost', 'false');

    if (!this._crumbCache || Date.now() - this._crumbCache.fetchedAt > this._crumbTtlMs) {
      await this._refreshCrumb();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      let response = await this._fetchChartOnce(
        baseUrl,
        this._crumbCache.crumb,
        this._crumbCache.cookies,
        controller.signal,
      );

      // On 401 or 403 the crumb has expired — refresh once and retry
      if (response.status === 401 || response.status === 403) {
        this._crumbCache = null;
        await this._refreshCrumb();
        response = await this._fetchChartOnce(
          baseUrl,
          this._crumbCache.crumb,
          this._crumbCache.cookies,
          controller.signal,
        );
      }

      if (!response.ok) {
        const error = new Error(`Failed to fetch prices for ${symbol}`);
        error.status = response.status;
        throw error;
      }
      const json = await response.json();
      const chartResult = json?.chart?.result?.[0];
      if (!chartResult) {
        const chartError = json?.chart?.error;
        if (chartError) {
          const err = new Error(
            `Yahoo Finance error for ${symbol}: ${
              chartError.description ?? chartError.code ?? 'unknown'
            }`,
          );
          err.code = chartError.code === 'Not Found' ? 'PRICE_NOT_FOUND' : 'PRICE_FETCH_FAILED';
          throw err;
        }
        throw createNoDataError(symbol);
      }
      const timestamps = chartResult.timestamp ?? [];
      const adjCloses = chartResult.indicators?.adjclose?.[0]?.adjclose ?? [];
      const closes = chartResult.indicators?.quote?.[0]?.close ?? [];
      const result = [];
      for (let i = 0; i < timestamps.length; i += 1) {
        const adjClose = adjCloses[i] ?? closes[i];
        if (adjClose == null || !Number.isFinite(adjClose)) {
          continue;
        }
        const date = new Date(timestamps[i] * 1000).toLocaleDateString('en-CA', {
          timeZone: 'America/New_York',
        });
        result.push({ date, adjClose });
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
      return attachProviderMeta(result, {
        provider: this.providerKey,
        degraded: false,
      });
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
    this.providerKey = 'stooq';
  }

  async getDailyAdjustedClose(symbol, from, to) {
    const normalizedSymbol = normalizeStooqSymbol(symbol);
    const d1 = typeof from === 'string' ? from.replace(/-/g, '') : '';
    const d2 = typeof to === 'string' ? to.replace(/-/g, '') : '';
    const dateParams = d1 && d2 ? `&d1=${d1}&d2=${d2}` : '';
    const url = `https://stooq.com/q/d/l/?s=${normalizedSymbol}${dateParams}&i=d`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
        },
      });
      if (!response.ok) {
        const error = new Error(`Failed to fetch prices for ${symbol}`);
        error.status = response.status;
        throw error;
      }
      const contentType = response.headers?.get?.('content-type') ?? '';
      if (contentType.includes('text/html')) {
        const htmlError = new Error(`Stooq returned HTML instead of CSV for ${symbol}`);
        htmlError.code = 'PRICE_FETCH_FAILED';
        throw htmlError;
      }
      const csv = (await response.text()).trim();
      if (!csv || /^no data$/i.test(csv)) {
        throw createNoDataError(symbol);
      }
      const firstLine = csv.split('\n').find((l) => l.trim().length > 0) ?? '';
      if (firstLine.trimStart().startsWith('<')) {
        const htmlError = new Error(`Stooq returned HTML instead of CSV for ${symbol}`);
        htmlError.code = 'PRICE_FETCH_FAILED';
        throw htmlError;
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
      return attachProviderMeta(result, {
        provider: this.providerKey,
        degraded: false,
      });
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
  constructor({ primary, fallback, logger, healthMonitor = null } = {}) {
    this.primary = primary;
    this.fallback = fallback;
    this.logger = normalizeLogger(logger, { provider: 'dual' });
    this.healthMonitor = healthMonitor;
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
      const providerKey =
        typeof attempt.provider?.providerKey === 'string'
          ? attempt.provider.providerKey
          : String(attempt.provider?.constructor?.name ?? attempt.role).toLowerCase();
      const providerName = attempt.provider?.constructor?.name ?? attempt.role;
      if (this.healthMonitor && !this.healthMonitor.isHealthy(providerKey)) {
        this.healthMonitor.logSkip(providerKey, {
          symbol,
          from,
          to,
          role: attempt.role,
        });
        continue;
      }
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
        this.healthMonitor?.recordSuccess(providerKey);
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
        return attachProviderMeta(result, {
          provider: providerKey,
          degraded: attempt.role !== 'primary',
          role: attempt.role,
        });
      } catch (error) {
        lastError = error;
        this.healthMonitor?.recordFailure(providerKey, error);
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
    this.providerKey = 'twelvedata';
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
      return attachProviderMeta({
        date,
        adjClose: price,
      }, {
        provider: this.providerKey,
        degraded: false,
      });
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

function resolveQuotePriceFromCandidates(candidates) {
  for (const candidate of candidates) {
    const parsed = Number.parseFloat(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function resolveAlpacaSnapshotPrice(payload) {
  return resolveQuotePriceFromCandidates([
    payload?.latestTrade?.p,
    payload?.minuteBar?.c,
    payload?.dailyBar?.c,
    payload?.prevDailyBar?.c,
  ]);
}

function resolveAlpacaSnapshotDate(payload) {
  return normalizeQuoteDate(
    payload?.latestTrade?.t
    ?? payload?.minuteBar?.t
    ?? payload?.dailyBar?.t
    ?? payload?.prevDailyBar?.t,
  );
}

/**
 * Historical daily close prices via the Alpaca Market Data API
 * (v2/stocks/bars — IEX feed, split-adjusted).
 *
 * Uses the same API credentials as AlpacaLatestQuoteProvider so no extra
 * configuration is needed; set PRICE_PROVIDER_PRIMARY=alpaca.
 */
export class AlpacaHistoricalProvider {
  constructor({ fetchImpl = fetch, timeoutMs = 10000, logger, apiKey = '', apiSecret = '' } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = normalizeLogger(logger, { provider: 'alpaca_hist' });
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    this.apiSecret = typeof apiSecret === 'string' ? apiSecret.trim() : '';
    this.providerKey = 'alpaca';
  }

  async getDailyAdjustedClose(symbol, from, to) {
    if (!this.apiKey || !this.apiSecret) {
      const error = new Error('Alpaca API credentials are required for historical prices');
      error.code = 'PRICE_PROVIDER_MISCONFIGURED';
      throw error;
    }

    const url = new URL('https://data.alpaca.markets/v2/stocks/bars');
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('timeframe', '1Day');
    url.searchParams.set('start', toDateKey(from));
    url.searchParams.set('end', toDateKey(to));
    url.searchParams.set('feed', 'iex');
    url.searchParams.set('adjustment', 'split');
    url.searchParams.set('limit', '10000');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetch(url, {
        signal: controller.signal,
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecret,
        },
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw createNoDataError(symbol);
        }
        const body = await response.text().catch(() => '');
        const error = new Error(`Failed to fetch historical prices for ${symbol}: ${body.slice(0, 120)}`);
        error.status = response.status;
        if (response.status === 401 || response.status === 403) {
          error.code = 'PRICE_PROVIDER_AUTH_FAILED';
        }
        throw error;
      }
      const payload = await response.json();
      const bars = Array.isArray(payload?.bars?.[symbol]) ? payload.bars[symbol] : [];
      if (bars.length === 0) {
        throw createNoDataError(symbol);
      }
      const result = [];
      for (const bar of bars) {
        const adjClose = Number.parseFloat(bar?.c);
        if (!Number.isFinite(adjClose) || adjClose <= 0) {
          continue;
        }
        // Alpaca timestamps are ISO-8601 UTC; slice to YYYY-MM-DD in NY time
        const rawTs = bar?.t;
        let date;
        if (typeof rawTs === 'string') {
          date = new Date(rawTs).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        } else {
          continue;
        }
        result.push({ date, adjClose });
      }
      if (result.length === 0) {
        throw createNoDataError(symbol);
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
      return attachProviderMeta(result, { provider: this.providerKey, degraded: false });
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

export class AlpacaLatestQuoteProvider {
  constructor({
    fetchImpl = fetch,
    timeoutMs = 5000,
    logger,
    apiKey = '',
    apiSecret = '',
  } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = normalizeLogger(logger, { provider: 'alpaca' });
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    this.apiSecret = typeof apiSecret === 'string' ? apiSecret.trim() : '';
    this.providerKey = 'alpaca';
  }

  async getLatestQuote(symbol) {
    if (!this.apiKey || !this.apiSecret) {
      const error = new Error('Alpaca API credentials are required');
      error.code = 'PRICE_PROVIDER_MISCONFIGURED';
      throw error;
    }

    const encodedSymbol = encodeURIComponent(symbol);
    const url = `https://data.alpaca.markets/v2/stocks/${encodedSymbol}/snapshot`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetch(url, {
        signal: controller.signal,
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecret,
        },
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw createNoDataError(symbol);
        }
        const error = new Error(`Failed to fetch latest quote for ${symbol}`);
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      const price = resolveAlpacaSnapshotPrice(payload);
      if (!Number.isFinite(price)) {
        throw createNoDataError(symbol);
      }
      const date = resolveAlpacaSnapshotDate(payload);
      const durationMs = Date.now() - startedAt;
      this.logger?.info?.('latest_quote_provider_latency', {
        symbol,
        duration_ms: durationMs,
        date,
      });
      return attachProviderMeta({
        date,
        adjClose: price,
      }, {
        provider: this.providerKey,
        degraded: false,
      });
    } catch (error) {
      this.logger?.error?.('latest_quote_provider_failed', {
        symbol,
        error: error.message,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Historical daily close prices via Alpha Vantage TIME_SERIES_DAILY (free tier).
 * Free tier: 25 requests/day, 5 requests/minute.
 * Note: free tier returns unadjusted close ("4. close"); split-adjusted
 * data requires the premium TIME_SERIES_DAILY_ADJUSTED endpoint.
 * Set PRICE_PROVIDER_PRIMARY=alphavantage and ALPHAVANTAGE_API_KEY=<key>.
 */
export class AlphaVantageHistoricalProvider {
  constructor({ fetchImpl = fetch, timeoutMs = 15000, logger, apiKey = '' } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = normalizeLogger(logger, { provider: 'alphavantage' });
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    this.providerKey = 'alphavantage';
  }

  async getDailyAdjustedClose(symbol, from, to) {
    if (!this.apiKey) {
      const error = new Error('Alpha Vantage API key is required for historical prices');
      error.code = 'PRICE_PROVIDER_MISCONFIGURED';
      throw error;
    }

    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'TIME_SERIES_DAILY');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('outputsize', 'full');
    url.searchParams.set('apikey', this.apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Failed to fetch historical prices for ${symbol}`);
        error.status = response.status;
        if (response.status === 401 || response.status === 403) {
          error.code = 'PRICE_PROVIDER_AUTH_FAILED';
        }
        throw error;
      }
      const payload = await response.json();
      // Free-tier rate limit
      if (payload?.['Note']) {
        const error = new Error(`Alpha Vantage rate limit reached: ${String(payload['Note']).slice(0, 120)}`);
        error.code = 'PRICE_PROVIDER_RATE_LIMITED';
        throw error;
      }
      // Premium endpoint guard
      if (payload?.['Information']) {
        const error = new Error(`Alpha Vantage access denied: ${String(payload['Information']).slice(0, 120)}`);
        error.code = 'PRICE_PROVIDER_AUTH_FAILED';
        throw error;
      }
      // Invalid or unknown symbol
      if (payload?.['Error Message']) {
        throw createNoDataError(symbol);
      }

      const timeSeries = payload?.['Time Series (Daily)'];
      if (!timeSeries || typeof timeSeries !== 'object') {
        throw createNoDataError(symbol);
      }

      const fromKey = toDateKey(from);
      const toKey = toDateKey(to);
      const result = [];
      for (const [date, bar] of Object.entries(timeSeries)) {
        if (date < fromKey || date > toKey) {
          continue;
        }
        const adjClose = Number.parseFloat(bar?.['4. close']);
        if (Number.isFinite(adjClose) && adjClose > 0) {
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
        from,
        to,
        duration_ms: durationMs,
        rows: result.length,
      });
      return attachProviderMeta(result, { provider: this.providerKey, degraded: false });
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

/**
 * Latest price snapshot via Finnhub /v1/quote (free tier).
 * Returns the current trading price (field "c") with a Unix timestamp ("t").
 * Set PRICE_PROVIDER_LATEST=finnhub and FINNHUB_API_KEY=<key>.
 */
export class FinnhubLatestQuoteProvider {
  constructor({ fetchImpl = fetch, timeoutMs = 5000, logger, apiKey = '' } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = normalizeLogger(logger, { provider: 'finnhub' });
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    this.providerKey = 'finnhub';
  }

  async getLatestQuote(symbol) {
    if (!this.apiKey) {
      const error = new Error('Finnhub API key is required');
      error.code = 'PRICE_PROVIDER_MISCONFIGURED';
      throw error;
    }

    const url = new URL('https://finnhub.io/api/v1/quote');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('token', this.apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const error = new Error(`Failed to fetch latest quote for ${symbol}: ${body.slice(0, 120)}`);
        error.status = response.status;
        if (response.status === 401 || response.status === 403) {
          error.code = 'PRICE_PROVIDER_AUTH_FAILED';
        }
        throw error;
      }
      const payload = await response.json();
      // Finnhub returns { c: 0 } for unknown or untraded symbols
      const price = Number.parseFloat(payload?.c);
      if (!Number.isFinite(price) || price <= 0) {
        throw createNoDataError(symbol);
      }
      const date = normalizeQuoteDate(payload?.t);
      const durationMs = Date.now() - startedAt;
      this.logger?.info?.('latest_quote_provider_latency', {
        symbol,
        duration_ms: durationMs,
        date,
      });
      return attachProviderMeta({ date, adjClose: price }, {
        provider: this.providerKey,
        degraded: false,
      });
    } catch (error) {
      this.logger?.error?.('latest_quote_provider_failed', {
        symbol,
        error: error.message,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default YahooPriceProvider;
