import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import JsonTableStorage from '../data/storage.js';
import { writePortfolioState } from '../data/portfolioState.js';
import { runDailyClose } from '../jobs/daily_close.js';
import { createApp } from '../app.js';

const noopLogger = { info() {}, warn() {}, error() {} };

class FakePriceProvider {
  constructor(pricesBySymbol) {
    this.pricesBySymbol = pricesBySymbol;
  }

  async getDailyAdjustedClose(symbol, from, to) {
    const data = this.pricesBySymbol[symbol] ?? [];
    return data.filter((row) => row.date >= from && row.date <= to);
  }
}

let dataDir;
let storage;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'job-test-'));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable('transactions', []);
  await storage.ensureTable('cash_rates', []);
  await storage.ensureTable('prices', []);
  await storage.ensureTable('returns_daily', []);
  await storage.ensureTable('nav_snapshots', []);
  await storage.ensureTable('roi_daily', []);
  await storage.ensureTable('roi_sync_state', []);
  await storage.ensureTable('jobs_state', []);
  await storage.ensureTable('cash_interest_accruals', []);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('runDailyClose accrues interest and is idempotent', async () => {
  await storage.upsertRow(
    'cash_rates',
    { effective_date: '2023-12-01', apy: 0.0365 },
    ['effective_date'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'b1', type: 'BUY', ticker: 'SPY', date: '2024-01-01', quantity: 5, amount: 500 },
    ['id'],
  );

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      { date: '2024-01-02', adjClose: 101 },
      { date: '2024-01-03', adjClose: 102 },
    ],
  });

  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-02T00:00:00Z'),
    priceProvider: provider,
  });
  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
  });
  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
  });

  const transactions = await storage.readTable('transactions');
  const interest = transactions.filter((tx) => tx.type === 'INTEREST');
  assert.equal(interest.length, 2);

  const returns = await storage.readTable('returns_daily');
  assert.ok(returns.find((row) => row.date === '2024-01-02'));
  assert.ok(returns.find((row) => row.date === '2024-01-03'));
});

test('runDailyClose posts a single monthly interest entry when enabled', async () => {
  await storage.upsertRow(
    'cash_rates',
    { effective_date: '2023-12-01', apy: 0.0365 },
    ['effective_date'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 10000 },
    ['id'],
  );

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      { date: '2024-01-31', adjClose: 101 },
    ],
  });

  const config = {
    featureFlags: { cashBenchmarks: true, monthlyCashPosting: true },
    cash: { postingDay: 'last' },
  };

  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-02T00:00:00Z'),
    priceProvider: provider,
    config,
  });
  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-31T00:00:00Z'),
    priceProvider: provider,
    config,
  });

  const transactions = await storage.readTable('transactions');
  const interest = transactions.filter((tx) => tx.type === 'INTEREST');
  assert.equal(interest.length, 1);
  assert.equal(interest[0].note, 'Automated monthly cash interest posting');
  assert.ok(interest[0].amount > 0);
});

test('runDailyClose persists actionable signal transitions once per trading day', async () => {
  await writePortfolioState(storage, 'signals-desktop', {
    transactions: [
      { uid: 'd1', date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
      { uid: 'b1', date: '2024-01-02', type: 'BUY', ticker: 'AAPL', amount: -500, price: 100, shares: 5, quantity: 5 },
    ],
    signals: { AAPL: { pct: 5 } },
    settings: {
      notifications: {
        email: true,
        push: true,
        signalTransitions: true,
      },
    },
  });

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-02', adjClose: 100 },
      { date: '2024-01-03', adjClose: 101 },
    ],
    AAPL: [
      { date: '2024-01-02', adjClose: 100 },
      { date: '2024-01-03', adjClose: 94 },
    ],
  });

  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
  });
  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
  });

  const stateRows = await storage.readTable('signal_notification_states');
  assert.equal(stateRows.length, 1);
  assert.equal(stateRows[0].portfolio_id, 'signals-desktop');
  assert.equal(stateRows[0].ticker, 'AAPL');
  assert.equal(stateRows[0].status, 'BUY_ZONE');
  assert.equal(stateRows[0].current_price_as_of, '2024-01-03');

  const notifications = await storage.readTable('signal_notifications');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].ticker, 'AAPL');
  assert.equal(notifications[0].status, 'BUY_ZONE');
  assert.equal(notifications[0].delivery.email.status, 'pending');
});

