import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { createSessionTestApp, withSession } from './sessionTestUtils.js';

let dataDir;
let app;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-api-errors-'));
  app = createSessionTestApp({
    dataDir,
    logger: { info() {}, warn() {}, error() {} },
  });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('returns 400 for invalid portfolio identifier formatting', async () => {
  const response = await withSession(
    request(app).get('/api/portfolio/invalid id with spaces'),
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
});

test('returns 400 when JSON payload is malformed', async () => {
  const response = await withSession(
    request(app)
      .post('/api/portfolio/badjson')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }'),
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'INVALID_JSON');
});

test('returns 403 when an invalid desktop session token is provided', async () => {
  const response = await withSession(
    request(app)
      .post('/api/portfolio/invalid-session-test')
      .send({ transactions: [] }),
    'bad-session-token',
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'INVALID_SESSION_TOKEN');
});

test('returns 413 for payloads larger than the JSON body limit', async () => {
  const oversizeNote = 'a'.repeat(11 * 1024 * 1024);
  const response = await withSession(
    request(app)
      .post('/api/portfolio/oversized')
      .send({
        transactions: [
          {
            date: '2024-01-01',
            type: 'DEPOSIT',
            amount: 1000,
            note: oversizeNote,
          },
        ],
      }),
  );

  assert.equal(response.status, 413);
  assert.equal(response.body.error, 'PAYLOAD_TOO_LARGE');
});

test('returns an empty object when accessing a non-provisioned portfolio with a valid session', async () => {
  const response = await withSession(request(app).get('/api/portfolio/missing'));

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {});
});
