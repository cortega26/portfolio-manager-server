import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { runMigrations } from '../migrations/index.js';
import JsonTableStorage from '../data/storage.js';

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'migration-cash-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('migration 004 initializes cash_rates table with empty data on fresh install', async () => {
  await runMigrations({ dataDir, logger: noopLogger });

  const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  const rates = await storage.readTable('cash_rates');
  assert.deepEqual(rates, [], 'cash_rates table should be empty on fresh install');

  const state = JSON.parse(readFileSync(path.join(dataDir, '_migrations_state.json'), 'utf8'));
  assert.ok(state.applied.includes('004_portfolio_cash_policy'));
});

test('migration 005 backfills legacy NVDA pre-split csv sells in persisted portfolios', async () => {
  await runMigrations({ dataDir, logger: noopLogger });

  const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.writeTable('transactions', [
    {
      id: 'csv:32996_asset_market_buys.csv:3',
      uid: 'csv:32996_asset_market_buys.csv:3',
      portfolio_id: 'desktop',
      date: '2024-01-23',
      ticker: 'NVDA',
      type: 'BUY',
      amount: -1.06,
      price: 59.44883082,
      quantity: 0.01783046,
      shares: 0.01783046,
      metadata: {
        system: {
          import: {
            source: 'csv-bootstrap',
            original: {
              quantity: '0.001783046',
            },
            adjustment: {
              rule: 'NVDA_10_FOR_1_PRE_2024_06_10_BUY_ONLY',
              factor: '10',
            },
          },
        },
      },
    },
    {
      id: 'csv:32996_asset_market_sells.csv:3',
      uid: 'csv:32996_asset_market_sells.csv:3',
      portfolio_id: 'desktop',
      date: '2024-01-24',
      ticker: 'NVDA',
      type: 'SELL',
      amount: 1.11,
      price: 622.53020954,
      quantity: -0.001783046,
      shares: 0.001783046,
      metadata: {
        system: {
          import: {
            source: 'csv-bootstrap',
            original: {
              quantity: '0.001783046',
            },
            adjustment: null,
          },
        },
      },
    },
  ]);

  const statePath = path.join(dataDir, '_migrations_state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.applied = state.applied.filter((id) => id !== '005_nvda_presplit_split_backfill');
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

  await runMigrations({ dataDir, logger: noopLogger });

  const transactions = await storage.readTable('transactions');
  const [buy, sell] = transactions;

  assert.equal(buy.shares, 0.01783046);
  assert.equal(
    buy.metadata?.system?.import?.adjustment?.rule,
    'NVDA_10_FOR_1_PRE_2024_06_10_ALL_TRADES',
  );
  assert.equal(sell.shares, 0.01783046);
  assert.equal(sell.quantity, -0.01783046);
  assert.equal(sell.price, 62.25302095);
  assert.equal(
    sell.metadata?.system?.import?.adjustment?.rule,
    'NVDA_10_FOR_1_PRE_2024_06_10_ALL_TRADES',
  );
});

test('migrations are idempotent: running twice yields same state', async () => {
  await runMigrations({ dataDir, logger: noopLogger });

  const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  const txFirstRun = await storage.readTable('transactions');

  // Run again — should not error and should not duplicate data
  await runMigrations({ dataDir, logger: noopLogger });
  const txSecondRun = await storage.readTable('transactions');

  assert.deepEqual(txSecondRun, txFirstRun, 'second run should produce identical state');
});

test('all expected tables are created after migrations', async () => {
  await runMigrations({ dataDir, logger: noopLogger });

  const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  const expectedTables = [
    'transactions',
    'cash_rates',
    'prices',
    'nav_snapshots',
    'returns_daily',
    'jobs_state',
    'portfolio_keys',
    'cash_interest_accruals',
  ];
  for (const table of expectedTables) {
    const rows = await storage.readTable(table);
    assert.ok(Array.isArray(rows), `table "${table}" should exist and return an array`);
  }
});