test('runDailyClose delivers pending signal notification emails once when configured', async () => {
  await writePortfolioState(storage, 'signals-email', {
    transactions: [
      { uid: 'd1', date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
      { uid: 'b1', date: '2024-01-02', type: 'BUY', ticker: 'AAPL', amount: -500, price: 100, shares: 5, quantity: 5 },
    ],
    signals: { AAPL: { pct: 5 } },
    settings: {
      notifications: {
        email: true,
        push: true,
        signalTransitions: true,
      },
    },
  });

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-02', adjClose: 100 },
      { date: '2024-01-03', adjClose: 101 },
    ],
    AAPL: [
      { date: '2024-01-02', adjClose: 100 },
      { date: '2024-01-03', adjClose: 94 },
    ],
  });
  const sentNotificationIds = [];
  const notificationMailer = {
    enabled: true,
    configured: true,
    async sendSignalNotification(notification) {
      sentNotificationIds.push(notification.id);
      return { messageId: 'message-1' };
    },
  };
  const config = {
    featureFlags: { cashBenchmarks: true },
    notifications: {
      emailDelivery: {
        enabled: true,
        configured: true,
        from: 'alerts@example.com',
        to: ['investor@example.com'],
        transport: {
          host: '127.0.0.1',
          port: 1025,
          secure: false,
          auth: {},
        },
      },
    },
  };

  const firstRun = await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
    config,
    notificationMailer,
  });
  const secondRun = await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
    config,
    notificationMailer,
  });

  assert.deepEqual(sentNotificationIds.length, 1);
  assert.deepEqual(firstRun.signalNotifications.emailDelivery, {
    attempted: 1,
    delivered: 1,
    failed: 0,
    exhausted: 0,
    skipped: null,
  });
  assert.deepEqual(secondRun.signalNotifications.emailDelivery, {
    attempted: 0,
    delivered: 0,
    failed: 0,
    exhausted: 0,
    skipped: null,
  });

  const notifications = await storage.readTable('signal_notifications');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].delivery.email.status, 'delivered');
  assert.equal(notifications[0].delivery.email.attempts, 1);
  assert.ok(typeof notifications[0].delivery.email.lastAttemptAt === 'string');
  assert.ok(typeof notifications[0].delivery.email.deliveredAt === 'string');
  assert.equal(notifications[0].delivery.email.messageId, 'message-1');
});

