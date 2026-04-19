import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { randomInt } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import pino from 'pino';

import { isValidPortfolioId } from '../routes/_schemas.js';
import { readPortfolioState } from '../data/portfolioState.js';
import JsonTableStorage from '../data/storage.js';
import { sortTransactions, sortTransactionsForCashAudit } from '../finance/portfolio.js';
import { createSessionTestApp, withSession, closeApp, request } from './helpers/fastifyTestApp.js';

const silentLogger = pino({ level: 'silent' });

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-data-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function readPersistedPortfolio(id) {
  const storage = new JsonTableStorage({ dataDir, logger: silentLogger });
  return readPortfolioState(storage, id);
}

test('GET /api/portfolio/:id returns an empty payload when portfolio is not provisioned', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const response = await withSession(request(app).get('/api/portfolio/demo'));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {});
  await closeApp(app);
});

test('GET /api/portfolio/:id requires a desktop session token header', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const response = await request(app).get('/api/portfolio/demo');
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'NO_SESSION_TOKEN');
  await closeApp(app);
});

test('POST /api/portfolio/:id requires a desktop session token header', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const response = await request(app)
    .post('/api/portfolio/no_auth')
    .send({ transactions: [] });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'NO_SESSION_TOKEN');
  await closeApp(app);
});

test('POST /api/portfolio/:id persists validated portfolio payloads', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const payload = {
    transactions: [
      {
        date: '2023-12-30',
        type: 'DEPOSIT',
        amount: 1000,
      },
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
  const response = await withSession(
    request(app)
      .post('/api/portfolio/sample_01')
      .send(payload),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });

  const saved = await readPersistedPortfolio('sample_01');
  assert.equal(saved.transactions.length, 2);
  const deposit = saved.transactions.find((tx) => tx.type === 'DEPOSIT');
  assert.ok(deposit);
  assert.equal(deposit.amount, 1000);
  assert.equal(deposit.date, '2023-12-30');

  const buyTx = saved.transactions.find((tx) => tx.type === 'BUY');
  assert.ok(buyTx);
  const { uid: savedUid, createdAt, seq, ...rest } = buyTx;
  assert.equal(typeof savedUid, 'string');
  assert.ok(savedUid.length > 0);
  assert.equal(typeof createdAt, 'number');
  assert.equal(typeof seq, 'number');
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
  assert.deepEqual(saved.settings, {
    notifications: {
      email: false,
      push: true,
      signalTransitions: true,
    },
    alerts: {
      rebalance: true,
      drawdownThreshold: 15,
      marketStatus: true,
      roiFallback: true,
    },
    privacy: {
      hideBalances: false,
    },
    display: {
      currency: 'USD',
      refreshInterval: 15,
      compactTables: false,
    },
    autoClip: false,
  });
  await closeApp(app);
});

test('GET /api/portfolio/:id rejects invalid session tokens after provisioning', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  await withSession(
    request(app)
      .post('/api/portfolio/auth_check')
      .send({ transactions: [] }),
  );

  const response = await withSession(
    request(app).get('/api/portfolio/auth_check'),
    'wrong-key',
  );
  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'INVALID_SESSION_TOKEN');
  await closeApp(app);
});

test('POST /api/portfolio/:id rejects oversells when autoClip is disabled', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const payload = {
    transactions: [
      {
        date: '2023-12-31',
        type: 'DEPOSIT',
        amount: 2000,
      },
      {
        date: '2024-01-01',
        ticker: 'AAPL',
        type: 'BUY',
        amount: -1000,
        shares: 10,
        price: 100,
      },
      {
        date: '2024-01-02',
        ticker: 'AAPL',
        type: 'SELL',
        amount: 1500,
        shares: 15,
        price: 150,
      },
    ],
    settings: { autoClip: false },
  };

  const response = await withSession(
    request(app)
      .post('/api/portfolio/oversell_reject')
      .send(payload),
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'E_OVERSELL');
  await closeApp(app);
});

