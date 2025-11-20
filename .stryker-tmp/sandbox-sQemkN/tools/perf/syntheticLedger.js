// @ts-nocheck
import { toDateKey } from '../../server/finance/cash.js';

const DEFAULT_TRANSACTION_COUNT = 10_240;
const DEFAULT_TICKERS = ['SPY', 'QQQ', 'IWM', 'VTI'];
const MS_PER_DAY = 86_400_000;

function createDeterministicRng(seed = 17) {
  let state = BigInt(seed);
  const modulus = 2_147_483_647n;
  const multiplier = 48_271n;
  return () => {
    state = (state * multiplier) % modulus;
    return Number(state) / Number(modulus);
  };
}

function resolveTradeQuantity(rngValue) {
  const base = 0.15 + rngValue * 0.4;
  return Number(base.toFixed(4));
}

function calculatePrice({ tickerIndex, dayIndex }) {
  const base = 100 + tickerIndex * 3.25;
  const drift = dayIndex * 0.12;
  return Number((base + drift).toFixed(2));
}

function determineType({ ticker, holdings, rngValue, saleFrequency }) {
  const held = holdings.get(ticker) ?? 0;
  if (held <= 0) {
    return 'BUY';
  }
  if (saleFrequency <= 0) {
    return 'BUY';
  }
  return rngValue < saleFrequency ? 'SELL' : 'BUY';
}

function generateTransactions({
  transactionCount,
  tickers,
  baseDate,
  saleFrequency,
}) {
  const rng = createDeterministicRng(11);
  const transactions = [
    {
      id: 'seed-deposit',
      seq: 0,
      createdAt: 0,
      date: toDateKey(baseDate),
      type: 'DEPOSIT',
      amount: 1_000_000,
    },
  ];

  const holdings = new Map();
  const dateKeys = new Set([toDateKey(baseDate)]);

  for (let index = 0; index < transactionCount; index += 1) {
    const rngValue = rng();
    const ticker = tickers[index % tickers.length];
    const dayIndex = Math.floor(index / tickers.length) + 1;
    const date = toDateKey(new Date(baseDate.getTime() + dayIndex * MS_PER_DAY));
    const quantity = resolveTradeQuantity(rngValue);
    const tradeType = determineType({ ticker, holdings, rngValue, saleFrequency });
    const signedQuantity = tradeType === 'SELL' ? -quantity : quantity;
    const price = calculatePrice({ tickerIndex: tickers.indexOf(ticker), dayIndex });
    const amount = Number((Math.abs(signedQuantity) * price).toFixed(2));

    const currentHolding = holdings.get(ticker) ?? 0;
    const nextHolding = currentHolding + signedQuantity;
    if (nextHolding < 0) {
      holdings.set(ticker, currentHolding + quantity);
      transactions.push({
        id: `tx-${index}`,
        seq: index + 1,
        createdAt: index + 1,
        date,
        type: 'BUY',
        ticker,
        quantity,
        amount,
      });
    } else {
      holdings.set(ticker, nextHolding);
      transactions.push({
        id: `tx-${index}`,
        seq: index + 1,
        createdAt: index + 1,
        date,
        type: tradeType,
        ticker,
        quantity: signedQuantity,
        amount,
      });
    }
    dateKeys.add(date);
  }

  return { transactions, dateKeys };
}

function buildPriceMap({ tickers, sortedDates }) {
  const pricesByDate = new Map();
  for (const [dateIndex, dateKey] of sortedDates.entries()) {
    const priceMap = new Map();
    for (const [tickerIndex, ticker] of tickers.entries()) {
      priceMap.set(ticker, calculatePrice({ tickerIndex, dayIndex: dateIndex }));
    }
    pricesByDate.set(dateKey, priceMap);
  }
  return pricesByDate;
}

export function buildSyntheticLedger({
  transactionCount = DEFAULT_TRANSACTION_COUNT,
  tickers = DEFAULT_TICKERS,
  baseDate = new Date('2024-01-01T00:00:00Z'),
  saleFrequency = 0.3,
} = {}) {
  if (!Number.isInteger(transactionCount) || transactionCount < 1) {
    throw new Error('transactionCount must be a positive integer');
  }
  if (!Array.isArray(tickers) || tickers.length === 0) {
    throw new Error('tickers must be a non-empty array');
  }

  const { transactions, dateKeys } = generateTransactions({
    transactionCount,
    tickers,
    baseDate,
    saleFrequency,
  });
  const sortedDates = Array.from(dateKeys).sort((a, b) => a.localeCompare(b));
  const pricesByDate = buildPriceMap({ tickers, sortedDates });

  return {
    transactions,
    pricesByDate,
    dates: sortedDates,
  };
}