test('runDailyClose retries eligible failed signal notification emails on the existing job path', async () => {
  await writePortfolioState(storage, 'signals-retry', {
    transactions: [
      { uid: 'd1', date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
      { uid: 'b1', date: '2024-01-02', type: 'BUY', ticker: 'AAPL', amount: -500, price: 100, shares: 5, quantity: 5 },
    ],
    signals: { AAPL: { pct: 5 } },
    settings: {
      notifications: {
        email: true,
        push: true,
        signalTransitions: true,
      },
    },
  });

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-02', adjClose: 100 },
      { date: '2024-01-03', adjClose: 101 },
    ],
    AAPL: [
      { date: '2024-01-02', adjClose: 100 },
      { date: '2024-01-03', adjClose: 94 },
    ],
  });
  const retryConfig = {
    featureFlags: { cashBenchmarks: true },
    notifications: {
      emailDelivery: {
        enabled: true,
        configured: true,
        from: 'alerts@example.com',
        to: ['investor@example.com'],
        retry: {
          maxAttempts: 3,
          minDelayMs: 0,
          backoffMultiplier: 2,
          automaticRetries: true,
        },
        transport: {
          host: '127.0.0.1',
          port: 1025,
          secure: false,
          auth: {},
        },
      },
    },
  };

  const firstRun = await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
    config: retryConfig,
    notificationMailer: {
      enabled: true,
      configured: true,
      async sendSignalNotification() {
        throw Object.assign(new Error('SMTP unavailable'), { code: 'ECONNREFUSED' });
      },
    },
  });
  const secondRun = await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
    config: retryConfig,
    notificationMailer: {
      enabled: true,
      configured: true,
      async sendSignalNotification() {
        return { messageId: 'retried-message-1' };
      },
    },
  });
  const thirdRun = await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
    config: retryConfig,
    notificationMailer: {
      enabled: true,
      configured: true,
      async sendSignalNotification() {
        throw new Error('should not retry after delivery');
      },
    },
  });

  assert.deepEqual(firstRun.signalNotifications.emailDelivery, {
    attempted: 1,
    delivered: 0,
    failed: 1,
    exhausted: 0,
    skipped: null,
  });
  assert.deepEqual(secondRun.signalNotifications.emailDelivery, {
    attempted: 1,
    delivered: 1,
    failed: 0,
    exhausted: 0,
    skipped: null,
  });
  assert.deepEqual(thirdRun.signalNotifications.emailDelivery, {
    attempted: 0,
    delivered: 0,
    failed: 0,
    exhausted: 0,
    skipped: null,
  });

  const notifications = await storage.readTable('signal_notifications');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].delivery.email.status, 'delivered');
  assert.equal(notifications[0].delivery.email.attempts, 2);
  assert.equal(notifications[0].delivery.email.messageId, 'retried-message-1');
});

test('runDailyClose marks failed signal notification emails as exhausted after the retry limit', async () => {
  await writePortfolioState(storage, 'signals-exhausted', {
    transactions: [
      { uid: 'd1', date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
      { uid: 'b1', date: '2024-01-02', type: 'BUY', ticker: 'AAPL', amount: -500, price: 100, shares: 5, quantity: 5 },
    ],
    signals: { AAPL: { pct: 5 } },
    settings: {
      notifications: {
        email: true,
        push: true,
        signalTransitions: true,
      },
    },
  });

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-02', adjClose: 100 },
      { date: '2024-01-03', adjClose: 101 },
    ],
    AAPL: [
      { date: '2024-01-02', adjClose: 100 },
      { date: '2024-01-03', adjClose: 94 },
    ],
  });
  const retryConfig = {
    featureFlags: { cashBenchmarks: true },
    notifications: {
      emailDelivery: {
        enabled: true,
        configured: true,
        from: 'alerts@example.com',
        to: ['investor@example.com'],
        retry: {
          maxAttempts: 2,
          minDelayMs: 0,
          backoffMultiplier: 2,
          automaticRetries: true,
        },
        transport: {
          host: '127.0.0.1',
          port: 1025,
          secure: false,
          auth: {},
        },
      },
    },
  };
  const failingMailer = {
    enabled: true,
    configured: true,
    async sendSignalNotification() {
      throw Object.assign(new Error('Still failing'), { code: 'ETIMEDOUT' });
    },
  };

  const firstRun = await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
    config: retryConfig,
    notificationMailer: failingMailer,
  });
  const secondRun = await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
    config: retryConfig,
    notificationMailer: failingMailer,
  });
  const thirdRun = await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
    config: retryConfig,
    notificationMailer: {
      enabled: true,
      configured: true,
      async sendSignalNotification() {
        throw new Error('should not retry after exhaustion');
      },
    },
  });

  assert.deepEqual(firstRun.signalNotifications.emailDelivery, {
    attempted: 1,
    delivered: 0,
    failed: 1,
    exhausted: 0,
    skipped: null,
  });
  assert.deepEqual(secondRun.signalNotifications.emailDelivery, {
    attempted: 1,
    delivered: 0,
    failed: 0,
    exhausted: 1,
    skipped: null,
  });
  assert.deepEqual(thirdRun.signalNotifications.emailDelivery, {
    attempted: 0,
    delivered: 0,
    failed: 0,
    exhausted: 0,
    skipped: null,
  });

  const notifications = await storage.readTable('signal_notifications');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].delivery.email.status, 'exhausted');
  assert.equal(notifications[0].delivery.email.attempts, 2);
  assert.equal(notifications[0].delivery.email.nextRetryAt, null);
  assert.ok(typeof notifications[0].delivery.email.exhaustedAt === 'string');
});

