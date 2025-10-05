import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { randomInt } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { createApp, isValidPortfolioId } from '../app.js';
import { sortTransactions } from '../finance/portfolio.js';

const noopLogger = {
  info() {},
  warn() {},
  error() {},
};

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-data-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('GET /api/portfolio/:id returns empty object when portfolio is missing', async () => {
  const app = createApp({ dataDir, logger: noopLogger });
  const response = await request(app).get('/api/portfolio/demo');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {});
});

test('POST /api/portfolio/:id persists validated portfolio payloads', async () => {
  const app = createApp({ dataDir, logger: noopLogger });
  const payload = {
    transactions: [
      {
        date: '2024-01-01',
        ticker: 'aapl',
        type: 'buy',
        amount: -150.5,
        shares: 1.5,
        price: 100.333,
      },
    ],
    signals: { aapl: { pct: 3 } },
  };
  const response = await request(app)
    .post('/api/portfolio/sample_01')
    .send(payload);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });

  const filePath = path.join(dataDir, 'portfolio_sample_01.json');
  const saved = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.equal(saved.transactions.length, 1);
  const [transaction] = saved.transactions;
  const { uid: savedUid, ...rest } = transaction;
  assert.equal(typeof savedUid, 'string');
  assert.ok(savedUid.length > 0);
  assert.deepEqual(rest, {
    date: '2024-01-01',
    ticker: 'AAPL',
    type: 'BUY',
    amount: -150.5,
    shares: 1.5,
    price: 100.333,
    quantity: 1.5,
  });
  assert.deepEqual(saved.signals, { AAPL: { pct: 3 } });
  assert.deepEqual(saved.settings, { autoClip: false });
});

test('POST /api/portfolio/:id deduplicates transactions by uid', async () => {
  const app = createApp({ dataDir, logger: noopLogger });
  const payload = {
    transactions: [
      {
        uid: 'duplicate-id',
        date: '2024-02-01',
        type: 'DEPOSIT',
        amount: 1000,
      },
      {
        uid: 'duplicate-id',
        date: '2024-02-01',
        type: 'DEPOSIT',
        amount: 1000,
      },
      {
        date: '2024-02-02',
        type: 'DEPOSIT',
        amount: 500,
      },
    ],
  };

  const response = await request(app).post('/api/portfolio/dedupe').send(payload);
  assert.equal(response.status, 200);

  const filePath = path.join(dataDir, 'portfolio_dedupe.json');
  const saved = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.equal(saved.transactions.length, 2);
  const duplicateCount = saved.transactions.filter((tx) => tx.uid === 'duplicate-id').length;
  assert.equal(duplicateCount, 1);
});

test('concurrent POST requests to the same portfolio remain consistent', async () => {
  const app = createApp({ dataDir, logger: noopLogger });
  const id = 'race';
  const payloads = Array.from({ length: 6 }, (_, index) => ({
    transactions: [
      {
        date: `2024-03-0${index + 1}`,
        type: 'DEPOSIT',
        amount: 1000 + index,
      },
    ],
  }));

  await Promise.all(
    payloads.map((payload) => request(app).post(`/api/portfolio/${id}`).send(payload)),
  );

  const filePath = path.join(dataDir, 'portfolio_race.json');
  const saved = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.equal(saved.transactions.length, 1);
  const [transaction] = saved.transactions;
  assert.equal(typeof transaction.uid, 'string');
  const savedAmount = transaction.amount;
  assert.ok(
    payloads.some((payload) => payload.transactions[0].amount === savedAmount),
    'final write must match one of the submitted payloads',
  );
});

test('rejects invalid portfolio identifiers to prevent path traversal', async () => {
  const app = createApp({ dataDir, logger: noopLogger });
  const response = await request(app).get(
    '/api/portfolio/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd',
  );
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
  assert.equal(response.body.details[0]?.path?.[0], undefined);
});

test('rejects non-object portfolio payloads', async () => {
  const app = createApp({ dataDir, logger: noopLogger });
  const response = await request(app)
    .post('/api/portfolio/invalid_payload')
    .send(['not', 'an', 'object']);
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
});

