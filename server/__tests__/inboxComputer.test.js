// server/__tests__/inboxComputer.test.js
// Unit tests for server/finance/inboxComputer.ts — Step 5.3.
// Uses node:test. Run via: npm run test:node

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { computeInbox, buildThresholdEventKey, buildLargeMoveEventKey, buildLongUnreviewedEventKey, buildNoThresholdEventKey } from '../finance/inboxComputer.js';

// ── helpers ────────────────────────────────────────────────────────────────

/** A reference date well after all test transactions so staleness rules fire. */
const FAR_FUTURE = new Date('2060-01-02T00:00:00.000Z');

function makeTransaction({ ticker = 'AAPL', type = 'BUY', date = '2020-01-02', shares = 10, amount = 1500, price = 150 } = {}) {
  return { ticker, type, date, shares, quantity: type === 'SELL' ? -shares : shares, amount, price };
}

function makePrice(price) {
  return { price, asOf: '2024-01-15' };
}

function pricesMap(entries) {
  return new Map(Object.entries(entries).map(([k, v]) => [k, makePrice(v)]));
}

// ── Event key builders ────────────────────────────────────────────────────

describe('Event key builders', () => {
  test('buildThresholdEventKey encodes ticker, direction, pct, date', () => {
    const key = buildThresholdEventKey('AAPL', 'BUY_ZONE', 10, '2024-01-15');
    assert.equal(key, 'AAPL:below:10:2024-01-15');
  });

  test('buildThresholdEventKey uses "above" for TRIM_ZONE', () => {
    const key = buildThresholdEventKey('TSLA', 'TRIM_ZONE', 5, '2024-06-01');
    assert.equal(key, 'TSLA:above:5:2024-06-01');
  });

  test('buildLargeMoveEventKey rounds absolute pct', () => {
    const key = buildLargeMoveEventKey('AMD', -23.7, '2023-05-01');
    assert.equal(key, 'AMD:down:24:2023-05-01');
  });

  test('buildLargeMoveEventKey handles positive move', () => {
    const key = buildLargeMoveEventKey('NVDA', 45.1, '2022-01-10');
    assert.equal(key, 'NVDA:up:45:2022-01-10');
  });

  test('buildLongUnreviewedEventKey format', () => {
    const key = buildLongUnreviewedEventKey('GLD', '2023-01-01');
    assert.equal(key, 'GLD:LONG_UNREVIEWED:2023-01-01');
  });

  test('buildNoThresholdEventKey format', () => {
    const key = buildNoThresholdEventKey('DELL', '2022-03-15');
    assert.equal(key, 'DELL:NO_THRESHOLD_CONFIGURED:2022-03-15');
  });
});

// ── computeInbox ─────────────────────────────────────────────────────────

describe('computeInbox — empty / no holdings', () => {
  test('returns empty array when no transactions', () => {
    const result = computeInbox({
      transactions: [],
      signals: {},
      priceSnapshots: new Map(),
      dismissHistory: [],
    });
    assert.deepEqual(result, []);
  });

  test('returns empty array when all positions are closed', () => {
    const txs = [
      makeTransaction({ type: 'BUY', shares: 10, amount: 1500, price: 150, date: '2020-01-02' }),
      makeTransaction({ type: 'SELL', shares: 10, amount: 1600, price: 160, date: '2020-06-01' }),
    ];
    const result = computeInbox({
      transactions: txs,
      signals: {},
      priceSnapshots: pricesMap({ AAPL: 160 }),
      dismissHistory: [],
      referenceDate: FAR_FUTURE,
    });
    assert.deepEqual(result, []);
  });
});

