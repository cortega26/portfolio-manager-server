import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'path';
import { tmpdir } from 'node:os';

import { createSessionTestApp, request, closeApp } from './helpers/fastifyTestApp.js';

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {}, child() { return this; } };

class LargePriceProvider {
  constructor(rowCount) {
    this.rowCount = rowCount;
    this.calls = 0;
  }

  async getDailyAdjustedClose() {
    this.calls += 1;
    const rows = [];
    for (let index = 0; index < this.rowCount; index += 1) {
      const date = new Date(2024, 0, 1 + index).toISOString().slice(0, 10);
      rows.push({ date, adjClose: 100 + index });
    }
    return rows;
  }
}

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-compression-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function buildApp(overrides = {}) {
  return createSessionTestApp({
    dataDir,
    logger: noopLogger,
    priceProvider: overrides.priceProvider,
  });
}

test('gzip compression is applied to large JSON responses', async () => {
  const provider = new LargePriceProvider(2000);
  const app = await buildApp({ priceProvider: provider });

  const response = await request(app)
    .get('/api/prices/BIG?range=1y')
    .set('Accept-Encoding', 'gzip');

  assert.equal(response.status, 200);
  assert.equal(response.headers['x-cache'], 'MISS');
  assert.ok(['gzip', 'br'].includes(response.headers['content-encoding']));
  assert.ok(Array.isArray(response.body));
  assert.equal(provider.calls, 1);
  await closeApp(app);
});

test('compression can be skipped with x-no-compression header', async () => {
  const provider = new LargePriceProvider(2000);
  const app = await buildApp({ priceProvider: provider });

  const response = await request(app)
    .get('/api/prices/SKIP?range=1y')
    .set('Accept-Encoding', 'gzip')
    .set('X-No-Compression', '1');

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-encoding'], undefined);
  await closeApp(app);
});

test('small responses remain uncompressed', async () => {
  const app = await buildApp();

  // /api/monitoring returns a small JSON object — ideal for testing that
  // compression is not applied to small payloads.
  const response = await request(app).get('/api/monitoring');

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-encoding'], undefined);
  await closeApp(app);
});

