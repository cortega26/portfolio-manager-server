import { promises as fs } from 'node:fs';
import path from 'node:path';

import { CASH_POLICY_SCHEMA_VERSION, PORTFOLIO_SCHEMA_VERSION } from '../../shared/constants.js';
import { readPortfolioState, writePortfolioState } from '../data/portfolioState.js';
import { portfolioBodySchema } from '../routes/_schemas.js';
import { withLock } from '../utils/locks.js';
import { d, roundDecimal } from '../finance/decimal.js';
import { sortTransactions } from '../finance/portfolio.js';
import { runMigrations } from '../migrations/index.js';

// Corporate actions are loaded once from the config file at the path below.
// Format: [{ ticker, date, type: "split", ratio, applies_to: "ALL"|"BUY"|"SELL", rule }]
// See server/data/corporateActions.json for the authoritative list.
const CORPORATE_ACTIONS_PATH = new URL('../data/corporateActions.json', import.meta.url);

/** @type {Array<{ticker:string, date:string, type:string, ratio:number, applies_to:string, rule:string}>} */
let _corporateActionsCache = null;

export async function loadCorporateActions(filePath = CORPORATE_ACTIONS_PATH) {
  if (_corporateActionsCache !== null) {
    return _corporateActionsCache;
  }
  const raw = await fs.readFile(filePath instanceof URL ? filePath : new URL(filePath), 'utf8');
  _corporateActionsCache = JSON.parse(raw);
  return _corporateActionsCache;
}

// Allow tests to inject a custom action list without touching the cache.
export function _setCorporateActionsForTest(actions) {
  _corporateActionsCache = actions;
}

export function _resetCorporateActionsCache() {
  _corporateActionsCache = null;
}

export const CSV_IMPORT_FILE_NAMES = {
  buys: '32996_asset_market_buys.csv',
  sells: '32996_asset_market_sells.csv',
  forex: '32996_forex_buys.csv',
  dividends: 'tailormade-broker-dividends-2026-03-18.csv',
};

export const CSV_IMPORT_EXPECTED_RECONCILIATION = {
  cash: '196.71',
  holdings: {
    AMD: '0.305562260',
    DELL: '0.454749913',
    GLD: '0.001016562',
    NVDA: '0.815097910',
    TSLA: '0.783956628',
  },
};

const CASH_CURRENCY = 'USD';

const IMPORT_SOURCE_TAG = 'csv-bootstrap';
const IMPORT_CASH_CHRONOLOGY = 'day-netted';
const SYNTHETIC_GIFT_CARD_ID = 'synthetic:gift-card-usd-1';
const SYNTHETIC_GIFT_CARD_DATE = '2023-11-27';
const SYNTHETIC_GIFT_CARD_AMOUNT = '1.00';
const SYNTHETIC_HYCA_INTEREST_RULE = 'FINTUAL_HYCA_MONTHLY_INTEREST_CONFIRMED_BY_SUPPORT';
const SYNTHETIC_HYCA_INTEREST_POSTINGS = [
  { date: '2025-05-31', amount: '0.18' },
  { date: '2025-06-30', amount: '0.67' },
  { date: '2025-07-31', amount: '1.01' },
  { date: '2025-08-29', amount: '0.68' },
  { date: '2025-09-30', amount: '0.73' },
  { date: '2025-10-31', amount: '1.20' },
  { date: '2025-11-28', amount: '0.32' },
  { date: '2025-12-31', amount: '0.08' },
  { date: '2026-01-30', amount: '0.04' },
  { date: '2026-02-27', amount: '0.05' },
];

function buildImportMetadata({
  fileName,
  lineNumber,
  original,
  adjustment = null,
}) {
  return {
    system: {
      import: {
        source: IMPORT_SOURCE_TAG,
        cashChronology: IMPORT_CASH_CHRONOLOGY,
        file: fileName,
        line: lineNumber,
        original,
        adjustment,
      },
    },
  };
}

