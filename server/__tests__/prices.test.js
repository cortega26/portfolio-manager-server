import assert from 'node:assert/strict';
import { test as baseTest } from 'node:test';

import {
  AlpacaLatestQuoteProvider,
  YahooPriceProvider,
  StooqPriceProvider,
  TwelveDataQuoteProvider,
  DualPriceProvider,
} from '../data/prices.js';

// Yahoo v8 chart JSON fixture (replaces the deprecated v7 CSV endpoint)
const yahooV8Json = {
  chart: {
    result: [{
      meta: { symbol: 'SPY' },
      // 2024-01-01 17:00 UTC = 2024-01-01 12:00 America/New_York
      timestamp: [1704124800],
      indicators: {
        quote: [{ close: [10.0] }],
        adjclose: [{ adjclose: [9.5] }],
      },
    }],
    error: null,
  },
};
const stooqCsv = `Date,Open,High,Low,Close,Volume\n2024-01-01,1,1,1,11,100`;
const twelveDataQuote = {
  symbol: 'MSFT',
  price: '251.75',
  datetime: '2024-02-03 10:15:00',
  is_market_open: false,
};
const alpacaSnapshot = {
  latestTrade: {
    p: 417.62,
    t: '2024-02-05T15:45:12Z',
  },
  minuteBar: {
    c: 417.5,
    t: '2024-02-05T15:45:00Z',
  },
};

function createMockLogger(bindings = {}, entries = []) {
  const logger = {
    entries,
    info(event, meta = {}) {
      entries.push({ level: 'info', event, meta: { ...bindings, ...meta } });
    },
    warn(event, meta = {}) {
      entries.push({ level: 'warn', event, meta: { ...bindings, ...meta } });
    },
    error(event, meta = {}) {
      entries.push({ level: 'error', event, meta: { ...bindings, ...meta } });
    },
    child(childBindings = {}) {
      return createMockLogger({ ...bindings, ...childBindings }, entries);
    },
  };
  return logger;
}

class PrimaryStub {
  constructor(result, error) {
    this.result = result;
    this.error = error;
    this.calls = 0;
  }

  async getDailyAdjustedClose() {
    this.calls += 1;
    if (this.error) {
      throw this.error;
    }
    return this.result;
  }
}

class FallbackStub extends PrimaryStub {}

const skipNetwork = process.env.NO_NETWORK_TESTS === '1';
const test = skipNetwork ? baseTest.skip : baseTest;

test('YahooPriceProvider parses adjusted close values and logs latency', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => yahooV8Json });
  const logger = createMockLogger();
  const provider = new YahooPriceProvider({ fetchImpl, timeoutMs: 1000, logger });
  // Pre-populate crumb cache so the test exercises only the chart-fetch path
  provider._crumbCache = { crumb: 'test-crumb', cookies: 'A1=test', fetchedAt: Date.now() };
  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].adjClose, 9.5);
  assert.ok(
    logger.entries.some(
      (entry) => entry.event === 'price_provider_latency' && entry.meta.provider === 'yahoo',
    ),
  );
});

test('YahooPriceProvider surfaces upstream failures', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => '' });
  const logger = createMockLogger();
  const provider = new YahooPriceProvider({ fetchImpl, timeoutMs: 1000, logger });
  // Pre-populate crumb cache so the test exercises only the chart-fetch path
  provider._crumbCache = { crumb: 'test-crumb', cookies: 'A1=test', fetchedAt: Date.now() };
  await assert.rejects(() =>
    provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02'),
  );
  assert.ok(
    logger.entries.some(
      (entry) => entry.level === 'error' && entry.event === 'price_provider_failed',
    ),
  );
});

test('StooqPriceProvider normalizes US symbols into adjusted series', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    return { ok: true, text: async () => stooqCsv };
  };
  const logger = createMockLogger();
  const provider = new StooqPriceProvider({ fetchImpl, timeoutMs: 1000, logger });
  const rows = await provider.getDailyAdjustedClose('NVDA', '2024-01-01', '2024-01-10');
  assert.deepEqual(rows, [{ date: '2024-01-01', adjClose: 11 }]);
  assert.equal(requests[0], 'https://stooq.com/q/d/l/?s=nvda.us&d1=20240101&d2=20240110&i=d');
  assert.ok(
    logger.entries.some(
      (entry) => entry.event === 'price_provider_latency' && entry.meta.provider === 'stooq',
    ),
  );
});

test('StooqPriceProvider treats "No data" as an upstream error', async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => 'No data' });
  const logger = createMockLogger();
  const provider = new StooqPriceProvider({ fetchImpl, timeoutMs: 1000, logger });
  await assert.rejects(
    () => provider.getDailyAdjustedClose('NVDA', '2024-01-01', '2024-01-10'),
    (error) => error.code === 'PRICE_NOT_FOUND' && error.status === 404,
  );
  assert.ok(
    logger.entries.some(
      (entry) => entry.level === 'error' && entry.event === 'price_provider_failed',
    ),
  );
});

