import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../migrations/index.js';

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;
let storage;
let app;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'interest-admin-'));
  storage = await runMigrations({ dataDir, logger: noopLogger });
  app = createApp({
    dataDir,
    logger: noopLogger,
    config: {
      featureFlags: { cashBenchmarks: true, monthlyCashPosting: false },
    },
  });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('admin interest run endpoint accrues interest once per day', async () => {
  writeFileSync(
    path.join(dataDir, 'portfolio_admin.json'),
    JSON.stringify(
      {
        id: 'admin',
        schemaVersion: 1,
        cash: {
          currency: 'USD',
          apyTimeline: [{ from: '2024-01-01', apy: 0.05 }],
        },
      },
      null,
      2,
    ),
  );

  await storage.upsertRow(
    'transactions',
    {
      id: 'admin-deposit',
      portfolio_id: 'admin',
      type: 'DEPOSIT',
      ticker: 'CASH',
      date: '2024-01-01',
      amount: 2000,
      currency: 'USD',
    },
    ['id'],
  );

  const first = await request(app)
    .post('/api/admin/interest/run')
    .query({ date: '2024-01-02' })
    .expect(200);
  assert.equal(first.body.status, 'ok');
  assert.ok(first.body.requestId);

  const transactions = await storage.readTable('transactions');
  assert.equal(transactions.filter((tx) => tx.type === 'INTEREST').length, 1);

  const second = await request(app)
    .post('/api/admin/interest/run')
    .query({ date: '2024-01-02' })
    .expect(200);
  assert.equal(second.body.status, 'ok');

  const afterSecond = await storage.readTable('transactions');
  assert.equal(afterSecond.filter((tx) => tx.type === 'INTEREST').length, 1);
});

test('admin interest backfill processes ranges', async () => {
  writeFileSync(
    path.join(dataDir, 'portfolio_range.json'),
    JSON.stringify(
      {
        id: 'range',
        schemaVersion: 1,
        cash: {
          currency: 'USD',
          apyTimeline: [{ from: '2024-01-01', apy: 0.03 }],
        },
      },
      null,
      2,
    ),
  );

  await storage.upsertRow(
    'transactions',
    {
      id: 'range-deposit',
      portfolio_id: 'range',
      type: 'DEPOSIT',
      ticker: 'CASH',
      date: '2024-01-02',
      amount: 5000,
      currency: 'USD',
    },
    ['id'],
  );

  const response = await request(app)
    .post('/api/admin/interest/backfill')
    .query({ from: '2024-01-02', to: '2024-01-04' })
    .expect(200);
  assert.equal(response.body.status, 'ok');
  assert.ok(Array.isArray(response.body.runs ?? response.body.result?.runs));
});
