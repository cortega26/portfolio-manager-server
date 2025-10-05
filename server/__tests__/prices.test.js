import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  YahooPriceProvider,
  StooqPriceProvider,
  DualPriceProvider,
} from '../data/prices.js';

const yahooCsv = `Date,Open,High,Low,Close,Adj Close,Volume\n2024-01-01,1,1,1,10,9.5,100`;
const stooqCsv = `Date,Open,High,Low,Close,Volume\n2024-01-01,1,1,1,11,100`;

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

test('YahooPriceProvider parses adjusted close values and logs latency', async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => yahooCsv });
  const logger = createMockLogger();
  const provider = new YahooPriceProvider({ fetchImpl, timeoutMs: 1000, logger });
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
  const fetchImpl = async () => ({ ok: false, text: async () => '' });
  const logger = createMockLogger();
  const provider = new YahooPriceProvider({ fetchImpl, timeoutMs: 1000, logger });
  await assert.rejects(() =>
    provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02'),
  );
  assert.ok(
    logger.entries.some(
      (entry) => entry.level === 'error' && entry.event === 'price_provider_failed',
    ),
  );
});

test('StooqPriceProvider normalizes close values into adjusted series', async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => stooqCsv });
  const logger = createMockLogger();
  const provider = new StooqPriceProvider({ fetchImpl, timeoutMs: 1000, logger });
  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-10');
  assert.deepEqual(rows, [{ date: '2024-01-01', adjClose: 11 }]);
  assert.ok(
    logger.entries.some(
      (entry) => entry.event === 'price_provider_latency' && entry.meta.provider === 'stooq',
    ),
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