test('POST /api/portfolio/:id clips oversells when autoClip is enabled', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const payload = {
    transactions: [
      {
        date: '2023-12-31',
        type: 'DEPOSIT',
        amount: 3000,
      },
      {
        date: '2024-01-01',
        ticker: 'MSFT',
        type: 'BUY',
        amount: -2000,
        shares: 20,
        price: 100,
      },
      {
        date: '2024-01-02',
        ticker: 'MSFT',
        type: 'SELL',
        amount: 2500,
        shares: 25,
        price: 100,
      },
    ],
    settings: { autoClip: true },
  };

  const response = await withSession(
    request(app)
      .post('/api/portfolio/oversell_clip')
      .send(payload),
  );

  assert.equal(response.status, 200);

  const saved = await readPersistedPortfolio('oversell_clip');
  const buyTx = saved.transactions.find((tx) => tx.type === 'BUY');
  const sellTx = saved.transactions.find((tx) => tx.type === 'SELL');
  assert.ok(buyTx && sellTx);
  const { uid: buyUid, ...buy } = buyTx;
  const { uid: sellUid, ...sell } = sellTx;
  assert.ok(buyUid && sellUid);
  assert.equal(buy.shares, 20);
  assert.equal(buy.amount, -2000);
  assert.equal(sell.shares, 20);
  assert.equal(sell.quantity, -20);
  assert.equal(sell.amount, 2000);
  assert.equal(saved.settings.autoClip, true);
  assert.ok(sell.metadata?.system?.oversell_clipped);
  assert.equal(sell.metadata.system.oversell_clipped.delivered_shares, 20);
  await closeApp(app);
});

test('POST /api/portfolio/:id rejects duplicate transaction uids with a 409', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const portfolioId = 'dedupe';
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

  const response = await withSession(
    request(app).post(`/api/portfolio/${portfolioId}`).send(payload),
  );
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'DUPLICATE_TRANSACTION_UID');
  assert.match(response.body.message, /Duplicate transaction identifiers/i);
  assert.deepEqual(response.body.details, {
    portfolioId,
    duplicates: ['duplicate-id'],
  });

  const saved = await readPersistedPortfolio(portfolioId);
  assert.equal(saved, null);
  await closeApp(app);
});

test('concurrent POST requests to the same portfolio remain consistent', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
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
    payloads.map((payload) =>
      withSession(request(app).post(`/api/portfolio/${id}`).send(payload)),
    ),
  );

  const saved = await readPersistedPortfolio(id);
  assert.equal(saved.transactions.length, 1);
  const [transaction] = saved.transactions;
  assert.equal(typeof transaction.uid, 'string');
  const savedAmount = transaction.amount;
  assert.ok(
    payloads.some((payload) => payload.transactions[0].amount === savedAmount),
    'final write must match one of the submitted payloads',
  );
  await closeApp(app);
});

test('rejects invalid portfolio identifiers to prevent path traversal', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const response = await request(app).get(
    '/api/portfolio/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd',
  );
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
  assert.equal(response.body.details[0]?.path?.[0], undefined);
  await closeApp(app);
});

test('rejects non-object portfolio payloads', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const response = await withSession(
    request(app)
      .post('/api/portfolio/invalid_payload')
      .send(['not', 'an', 'object']),
  );
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
  await closeApp(app);
});

test('GET /api/prices/:symbol returns parsed historical data', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const csv = `Date,Open,High,Low,Close,Adj Close,Volume\n${today},1,1,1,123.45,123.45,1000`;
  const fetchImpl = async () => ({
    ok: true,
    text: async () => csv,
  });
  const app = await createSessionTestApp({ dataDir, logger: silentLogger, fetchImpl });
  const response = await request(app).get('/api/prices/AAPL');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [{ date: today, close: 123.45 }]);
  await closeApp(app);
});

test('GET /api/prices/:symbol rejects invalid symbol input', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const response = await request(app).get('/api/prices/INVALID!');
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: 'INVALID_SYMBOL', message: 'Invalid symbol.' });
  await closeApp(app);
});

test('GET /api/prices/:symbol handles upstream fetch failures', async () => {
  const fetchImpl = async () => ({
    ok: false,
    text: async () => '',
  });
  const app = await createSessionTestApp({ dataDir, logger: silentLogger, fetchImpl });
  const response = await request(app).get('/api/prices/AAPL');
  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    error: 'PRICE_FETCH_FAILED',
    message: 'Failed to fetch historical prices.',
  });
  await closeApp(app);
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

