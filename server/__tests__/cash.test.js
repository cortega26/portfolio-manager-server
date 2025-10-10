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
  const timeline = [
    { from: '2024-01-01', to: null, apy: 0.02 },
    { from: '2024-06-01', to: null, apy: 0.04 },
  ];
  const result = resolveApyForDate(timeline, '2024-06-15');
  assert.equal(result, 0.04);
});

test('accrueInterest inserts transaction when balance positive', async () => {
  await storage.upsertRow(
    'transactions',
    { id: 't1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  const policy = {
    currency: 'USD',
    apyTimeline: [{ from: '2023-12-01', to: null, apy: 0.0365 }],
  };
  const record = await accrueInterest({
    storage,
    date: '2024-01-02',
    policy,
    logger: noopLogger,
  });
  assert.ok(record);
  const transactions = await storage.readTable('transactions');
  const interest = transactions.find((tx) => tx.type === 'INTEREST');
  assert.ok(interest);
  assert.equal(interest.date, '2024-01-02');
  assert.equal(interest.currency, 'USD');
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
  const policy = {
    currency: 'USD',
    apyTimeline: [{ from: '2023-12-01', to: null, apy: 0.0365 }],
  };
  await accrueInterest({ storage, date: '2024-01-02', policy, logger: noopLogger });
  await accrueInterest({ storage, date: '2024-01-02', policy, logger: noopLogger });
  const transactions = await storage.readTable('transactions');
  const interestRecords = transactions.filter((tx) => tx.type === 'INTEREST');
  assert.equal(interestRecords.length, 1);
  const delta = roundDecimal(
    dailyRateFromApy(0.0365).times(1000),
    6,
  );
  assert.equal(interestRecords[0].amount, fromCents(toCents(delta)).toNumber());
  assert.equal(interestRecords[0].currency, 'USD');
});

test('monthly interest accrual buffers and posts once per month', async () => {
  await storage.upsertRow(
    'transactions',
    { id: 't1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  const policy = {
    currency: 'USD',
    apyTimeline: [{ from: '2023-12-01', to: null, apy: 0.0365 }],
  };
  await accrueInterest({
    storage,
    date: '2024-01-02',
    policy,
    logger: noopLogger,
    featureFlags: { monthlyCashPosting: true },
  });
  await accrueInterest({
    storage,
    date: '2024-01-31',
    policy,
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
    currency: 'USD',
  });
  assert.ok(posting);
  assert.equal(posting.note, 'Automated monthly cash interest posting');
  assert.equal(posting.currency, 'USD');

  transactions = await storage.readTable('transactions');
  const interest = transactions.filter((tx) => tx.type === 'INTEREST');
  assert.equal(interest.length, 1);
  assert.equal(interest[0].internal, false);
  assert.equal(interest[0].date, '2024-01-31');
  assert.ok(interest[0].amount > 0);
  assert.equal(interest[0].currency, 'USD');

  const second = await postMonthlyInterest({
    storage,
    date: '2024-01-31',
    postingDay: 'last',
    logger: noopLogger,
    currency: 'USD',
  });
  assert.equal(second, null);
});

test('monthly accruals are isolated per currency', async () => {
  await storage.upsertRow(
    'transactions',
    {
      id: 'usd-deposit',
      type: 'DEPOSIT',
      ticker: 'CASH',
      date: '2024-01-01',
      amount: 1000,
      currency: 'USD',
    },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    {
      id: 'eur-deposit',
      type: 'DEPOSIT',
      ticker: 'CASH',
      date: '2024-01-01',
      amount: 2000,
      currency: 'EUR',
    },
    ['id'],
  );

  const usdPolicy = {
    currency: 'USD',
    apyTimeline: [{ from: '2023-12-01', to: null, apy: 0.0365 }],
  };
  const eurPolicy = {
    currency: 'EUR',
    apyTimeline: [{ from: '2023-12-01', to: null, apy: 0.05 }],
  };

  await accrueInterest({
    storage,
    date: '2024-01-10',
    policy: usdPolicy,
    logger: noopLogger,
    featureFlags: { monthlyCashPosting: true },
  });
  await accrueInterest({
    storage,
    date: '2024-01-15',
    policy: eurPolicy,
    logger: noopLogger,
    featureFlags: { monthlyCashPosting: true },
  });
  await accrueInterest({
    storage,
    date: '2024-01-20',
    policy: usdPolicy,
    logger: noopLogger,
    featureFlags: { monthlyCashPosting: true },
  });

  let accruals = await storage.readTable('cash_interest_accruals');
  const usdAccrual = accruals.find((row) => row.currency === 'USD');
  const eurAccrual = accruals.find((row) => row.currency === 'EUR');
  assert.ok(usdAccrual);
  assert.ok(eurAccrual);
  assert.ok(usdAccrual.accrued_cents > 0);
  assert.ok(eurAccrual.accrued_cents > 0);
  assert.notEqual(usdAccrual.accrued_cents, eurAccrual.accrued_cents);

  const usdPosting = await postMonthlyInterest({
    storage,
    date: '2024-01-31',
    postingDay: 'last',
    logger: noopLogger,
    currency: 'USD',
  });
  assert.ok(usdPosting);
  assert.equal(usdPosting.currency, 'USD');

  accruals = await storage.readTable('cash_interest_accruals');
  const usdCleared = accruals.find((row) => row.currency === 'USD');
  const eurRemaining = accruals.find((row) => row.currency === 'EUR');
  assert.ok(usdCleared);
  assert.equal(usdCleared.accrued_cents, 0);
  assert.ok(eurRemaining);
  assert.ok(eurRemaining.accrued_cents > 0);

  const eurPosting = await postMonthlyInterest({
    storage,
    date: '2024-01-31',
    postingDay: 'last',
    logger: noopLogger,
    currency: 'EUR',
  });
  assert.ok(eurPosting);
  assert.equal(eurPosting.currency, 'EUR');

  accruals = await storage.readTable('cash_interest_accruals');
  const eurCleared = accruals.find((row) => row.currency === 'EUR');
  assert.ok(eurCleared);
  assert.equal(eurCleared.accrued_cents, 0);
});
