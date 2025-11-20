// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { computeDailyStates } from '../finance/portfolio.js';
import {
  computeDailyReturnRows,
  summarizeReturns,
} from '../finance/returns.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(currentDir, 'fixtures/returns');

function readJsonFixture(name) {
  const filePath = path.join(fixtureDir, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('daily returns stay aligned with stored snapshots', () => {
  const transactions = readJsonFixture('transactions.json');
  const rates = readJsonFixture('cash_rates.json');
  const spyPriceObject = readJsonFixture('spy_prices.json');
  const expectedRows = readJsonFixture('daily_returns.json');
  const expectedSummary = readJsonFixture('summary.json');

  const dates = Object.keys(spyPriceObject).sort((a, b) => a.localeCompare(b));
  const pricesByDate = new Map(
    dates.map((date) => [date, new Map([['SPY', spyPriceObject[date]]])]),
  );

  const states = computeDailyStates({ transactions, pricesByDate, dates });
  const spyPrices = new Map(dates.map((date) => [date, spyPriceObject[date]]));

  const rows = computeDailyReturnRows({
    states,
    rates,
    spyPrices,
    transactions,
  });

  const normalizedRows = rows
    .map((row) => ({ ...row }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const normalizedExpected = expectedRows
    .map((row) => ({ ...row }))
    .sort((a, b) => a.date.localeCompare(b.date));

  assert.deepEqual(normalizedRows, normalizedExpected);

  const summary = summarizeReturns(rows);
  assert.deepEqual(summary, expectedSummary);
});