function normalizeLineEndings(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function readCsvLines(filePath) {
  const contents = normalizeLineEndings(await fs.readFile(filePath, 'utf8')).trim();
  if (!contents) {
    return [];
  }
  return contents.split('\n');
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

async function parseCommaSeparatedFile(filePath) {
  const lines = await readCsvLines(filePath);
  if (lines.length === 0) {
    return [];
  }
  return lines.slice(1).map((line, index) => ({
    lineNumber: index + 2,
    columns: parseDelimitedLine(line, ','),
  }));
}

async function parseSemicolonSeparatedFile(filePath) {
  const lines = await readCsvLines(filePath);
  if (lines.length === 0) {
    return [];
  }
  return lines.slice(1).map((line, index) => ({
    lineNumber: index + 2,
    columns: parseDelimitedLine(line, ';'),
  }));
}

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return value;
}

function parseBrokerDate(value) {
  const match = /^(\d{2})-(\d{2})-(\d{2})$/u.exec(String(value ?? '').trim());
  if (!match) {
    throw new Error(`Invalid broker date: ${value}`);
  }
  const [, day, month, year] = match;
  return `20${year}-${month}-${day}`;
}

function toDecimalString(value, places) {
  return roundDecimal(value, places).toFixed(places);
}

function toFiniteNumber(value, places) {
  return Number(toDecimalString(value, places));
}

function normalizeImportedNumericInput(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');

  if (hasComma && hasDot) {
    if (trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.')) {
      return trimmed.replace(/\./g, '').replace(',', '.');
    }
    return trimmed.replace(/,/g, '');
  }

  if (hasComma) {
    return trimmed.replace(',', '.');
  }

  return trimmed;
}

function createDeterministicCreatedAt(date, lineNumber, variantIndex = 0) {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10));
  return Date.UTC(year, month - 1, day, 0, 0, 0, 0) + (lineNumber * 10) + variantIndex;
}

function withBaseTransactionFields({
  id,
  date,
  lineNumber,
  seq,
  note,
  metadata,
}) {
  return {
    id,
    uid: id,
    date,
    note,
    currency: CASH_CURRENCY,
    metadata,
    createdAt: createDeterministicCreatedAt(date, lineNumber, seq % 10),
    seq,
  };
}

/**
 * Applies a split adjustment from corporateActions config to a transaction.
 *
 * @param {{ ticker: string, date: string, type: string, quantity: Decimal }} params
 * @param {Array} corporateActions - loaded from server/data/corporateActions.json
 * @returns {{ quantity: Decimal, adjustment: object|null }}
 */
function maybeApplyDatasetQuantityAdjustment({ ticker, date, type, quantity }, corporateActions = []) {
  for (const action of corporateActions) {
    if (action.type !== 'split') continue;
    if (action.ticker !== ticker) continue;
    if (date >= action.date) continue;

    const appliesToTransaction =
      action.applies_to === 'ALL' ||
      action.applies_to === type;

    if (!appliesToTransaction) continue;

    return {
      quantity: quantity.times(action.ratio),
      adjustment: {
        rule: action.rule,
        factor: String(action.ratio),
      },
    };
  }
  return { quantity, adjustment: null };
}

function buildBuyOrSellTransaction({
  fileName,
  lineNumber,
  seq,
  date,
  ticker,
  assetName,
  category,
  amount,
  quantity,
  type,
  corporateActions = [],
}) {
  const normalizedDate = parseIsoDate(date);
  const normalizedAmount = normalizeImportedNumericInput(amount);
  const normalizedQuantity = normalizeImportedNumericInput(quantity);
  const decimalAmount = d(normalizedAmount).abs();
  const quantityAdjustment = maybeApplyDatasetQuantityAdjustment({
    ticker,
    date: normalizedDate,
    type,
    quantity: d(normalizedQuantity).abs(),
  }, corporateActions);
  const signedQuantity = type === 'SELL'
    ? quantityAdjustment.quantity.neg()
    : quantityAdjustment.quantity;
  const price = decimalAmount.div(quantityAdjustment.quantity);
  const id = `csv:${fileName}:${lineNumber}`;
  const note = [
    assetName,
    `category=${category}`,
    `source=${fileName}`,
    `line=${lineNumber}`,
  ].join(' | ');

  return {
    ...withBaseTransactionFields({
      id,
      date: normalizedDate,
      lineNumber,
      seq,
      note,
      metadata: buildImportMetadata({
        fileName,
        lineNumber,
        original: {
          assetName,
          category,
          amount: String(normalizedAmount),
          quantity: String(normalizedQuantity),
        },
        adjustment: quantityAdjustment.adjustment,
      }),
    }),
    ticker,
    type,
    amount: type === 'BUY'
      ? -toFiniteNumber(decimalAmount, 2)
      : toFiniteNumber(decimalAmount, 2),
    price: toFiniteNumber(price, 8),
    quantity: toFiniteNumber(signedQuantity, 9),
    shares: toFiniteNumber(quantityAdjustment.quantity, 9),
  };
}

