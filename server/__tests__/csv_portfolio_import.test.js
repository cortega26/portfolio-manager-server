import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import JsonTableStorage from '../data/storage.js';
import { readPortfolioState } from '../data/portfolioState.js';
import {
  CSV_IMPORT_EXPECTED_RECONCILIATION,
  buildCsvPortfolioImport,
  importCsvPortfolio,
} from '../import/csvPortfolioImport.js';

const noopLogger = {
  info() {},
  warn() {},
  error() {},
};

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

test('buildCsvPortfolioImport reconciles exact holdings and cash with explicit dataset adjustments', async () => {
  const result = await buildCsvPortfolioImport({ sourceDir: projectRoot });

  assert.deepEqual(result.reconciliation.holdings, CSV_IMPORT_EXPECTED_RECONCILIATION.holdings);
  assert.equal(
    result.reconciliation.cashByCurrency.USD,
    CSV_IMPORT_EXPECTED_RECONCILIATION.cash,
  );
  assert.equal(result.snapshot.transactions.length > 0, true);

  const adjustedNvdaBuys = result.snapshot.transactions.filter(
    (tx) =>
      tx.type === 'BUY'
      && tx.ticker === 'NVDA'
      && tx.date < '2024-06-10',
  );
  assert.ok(adjustedNvdaBuys.length > 0);
  assert.ok(
    adjustedNvdaBuys.every(
      (tx) => tx.metadata?.system?.import?.adjustment?.rule === 'NVDA_10_FOR_1_PRE_2024_06_10_ALL_TRADES',
    ),
  );

  const preSplitNvdaSells = result.snapshot.transactions.filter(
    (tx) =>
      tx.type === 'SELL'
      && tx.ticker === 'NVDA'
      && tx.date < '2024-06-10',
  );
  assert.ok(preSplitNvdaSells.length > 0);
  assert.ok(
    preSplitNvdaSells.every(
      (tx) => tx.metadata?.system?.import?.adjustment?.rule === 'NVDA_10_FOR_1_PRE_2024_06_10_ALL_TRADES',
    ),
  );
  const samplePreSplitNvdaSell = preSplitNvdaSells[0];
  assert.equal(
    samplePreSplitNvdaSell.shares,
    Number(samplePreSplitNvdaSell.metadata.system.import.original.quantity) * 10,
  );

  const lrcxAdjustedBuy = result.snapshot.transactions.find(
    (tx) => tx.type === 'BUY' && tx.ticker === 'LRCX' && tx.date === '2024-07-15',
  );
  assert.ok(lrcxAdjustedBuy);
  assert.equal(
    lrcxAdjustedBuy.metadata?.system?.import?.adjustment?.rule,
    'LRCX_10_FOR_1_DATASET_RECONCILIATION_PRE_2024_10_03_BUY_ONLY',
  );
  assert.equal(lrcxAdjustedBuy.quantity, 0.28038955);

  const dividendGross = result.snapshot.transactions.find(
    (tx) => tx.id === 'csv:tailormade-broker-dividends-2026-03-18.csv:2:gross',
  );
  const dividendTax = result.snapshot.transactions.find(
    (tx) => tx.id === 'csv:tailormade-broker-dividends-2026-03-18.csv:2:tax',
  );
  assert.ok(dividendGross);
  assert.ok(dividendTax);
  assert.equal(dividendGross.type, 'DIVIDEND');
  assert.equal(dividendGross.amount, 0.94);
  assert.equal(dividendTax.type, 'FEE');
  assert.equal(dividendTax.amount, 0.14);

  const giftCardDeposit = result.snapshot.transactions.find(
    (tx) => tx.id === 'synthetic:gift-card-usd-1',
  );
  assert.ok(giftCardDeposit);
  assert.equal(giftCardDeposit.type, 'DEPOSIT');
  assert.equal(giftCardDeposit.amount, 1);
  assert.equal(giftCardDeposit.date, '2023-11-27');
  assert.equal(
    giftCardDeposit.metadata?.system?.import?.adjustment?.rule,
    'FINTUAL_GIFT_CARD_INITIAL_DEPOSIT',
  );

  const hycaInterest = result.snapshot.transactions.filter(
    (tx) => tx.metadata?.system?.import?.adjustment?.rule === 'FINTUAL_HYCA_MONTHLY_INTEREST_CONFIRMED_BY_SUPPORT',
  );
  assert.equal(hycaInterest.length, 10);
  assert.equal(
    Number(hycaInterest.reduce((total, tx) => total + tx.amount, 0).toFixed(2)),
    4.96,
  );
  assert.ok(hycaInterest.every((tx) => tx.type === 'INTEREST'));
});

test('buildCsvPortfolioImport normalizes comma-decimal numeric fields from broker CSVs', async () => {
  const result = await buildCsvPortfolioImport({ sourceDir: projectRoot });
  const firstBuy = result.snapshot.transactions.find(
    (tx) => tx.id === 'csv:32996_asset_market_buys.csv:2',
  );

  assert.ok(firstBuy);
  assert.equal(firstBuy.amount, -1);
  assert.equal(firstBuy.shares, 0.002197377);
  assert.equal(firstBuy.metadata?.system?.import?.original?.amount, '1.00');
  assert.equal(firstBuy.metadata?.system?.import?.original?.quantity, '0.002197377');
});

test('importCsvPortfolio dry-run validates reconciliation without creating files', async () => {
  const dataDir = createTempDir('csv-import-dry-run-');

  const result = await importCsvPortfolio({
    dataDir,
    sourceDir: projectRoot,
    dryRun: true,
    logger: noopLogger,
  });

  assert.equal(result.dryRun, true);
  assert.equal(existsSync(path.join(dataDir, 'storage.sqlite')), false);
});

test('importCsvPortfolio writes SQLite-backed portfolio state and remains idempotent across reruns', async () => {
  const dataDir = createTempDir('csv-import-write-');
  const first = await importCsvPortfolio({
    dataDir,
    portfolioId: 'desktop',
    sourceDir: projectRoot,
    logger: noopLogger,
  });
  const firstStats = statSync(path.join(dataDir, 'storage.sqlite'));

  const second = await importCsvPortfolio({
    dataDir,
    portfolioId: 'desktop',
    sourceDir: projectRoot,
    logger: noopLogger,
  });

  const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  const rows = await storage.readTable('transactions');
  const desktopRows = rows.filter((row) => row.portfolio_id === 'desktop');
  const uniqueIds = new Set(desktopRows.map((row) => row.id));
  const portfolio = await readPortfolioState(storage, 'desktop');

  assert.equal(first.written, true);
  assert.equal(second.written, true);
  assert.equal(existsSync(path.join(dataDir, 'storage.sqlite')), true);
  assert.equal(desktopRows.length, first.transactionCount);
  assert.equal(uniqueIds.size, desktopRows.length);
  assert.equal(first.transactionCount, second.transactionCount);
  assert.equal(portfolio?.cash?.currency, 'USD');
  assert.equal(portfolio?.transactions?.length, first.transactionCount);
  assert.equal(
    second.reconciliation.cashByCurrency.USD,
    CSV_IMPORT_EXPECTED_RECONCILIATION.cash,
  );
  assert.ok(statSync(path.join(dataDir, 'storage.sqlite')).mtimeMs >= firstStats.mtimeMs);
});
