import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { createApp } from '../app.js';

const STRONG_KEY = 'ValidKeyErrors1!';

let dataDir;
let app;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-api-errors-'));
  app = createApp({
    dataDir,
    logger: { info() {}, warn() {}, error() {} },
    config: { featureFlags: { cashBenchmarks: true }, cors: { allowedOrigins: [] } },
  });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('returns 400 for invalid portfolio identifier formatting', async () => {
  const response = await request(app)
    .get('/api/portfolio/invalid id with spaces')
    .set('X-Portfolio-Key', STRONG_KEY);

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
});

test('returns 400 when JSON payload is malformed', async () => {
  const response = await request(app)
    .post('/api/portfolio/badjson')
    .set('X-Portfolio-Key', STRONG_KEY)
    .set('Content-Type', 'application/json')
    .send('{ invalid json }');

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'INVALID_JSON');
});

test('returns 400 when attempting to bootstrap with a weak key', async () => {
  const response = await request(app)
    .post('/api/portfolio/weak-key-test')
    .set('X-Portfolio-Key', 'weakkey')
    .send({ transactions: [] });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'WEAK_KEY');
});

test('returns 413 for payloads larger than the JSON body limit', async () => {
  const oversizeNote = 'a'.repeat(11 * 1024 * 1024);
  const response = await request(app)
    .post('/api/portfolio/oversized')
    .set('X-Portfolio-Key', STRONG_KEY)
    .send({
      transactions: [
        {
          date: '2024-01-01',
          type: 'DEPOSIT',
          amount: 1000,
          note: oversizeNote,
        },
      ],
    });

  assert.equal(response.status, 413);
  assert.equal(response.body.error, 'PAYLOAD_TOO_LARGE');
});

test('returns 404 when accessing a non-provisioned portfolio without bootstrap permission', async () => {
  const response = await request(app)
    .get('/api/portfolio/missing')
    .set('X-Portfolio-Key', STRONG_KEY);

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'PORTFOLIO_NOT_FOUND');
});
