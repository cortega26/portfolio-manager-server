import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import JsonTableStorage from '../data/storage.js';
import {
  accrueInterest,
  dailyRateFromApy,
  resolveApyForDate,
} from '../finance/cash.js';

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;
let storage;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'cash-test-'));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable('transactions', []);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('dailyRateFromApy matches expected precision', () => {
  const rate = dailyRateFromApy(0.05);
  assert.ok(rate > 0.0001 && rate < 0.0002);
});

test('resolveApyForDate returns latest effective rate', () => {
  const rates = [
    { effective_date: '2024-01-01', apy: 0.02 },
    { effective_date: '2024-06-01', apy: 0.04 },
  ];
  const result = resolveApyForDate(rates, '2024-06-15');
  assert.equal(result, 0.04);
});

test('accrueInterest inserts transaction when balance positive', async () => {
  await storage.upsertRow(
    'transactions',
    { id: 't1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  const record = await accrueInterest({
    storage,
    date: '2024-01-02',
    rates: [{ effective_date: '2023-12-01', apy: 0.0365 }],
    logger: noopLogger,
  });
  assert.ok(record);
  const transactions = await storage.readTable('transactions');
  const interest = transactions.find((tx) => tx.type === 'INTEREST');
  assert.ok(interest);
  assert.equal(interest.date, '2024-01-02');
});

test('accrueInterest is idempotent across reruns', async () => {
  await storage.upsertRow(
    'transactions',
    { id: 't1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  const rates = [{ effective_date: '2023-12-01', apy: 0.0365 }];
  await accrueInterest({ storage, date: '2024-01-02', rates, logger: noopLogger });
  await accrueInterest({ storage, date: '2024-01-02', rates, logger: noopLogger });
  const transactions = await storage.readTable('transactions');
  const interestRecords = transactions.filter((tx) => tx.type === 'INTEREST');
  assert.equal(interestRecords.length, 1);
});
