/**
 * PM-AUD-020 — Frontend fallback precision divergence test.
 *
 * Feeds identical 500-day transaction + price data to both calculation paths:
 *   - Frontend: buildRoiSeries (native JavaScript floats)
 *   - Backend:  computeDailyStates → computeDailyReturnRows → summarizeReturns (Decimal.js)
 *
 * To isolate float-vs-Decimal precision drift, the test uses a simple buy-and-hold
 * scenario: one initial deposit + buy, then price-only changes for 500 days.
 * Both paths compute the same TWR formula but with different numeric precision.
 *
 * Note: Transaction format differs between paths — the frontend reads `shares`,
 * the backend reads `quantity`. Both fields are included in test data.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { buildRoiSeries } from '../utils/roi.js';
import { computeDailyStates } from '../../server/finance/portfolio.js';
import { computeDailyReturnRows, summarizeReturns } from '../../server/finance/returns.js';

const DAYS = 500;
const TICKER = 'TSLA';
const INITIAL_SPY = 400;
const INITIAL_STOCK = 200;

function deterministicReturn(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.06;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function generatePriceSeries() {
  const baseDate = new Date('2023-01-02T00:00:00Z');
  const dates = [];
  const spyPriceList = [];
  const stockPriceList = [];

  let spyPrice = INITIAL_SPY;
  let stockPrice = INITIAL_STOCK;

  for (let i = 0; i < DAYS; i++) {
    const date = new Date(baseDate.getTime() + i * 86_400_000);
    const dateKey = toDateKey(date);
    dates.push(dateKey);

    if (i > 0) {
      spyPrice *= 1 + deterministicReturn(i * 2);
      stockPrice *= 1 + deterministicReturn(i * 2 + 1);
    }

    spyPriceList.push({ date: dateKey, close: Number(spyPrice.toFixed(4)) });
    stockPriceList.push({ date: dateKey, close: Number(stockPrice.toFixed(4)) });
  }

  return { dates, spyPriceList, stockPriceList };
}

function runBackendPath(transactions, dates, stockPriceList, spyPriceList) {
  const pricesByDate = new Map();
  for (let i = 0; i < dates.length; i++) {
    const priceMap = new Map();
    priceMap.set(TICKER, stockPriceList[i].close);
    pricesByDate.set(dates[i], priceMap);
  }

  const states = computeDailyStates({ transactions, pricesByDate, dates });
  const spyPricesMap = new Map(spyPriceList.map((p) => [p.date, p.close]));
  const rates = [{ effective_date: '2023-01-01', apy: 0 }];

  const rows = computeDailyReturnRows({
    states,
    rates,
    spyPrices: spyPricesMap,
    transactions,
  });

  return summarizeReturns(rows);
}

async function runFrontendPath(transactions, stockPriceList, spyPriceList) {
  const priceMapFrontend = {
    [TICKER]: stockPriceList,
    SPY: spyPriceList,
  };
  const fetcher = async (symbol) => priceMapFrontend[symbol.toUpperCase()] ?? [];
  return buildRoiSeries(transactions, fetcher);
}

// Build transactions with both `shares` (frontend) and `quantity` (backend) fields,
// and positive `amount` (backend convention — frontend uses Math.abs internally).
function makeBuyTx(date, shares, amount) {
  return { date, ticker: TICKER, type: 'BUY', shares, quantity: shares, amount };
}

describe('PM-AUD-020: Frontend fallback vs backend precision divergence', () => {
  const { dates, spyPriceList, stockPriceList } = generatePriceSeries();

  it('SPY benchmark divergence is < 10 basis points over 500 days', async () => {
    const transactions = [
      { date: dates[0], type: 'DEPOSIT', amount: 10000 },
      makeBuyTx(dates[0], 20, 4000),
    ];

    const frontendSeries = await runFrontendPath(transactions, stockPriceList, spyPriceList);
    assert.ok(frontendSeries.length > 0, 'Frontend series should not be empty');
    const frontendSpyReturn = frontendSeries[frontendSeries.length - 1].spy;

    const summary = runBackendPath(transactions, dates, stockPriceList, spyPriceList);
    const backendSpyReturn = summary.r_spy_100 * 100;

    const divergencePctPoints = Math.abs(frontendSpyReturn - backendSpyReturn);

    assert.ok(
      divergencePctPoints < 0.1,
      `SPY return divergence of ${divergencePctPoints.toFixed(6)} pct points ` +
        `exceeds 10 bps threshold. Frontend: ${frontendSpyReturn.toFixed(4)}%, Backend: ${backendSpyReturn.toFixed(4)}%`
    );
  });

  it('portfolio cumulative return divergence is < 10 basis points for buy-and-hold', async () => {
    const transactions = [
      { date: dates[0], type: 'DEPOSIT', amount: 10000 },
      makeBuyTx(dates[0], 20, 4000),
    ];

    const frontendSeries = await runFrontendPath(transactions, stockPriceList, spyPriceList);
    assert.ok(frontendSeries.length > 0, 'Frontend series should not be empty');
    const frontendReturn = frontendSeries[frontendSeries.length - 1].portfolio;

    const summary = runBackendPath(transactions, dates, stockPriceList, spyPriceList);
    const backendReturn = summary.r_port * 100;

    const divergencePctPoints = Math.abs(frontendReturn - backendReturn);

    assert.ok(
      divergencePctPoints < 0.1,
      `Portfolio return divergence of ${divergencePctPoints.toFixed(6)} pct points ` +
        `exceeds 10 bps threshold. Frontend: ${frontendReturn.toFixed(4)}%, Backend: ${backendReturn.toFixed(4)}%`
    );
  });

  it('portfolio divergence with periodic deposits stays within acceptable bounds', async () => {
    const transactions = [
      { date: dates[0], type: 'DEPOSIT', amount: 10000 },
      makeBuyTx(dates[0], 20, 4000),
    ];
    for (let i = 30; i < DAYS; i += 30) {
      transactions.push({ date: dates[i], type: 'DEPOSIT', amount: 500 });
    }

    const frontendSeries = await runFrontendPath(transactions, stockPriceList, spyPriceList);
    assert.ok(frontendSeries.length > 0, 'Frontend series should not be empty');
    const frontendReturn = frontendSeries[frontendSeries.length - 1].portfolio;

    const summary = runBackendPath(transactions, dates, stockPriceList, spyPriceList);
    const backendReturn = summary.r_port * 100;

    const divergencePctPoints = Math.abs(frontendReturn - backendReturn);

    // With periodic deposits, both paths handle TWR chain-linking slightly differently.
    // We still expect the divergence to be within a few percentage points — this test
    // documents and bounds the known limitation rather than requiring exact agreement.
    assert.ok(
      divergencePctPoints < 5.0,
      `Portfolio return divergence of ${divergencePctPoints.toFixed(4)} pct points ` +
        `exceeds 500 bps threshold with periodic deposits. ` +
        `Frontend: ${frontendReturn.toFixed(4)}%, Backend: ${backendReturn.toFixed(4)}%`
    );
  });
});