test('API endpoints expose computed series', async () => {
  await storage.upsertRow(
    'cash_rates',
    { effective_date: '2023-12-01', apy: 0.0365 },
    ['effective_date'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      { date: '2024-01-02', adjClose: 101 },
    ],
    QQQ: [
      { date: '2024-01-01', adjClose: 200 },
      { date: '2024-01-02', adjClose: 202 },
    ],
  });
  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-02T00:00:00Z'),
    priceProvider: provider,
  });

  const app = createApp({
    dataDir,
    logger: noopLogger,
    config: { featureFlags: { cashBenchmarks: true } },
  });
  const returnsResponse = await request(app).get(
    '/api/returns/daily?from=2024-01-01&to=2024-01-02&views=port,bench',
  );
  assert.equal(returnsResponse.status, 200);
  assert.ok(Array.isArray(returnsResponse.body.series.r_port));
  assert.ok(returnsResponse.body.meta);

  const roiResponse = await request(app).get(
    '/api/roi/daily?from=2024-01-01&to=2024-01-02',
  );
  assert.equal(roiResponse.status, 200);
  assert.ok(Array.isArray(roiResponse.body.series.portfolio));
  assert.ok(Array.isArray(roiResponse.body.series.portfolioTwr));
  assert.equal(roiResponse.body.series.portfolioTwr[0]?.value ?? null, 0);
  assert.equal(roiResponse.body.meta.primaryMetric, 'portfolio');
  assert.equal(roiResponse.body.meta.secondaryMetric, 'portfolioTwr');

  const navResponse = await request(app).get(
    '/api/nav/daily?from=2024-01-02&to=2024-01-02',
  );
  assert.equal(navResponse.status, 200);
  assert.ok(Array.isArray(navResponse.body.data));
  assert.ok(navResponse.body.data.length > 0);
  assert.equal(navResponse.body.data[0].stale_price, false);

  const summaryResponse = await request(app).get(
    '/api/benchmarks/summary?from=2024-01-01&to=2024-01-02',
  );
  assert.equal(summaryResponse.status, 200);
  assert.ok(summaryResponse.body.summary);
  assert.ok(summaryResponse.body.money_weighted);
  assert.equal(summaryResponse.body.money_weighted.method, 'xirr');
  const postRate = await request(app)
    .post('/api/admin/cash-rate')
    .send({ effective_date: '2024-01-15', apy: 0.04 });
  assert.equal(postRate.status, 200);
});

test('returns endpoint auto-repairs historical rows when returns tables are empty', async () => {
  await storage.upsertRow(
    'cash_rates',
    { effective_date: '2023-12-01', apy: 0.0365 },
    ['effective_date'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'b1', type: 'BUY', ticker: 'QQQ', date: '2024-01-02', quantity: 2, amount: 400 },
    ['id'],
  );

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      { date: '2024-01-02', adjClose: 101 },
      { date: '2024-01-03', adjClose: 102 },
    ],
    QQQ: [
      { date: '2024-01-01', adjClose: 200 },
      { date: '2024-01-02', adjClose: 205 },
      { date: '2024-01-03', adjClose: 210 },
    ],
  });

  const app = createApp({
    dataDir,
    logger: noopLogger,
    priceProvider: provider,
    config: { featureFlags: { cashBenchmarks: true } },
  });

  const response = await request(app).get(
    '/api/returns/daily?from=2024-01-01&to=2024-01-03&views=port,spy,bench',
  );

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.series.r_port));
  assert.ok(response.body.series.r_port.length > 0);

  const returns = await storage.readTable('returns_daily');
  const navSnapshots = await storage.readTable('nav_snapshots');
  assert.ok(returns.length > 0);
  assert.ok(navSnapshots.length > 0);
});

