import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import pino from 'pino';

import JsonTableStorage from '../data/storage.js';
import { createSessionTestApp, withSession, closeApp, request } from './helpers/fastifyTestApp.js';

const silentLogger = pino({ level: 'silent' });

let dataDir;
let storage;
let app;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-keys-tests-'));
  storage = new JsonTableStorage({ dataDir, logger: silentLogger });
  app = await createSessionTestApp({ dataDir, logger: silentLogger });
});

afterEach(async () => {
  await closeApp(app);
  rmSync(dataDir, { recursive: true, force: true });
});

test('session auth portfolio writes do not persist portfolio key records', async () => {
  await withSession(
    request(app)
      .post('/api/portfolio/session-only')
      .send({ transactions: [] }),
  ).expect(200);

  const keyRows = await storage.readTable('portfolio_keys');
  assert.deepEqual(keyRows, []);
});