function buildDepositTransaction({
  fileName,
  lineNumber,
  seq,
  date,
  usdAmount,
  clpAmount,
}) {
  const normalizedDate = parseIsoDate(date);
  const normalizedUsdAmount = normalizeImportedNumericInput(usdAmount);
  const normalizedClpAmount = normalizeImportedNumericInput(clpAmount);
  const usd = d(normalizedUsdAmount).abs();
  const clp = d(normalizedClpAmount).abs();
  const fxRate = usd.isZero() ? d(0) : clp.div(usd);
  const id = `csv:${fileName}:${lineNumber}`;
  const note = [
    `forex buy CLP=${toDecimalString(clp, 0)}`,
    `implicit_fx=${toDecimalString(fxRate, 6)}`,
    `source=${fileName}`,
    `line=${lineNumber}`,
  ].join(' | ');

  return {
    ...withBaseTransactionFields({
      id,
      date: normalizedDate,
      lineNumber,
      seq,
      note,
      metadata: buildImportMetadata({
        fileName,
        lineNumber,
        original: {
          usdAmount: String(normalizedUsdAmount),
          clpAmount: String(normalizedClpAmount),
        },
      }),
    }),
    ticker: 'CASH',
    type: 'DEPOSIT',
    amount: toFiniteNumber(usd, 2),
    quantity: 0,
    shares: 0,
  };
}

function buildSyntheticGiftCardDeposit({ seq }) {
  const normalizedDate = parseIsoDate(SYNTHETIC_GIFT_CARD_DATE);
  const amount = d(SYNTHETIC_GIFT_CARD_AMOUNT);
  const note = 'initial gift card credit confirmed by Fintual support';

  return {
    ...withBaseTransactionFields({
      id: SYNTHETIC_GIFT_CARD_ID,
      date: normalizedDate,
      lineNumber: 0,
      seq,
      note,
      metadata: {
        system: {
          import: {
            source: IMPORT_SOURCE_TAG,
            cashChronology: IMPORT_CASH_CHRONOLOGY,
            file: 'synthetic-adjustments',
            line: 0,
            original: {
              amount: SYNTHETIC_GIFT_CARD_AMOUNT,
              kind: 'gift_card',
              confirmedAt: '2026-03-19',
            },
            adjustment: {
              rule: 'FINTUAL_GIFT_CARD_INITIAL_DEPOSIT',
            },
          },
        },
      },
    }),
    ticker: 'CASH',
    type: 'DEPOSIT',
    amount: toFiniteNumber(amount, 2),
    quantity: 0,
    shares: 0,
  };
}

function buildSyntheticHycaInterestTransaction({ seq, index, date, amount }) {
  const normalizedDate = parseIsoDate(date);
  const normalizedAmount = normalizeImportedNumericInput(amount);
  const decimalAmount = d(normalizedAmount).abs();
  const id = `synthetic:hyca-interest:${date}`;

  return {
    ...withBaseTransactionFields({
      id,
      date: normalizedDate,
      lineNumber: 0,
      seq,
      note: 'monthly HYCA interest confirmed by Fintual support',
      metadata: {
        system: {
          import: {
            source: IMPORT_SOURCE_TAG,
            cashChronology: IMPORT_CASH_CHRONOLOGY,
            file: 'synthetic-adjustments',
            line: index + 1,
            original: {
              amount: normalizedAmount,
              kind: 'hyca_interest',
              confirmedAt: '2026-03-19',
            },
            adjustment: {
              rule: SYNTHETIC_HYCA_INTEREST_RULE,
            },
          },
        },
      },
    }),
    ticker: 'CASH',
    type: 'INTEREST',
    amount: toFiniteNumber(decimalAmount, 2),
    quantity: 0,
    shares: 0,
  };
}

function buildDividendTransactions({
  fileName,
  lineNumber,
  seq,
  brokerId,
  grossCents,
  taxCents,
  createdAtRaw,
  dateRaw,
}) {
  const normalizedDate = parseBrokerDate(dateRaw);
  const grossAmount = d(grossCents).div(100);
  const taxAmount = d(taxCents).div(100);
  const baseNote = [
    `broker_dividend_id=${brokerId}`,
    `created_at=${createdAtRaw}`,
    `source=${fileName}`,
    `line=${lineNumber}`,
  ].join(' | ');
  const metadataBase = {
    brokerId: String(brokerId),
    createdAt: String(createdAtRaw),
    grossCents: String(grossCents),
    taxCents: String(taxCents),
  };

  const transactions = [
    {
      ...withBaseTransactionFields({
        id: `csv:${fileName}:${lineNumber}:gross`,
        date: normalizedDate,
        lineNumber,
        seq,
        note: `${baseNote} | gross`,
        metadata: buildImportMetadata({
          fileName,
          lineNumber,
          original: metadataBase,
        }),
      }),
      type: 'DIVIDEND',
      amount: toFiniteNumber(grossAmount, 2),
    },
  ];

  if (!taxAmount.isZero()) {
    transactions.push({
      ...withBaseTransactionFields({
        id: `csv:${fileName}:${lineNumber}:tax`,
        date: normalizedDate,
        lineNumber,
        seq: seq + 1,
        note: `${baseNote} | withholding_tax`,
        metadata: buildImportMetadata({
          fileName,
          lineNumber,
          original: metadataBase,
        }),
      }),
      type: 'FEE',
      amount: toFiniteNumber(taxAmount, 2),
    });
  }

  return transactions;
}

