import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import fc from 'fast-check';

import JsonTableStorage from '../data/storage.js';
import { accrueInterest, dailyRateFromApy } from '../finance/cash.js';
import { fromCents, toCents } from '../finance/decimal.js';

const noopLogger = { info() {}, warn() {}, error() {} };

function roundCents(value) {
  return Number.parseFloat(value.toFixed(2));
}

async function withStorage(run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cash-prop-'));
  const storage = new JsonTableStorage({ dataDir: dir, logger: noopLogger });
  await storage.ensureTable('transactions', []);
  try {
    await run(storage);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('accrueInterest posts deterministic interest for random balances', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        deposit: fc.double({ min: 100, max: 50000, noNaN: true }),
        apy: fc.double({ min: 0.0005, max: 0.12, noNaN: true }),
      }),
      async ({ deposit, apy }) => {
        await withStorage(async (storage) => {
          const amount = roundCents(deposit);
          const dailyRate = dailyRateFromApy(apy);
          const expectedCents = toCents(dailyRate.times(amount));
          fc.pre(expectedCents > 0);
          await storage.upsertRow(
            'transactions',
            {
              id: 'seed',
              type: 'DEPOSIT',
              ticker: 'CASH',
              date: '2024-01-01',
              amount,
            },
            ['id'],
          );
          const record = await accrueInterest({
            storage,
            date: '2024-01-02',
            rates: [
              {
                effective_date: '2023-12-01',
                apy,
              },
            ],
            logger: noopLogger,
          });
          assert.ok(record, 'expected interest record to be created');
          const normalized = fromCents(expectedCents).toNumber();
          assert.equal(record.amount, normalized);
        });
      },
    ),
  );
});

test('accrueInterest remains idempotent under repeated execution', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        deposit: fc.double({ min: 250, max: 75000, noNaN: true }),
        apy: fc.double({ min: 0.0005, max: 0.1, noNaN: true }),
      }),
      async ({ deposit, apy }) => {
        await withStorage(async (storage) => {
          const amount = roundCents(deposit);
          await storage.upsertRow(
            'transactions',
            {
              id: 'seed',
              type: 'DEPOSIT',
              ticker: 'CASH',
              date: '2024-01-01',
              amount,
            },
            ['id'],
          );
          const rates = [{ effective_date: '2023-12-01', apy }];
          const first = await accrueInterest({ storage, date: '2024-01-02', rates, logger: noopLogger });
          const second = await accrueInterest({ storage, date: '2024-01-02', rates, logger: noopLogger });
          const table = await storage.readTable('transactions');
          const interestRows = table.filter((tx) => tx.type === 'INTEREST');
          if (first) {
            assert.equal(interestRows.length, 1);
            assert.deepEqual(second, first);
          } else {
            assert.equal(interestRows.length, 0);
          }
        });
      },
    ),
  );
});
