import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { runInterestAccrual, runInterestBackfill, previousTradingDay } from '../jobs/interest.js';
import { runMigrations } from '../migrations/index.js';

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;
let storage;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'interest-job-'));
  storage = await runMigrations({ dataDir, logger: noopLogger });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('runInterestAccrual posts per-portfolio interest and is idempotent', async () => {
  const alphaPath = path.join(dataDir, 'portfolio_alpha.json');
  const bravoPath = path.join(dataDir, 'portfolio_bravo.json');
  writeFileSync(
    alphaPath,
    JSON.stringify(
      {
        id: 'alpha',
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
  writeFileSync(
    bravoPath,
    JSON.stringify(
      {
        id: 'bravo',
        schemaVersion: 1,
        cash: {
          currency: 'CLP',
          apyTimeline: [{ from: '2024-01-01', apy: 0.12 }],
        },
      },
      null,
      2,
    ),
  );

  await storage.upsertRow(
    'transactions',
    {
      id: 'alpha-deposit',
      portfolio_id: 'alpha',
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
      id: 'bravo-deposit',
      portfolio_id: 'bravo',
      type: 'DEPOSIT',
      ticker: 'CASH',
      date: '2024-01-01',
      amount: 500000,
      currency: 'CLP',
    },
    ['id'],
  );

  const firstRun = await runInterestAccrual({
    dataDir,
    storage,
    logger: noopLogger,
    date: new Date('2024-01-02T00:00:00Z'),
    config: { featureFlags: { monthlyCashPosting: false } },
  });
  assert.equal(firstRun.skipped, false);
  assert.equal(firstRun.portfolios.length, 2);

  const transactions = await storage.readTable('transactions');
  const interests = transactions.filter((tx) => tx.type === 'INTEREST');
  assert.equal(interests.length, 2);
  const alphaInterest = interests.find((tx) => tx.portfolio_id === 'alpha');
  const bravoInterest = interests.find((tx) => tx.portfolio_id === 'bravo');
  assert.ok(alphaInterest);
  assert.ok(bravoInterest);

  const secondRun = await runInterestAccrual({
    dataDir,
    storage,
    logger: noopLogger,
    date: new Date('2024-01-02T00:00:00Z'),
    config: { featureFlags: { monthlyCashPosting: false } },
  });
  assert.equal(secondRun.skipped, false);
  assert.equal(secondRun.portfolios.length, 2);

  const transactionsAfterSecond = await storage.readTable('transactions');
  const interestAfterSecond = transactionsAfterSecond.filter((tx) => tx.type === 'INTEREST');
  assert.equal(interestAfterSecond.length, 2, 'interest postings remain idempotent');
});

test('runInterestBackfill covers range of trading days', async () => {
  writeFileSync(
    path.join(dataDir, 'portfolio_delta.json'),
    JSON.stringify(
      {
        id: 'delta',
        schemaVersion: 1,
        cash: {
          currency: 'USD',
          apyTimeline: [{ from: '2024-01-01', apy: 0.04 }],
        },
      },
      null,
      2,
    ),
  );

  await storage.upsertRow(
    'transactions',
    {
      id: 'delta-deposit',
      portfolio_id: 'delta',
      type: 'DEPOSIT',
      ticker: 'CASH',
      date: '2024-01-02',
      amount: 10000,
      currency: 'USD',
    },
    ['id'],
  );

  const result = await runInterestBackfill({
    dataDir,
    logger: noopLogger,
    from: '2024-01-02',
    to: '2024-01-05',
    config: { featureFlags: { monthlyCashPosting: false } },
  });
  assert.equal(result.runs.length > 0, true);
  const dates = result.runs.map((run) => run.date);
  assert.ok(dates.includes('2024-01-02'));
  assert.ok(dates.includes('2024-01-03'));
});

test('previousTradingDay skips weekends', () => {
  const monday = new Date('2024-01-08T12:00:00Z');
  const friday = previousTradingDay(monday);
  assert.equal(friday.toISOString().slice(0, 10), '2024-01-05');
});
