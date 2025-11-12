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
  postInterestForDate,
  toDateKey,
} from '../finance/cash.js';
import { d, fromCents, roundDecimal, toCents } from '../finance/decimal.js';

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

test('toDateKey normalizes timestamps into UTC date strings', () => {
  const isoWithTime = '2024-05-01T15:45:30Z';
  const epochMs = Date.UTC(2024, 4, 1, 23, 30, 0);
  const alreadyKeyed = '2024-05-01';

  assert.equal(toDateKey(isoWithTime), '2024-05-01');
  assert.equal(toDateKey(epochMs), '2024-05-01');
  assert.equal(toDateKey(alreadyKeyed), '2024-05-01');
});

test('postInterestForDate produces deterministic interest across scenarios', () => {
  const scenarios = [
    {
      name: 'usd deposit previous day',
      portfolioId: 'pf-1',
      date: '2024-01-02',
      policy: { currency: 'USD', apyTimeline: [{ from: '2023-12-01', apy: 0.0365 }] },
      transactions: [
        {
          id: 't1',
          portfolio_id: 'pf-1',
          type: 'DEPOSIT',
          ticker: 'CASH',
          date: '2024-01-01',
          amount: 1000,
          currency: 'USD',
        },
      ],
      expectedAmount: roundDecimal(d(1000).times(0.0365).div(365), 2).toNumber(),
    },
    {
      name: 'usd deposits and withdrawals same day',
      portfolioId: 'pf-2',
      date: '2024-01-05',
      policy: { currency: 'usd', apyTimeline: [{ from: '2024-01-01', apy: 0.05 }] },
      transactions: [
        {
          id: 'd1',
          portfolio_id: 'pf-2',
          type: 'DEPOSIT',
          ticker: 'CASH',
          date: '2024-01-05',
          amount: 2000,
          currency: 'usd',
        },
        {
          id: 'w1',
          portfolio_id: 'pf-2',
          type: 'WITHDRAWAL',
          ticker: 'CASH',
          date: '2024-01-05',
          amount: 750,
          currency: 'USD',
        },
      ],
      expectedAmount: roundDecimal(d(1250).times(0.05).div(365), 2).toNumber(),
    },
    {
      name: 'clp large balance uses zero decimal precision',
      portfolioId: 'pf-3',
      date: '2024-02-10',
      policy: { currency: 'CLP', apyTimeline: [{ from: '2024-01-01', apy: 0.07 }] },
      transactions: [
        {
          id: 'clp-dep',
          portfolio_id: 'pf-3',
          type: 'DEPOSIT',
          ticker: 'CASH',
          date: '2024-01-15',
          amount: 25_000_000,
          currency: 'CLP',
        },
      ],
      expectedAmount: roundDecimal(d(25_000_000).times(0.07).div(365), 0).toNumber(),
    },
    {
      name: 'apy change mid month applies new rate',
      portfolioId: 'pf-4',
      date: '2024-03-16',
      policy: {
        currency: 'USD',
        apyTimeline: [
          { from: '2024-02-01', to: '2024-03-15', apy: 0.01 },
          { from: '2024-03-16', apy: 0.08 },
        ],
      },
      transactions: [
        {
          id: 'balance',
          portfolio_id: 'pf-4',
          type: 'DEPOSIT',
          ticker: 'CASH',
          date: '2024-02-01',
          amount: 5000,
          currency: 'USD',
        },
      ],
      expectedAmount: roundDecimal(d(5000).times(0.08).div(365), 2).toNumber(),
    },
    {
      name: 'negative cash accrues negative interest',
      portfolioId: 'pf-5',
      date: '2024-04-02',
      policy: { currency: 'USD', apyTimeline: [{ from: '2024-01-01', apy: 0.04 }] },
      transactions: [
        {
          id: 'deposit',
          portfolio_id: 'pf-5',
          type: 'DEPOSIT',
          ticker: 'CASH',
          date: '2024-03-31',
          amount: 1000,
          currency: 'USD',
        },
        {
          id: 'withdraw',
          portfolio_id: 'pf-5',
          type: 'WITHDRAWAL',
          ticker: 'CASH',
          date: '2024-04-02',
          amount: 2500,
          currency: 'USD',
        },
      ],
      expectedAmount: roundDecimal(d(-1500).times(0.04).div(365), 2).toNumber(),
    },
    {
      name: 'zero apy yields no posting',
      portfolioId: 'pf-6',
      date: '2024-05-10',
      policy: { currency: 'USD', apyTimeline: [{ from: '2024-01-01', apy: 0 }] },
      transactions: [
        {
          id: 'deposit',
          portfolio_id: 'pf-6',
          type: 'DEPOSIT',
          ticker: 'CASH',
          date: '2024-05-09',
          amount: 7500,
          currency: 'USD',
        },
      ],
      expectedAmount: null,
    },
  ];

  for (const scenario of scenarios) {
    const { name, expectedAmount, ...ctx } = scenario;
    const result = postInterestForDate(ctx.portfolioId, ctx.date, {
      transactions: ctx.transactions,
      policy: ctx.policy,
    });
    if (expectedAmount === null) {
      assert.equal(result, null, `${name} should not produce interest`);
    } else {
      assert.ok(result, `${name} should produce an interest posting`);
      assert.equal(result.amount, expectedAmount, `${name} amount mismatch`);
      assert.equal(result.currency.toUpperCase(), ctx.policy.currency.toUpperCase());
      assert.equal(result.date, ctx.date);
    }
  }
});

