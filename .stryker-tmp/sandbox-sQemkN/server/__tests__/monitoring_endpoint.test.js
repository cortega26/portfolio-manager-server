// @ts-nocheck
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { createApp } from '../app.js';
import { flushPriceCache } from '../cache/priceCache.js';
import { getPerformanceMetrics } from '../metrics/performanceMetrics.js';
import { resetRateLimitMetrics } from '../metrics/rateLimitMetrics.js';
import { resetLockMetrics, withLock } from '../utils/locks.js';

class SilentLogger {
  info() {}

  warn() {}

  error() {}

  child() {
    return this;
  }
}

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('performance monitoring endpoint', () => {
  let dataDir;
  let app;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-monitoring-'));
    resetRateLimitMetrics();
    resetLockMetrics();
    flushPriceCache();
    app = createApp({
      dataDir,
      logger: new SilentLogger(),
      config: {
        featureFlags: { cashBenchmarks: true },
        cors: { allowedOrigins: [] },
        rateLimit: { portfolio: { windowMs: 1_000, max: 5 } },
      },
    });
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    resetLockMetrics();
    flushPriceCache();
  });

  test('reports runtime, cache, lock, and security metrics', async () => {
    const hold = createDeferred();
    const firstLock = withLock('monitor-test', async () => {
      await hold.promise;
      return 'first';
    });

    await new Promise((resolve) => setImmediate(resolve));

    const secondLock = withLock('monitor-test', async () => 'second');

    await new Promise((resolve) => setImmediate(resolve));

    const response = await request(app).get('/api/monitoring').expect(200);

    const body = response.body;
    assert.ok(body.timestamp, 'timestamp should be present');

    assert.ok(body.process, 'process metrics present');
    assert.ok(Number.isFinite(body.process.uptimeSeconds), 'uptime should be numeric');
    assert.ok(Array.isArray(body.process.loadAverage), 'load average reported');

    assert.ok(body.cache, 'cache stats present');
    assert.ok(Object.prototype.hasOwnProperty.call(body.cache, 'hitRate'), 'cache hit rate included');

    assert.ok(body.locks, 'lock metrics present');
    assert.equal(body.locks.totalActive, 1, 'one active lock tracked');
    assert.equal(body.locks.totalPending, 1, 'one queued lock tracked');
    assert.ok(body.locks.maxDepth >= 2, 'depth reflects active + queued locks');

    assert.ok(body.bruteForce, 'brute force metrics present');
    assert.ok(body.rateLimit, 'rate limit metrics present');

    hold.resolve();
    await firstLock;
    await secondLock;
  });

  test('getPerformanceMetrics exposes deterministic structure', () => {
    const now = Date.now();
    const snapshot = getPerformanceMetrics({ now });
    assert.equal(snapshot.timestamp, new Date(now).toISOString());
    assert.ok(snapshot.process);
    assert.ok(snapshot.cache);
    assert.ok(snapshot.locks);
    assert.ok(snapshot.bruteForce);
    assert.ok(snapshot.rateLimit);
  });
});
