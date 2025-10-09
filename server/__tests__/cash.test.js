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
  postMonthlyInterest,
} from '../finance/cash.js';
import { fromCents, roundDecimal, toCents } from '../finance/decimal.js';

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;
let storage;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'cash-test-'));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable('transactions', []);
  await storage.ensureTable('cash_interest_accruals', []);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('dailyRateFromApy matches expected precision', () => {
  const rate = dailyRateFromApy(0.05);
  assert.ok(rate.gt(0.0001) && rate.lt(0.0002));
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
  const expected = dailyRateFromApy(0.0365).times(1000);
  assert.equal(
    interest.amount,
    fromCents(toCents(expected)).toNumber(),
  );
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
  const delta = roundDecimal(
    dailyRateFromApy(0.0365).times(1000),
    6,
  );
  assert.equal(interestRecords[0].amount, fromCents(toCents(delta)).toNumber());
});

test('monthly interest accrual buffers and posts once per month', async () => {
  await storage.upsertRow(
    'transactions',
    { id: 't1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  const rates = [{ effective_date: '2023-12-01', apy: 0.0365 }];
  await accrueInterest({
    storage,
    date: '2024-01-02',
    rates,
    logger: noopLogger,
    featureFlags: { monthlyCashPosting: true },
  });
  await accrueInterest({
    storage,
    date: '2024-01-31',
    rates,
    logger: noopLogger,
    featureFlags: { monthlyCashPosting: true },
  });
  let transactions = await storage.readTable('transactions');
  assert.equal(
    transactions.filter((tx) => tx.type === 'INTEREST').length,
    0,
  );

  const posting = await postMonthlyInterest({
    storage,
    date: '2024-01-31',
    postingDay: 'last',
    logger: noopLogger,
  });
  assert.ok(posting);
  assert.equal(posting.note, 'Automated monthly cash interest posting');

  transactions = await storage.readTable('transactions');
  const interest = transactions.filter((tx) => tx.type === 'INTEREST');
  assert.equal(interest.length, 1);
  assert.equal(interest[0].internal, false);
  assert.equal(interest[0].date, '2024-01-31');
  assert.ok(interest[0].amount > 0);

  const second = await postMonthlyInterest({
    storage,
    date: '2024-01-31',
    postingDay: 'last',
    logger: noopLogger,
  });
  assert.equal(second, null);
});
