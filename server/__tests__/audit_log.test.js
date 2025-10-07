import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { createApp } from '../app.js';
import { resetRateLimitMetrics } from '../metrics/rateLimitMetrics.js';

class SilentLogger {
  info() {}
  warn() {}
  error() {}
  child() {
    return this;
  }
}

describe('security audit logging', () => {
  const portfolioId = 'audit-security';
  const bootstrapKey = 'StrongKey2024!A';
  const rotatedKey = 'RotatedKey2024!B';
  const invalidKey = 'WeakKey1!';

  let dataDir;
  let app;
  let events;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-audit-log-'));
    events = [];
    resetRateLimitMetrics();
    app = createApp({
      dataDir,
      logger: new SilentLogger(),
      auditSink: (event) => {
        if (event?.event_type === 'security') {
          events.push(event);
        }
      },
      config: {
        featureFlags: { cashBenchmarks: true },
        cors: { allowedOrigins: [] },
        rateLimit: {
          portfolio: { windowMs: 1_000, max: 5 },
        },
      },
    });
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('auth lifecycle emits expected audit events', async () => {
    await request(app)
      .post(`/api/portfolio/${portfolioId}`)
      .set('X-Portfolio-Key', bootstrapKey)
      .send({ transactions: [] })
      .expect(200);

    const bootstrapEvent = events.find(
      (event) => event.event === 'auth_success' && event.mode === 'bootstrap',
    );
    assert.ok(bootstrapEvent, 'bootstrap should log auth_success');
    assert.equal(bootstrapEvent.portfolio_id, portfolioId);

    events.length = 0;

    await request(app)
      .get(`/api/portfolio/${portfolioId}`)
      .set('X-Portfolio-Key', invalidKey)
      .expect(403);

    const failedEvent = events.find((event) => event.event === 'auth_failed');
    assert.ok(failedEvent, 'invalid key should log auth_failed');
    assert.equal(failedEvent.reason, 'invalid_key');

    events.length = 0;

    await request(app)
      .post(`/api/portfolio/${portfolioId}`)
      .set('X-Portfolio-Key', bootstrapKey)
      .set('X-Portfolio-Key-New', 'weakkey')
      .send({ transactions: [] })
      .expect(400);

    const weakEvent = events.find((event) => event.event === 'weak_key_rejected');
    assert.ok(weakEvent, 'weak rotation key should log weak_key_rejected');
    assert.equal(weakEvent.action, 'rotate');

    events.length = 0;

    await request(app)
      .post(`/api/portfolio/${portfolioId}`)
      .set('X-Portfolio-Key', bootstrapKey)
      .set('X-Portfolio-Key-New', rotatedKey)
      .send({ transactions: [] })
      .expect(200);

    const rotationEvent = events.find((event) => event.event === 'key_rotated');
    assert.ok(rotationEvent, 'successful rotation should log key_rotated');
    assert.equal(rotationEvent.portfolio_id, portfolioId);

    const accessSuccess = events.find(
      (event) => event.event === 'auth_success' && event.mode === 'access',
    );
    assert.ok(accessSuccess, 'successful access should log auth_success mode access');
  });

  test('rate limiting logs audit events', async () => {
    const rateEvents = [];
    const rateDir = mkdtempSync(path.join(tmpdir(), 'portfolio-audit-rate-'));
    const rateApp = createApp({
      dataDir: rateDir,
      logger: new SilentLogger(),
      config: {
        featureFlags: { cashBenchmarks: true },
        cors: { allowedOrigins: [] },
        rateLimit: {
          portfolio: { windowMs: 5_000, max: 1 },
        },
      },
      auditSink: (event) => {
        if (event?.event_type === 'security') {
          rateEvents.push(event);
        }
      },
    });

    try {
      const rateKey = 'RateLimitKey24!A';

      await request(rateApp)
        .post(`/api/portfolio/${portfolioId}-rate`)
        .set('X-Portfolio-Key', rateKey)
        .send({ transactions: [] })
        .expect(200);

      rateEvents.length = 0;

      await request(rateApp)
        .post(`/api/portfolio/${portfolioId}-rate`)
        .set('X-Portfolio-Key', rateKey)
        .send({ transactions: [] })
        .expect(429);

      const rateLimitEvent = rateEvents.find((event) => event.event === 'rate_limit_exceeded');
      assert.ok(rateLimitEvent, 'second request should trigger rate limit audit event');
      assert.equal(rateLimitEvent.scope, 'portfolio');
    } finally {
      rmSync(rateDir, { recursive: true, force: true });
    }
  });
});