test('GET /api/prices/:symbol returns parsed historical data', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const csv = `Date,Open,High,Low,Close,Volume\n${today},1,1,1,123.45,1000`;
  const fetchImpl = async () => ({
    ok: true,
    text: async () => csv,
  });
  const app = createApp({ dataDir, logger: noopLogger, fetchImpl });
  const response = await request(app).get('/api/prices/AAPL');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [{ date: today, close: 123.45 }]);
});

test('GET /api/prices/:symbol rejects invalid symbol input', async () => {
  const app = createApp({ dataDir, logger: noopLogger });
  const response = await request(app).get('/api/prices/INVALID!');
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: 'INVALID_SYMBOL', message: 'Invalid symbol.' });
});

test('GET /api/prices/:symbol handles upstream fetch failures', async () => {
  const fetchImpl = async () => ({
    ok: false,
    text: async () => '',
  });
  const app = createApp({ dataDir, logger: noopLogger, fetchImpl });
  const response = await request(app).get('/api/prices/AAPL');
  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    error: 'PRICE_FETCH_FAILED',
    message: 'Failed to fetch historical prices.',
  });
});

test('GET /api/portfolio/:id returns 500 when stored data is invalid', async () => {
  const app = createApp({ dataDir, logger: noopLogger });
  writeFileSync(path.join(dataDir, 'portfolio_corrupt.json'), '{ invalid');
  const response = await request(app).get('/api/portfolio/corrupt');
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    error: 'PORTFOLIO_READ_FAILED',
    message: 'Unexpected server error',
  });
});

test('isValidPortfolioId accepts generated safe identifiers', () => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  for (let i = 0; i < 25; i += 1) {
    const length = 1 + randomInt(25);
    let candidate = '';
    for (let j = 0; j < length; j += 1) {
      candidate += alphabet[randomInt(alphabet.length)];
    }
    assert.equal(isValidPortfolioId(candidate), true);
  }
});

test('isValidPortfolioId rejects identifiers with unsafe characters', () => {
  const invalidSamples = ['../secret', 'name!', 'space id', '', '*'];
  for (const value of invalidSamples) {
    assert.equal(isValidPortfolioId(value), false);
  }
});

test('transactions are sorted deterministically by type priority', () => {
  const sameDayTransactions = [
    { id: 'zzz', date: '2024-01-01', type: 'BUY', amount: -1000 },
    { id: 'aaa', date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
    { id: 'mmm', date: '2024-01-01', type: 'SELL', amount: 500 },
    { id: 'bbb', date: '2024-01-01', type: 'WITHDRAWAL', amount: -200 },
  ];

  const sorted = sortTransactions(sameDayTransactions);

  assert.equal(sorted[0].type, 'DEPOSIT');
  assert.equal(sorted[1].type, 'BUY');
  assert.equal(sorted[2].type, 'SELL');
  assert.equal(sorted[3].type, 'WITHDRAWAL');
});

test('sorting is deterministic when called multiple times', () => {
  const transactions = [
    { id: 'b', date: '2024-01-01', type: 'BUY', amount: -500 },
    { id: 'a', date: '2024-01-01', type: 'DEPOSIT', amount: 500 },
  ];

  const sorted1 = sortTransactions(transactions);
  const sorted2 = sortTransactions(transactions);

  assert.deepEqual(sorted1, sorted2);
});

test('different dates are sorted chronologically first', () => {
  const transactions = [
    { id: 'c', date: '2024-01-03', type: 'BUY', amount: -300 },
    { id: 'a', date: '2024-01-01', type: 'SELL', amount: 100 },
    { id: 'b', date: '2024-01-02', type: 'DEPOSIT', amount: 500 },
  ];

  const sorted = sortTransactions(transactions);

  assert.equal(sorted[0].date, '2024-01-01');
  assert.equal(sorted[1].date, '2024-01-02');
  assert.equal(sorted[2].date, '2024-01-03');
});
