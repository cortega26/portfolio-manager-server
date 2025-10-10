import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import fc from 'fast-check';

import { runMigrations } from '../migrations/index.js';
import { PORTFOLIO_SCHEMA_VERSION, CASH_POLICY_SCHEMA_VERSION } from '../../shared/constants.js';

const noopLogger = { info() {}, warn() {}, error() {} };

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function isoDateFrom(date) {
  return date.toISOString().slice(0, 10);
}

const isoDateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(isoDateFrom);

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'migration-cash-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function readPortfolio(fileName) {
  const filePath = path.join(dataDir, fileName);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

test('portfolio migration seeds cash policy and backups original file', async () => {
  writeJson(path.join(dataDir, 'cash_rates.json'), [
    { effective_date: '2023-12-01', apy: 0.02 },
    { effective_date: '2024-03-01', apy: 0.025 },
  ]);
  const portfolioName = 'portfolio_sample.json';
  writeJson(path.join(dataDir, portfolioName), {
    transactions: [],
    signals: {},
    settings: {},
  });

  await runMigrations({ dataDir, logger: noopLogger });

  const migrated = readPortfolio(portfolioName);
  assert.equal(migrated.schemaVersion, PORTFOLIO_SCHEMA_VERSION);
  assert.deepEqual(migrated.cash, {
    currency: 'USD',
    apyTimeline: [
      { from: '2023-12-01', to: null, apy: 0.02 },
      { from: '2024-03-01', to: null, apy: 0.025 },
    ],
    version: CASH_POLICY_SCHEMA_VERSION,
  });
  const backupPath = path.join(dataDir, `${portfolioName}.bak`);
  assert.ok(readFileSync(backupPath, 'utf8').length > 0, 'backup should exist');
  const state = JSON.parse(readFileSync(path.join(dataDir, '_migrations_state.json'), 'utf8'));
  assert.ok(state.applied.includes('004_portfolio_cash_policy'));
});

test('portfolio cash policy migration is idempotent', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        rates: fc.array(
          fc.record({
            effective_date: isoDateArb,
            apy: fc.double({ min: 0, max: 0.15, noNaN: true }),
          }),
          { minLength: 0, maxLength: 4 },
        ),
        schemaVersion: fc.oneof(fc.constant(undefined), fc.integer({ min: 0, max: 3 })),
        cashVersion: fc.oneof(fc.constant(undefined), fc.integer({ min: 0, max: 2 })),
        currency: fc.option(fc.constantFrom('usd', 'EUR', 'JPY', 'cad', 'bad'), { nil: undefined }),
        timeline: fc.option(
          fc.array(
            fc.record({
              from: isoDateArb,
              to: fc.option(isoDateArb, { nil: undefined }),
              apy: fc.double({ min: 0, max: 0.2, noNaN: true }),
            }),
            { minLength: 0, maxLength: 4 },
          ),
          { nil: undefined },
        ),
      }),
      async ({ rates, schemaVersion, cashVersion, currency, timeline }) => {
        const dir = mkdtempSync(path.join(tmpdir(), 'migration-cash-prop-'));
        try {
          writeJson(path.join(dir, 'cash_rates.json'), rates);
          const portfolio = {
            transactions: [],
            signals: {},
            settings: {},
          };
          if (schemaVersion !== undefined) {
            portfolio.schemaVersion = schemaVersion;
          }
          if (timeline !== undefined || currency !== undefined || cashVersion !== undefined) {
            portfolio.cash = {};
            if (currency !== undefined) {
              portfolio.cash.currency = currency;
            }
            if (timeline !== undefined) {
              portfolio.cash.apyTimeline = timeline;
            }
            if (cashVersion !== undefined) {
              portfolio.cash.version = cashVersion;
            }
          }
          const portfolioName = 'portfolio_prop.json';
          writeJson(path.join(dir, portfolioName), portfolio);

          await runMigrations({ dataDir: dir, logger: noopLogger });
          const firstPass = readFileSync(path.join(dir, portfolioName), 'utf8');
          await runMigrations({ dataDir: dir, logger: noopLogger });
          const secondPass = readFileSync(path.join(dir, portfolioName), 'utf8');
          assert.equal(secondPass, firstPass);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      },
    ),
    { numRuns: 25 },
  );
});