test('same-day transactions honor createdAt and seq tie-breakers', () => {
  const base = 1_700_000_000_000;
  const transactions = [
    {
      id: 'later',
      uid: 'uid-3',
      date: '2024-01-01',
      type: 'BUY',
      amount: -100,
      createdAt: base + 10,
      seq: 10,
    },
    {
      id: 'alpha',
      uid: 'uid-1',
      date: '2024-01-01',
      type: 'BUY',
      amount: -100,
      createdAt: base + 1,
      seq: 5,
    },
    {
      id: 'alpha',
      uid: 'uid-0',
      date: '2024-01-01',
      type: 'BUY',
      amount: -100,
      createdAt: base + 1,
      seq: 5,
    },
    {
      id: 'beta',
      uid: 'uid-2',
      date: '2024-01-01',
      type: 'BUY',
      amount: -100,
      createdAt: base + 1,
      seq: 5,
    },
    {
      id: 'earliest',
      uid: 'uid-4',
      date: '2024-01-01',
      type: 'BUY',
      amount: -100,
      createdAt: base,
      seq: 7,
    },
    {
      id: 'alpha',
      uid: 'uid-5',
      date: '2024-01-01',
      type: 'BUY',
      amount: -100,
      createdAt: base + 1,
      seq: 6,
    },
  ];

  const sorted = sortTransactions(transactions);

  assert.deepEqual(sorted.map((tx) => tx.id), [
    'earliest',
    'alpha',
    'alpha',
    'beta',
    'alpha',
    'later',
  ]);
  assert.deepEqual(sorted.map((tx) => tx.uid), [
    'uid-4',
    'uid-0',
    'uid-1',
    'uid-2',
    'uid-5',
    'uid-3',
  ]);
});

test('cash audit sorting respects actual chronology for manual same-day transactions', () => {
  const base = 1_700_000_000_000;
  const transactions = [
    {
      id: 'buy',
      date: '2024-01-01',
      type: 'BUY',
      amount: -100,
      createdAt: base + 20,
      seq: 2,
    },
    {
      id: 'sell',
      date: '2024-01-01',
      type: 'SELL',
      amount: 100,
      createdAt: base + 10,
      seq: 1,
    },
  ];

  const sorted = sortTransactionsForCashAudit(transactions);
  assert.deepEqual(sorted.map((tx) => tx.id), ['sell', 'buy']);
});

test('cash audit sorting nets imported broker days before debits', () => {
  const base = 1_700_000_000_000;
  const imported = (id, type, createdAt) => ({
    id,
    date: '2024-01-01',
    type,
    amount: type === 'BUY' ? -100 : 100,
    createdAt,
    seq: createdAt - base,
    metadata: {
      system: {
        import: {
          source: 'csv-bootstrap',
        },
      },
    },
  });

  const transactions = [
    imported('buy', 'BUY', base + 20),
    imported('sell', 'SELL', base + 10),
  ];

  const sorted = sortTransactionsForCashAudit(transactions);
  assert.deepEqual(sorted.map((tx) => tx.id), ['sell', 'buy']);
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

test('POST /api/portfolio/:id assigns deterministic metadata fields', async () => {
  const app = await createSessionTestApp({ dataDir, logger: silentLogger });
  const id = 'metadata_fields';
  const payload = {
    transactions: [
      {
        uid: 'keep-existing',
        date: '2024-02-01',
        type: 'DEPOSIT',
        amount: 1000,
        createdAt: 1_700_000_000_000,
        seq: 5,
      },
      {
        date: '2024-02-02',
        type: 'BUY',
        amount: -500,
        ticker: 'MSFT',
      },
      {
        uid: 'backdated',
        date: '2024-02-03',
        type: 'SELL',
        amount: 250,
        ticker: 'MSFT',
        createdAt: 0,
        seq: 1,
      },
    ],
  };

  const response = await withSession(
    request(app).post(`/api/portfolio/${id}`).send(payload),
  );

  assert.equal(response.status, 200);

  const saved = await readPersistedPortfolio(id);
  const createdAts = saved.transactions.map((tx) => tx.createdAt);
  const seqs = saved.transactions.map((tx) => tx.seq);

  assert.ok(createdAts.every((value) => Number.isInteger(value) && value >= 0));
  for (let index = 1; index < createdAts.length; index += 1) {
    assert.ok(
      createdAts[index] > createdAts[index - 1],
      'createdAt values must be strictly increasing',
    );
  }

  assert.equal(seqs[0], payload.transactions[0].seq);
  for (let index = 1; index < seqs.length; index += 1) {
    assert.equal(seqs[index], seqs[index - 1] + 1);
  }
  await closeApp(app);
});
