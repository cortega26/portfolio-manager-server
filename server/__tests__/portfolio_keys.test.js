import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import request from 'supertest';

import { createApp } from '../app.js';
import JsonTableStorage from '../data/storage.js';

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;
let storage;
let app;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-keys-tests-'));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable('portfolio_keys', []);
  app = createApp({ dataDir, logger: noopLogger });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function readKeyRecord(id) {
  const rows = await storage.readTable('portfolio_keys');
  return rows.find((row) => row.id === id);
}

function isHex(value) {
  return typeof value === 'string' && /^[0-9a-f]+$/iu.test(value);
}

test('bootstrapping stores salted portfolio keys', async () => {
  const payload = { transactions: [], signals: {} };
  const key = 'ValidKey123!';
  const response = await request(app)
    .post('/api/portfolio/salted-bootstrap')
    .set('Content-Type', 'application/json')
    .set('X-Portfolio-Key', key)
    .send(payload);

  assert.equal(response.status, 200);
  const record = await readKeyRecord('salted-bootstrap');
  assert.ok(record, 'expected stored key record');
  assert.ok(isHex(record.hash));
  assert.ok(isHex(record.salt));
  assert.equal(record.salt.length, 32);
  const legacyDigest = createHash('sha256').update(key).digest('hex');
  assert.notEqual(
    record.hash,
    legacyDigest,
    'salted hash should differ from unsalted digest',
  );
});

test('legacy unsalted keys upgrade to salted hashes after successful auth', async () => {
  const id = 'legacy-upgrade';
  const key = 'LegacyKey456!';
  const payload = { transactions: [], signals: {} };

  const bootstrapResponse = await request(app)
    .post(`/api/portfolio/${id}`)
    .set('Content-Type', 'application/json')
    .set('X-Portfolio-Key', key)
    .send(payload);
  assert.equal(bootstrapResponse.status, 200);

  const legacyDigest = createHash('sha256').update(key).digest('hex');
  await storage.writeTable('portfolio_keys', [
    { id, hash: legacyDigest, updated_at: new Date().toISOString() },
  ]);

  app = createApp({ dataDir, logger: noopLogger });

  const response = await request(app)
    .get(`/api/portfolio/${id}`)
    .set('X-Portfolio-Key', key);

  assert.equal(response.status, 200);
  const updated = await readKeyRecord(id);
  assert.ok(updated?.salt, 'expected salt after upgrade');
  assert.ok(isHex(updated.salt));
  assert.notEqual(updated.hash, legacyDigest, 'hash should change after salting');
});

test('key rotation writes a fresh salted hash for the new secret', async () => {
  const payload = { transactions: [], signals: {} };
  const key = 'RotateKey789!';
  const response = await request(app)
    .post('/api/portfolio/rotate-me')
    .set('Content-Type', 'application/json')
    .set('X-Portfolio-Key', key)
    .send(payload);

  assert.equal(response.status, 200);
  const initialRecord = await readKeyRecord('rotate-me');
  assert.ok(initialRecord?.salt);

  const rotationResponse = await request(app)
    .post('/api/portfolio/rotate-me')
    .set('Content-Type', 'application/json')
    .set('X-Portfolio-Key', key)
    .set('X-Portfolio-Key-New', 'NewRotateKey987!')
    .send(payload);

  assert.equal(rotationResponse.status, 200);
  const rotatedRecord = await readKeyRecord('rotate-me');
  assert.ok(rotatedRecord?.salt);
  assert.notEqual(rotatedRecord.hash, initialRecord.hash);
  assert.notEqual(rotatedRecord.salt, initialRecord.salt);
});
