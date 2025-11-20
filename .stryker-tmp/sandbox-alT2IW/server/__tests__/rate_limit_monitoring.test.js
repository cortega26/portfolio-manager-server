// @ts-nocheck
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { createApp } from '../app.js';
import {
  getRateLimitMetrics,
  recordRateLimitHit,
  registerRateLimitConfig,
  resetRateLimitMetrics,
} from '../metrics/rateLimitMetrics.js';

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;
let app;

beforeEach(() => {
  resetRateLimitMetrics();
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-rate-limit-monitor-'));
  app = createApp({
    dataDir,
    logger: noopLogger,
    config: {
      featureFlags: { cashBenchmarks: true },
      cors: { allowedOrigins: [] },
      rateLimit: {
        portfolio: { windowMs: 1_000, max: 1 },
      },
    },
  });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('rate limit monitoring reports recent hits and offenders', async () => {
  const portfolioId = `rl-${randomUUID()}`;
  const apiKey = 'RateLimitStrong1!';

  await request(app)
    .post(`/api/portfolio/${portfolioId}`)
    .set('X-Portfolio-Key', apiKey)
    .send({ transactions: [] })
    .expect(200);

  await new Promise((resolve) => setTimeout(resolve, 1_050));

  await request(app)
    .get(`/api/portfolio/${portfolioId}`)
    .set('X-Portfolio-Key', apiKey)
    .expect(200);

  const limited = await request(app)
    .get(`/api/portfolio/${portfolioId}`)
    .set('X-Portfolio-Key', apiKey)
    .expect(429);

  const retryAfter = Number.parseInt(limited.headers['retry-after'] ?? '0', 10);
  assert.ok(Number.isFinite(retryAfter) && retryAfter >= 1);

  const stats = await request(app).get('/api/security/stats');
  assert.equal(stats.status, 200);

  const { rateLimit, bruteForce } = stats.body;
  assert.ok(rateLimit, 'rate limit metrics should be present');
  assert.ok(bruteForce, 'brute force metrics should remain available');
  assert.ok(rateLimit.totalHits >= 1, 'at least one limiter hit should be tracked');

  const portfolioMetrics = rateLimit.scopes.portfolio;
  assert.ok(portfolioMetrics, 'portfolio scope metrics should exist');
  assert.equal(portfolioMetrics.limit, 1);
  assert.equal(portfolioMetrics.windowMs, 1_000);
  assert.ok(portfolioMetrics.totalHits >= 1);
  assert.ok(portfolioMetrics.hitsLastWindow >= 1);
  assert.ok(portfolioMetrics.hitsLast15m >= portfolioMetrics.totalHits);
  assert.equal(portfolioMetrics.uniqueIpCount, 1);
  assert.ok(portfolioMetrics.lastHitAt, 'last hit timestamp should be recorded');
  assert.ok(Array.isArray(portfolioMetrics.topOffenders));
  assert.ok(portfolioMetrics.topOffenders.length >= 1);
  assert.equal(typeof portfolioMetrics.topOffenders[0].ip, 'string');
  assert.ok(portfolioMetrics.topOffenders[0].hits >= 1);
});

test('registerRateLimitConfig normalises scope names and tracks unknown offenders', () => {
  registerRateLimitConfig(' General ', { limit: 25, windowMs: 2_000 });
  recordRateLimitHit({ scope: ' General ', limit: 25, windowMs: 2_000, ip: undefined });

  const metrics = getRateLimitMetrics();
  const general = metrics.scopes.general;

  assert.ok(general.configured);
  assert.equal(general.limit, 25);
  assert.equal(general.windowMs, 2_000);
  assert.equal(general.totalHits, 1);
  assert.equal(general.uniqueIpCount, 1);
  assert.equal(general.topOffenders[0].ip, 'unknown');
});

test('rate limit metrics prune stale hits and cap offender lists', () => {
  const base = Date.now();
  const originalNow = Date.now;

  try {
    Date.now = () => base - (16 * 60 * 1000);
    recordRateLimitHit({ scope: 'portfolio', ip: '198.51.100.1' });

    Date.now = () => base;
    registerRateLimitConfig('portfolio', { limit: 2, windowMs: 500 });

    for (let i = 0; i < 120; i += 1) {
      recordRateLimitHit({ scope: 'portfolio', ip: `203.0.113.${i}` });
    }

    for (let i = 0; i < 3; i += 1) {
      recordRateLimitHit({ scope: 'portfolio', ip: '203.0.113.200' });
    }
  } finally {
    Date.now = originalNow;
  }

  const metrics = getRateLimitMetrics({ now: base + 400 });
  const portfolio = metrics.scopes.portfolio;

  assert.equal(portfolio.totalHits, 124);
  assert.equal(portfolio.hitsLast15m, 123);
  assert.equal(portfolio.hitsLastWindow, 123);
  assert.equal(portfolio.hitsLastMinute, 123);
  assert.equal(portfolio.uniqueIpCount, 100);
  assert.ok(portfolio.lastHitAt);
  assert.ok(portfolio.topOffenders.length <= 5);
  assert.equal(portfolio.topOffenders[0].ip, '203.0.113.200');
  assert.ok(portfolio.topOffenders[0].hits >= 3);
});