test('TwelveDataQuoteProvider parses latest quote payloads and logs latency', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    return { ok: true, json: async () => twelveDataQuote };
  };
  const logger = createMockLogger();
  const provider = new TwelveDataQuoteProvider({
    fetchImpl,
    timeoutMs: 1000,
    logger,
    apiKey: 'test-key',
  });
  const row = await provider.getLatestQuote('MSFT');
  assert.deepEqual(row, { date: '2024-02-03', adjClose: 251.75 });
  assert.ok(requests[0].includes('https://api.twelvedata.com/quote'));
  assert.ok(requests[0].includes('symbol=MSFT'));
  assert.ok(requests[0].includes('prepost=true'));
  assert.ok(
    logger.entries.some(
      (entry) => entry.event === 'latest_quote_provider_latency' && entry.meta.provider === 'twelvedata',
    ),
  );
});

test('AlpacaLatestQuoteProvider parses snapshot payloads and logs latency', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({
      url: String(url),
      headers: options.headers,
    });
    return { ok: true, json: async () => alpacaSnapshot };
  };
  const logger = createMockLogger();
  const provider = new AlpacaLatestQuoteProvider({
    fetchImpl,
    timeoutMs: 1000,
    logger,
    apiKey: 'alpaca-key',
    apiSecret: 'alpaca-secret',
  });
  const row = await provider.getLatestQuote('SPY');
  assert.deepEqual(row, { date: '2024-02-05', adjClose: 417.62 });
  assert.equal(requests[0].url, 'https://data.alpaca.markets/v2/stocks/SPY/snapshot');
  assert.equal(requests[0].headers['APCA-API-KEY-ID'], 'alpaca-key');
  assert.equal(requests[0].headers['APCA-API-SECRET-KEY'], 'alpaca-secret');
  assert.ok(
    logger.entries.some(
      (entry) => entry.event === 'latest_quote_provider_latency' && entry.meta.provider === 'alpaca',
    ),
  );
});

test('AlpacaLatestQuoteProvider treats 404 as symbol-level no data', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    json: async () => ({}),
  });
  const logger = createMockLogger();
  const provider = new AlpacaLatestQuoteProvider({
    fetchImpl,
    timeoutMs: 1000,
    logger,
    apiKey: 'alpaca-key',
    apiSecret: 'alpaca-secret',
  });
  await assert.rejects(
    () => provider.getLatestQuote('INVALID'),
    (error) => error.code === 'PRICE_NOT_FOUND' && error.status === 404,
  );
});

test('DualPriceProvider returns primary data when successful and avoids fallback', async () => {
  const primary = new PrimaryStub([{ date: '2024-01-01', adjClose: 42 }], null);
  const fallback = new FallbackStub([{ date: '2024-01-01', adjClose: 11 }], null);
  const logger = createMockLogger();
  const provider = new DualPriceProvider({ primary, fallback, logger });
  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-10');
  assert.deepEqual(rows, [{ date: '2024-01-01', adjClose: 42 }]);
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 0);
  assert.ok(
    logger.entries.some(
      (entry) =>
        entry.event === 'price_provider_success' && entry.meta.role === 'primary' && entry.level === 'info',
    ),
  );
  assert.equal(
    logger.entries.filter((entry) => entry.event === 'price_provider_failure').length,
    0,
  );
});

test('DualPriceProvider falls back when primary fails and logs failure', async () => {
  const primaryError = new Error('Primary failed');
  const primary = new PrimaryStub(null, primaryError);
  const fallback = new FallbackStub([{ date: '2024-01-01', adjClose: 11 }], null);
  const logger = createMockLogger();
  const provider = new DualPriceProvider({ primary, fallback, logger });
  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-10');
  assert.deepEqual(rows, [{ date: '2024-01-01', adjClose: 11 }]);
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 1);
  assert.ok(
    logger.entries.some(
      (entry) =>
        entry.event === 'price_provider_failure' && entry.meta.role === 'primary' && entry.level === 'warn',
    ),
  );
  assert.ok(
    logger.entries.some(
      (entry) => entry.event === 'price_provider_fallback' && entry.meta.failed_provider === 'PrimaryStub',
    ),
  );
  assert.ok(
    logger.entries.some(
      (entry) => entry.event === 'price_provider_success' && entry.meta.role === 'fallback',
    ),
  );
});

test('DualPriceProvider propagates final error when all providers fail', async () => {
  const primaryError = new Error('Primary failed');
  const fallbackError = new Error('Fallback failed');
  const primary = new PrimaryStub(null, primaryError);
  const fallback = new FallbackStub(null, fallbackError);
  const logger = createMockLogger();
  const provider = new DualPriceProvider({ primary, fallback, logger });
  await assert.rejects(
    () => provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-10'),
    (error) => error === fallbackError,
  );
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 1);
  const failureEvents = logger.entries.filter((entry) => entry.event === 'price_provider_failure');
  assert.equal(failureEvents.length, 2);
  assert.ok(
    logger.entries.some(
      (entry) => entry.level === 'warn' && entry.event === 'price_provider_failure' && entry.meta.role === 'fallback',
    ),
  );
});