test('roi endpoint repairs missing canonical benchmark returns even when imported roi rows already exist', async () => {
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000, portfolio_id: 'desktop' },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'b1', type: 'BUY', ticker: 'QQQ', date: '2024-01-02', quantity: 2, amount: 400, portfolio_id: 'desktop' },
    ['id'],
  );
  await storage.writeTable('roi_daily', [
    {
      portfolio_id: 'desktop',
      date: '2024-01-01',
      portfolio_nav: 1000,
      net_contributions: 1000,
      roi_portfolio_pct: 0,
      roi_sp500_pct: null,
      roi_ndx_pct: null,
      source: 'r2_import',
      updated_at: '2024-01-03T00:00:00.000Z',
    },
    {
      portfolio_id: 'desktop',
      date: '2024-01-02',
      portfolio_nav: 1010,
      net_contributions: 1000,
      roi_portfolio_pct: 1,
      roi_sp500_pct: null,
      roi_ndx_pct: null,
      source: 'r2_import',
      updated_at: '2024-01-03T00:00:00.000Z',
    },
  ]);

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      { date: '2024-01-02', adjClose: 101 },
      { date: '2024-01-03', adjClose: 102 },
    ],
    QQQ: [
      { date: '2024-01-01', adjClose: 200 },
      { date: '2024-01-02', adjClose: 205 },
      { date: '2024-01-03', adjClose: 210 },
    ],
  });

  const app = createApp({
    dataDir,
    logger: noopLogger,
    priceProvider: provider,
    config: { featureFlags: { cashBenchmarks: true } },
  });

  const response = await request(app).get(
    '/api/roi/daily?portfolioId=desktop&from=2024-01-01&to=2024-01-03',
  );

  assert.equal(response.status, 200);
  assert.ok(response.body.series.spy.length > 0);
  assert.ok(response.body.series.qqq.length > 0);
  assert.ok(response.body.series.bench.length > 0);
  assert.ok(response.body.series.spy.some((point) => point.value !== 0));
  assert.ok(response.body.series.qqq.some((point) => point.value !== 0));
  assert.equal(response.body.meta.benchmarkHealth.spy.available, true);
  assert.equal(response.body.meta.benchmarkHealth.qqq.available, true);
  assert.equal(response.body.meta.benchmarkHealth.blended.available, true);

  const repairedReturns = await storage.readTable('returns_daily');
  const desktopReturns = repairedReturns.filter((row) => row.portfolio_id === 'desktop');
  assert.ok(desktopReturns.length > 0);
  assert.ok(desktopReturns.every((row) => Number.isFinite(row.r_spy_100)));
  assert.ok(desktopReturns.every((row) => Number.isFinite(row.r_qqq_100)));
  assert.ok(desktopReturns.every((row) => Number.isFinite(row.r_bench_blended)));
});