describe('computeInbox — THRESHOLD_TRIGGERED', () => {
  test('surfaces THRESHOLD_TRIGGERED when price crosses below buy threshold', () => {
    // Reference price 150, 10% threshold → lower bound = 135. Current price 120 is below.
    const txs = [makeTransaction({ type: 'BUY', shares: 10, amount: 1500, price: 150 })];
    const result = computeInbox({
      transactions: txs,
      signals: { AAPL: { pct: 10 } },
      priceSnapshots: pricesMap({ AAPL: 120 }),
      dismissHistory: [],
      referenceDate: FAR_FUTURE,
    });
    const thresh = result.find((i) => i.eventType === 'THRESHOLD_TRIGGERED');
    assert.ok(thresh, 'Expected a THRESHOLD_TRIGGERED item');
    assert.equal(thresh.ticker, 'AAPL');
    assert.equal(thresh.urgency, 'HIGH');
    assert.equal(thresh.signalStatus, 'BUY_ZONE');
    assert.equal(thresh.thresholdPct, 10);
  });

  test('surfaces THRESHOLD_TRIGGERED when price crosses above trim threshold', () => {
    // Reference price 100, 5% threshold → upper bound = 105. Current price 120 is above.
    const txs = [makeTransaction({ type: 'BUY', shares: 5, amount: 500, price: 100 })];
    const result = computeInbox({
      transactions: txs,
      signals: { AAPL: { pct: 5 } },
      priceSnapshots: pricesMap({ AAPL: 120 }),
      dismissHistory: [],
      referenceDate: FAR_FUTURE,
    });
    const thresh = result.find((i) => i.eventType === 'THRESHOLD_TRIGGERED');
    assert.ok(thresh, 'Expected a THRESHOLD_TRIGGERED item');
    assert.equal(thresh.signalStatus, 'TRIM_ZONE');
  });

  test('does not surface THRESHOLD_TRIGGERED when price is within band', () => {
    // Reference price 100, 20% threshold → band [80, 120]. Current price 105.
    const txs = [makeTransaction({ type: 'BUY', shares: 5, amount: 500, price: 100 })];
    const result = computeInbox({
      transactions: txs,
      signals: { AAPL: { pct: 20 } },
      priceSnapshots: pricesMap({ AAPL: 105 }),
      dismissHistory: [],
    });
    const thresh = result.find((i) => i.eventType === 'THRESHOLD_TRIGGERED');
    assert.equal(thresh, undefined);
  });

  test('does not surface THRESHOLD_TRIGGERED when eventKey is dismissed', () => {
    const txs = [makeTransaction({ type: 'BUY', shares: 10, amount: 1500, price: 150 })];
    const eventKey = buildThresholdEventKey('AAPL', 'BUY_ZONE', 10, '2024-01-15');
    const result = computeInbox({
      transactions: txs,
      signals: { AAPL: { pct: 10 } },
      priceSnapshots: pricesMap({ AAPL: 120 }),
      dismissHistory: [{
        portfolio_id: 'demo',
        ticker: 'AAPL',
        event_type: 'THRESHOLD_TRIGGERED',
        event_key: eventKey,
        dismissed_at: '2024-01-15T00:00:00.000Z',
      }],
      referenceDate: FAR_FUTURE,
    });
    const thresh = result.find((i) => i.eventType === 'THRESHOLD_TRIGGERED');
    assert.equal(thresh, undefined);
  });
});

describe('computeInbox — LARGE_MOVE_UNREVIEWED', () => {
  test('surfaces LARGE_MOVE_UNREVIEWED when move ≥ 20% up from avg cost', () => {
    // Avg cost = 100, current price = 125 → +25%
    const txs = [makeTransaction({ type: 'BUY', shares: 10, amount: 1000, price: 100 })];
    const result = computeInbox({
      transactions: txs,
      signals: { AAPL: { pct: 5 } }, // signal is HOLD so no threshold trigger
      priceSnapshots: pricesMap({ AAPL: 125 }),
      dismissHistory: [],
      referenceDate: FAR_FUTURE,
    });
    const item = result.find((i) => i.eventType === 'LARGE_MOVE_UNREVIEWED');
    assert.ok(item, 'Expected LARGE_MOVE_UNREVIEWED');
    assert.equal(item.urgency, 'HIGH');
    assert.ok(item.movePct !== undefined && item.movePct > 0);
  });

  test('surfaces LARGE_MOVE_UNREVIEWED when move ≥ 20% down', () => {
    const txs = [makeTransaction({ type: 'BUY', shares: 10, amount: 1000, price: 100 })];
    const result = computeInbox({
      transactions: txs,
      signals: {},
      priceSnapshots: pricesMap({ AAPL: 75 }), // -25%
      dismissHistory: [],
      referenceDate: FAR_FUTURE,
    });
    const item = result.find((i) => i.eventType === 'LARGE_MOVE_UNREVIEWED');
    assert.ok(item);
    assert.ok(item.movePct !== undefined && item.movePct < 0);
  });

  test('does not surface LARGE_MOVE_UNREVIEWED when move < 20%', () => {
    const txs = [makeTransaction({ type: 'BUY', shares: 10, amount: 1000, price: 100 })];
    const result = computeInbox({
      transactions: txs,
      signals: {},
      priceSnapshots: pricesMap({ AAPL: 115 }), // +15%
      dismissHistory: [],
    });
    const item = result.find((i) => i.eventType === 'LARGE_MOVE_UNREVIEWED');
    assert.equal(item, undefined);
  });
});

