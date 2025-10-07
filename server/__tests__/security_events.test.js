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

describe('security events endpoint', () => {
  const portfolioId = 'admin-audit';
  const apiKey = 'StrongKey2024!A';

  let dataDir;
  let app;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-security-events-'));
    resetRateLimitMetrics();
    app = createApp({
      dataDir,
      logger: new SilentLogger(),
      config: {
        featureFlags: { cashBenchmarks: true },
        cors: { allowedOrigins: [] },
        security: {
          bruteForce: {
            maxAttempts: 5,
            attemptWindowSeconds: 60,
            baseLockoutSeconds: 1,
            maxLockoutSeconds: 60,
            progressiveMultiplier: 2,
            checkPeriodSeconds: 1,
          },
          auditLog: {
            maxEvents: 10,
          },
        },
      },
    });
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('returns recent audit events in reverse chronological order', async () => {
    await request(app)
      .post(`/api/portfolio/${portfolioId}`)
      .set('X-Portfolio-Key', apiKey)
      .send({ transactions: [] })
      .expect(200);

    await request(app)
      .get(`/api/portfolio/${portfolioId}`)
      .set('X-Portfolio-Key', 'WrongKey1!')
      .expect(403);

    const response = await request(app)
      .get('/api/security/events?limit=5')
      .expect(200);

    assert.ok(Array.isArray(response.body.events));
    assert.ok(response.body.events.length >= 2);
    const [latest, previous] = response.body.events;
    assert.ok(latest.sequence > previous.sequence);
    const eventTypes = response.body.events.map((event) => event.event);
    assert.ok(eventTypes.includes('auth_success'));
    assert.ok(eventTypes.includes('auth_failed'));
  });

  test('respects configured buffer size when listing events', async () => {
    resetRateLimitMetrics();
    const limitedApp = createApp({
      dataDir,
      logger: new SilentLogger(),
      config: {
        featureFlags: { cashBenchmarks: true },
        cors: { allowedOrigins: [] },
        security: {
          bruteForce: {
            maxAttempts: 10,
            attemptWindowSeconds: 60,
            baseLockoutSeconds: 1,
            maxLockoutSeconds: 60,
            progressiveMultiplier: 2,
            checkPeriodSeconds: 1,
          },
          auditLog: {
            maxEvents: 3,
          },
        },
      },
    });

    await request(limitedApp)
      .post(`/api/portfolio/${portfolioId}-buffer`)
      .set('X-Portfolio-Key', apiKey)
      .send({ transactions: [] })
      .expect(200);

    for (let index = 0; index < 5; index += 1) {
      await request(limitedApp)
        .get(`/api/portfolio/${portfolioId}-buffer`)
        .set('X-Portfolio-Key', `Wrong-${index}!`)
        .expect(403);
    }

    const { body } = await request(limitedApp)
      .get('/api/security/events?limit=10')
      .expect(200);

    assert.ok(Array.isArray(body.events));
    assert.equal(body.events.length, 3);
    const sequences = body.events.map((event) => event.sequence);
    const sorted = [...sequences].sort((a, b) => b - a);
    assert.deepEqual(sequences, sorted);
  });
});
