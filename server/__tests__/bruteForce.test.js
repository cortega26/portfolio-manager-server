import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { createApp } from '../app.js';
import { resetRateLimitMetrics } from '../metrics/rateLimitMetrics.js';

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;

beforeEach(() => {
  resetRateLimitMetrics();
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-bruteforce-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function buildApp(overrides = {}) {
  return createApp({
    dataDir,
    logger: noopLogger,
    config: {
      featureFlags: { cashBenchmarks: true },
      cors: { allowedOrigins: [] },
      cache: {
        ttlSeconds: 600,
        price: { ttlSeconds: 600, checkPeriodSeconds: 120 },
      },
      security: {
        bruteForce: {
          maxAttempts: overrides.maxAttempts ?? 3,
          attemptWindowSeconds: overrides.attemptWindowSeconds ?? 30,
          baseLockoutSeconds: overrides.baseLockoutSeconds ?? 1,
          maxLockoutSeconds: overrides.maxLockoutSeconds ?? 8,
          progressiveMultiplier: overrides.progressiveMultiplier ?? 2,
          checkPeriodSeconds: overrides.checkPeriodSeconds ?? 1,
        },
      },
    },
  });
}

async function bootstrapPortfolio(app, portfolioId, apiKey) {
  const response = await request(app)
    .post(`/api/portfolio/${portfolioId}`)
    .set('X-Portfolio-Key', apiKey)
    .send({ transactions: [], signals: {} });
  assert.equal(response.status, 200);
}

test('locks out after reaching maximum invalid attempts', async () => {
  const app = buildApp({ maxAttempts: 3, baseLockoutSeconds: 1 });
  const portfolioId = `bf-${randomUUID()}`;
  const apiKey = 'ValidKeyLock1!';
  await bootstrapPortfolio(app, portfolioId, apiKey);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const invalid = await request(app)
      .get(`/api/portfolio/${portfolioId}`)
      .set('X-Portfolio-Key', `invalid-${attempt}`);
    assert.equal(invalid.status, 403);
  }

  const locked = await request(app)
    .get(`/api/portfolio/${portfolioId}`)
    .set('X-Portfolio-Key', 'invalid-final');
  assert.equal(locked.status, 429);
  const retryAfter = Number.parseInt(locked.headers['retry-after'] ?? '0', 10);
  assert.ok(Number.isFinite(retryAfter) && retryAfter >= 1);
});

test('successful authentication clears prior failures', async () => {
  const app = buildApp({ maxAttempts: 4, baseLockoutSeconds: 1 });
  const portfolioId = `bf-clear-${randomUUID()}`;
  const apiKey = 'ValidKeyClear1!';
  await bootstrapPortfolio(app, portfolioId, apiKey);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const invalid = await request(app)
      .get(`/api/portfolio/${portfolioId}`)
      .set('X-Portfolio-Key', `wrong-${attempt}`);
    assert.equal(invalid.status, 403);
  }

  const success = await request(app)
    .get(`/api/portfolio/${portfolioId}`)
    .set('X-Portfolio-Key', apiKey);
  assert.equal(success.status, 200);

  const postSuccess = await request(app)
    .get(`/api/portfolio/${portfolioId}`)
    .set('X-Portfolio-Key', 'wrong-after-success');
  assert.equal(postSuccess.status, 403);
});

test('lockout duration increases progressively', async () => {
  const app = buildApp({
    maxAttempts: 3,
    baseLockoutSeconds: 1,
    maxLockoutSeconds: 8,
    progressiveMultiplier: 2,
  });
  const portfolioId = `bf-progressive-${randomUUID()}`;
  const apiKey = 'ValidKeyProgress1!';
  await bootstrapPortfolio(app, portfolioId, apiKey);

  const triggerLockout = async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const invalid = await request(app)
        .get(`/api/portfolio/${portfolioId}`)
        .set('X-Portfolio-Key', `prog-${attempt}`);
      assert.equal(invalid.status, 403);
    }
    return request(app)
      .get(`/api/portfolio/${portfolioId}`)
      .set('X-Portfolio-Key', 'prog-final');
  };

  const firstLockout = await triggerLockout();
  assert.equal(firstLockout.status, 429);
  const retryAfterFirst = Number.parseInt(firstLockout.headers['retry-after'] ?? '0', 10);
  assert.ok(Number.isFinite(retryAfterFirst) && retryAfterFirst >= 1);

  await new Promise((resolve) => setTimeout(resolve, retryAfterFirst * 1000 + 100));

  const recovery = await request(app)
    .get(`/api/portfolio/${portfolioId}`)
    .set('X-Portfolio-Key', apiKey);
  assert.equal(recovery.status, 200);

  const secondLockout = await triggerLockout();
  assert.equal(secondLockout.status, 429);
  const retryAfterSecond = Number.parseInt(secondLockout.headers['retry-after'] ?? '0', 10);
  assert.ok(retryAfterSecond >= retryAfterFirst * 2 - 1);
});

test('security stats endpoint reports active lockouts', async () => {
  const app = buildApp({ maxAttempts: 2, baseLockoutSeconds: 1 });
  const portfolioId = `bf-stats-${randomUUID()}`;
  const apiKey = 'ValidKeyStats1!';
  await bootstrapPortfolio(app, portfolioId, apiKey);

  await request(app)
    .get(`/api/portfolio/${portfolioId}`)
    .set('X-Portfolio-Key', 'invalid');

  await request(app)
    .get(`/api/portfolio/${portfolioId}`)
    .set('X-Portfolio-Key', 'invalid');

  const stats = await request(app).get('/api/security/stats');
  assert.equal(stats.status, 200);
  assert.ok(stats.body.bruteForce);
  assert.ok(stats.body.bruteForce.activeLockouts >= 1);
  assert.ok(stats.body.rateLimit);
  assert.ok(stats.body.rateLimit.scopes.portfolio);
});