test('roi endpoint repairs legacy flat-zero qqq benchmark rows when QQQ price history moved', async () => {
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000, portfolio_id: 'desktop' },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'b1', type: 'BUY', ticker: 'QQQ', date: '2024-01-02', quantity: 2, amount: 400, portfolio_id: 'desktop' },
    ['id'],
  );
  await storage.writeTable('roi_daily', [
    {
      portfolio_id: 'desktop',
      date: '2024-01-01',
      portfolio_nav: 1000,
      net_contributions: 1000,
      roi_portfolio_pct: 0,
      roi_sp500_pct: null,
      roi_ndx_pct: null,
      source: 'r2_import',
      updated_at: '2024-01-03T00:00:00.000Z',
    },
    {
      portfolio_id: 'desktop',
      date: '2024-01-02',
      portfolio_nav: 1010,
      net_contributions: 1000,
      roi_portfolio_pct: 1,
      roi_sp500_pct: null,
      roi_ndx_pct: null,
      source: 'r2_import',
      updated_at: '2024-01-03T00:00:00.000Z',
    },
  ]);
  await storage.writeTable('returns_daily', [
    {
      portfolio_id: 'desktop',
      date: '2024-01-01',
      r_port: 0,
      r_ex_cash: 0,
      r_bench_blended: 0,
      r_spy_100: 0,
      r_qqq_100: 0,
      r_cash: 0,
      updated_at: '2024-01-03T00:00:00.000Z',
    },
    {
      portfolio_id: 'desktop',
      date: '2024-01-02',
      r_port: 0.01,
      r_ex_cash: 0.01,
      r_bench_blended: 0.01,
      r_spy_100: 0.01,
      r_qqq_100: 0,
      r_cash: 0,
      updated_at: '2024-01-03T00:00:00.000Z',
    },
  ]);
  await storage.writeTable('prices', [
    { ticker: 'SPY', date: '2024-01-01', adj_close: 100, updated_at: '2024-01-03T00:00:00.000Z' },
    { ticker: 'SPY', date: '2024-01-02', adj_close: 101, updated_at: '2024-01-03T00:00:00.000Z' },
    { ticker: 'QQQ', date: '2024-01-01', adj_close: 200, updated_at: '2024-01-03T00:00:00.000Z' },
    { ticker: 'QQQ', date: '2024-01-02', adj_close: 205, updated_at: '2024-01-03T00:00:00.000Z' },
  ]);

  const app = createApp({
    dataDir,
    logger: noopLogger,
    config: { featureFlags: { cashBenchmarks: true } },
  });

  const response = await request(app).get(
    '/api/roi/daily?portfolioId=desktop&from=2024-01-01&to=2024-01-02',
  );

  assert.equal(response.status, 200);
  assert.ok(response.body.series.qqq.some((point) => point.value !== 0));

  const repairedReturns = await storage.readTable('returns_daily');
  const desktopReturns = repairedReturns.filter((row) => row.portfolio_id === 'desktop');
  assert.ok(desktopReturns.some((row) => Math.abs(Number(row.r_qqq_100)) > 1e-8));
});

test('roi endpoint repairs legacy inception returns that still start below zero on day zero', async () => {
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000, portfolio_id: 'desktop' },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    {
      id: 'b1',
      type: 'BUY',
      ticker: 'SPY',
      date: '2024-01-01',
      quantity: 1,
      amount: 1000,
      portfolio_id: 'desktop',
    },
    ['id'],
  );
  await storage.writeTable('roi_daily', [
    {
      portfolio_id: 'desktop',
      date: '2024-01-01',
      portfolio_nav: 980,
      net_contributions: 1000,
      roi_portfolio_pct: -2,
      roi_sp500_pct: null,
      roi_ndx_pct: null,
      source: 'r2_import',
      updated_at: '2024-01-02T00:00:00.000Z',
    },
    {
      portfolio_id: 'desktop',
      date: '2024-01-02',
      portfolio_nav: 990,
      net_contributions: 1000,
      roi_portfolio_pct: -1,
      roi_sp500_pct: null,
      roi_ndx_pct: null,
      source: 'r2_import',
      updated_at: '2024-01-02T00:00:00.000Z',
    },
  ]);
  await storage.writeTable('returns_daily', [
    {
      portfolio_id: 'desktop',
      date: '2024-01-01',
      r_port: -0.02,
      r_ex_cash: 0.98,
      r_bench_blended: 0,
      r_spy_100: 0,
      r_cash: 0,
      updated_at: '2024-01-02T00:00:00.000Z',
    },
    {
      portfolio_id: 'desktop',
      date: '2024-01-02',
      r_port: 0.01,
      r_ex_cash: 0.01,
      r_bench_blended: 0.01,
      r_spy_100: 0.01,
      r_cash: 0,
      updated_at: '2024-01-02T00:00:00.000Z',
    },
  ]);

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 980 },
      { date: '2024-01-02', adjClose: 990 },
      { date: '2024-01-03', adjClose: 995 },
    ],
  });

  const app = createApp({
    dataDir,
    logger: noopLogger,
    priceProvider: provider,
    config: { featureFlags: { cashBenchmarks: true } },
  });

  const response = await request(app).get(
    '/api/roi/daily?portfolioId=desktop&from=2024-01-01&to=2024-01-02',
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.series.portfolio[0]?.value ?? null, 0);
  assert.equal(response.body.series.portfolioTwr[0]?.value ?? null, 0);
  assert.equal(response.body.series.exCash[0]?.value ?? null, 0);

  const repairedReturns = await storage.readTable('returns_daily');
  const firstReturn = repairedReturns.find(
    (row) => row.portfolio_id === 'desktop' && row.date === '2024-01-01',
  );
  assert.equal(firstReturn?.r_port ?? null, 0);
  assert.equal(firstReturn?.r_ex_cash ?? null, 0);
});