test('postInterestForDate skips dates where interest already exists', () => {
  const transactions = [
    {
      id: 'existing',
      portfolio_id: 'pf-dupe',
      type: 'INTEREST',
      ticker: 'CASH',
      date: '2024-06-01',
      amount: 1.23,
      currency: 'USD',
    },
  ];
  const policy = { currency: 'USD', apyTimeline: [{ from: '2024-01-01', apy: 0.05 }] };
  const result = postInterestForDate('pf-dupe', '2024-06-01', { transactions, policy });
  assert.equal(result, null);
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
    portfolioId: 'pf-monthly',
  });
  await accrueInterest({
    storage,
    date: '2024-01-31',
    policy,
    logger: noopLogger,
    featureFlags: { monthlyCashPosting: true },
    portfolioId: 'pf-monthly',
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
    portfolioId: 'pf-monthly',
  });
  assert.ok(posting);
  assert.equal(posting.note, 'Automated monthly cash interest posting');
  assert.equal(posting.currency, 'USD');
  assert.equal(posting.portfolio_id, 'pf-monthly');

  transactions = await storage.readTable('transactions');
  const interest = transactions.filter((tx) => tx.type === 'INTEREST');
  assert.equal(interest.length, 1);
  assert.equal(interest[0].internal, false);
  assert.equal(interest[0].date, '2024-01-31');
  assert.ok(interest[0].amount > 0);
  assert.equal(interest[0].currency, 'USD');
  assert.equal(interest[0].portfolio_id, 'pf-monthly');

  const second = await postMonthlyInterest({
    storage,
    date: '2024-01-31',
    postingDay: 'last',
    logger: noopLogger,
    currency: 'USD',
    portfolioId: 'pf-monthly',
  });
  assert.equal(second, null);
});

test('monthly interest accrual respects portfolio boundaries and policies', async () => {
  await storage.upsertRow(
    'transactions',
    {
      id: 'pf1-deposit',
      portfolio_id: 'pf-1',
      type: 'DEPOSIT',
      ticker: 'CASH',
      date: '2024-01-01',
      amount: 5000,
      currency: 'USD',
    },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    {
      id: 'pf2-deposit',
      portfolio_id: 'pf-2',
      type: 'DEPOSIT',
      ticker: 'CASH',
      date: '2024-01-01',
      amount: 7500,
      currency: 'USD',
    },
    ['id'],
  );

  const earningPolicy = {
    currency: 'USD',
    apyTimeline: [{ from: '2023-12-01', to: null, apy: 0.048 }],
  };
  const zeroPolicy = { currency: 'USD', apyTimeline: [] };

  await accrueInterest({
    storage,
    date: '2024-01-02',
    policy: earningPolicy,
    logger: noopLogger,
    featureFlags: { monthlyCashPosting: true },
    portfolioId: 'pf-1',
  });
  await accrueInterest({
    storage,
    date: '2024-01-02',
    policy: zeroPolicy,
    logger: noopLogger,
    featureFlags: { monthlyCashPosting: true },
    portfolioId: 'pf-2',
  });

  const postingPf1 = await postMonthlyInterest({
    storage,
    date: '2024-01-31',
    postingDay: 'last',
    logger: noopLogger,
    currency: 'USD',
    portfolioId: 'pf-1',
  });
  const postingPf2 = await postMonthlyInterest({
    storage,
    date: '2024-01-31',
    postingDay: 'last',
    logger: noopLogger,
    currency: 'USD',
    portfolioId: 'pf-2',
  });

  assert.ok(postingPf1);
  assert.equal(postingPf1.portfolio_id, 'pf-1');
  assert.ok(postingPf1.amount > 0);

  assert.equal(postingPf2, null);

  const transactions = await storage.readTable('transactions');
  const pf1Interest = transactions.filter(
    (tx) =>
      tx.type === 'INTEREST'
      && tx.portfolio_id === 'pf-1'
      && tx.note === 'Automated monthly cash interest posting',
  );
  const pf2Interest = transactions.filter(
    (tx) => tx.type === 'INTEREST' && tx.portfolio_id === 'pf-2',
  );

  assert.equal(pf1Interest.length, 1);
  assert.equal(pf2Interest.length, 0);
});

test('accrueInterest respects custom day count conventions', async () => {
  await storage.upsertRow(
    'transactions',
    {
      id: 'deposit-365',
      type: 'DEPOSIT',
      ticker: 'CASH',
      date: '2024-01-01',
      amount: 1000,
      currency: 'USD',
    },
    ['id'],
  );

  const basePolicy = {
    currency: 'USD',
    apyTimeline: [{ from: '2024-01-01', apy: 0.1 }],
  };

  const defaultDayCountRecord = await accrueInterest({
    storage,
    date: '2024-01-02',
    policy: basePolicy,
    logger: noopLogger,
  });
  assert.ok(defaultDayCountRecord);
  assert.equal(defaultDayCountRecord.amount, 0.27);

  await storage.deleteWhere(
    'transactions',
    (tx) => tx.id === defaultDayCountRecord?.id,
  );

  const customPolicy = {
    ...basePolicy,
    dayCount: 360,
  };

  const customDayCountRecord = await accrueInterest({
    storage,
    date: '2024-01-02',
    policy: customPolicy,
    logger: noopLogger,
  });
  assert.ok(customDayCountRecord);
  assert.equal(customDayCountRecord.amount, 0.28);
});