function resolveSourceFiles({ sourceDir, sourceFiles = {} }) {
  const baseDir = path.resolve(sourceDir ?? process.cwd());
  return {
    buys: path.resolve(baseDir, sourceFiles.buys ?? CSV_IMPORT_FILE_NAMES.buys),
    sells: path.resolve(baseDir, sourceFiles.sells ?? CSV_IMPORT_FILE_NAMES.sells),
    forex: path.resolve(baseDir, sourceFiles.forex ?? CSV_IMPORT_FILE_NAMES.forex),
    dividends: path.resolve(baseDir, sourceFiles.dividends ?? CSV_IMPORT_FILE_NAMES.dividends),
  };
}

function createPortfolioSnapshot(transactions) {
  const parsed = portfolioBodySchema.parse({
    transactions: sortTransactions(transactions),
    signals: {},
    settings: { autoClip: false },
    cash: { currency: CASH_CURRENCY, apyTimeline: [] },
  });
  return {
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    transactions: parsed.transactions,
    signals: parsed.signals,
    settings: parsed.settings,
    cash: {
      currency: parsed.cash.currency,
      apyTimeline: parsed.cash.apyTimeline,
      version: CASH_POLICY_SCHEMA_VERSION,
    },
  };
}

export function reconcileImportedTransactions(transactions) {
  const cashByCurrency = new Map();
  const holdings = new Map();

  for (const transaction of transactions) {
    const currency = typeof transaction.currency === 'string' ? transaction.currency : CASH_CURRENCY;
    const amount = d(transaction.amount ?? 0).abs();
    const previousCash = cashByCurrency.get(currency) ?? d(0);
    let nextCash = previousCash;

    switch (transaction.type) {
      case 'DEPOSIT':
      case 'DIVIDEND':
      case 'SELL':
      case 'INTEREST':
        nextCash = previousCash.plus(amount);
        break;
      case 'BUY':
      case 'FEE':
      case 'WITHDRAWAL':
        nextCash = previousCash.minus(amount);
        break;
      default:
        break;
    }

    cashByCurrency.set(currency, nextCash);

    if (transaction.ticker && transaction.ticker !== 'CASH') {
      const current = holdings.get(transaction.ticker) ?? d(0);
      holdings.set(transaction.ticker, current.plus(d(transaction.quantity ?? 0)));
    }
  }

  const normalizedHoldings = {};
  for (const [ticker, quantity] of [...holdings.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (quantity.isZero()) {
      continue;
    }
    normalizedHoldings[ticker] = quantity.toFixed(9);
  }

  return {
    cashByCurrency: Object.fromEntries(
      [...cashByCurrency.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([currency, value]) => [
        currency,
        value.toFixed(2),
      ]),
    ),
    holdings: normalizedHoldings,
  };
}

export function assertExpectedCsvImportReconciliation(summary) {
  const actualCash = summary.cashByCurrency[CASH_CURRENCY] ?? '0.00';
  if (actualCash !== CSV_IMPORT_EXPECTED_RECONCILIATION.cash) {
    throw new Error(
      `CSV import cash reconciliation mismatch. Expected ${CSV_IMPORT_EXPECTED_RECONCILIATION.cash} ${CASH_CURRENCY}, received ${actualCash} ${CASH_CURRENCY}.`,
    );
  }

  const expectedHoldings = CSV_IMPORT_EXPECTED_RECONCILIATION.holdings;
  const actualTickers = Object.keys(summary.holdings).sort();
  const expectedTickers = Object.keys(expectedHoldings).sort();
  if (JSON.stringify(actualTickers) !== JSON.stringify(expectedTickers)) {
    throw new Error(
      `CSV import holdings reconciliation mismatch. Expected tickers ${expectedTickers.join(', ')}, received ${actualTickers.join(', ')}.`,
    );
  }

  for (const [ticker, expectedQuantity] of Object.entries(expectedHoldings)) {
    const actualQuantity = summary.holdings[ticker];
    if (actualQuantity !== expectedQuantity) {
      throw new Error(
        `CSV import holdings reconciliation mismatch for ${ticker}. Expected ${expectedQuantity}, received ${actualQuantity}.`,
      );
    }
  }
}

export async function buildCsvPortfolioImport({ sourceDir, sourceFiles } = {}) {
  const resolvedFiles = resolveSourceFiles({ sourceDir, sourceFiles });
  const corporateActions = await loadCorporateActions();
  const transactions = [];
  let seq = 0;

  transactions.push(buildSyntheticGiftCardDeposit({ seq }));
  for (const [index, posting] of SYNTHETIC_HYCA_INTEREST_POSTINGS.entries()) {
    transactions.push(
      buildSyntheticHycaInterestTransaction({
        seq,
        index,
        date: posting.date,
        amount: posting.amount,
      }),
    );
  }

  const buyRows = await parseCommaSeparatedFile(resolvedFiles.buys);
  for (const { lineNumber, columns } of buyRows) {
    const [status, date, assetName, ticker, category, amount, quantity] = columns;
    if (status !== 'completada') {
      continue;
    }
    transactions.push(
      buildBuyOrSellTransaction({
        fileName: path.basename(resolvedFiles.buys),
        lineNumber,
        seq: seq++,
        date,
        ticker,
        assetName,
        category,
        amount,
        quantity,
        type: 'BUY',
        corporateActions,
      }),
    );
  }

  const sellRows = await parseCommaSeparatedFile(resolvedFiles.sells);
  for (const { lineNumber, columns } of sellRows) {
    const [status, date, assetName, ticker, category, amount, quantity] = columns;
    if (status !== 'completada') {
      continue;
    }
    transactions.push(
      buildBuyOrSellTransaction({
        fileName: path.basename(resolvedFiles.sells),
        lineNumber,
        seq: seq++,
        date,
        ticker,
        assetName,
        category,
        amount,
        quantity,
        type: 'SELL',
        corporateActions,
      }),
    );
  }

  const forexRows = await parseCommaSeparatedFile(resolvedFiles.forex);
  for (const { lineNumber, columns } of forexRows) {
    const [status, date, usdAmount, clpAmount] = columns;
    if (status !== 'completada') {
      continue;
    }
    transactions.push(
      buildDepositTransaction({
        fileName: path.basename(resolvedFiles.forex),
        lineNumber,
        seq: seq++,
        date,
        usdAmount,
        clpAmount,
      }),
    );
  }

  const dividendHeader = normalizeLineEndings(await fs.readFile(resolvedFiles.dividends, 'utf8'))
    .split('\n')[0] ?? '';
  const parseDividendRows =
    dividendHeader.includes(';') ? parseSemicolonSeparatedFile : parseCommaSeparatedFile;
  const dividendRows = await parseDividendRows(resolvedFiles.dividends);
  for (const { lineNumber, columns } of dividendRows) {
    const [
      brokerId,
      grossCents,
      ,
      taxCents,
      ,
      createdAtRaw,
      dateRaw,
    ] = columns;
    const dividendTransactions = buildDividendTransactions({
      fileName: path.basename(resolvedFiles.dividends),
      lineNumber,
      seq,
      brokerId,
      grossCents,
      taxCents,
      createdAtRaw,
      dateRaw,
    });
    seq += dividendTransactions.length;
    transactions.push(...dividendTransactions);
  }

  const snapshot = createPortfolioSnapshot(transactions);
  const reconciliation = reconcileImportedTransactions(snapshot.transactions);
  assertExpectedCsvImportReconciliation(reconciliation);

  return {
    snapshot,
    reconciliation,
    sourceFiles: resolvedFiles,
  };
}

export async function importCsvPortfolio({
  dataDir,
  portfolioId = 'desktop',
  sourceDir,
  sourceFiles,
  dryRun = false,
  logger = console,
} = {}) {
  const build = await buildCsvPortfolioImport({ sourceDir, sourceFiles });
  const state = {
    ...build.snapshot,
    id: portfolioId,
  };

  if (dryRun) {
    return {
      portfolioId,
      dryRun: true,
      written: false,
      transactionCount: build.snapshot.transactions.length,
      reconciliation: build.reconciliation,
      sourceFiles: build.sourceFiles,
    };
  }

  const storage = await runMigrations({ dataDir, logger });

  await withLock(`csv-import:${portfolioId}`, async () => {
    await writePortfolioState(storage, portfolioId, state);
  });

  const persisted = await readPortfolioState(storage, portfolioId);

  return {
    portfolioId,
    dryRun: false,
    written: true,
    transactionCount: persisted?.transactions?.length ?? 0,
    reconciliation: build.reconciliation,
    sourceFiles: build.sourceFiles,
  };
}