test('historical repair keeps portfolio dates even when SPY history ends earlier', async () => {
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'b1', type: 'BUY', ticker: 'QQQ', date: '2024-01-02', quantity: 2, amount: 400 },
    ['id'],
  );

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      { date: '2024-01-02', adjClose: 101 },
    ],
    QQQ: [
      { date: '2024-01-01', adjClose: 200 },
      { date: '2024-01-02', adjClose: 205 },
      { date: '2024-01-03', adjClose: 210 },
    ],
  });

  const app = createApp({
    dataDir,
    logger: noopLogger,
    priceProvider: provider,
    config: { featureFlags: { cashBenchmarks: true } },
  });

  const roiResponse = await request(app).get(
    '/api/roi/daily?from=2024-01-01&to=2024-01-03',
  );
  assert.equal(roiResponse.status, 200);
  assert.equal(roiResponse.body.series.portfolio.at(-1)?.date, '2024-01-03');

  const returnsResponse = await request(app).get(
    '/api/returns/daily?from=2024-01-01&to=2024-01-03&views=port,spy,bench',
  );
  assert.equal(returnsResponse.status, 200);
  assert.equal(returnsResponse.body.series.r_port.at(-1)?.date, '2024-01-03');

  const navSnapshots = await storage.readTable('nav_snapshots');
  const repairedDates = navSnapshots.map((row) => row.date).sort();
  assert.ok(repairedDates.includes('2024-01-03'));
});

test('stale prices set flag when latest close missing', async () => {
  await storage.upsertRow(
    'cash_rates',
    { effective_date: '2023-12-01', apy: 0.02 },
    ['effective_date'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'b1', type: 'BUY', ticker: 'SPY', date: '2024-01-01', quantity: 5, amount: 500 },
    ['id'],
  );

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      // intentionally missing 2024-01-02 to force carry forward
    ],
  });

  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-02T00:00:00Z'),
    priceProvider: provider,
  });

  const navSnapshots = await storage.readTable('nav_snapshots');
  const target = navSnapshots.find((row) => row.date === '2024-01-02');
  assert.ok(target);
  assert.equal(target.stale_price, true);
});

test('runDailyClose persists configured benchmark prices even without holdings', async () => {
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      { date: '2024-01-02', adjClose: 101 },
    ],
    QQQ: [
      { date: '2024-01-01', adjClose: 200 },
      { date: '2024-01-02', adjClose: 202 },
    ],
  });

  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-02T00:00:00Z'),
    priceProvider: provider,
    config: {
      benchmarks: {
        tickers: ['QQQ'],
        defaultSelection: ['qqq'],
      },
    },
  });

  const prices = await storage.readTable('prices');
  assert.ok(prices.find((row) => row.ticker === 'QQQ' && row.date === '2024-01-02'));
  assert.ok(prices.find((row) => row.ticker === 'SPY' && row.date === '2024-01-02'));
});