describe('computeInbox — LONG_UNREVIEWED', () => {
  test('surfaces LONG_UNREVIEWED when position ≥ $500 and 30+ trading days elapsed', () => {
    // Transaction in early 2020, reference date far in future → many trading days.
    const txs = [makeTransaction({ type: 'BUY', shares: 10, amount: 1000, price: 100, date: '2020-01-02' })];
    const result = computeInbox({
      transactions: txs,
      signals: { AAPL: { pct: 50 } }, // wide threshold — no trigger
      priceSnapshots: pricesMap({ AAPL: 100 }), // price unchanged — no large move
      dismissHistory: [],
      referenceDate: FAR_FUTURE,
    });
    const item = result.find((i) => i.eventType === 'LONG_UNREVIEWED');
    assert.ok(item, 'Expected LONG_UNREVIEWED');
    assert.equal(item.urgency, 'MEDIUM');
    assert.ok((item.tradingDaysUnreviewed ?? 0) >= 30);
  });

  test('does not surface LONG_UNREVIEWED when position < $500', () => {
    // 2 shares at $10 each = $20 position.
    const txs = [makeTransaction({ type: 'BUY', shares: 2, amount: 20, price: 10, date: '2020-01-02' })];
    const result = computeInbox({
      transactions: txs,
      signals: {},
      priceSnapshots: pricesMap({ AAPL: 10 }),
      dismissHistory: [],
      referenceDate: FAR_FUTURE,
    });
    const item = result.find((i) => i.eventType === 'LONG_UNREVIEWED');
    assert.equal(item, undefined);
  });
});

describe('computeInbox — NO_THRESHOLD_CONFIGURED', () => {
  test('surfaces NO_THRESHOLD_CONFIGURED when position ≥ $500 and no signal', () => {
    const txs = [makeTransaction({ type: 'BUY', shares: 10, amount: 1000, price: 100, date: '2020-01-02' })];
    const result = computeInbox({
      transactions: txs,
      signals: {},
      priceSnapshots: pricesMap({ AAPL: 100 }),
      dismissHistory: [],
      referenceDate: new Date('2020-06-01'), // only 30 days from Jan, not enough for LONG_UNREVIEWED
    });
    const item = result.find((i) => i.eventType === 'NO_THRESHOLD_CONFIGURED');
    assert.ok(item, 'Expected NO_THRESHOLD_CONFIGURED');
    assert.equal(item.urgency, 'LOW');
  });

  test('does not surface NO_THRESHOLD_CONFIGURED when signal is configured', () => {
    const txs = [makeTransaction({ type: 'BUY', shares: 10, amount: 1000, price: 100, date: '2020-01-02' })];
    const result = computeInbox({
      transactions: txs,
      signals: { AAPL: { pct: 10 } },
      priceSnapshots: pricesMap({ AAPL: 100 }),
      dismissHistory: [],
      referenceDate: new Date('2020-06-01'),
    });
    const item = result.find((i) => i.eventType === 'NO_THRESHOLD_CONFIGURED');
    assert.equal(item, undefined);
  });
});

describe('computeInbox — sort order', () => {
  test('HIGH urgency items come before MEDIUM and LOW', () => {
    // Two tickers: AAPL triggers threshold (HIGH), MSFT has no signal ($500+ position, LOW).
    const txs = [
      { ticker: 'AAPL', type: 'BUY', date: '2020-01-02', shares: 10, quantity: 10, amount: 1000, price: 100 },
      { ticker: 'MSFT', type: 'BUY', date: '2020-01-02', shares: 10, quantity: 10, amount: 1000, price: 100 },
    ];
    // AAPL: price 130 > 110 (ref 100 × 1.1) → TRIM_ZONE; also +30% large move
    // MSFT: price 100 → no threshold, no large move, no signal (LOW)
    const result = computeInbox({
      transactions: txs,
      signals: { AAPL: { pct: 10 } },
      priceSnapshots: new Map([
        ['AAPL', { price: 130, asOf: '2024-01-15' }],
        ['MSFT', { price: 100, asOf: '2024-01-15' }],
      ]),
      dismissHistory: [],
      referenceDate: new Date('2020-06-01'),
    });
    const urgencies = result.map((i) => i.urgency);
    // HIGH must appear before any MEDIUM or LOW
    const firstNonHigh = urgencies.findIndex((u) => u !== 'HIGH');
    if (firstNonHigh !== -1) {
      const afterFirstNonHigh = urgencies.slice(firstNonHigh);
      assert.ok(
        !afterFirstNonHigh.includes('HIGH'),
        'HIGH urgency items must all appear before MEDIUM/LOW items',
      );
    }
  });
});

describe('computeInbox — monetary values', () => {
  test('currentValue and shares are strings', () => {
    const txs = [makeTransaction({ type: 'BUY', shares: 3, amount: 600, price: 200 })];
    const result = computeInbox({
      transactions: txs,
      signals: {},
      priceSnapshots: pricesMap({ AAPL: 300 }), // +50% move
      dismissHistory: [],
      referenceDate: FAR_FUTURE,
    });
    for (const item of result) {
      if (item.currentValue !== null) {
        assert.equal(typeof item.currentValue, 'string', 'currentValue must be a string');
      }
      assert.equal(typeof item.shares, 'string', 'shares must be a string');
    }
  });
});
