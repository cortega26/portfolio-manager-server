import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
  configurePriceCache,
  flushPriceCache,
  generateETag,
  getCacheStats,
  getCachedPrice,
  setCachedPrice,
} from '../cache/priceCache.js';

beforeEach(() => {
  configurePriceCache({ ttlSeconds: 600, checkPeriodSeconds: 120 });
  flushPriceCache();
});

afterEach(() => {
  flushPriceCache();
});

test('caches price data and returns stored payloads', () => {
  const data = [{ date: '2024-01-01', close: 100 }];
  const etag = setCachedPrice('AAPL', '1y', data);

  const cached = getCachedPrice('AAPL', '1y');

  assert.ok(cached);
  assert.deepEqual(cached.data, data);
  assert.equal(cached.etag, etag);
});

test('returns undefined for cache miss and records stats', () => {
  const miss = getCachedPrice('MSFT', '1y');
  assert.equal(miss, undefined);

  const stats = getCacheStats();
  assert.equal(stats.misses >= 1, true);
});

test('generates consistent ETags for equal payloads', () => {
  const payload = [{ date: '2024-01-01', close: 100 }];
  const etag1 = generateETag(payload);
  const etag2 = generateETag(payload);

  assert.equal(etag1, etag2);
});

test('expires cached entries after TTL', async (t) => {
  t.mock.timers.enable();
  configurePriceCache({ ttlSeconds: 1, checkPeriodSeconds: 1 });
  flushPriceCache();

  setCachedPrice('GOOG', '1y', [{ date: '2024-01-01', close: 120 }]);
  assert.ok(getCachedPrice('GOOG', '1y'));

  // Advance time past the 1-second TTL plus check period.
  t.mock.timers.tick(1_500);

  assert.equal(getCachedPrice('GOOG', '1y'), undefined);
  t.mock.timers.reset();
});

test('honours maxAge guards for live cache reads', async (t) => {
  t.mock.timers.enable();
  setCachedPrice('SPY', 'latest:open', [{ date: '2024-01-01', close: 120 }], {
    ttlSeconds: 60,
  });
  assert.ok(getCachedPrice('SPY', 'latest:open', { maxAgeMs: 50 }));

  // Advance time past the 50ms maxAge.
  t.mock.timers.tick(60);

  assert.equal(getCachedPrice('SPY', 'latest:open', { maxAgeMs: 50 }), undefined);
  t.mock.timers.reset();
});
