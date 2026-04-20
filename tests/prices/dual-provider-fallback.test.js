/**
 * Unit tests for DualPriceProvider fallback chain:
 *  - Primary success → fallback never called
 *  - Primary HTML/PRICE_FETCH_FAILED error → fallback called
 *  - Both providers fail → throws last error
 *  - Health-monitor-marked unhealthy provider is skipped
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DualPriceProvider } from '../../server/data/prices.js';
import { createProviderHealthMonitor } from '../../server/data/providerHealth.js';

function makeProvider(key, result, error) {
  return {
    providerKey: key,
    calls: 0,
    async getDailyAdjustedClose() {
      this.calls += 1;
      if (error) throw error;
      return result;
    },
  };
}

function createMockLogger(entries = []) {
  return {
    entries,
    info(event, meta = {}) {
      entries.push({ level: 'info', event, meta });
    },
    warn(event, meta = {}) {
      entries.push({ level: 'warn', event, meta });
    },
    error(event, meta = {}) {
      entries.push({ level: 'error', event, meta });
    },
    child() {
      return createMockLogger(entries);
    },
  };
}

test('DualPriceProvider: primary success — fallback is never called', async () => {
  const primary = makeProvider('stooq', [{ date: '2024-01-01', adjClose: 100 }], null);
  const fallback = makeProvider('yahoo', [{ date: '2024-01-01', adjClose: 99 }], null);
  const logger = createMockLogger();
  const provider = new DualPriceProvider({ primary, fallback, logger });

  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-05');

  assert.equal(primary.calls, 1, 'primary called once');
  assert.equal(fallback.calls, 0, 'fallback not called');
  assert.equal(rows[0].adjClose, 100, 'returns primary data');

  const successLog = logger.entries.find((e) => e.event === 'price_provider_success');
  assert.ok(successLog, 'success event logged');
  assert.equal(successLog.meta.role, 'primary');
});

test('DualPriceProvider: primary PRICE_FETCH_FAILED (HTML) → fallback called, returns fallback data', async () => {
  const htmlError = new Error('Stooq returned HTML instead of CSV for SPY');
  htmlError.code = 'PRICE_FETCH_FAILED';
  const primary = makeProvider('stooq', null, htmlError);
  const fallback = makeProvider('yahoo', [{ date: '2024-01-01', adjClose: 405 }], null);
  const logger = createMockLogger();
  const provider = new DualPriceProvider({ primary, fallback, logger });

  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-05');

  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 1, 'fallback was called');
  assert.equal(rows[0].adjClose, 405, 'returns fallback data');

  const fallbackLog = logger.entries.find((e) => e.event === 'price_provider_fallback');
  assert.ok(fallbackLog, 'price_provider_fallback event logged');

  const successLog = logger.entries.find((e) => e.event === 'price_provider_success');
  assert.ok(successLog);
  assert.equal(successLog.meta.role, 'fallback');
});

test('DualPriceProvider: both providers fail → throws last error', async () => {
  const primaryErr = new Error('Stooq timeout');
  const fallbackErr = new Error('Yahoo crumb invalid');
  const primary = makeProvider('stooq', null, primaryErr);
  const fallback = makeProvider('yahoo', null, fallbackErr);
  const logger = createMockLogger();
  const provider = new DualPriceProvider({ primary, fallback, logger });

  await assert.rejects(
    () => provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-05'),
    (error) => {
      assert.equal(error, fallbackErr, 'throws the last (fallback) error');
      return true;
    }
  );
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 1);

  const failureLogs = logger.entries.filter((e) => e.event === 'price_provider_failure');
  assert.equal(failureLogs.length, 2, 'both failure events logged');
});

test('DualPriceProvider: health-monitor-marked unhealthy provider is skipped', async () => {
  const primary = makeProvider('stooq', null, new Error('should not be reached'));
  const fallback = makeProvider('yahoo', [{ date: '2024-01-01', adjClose: 410 }], null);
  const logger = createMockLogger();

  // Mark primary as unhealthy via health monitor
  const healthMonitor = createProviderHealthMonitor({ logger });
  // Record 2 transient failures to trigger cooldown
  const badError = new Error('transient failure');
  healthMonitor.recordFailure('stooq', badError);
  healthMonitor.recordFailure('stooq', badError);

  assert.ok(!healthMonitor.isHealthy('stooq'), 'stooq should be unhealthy after 2 failures');

  const provider = new DualPriceProvider({ primary, fallback, logger, healthMonitor });
  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-05');

  assert.equal(primary.calls, 0, 'unhealthy primary was skipped');
  assert.equal(fallback.calls, 1, 'fallback was called directly');
  assert.equal(rows[0].adjClose, 410);
});

test('DualPriceProvider: health-monitor-healthy primary is tried before fallback', async () => {
  const primary = makeProvider('stooq', [{ date: '2024-01-01', adjClose: 500 }], null);
  const fallback = makeProvider('yahoo', null, new Error('should not be reached'));
  const logger = createMockLogger();
  const healthMonitor = createProviderHealthMonitor({ logger });

  const provider = new DualPriceProvider({ primary, fallback, logger, healthMonitor });
  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-05');

  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 0);
  assert.equal(rows[0].adjClose, 500);
});
