import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import pino from 'pino';

import JsonTableStorage from '../data/storage.js';
import { createSessionTestApp, withSession, closeApp, request } from './helpers/fastifyTestApp.js';

const silentLogger = pino({ level: 'silent' });

const CACHE_TTL_SECONDS = 450;

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-cache-tests-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function seedReturnsTable(rows) {
  const storage = new JsonTableStorage({ dataDir, logger: silentLogger });
  await storage.writeTable('returns_daily', rows);
}

test('GET /api/prices/:symbol caches responses for warm hits and exposes TTL header', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const csv = `Date,Open,High,Low,Close,Volume\n${today},1,1,1,200.12,1000`;
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    return { ok: true, text: async () => csv };
  };
  const app = await createSessionTestApp({
    dataDir,
    logger: silentLogger,
    fetchImpl,
    config: {
      cache: {
        ttlSeconds: CACHE_TTL_SECONDS,
        price: { ttlSeconds: CACHE_TTL_SECONDS, checkPeriodSeconds: 60 },
      },
    },
  });

  const first = await request(app).get('/api/prices/MSFT');
  assert.equal(first.status, 200);
  assert.equal(fetchCount, 1);
  assert.equal(first.headers['cache-control'], `private, max-age=${CACHE_TTL_SECONDS}`);
  assert.equal(first.headers['x-cache'], 'MISS');
  assert.ok(Array.isArray(first.body));
  assert.equal(first.body.length, 1);

  const second = await request(app).get('/api/prices/MSFT');
  assert.equal(second.status, 200);
  assert.equal(fetchCount, 1, 'warm cache should avoid a new fetch');
  assert.deepEqual(second.body, first.body);
  assert.equal(second.headers['cache-control'], `private, max-age=${CACHE_TTL_SECONDS}`);
  assert.equal(second.headers['x-cache'], 'HIT');
  await closeApp(app);
});

test('GET /api/prices/bulk reuses warmed cache for latest-only responses', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const csv = `Date,Open,High,Low,Close,Adj Close,Volume\n${today},1,1,1,200.12,200.12,1000`;
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return { ok: true, text: async () => csv };
    }
    throw new Error('upstream unavailable');
  };
  const app = await createSessionTestApp({
    dataDir,
    logger: silentLogger,
    fetchImpl,
    config: {
      cache: {
        ttlSeconds: CACHE_TTL_SECONDS,
        price: { ttlSeconds: CACHE_TTL_SECONDS, checkPeriodSeconds: 60 },
      },
      freshness: { maxStaleTradingDays: 3 },
    },
  });

  const warm = await request(app).get('/api/prices/MSFT');
  assert.equal(warm.status, 200);
  assert.equal(fetchCount, 1);

  const fallback = await request(app).get('/api/prices/bulk?symbols=MSFT&latest=1');
  assert.equal(fallback.status, 200);
  assert.equal(fetchCount, 1, 'warmed cache should avoid an additional upstream fetch');
  assert.equal(fallback.headers['x-cache'], 'HIT');
  assert.deepEqual(fallback.body.errors, {});
  assert.equal(fallback.body.series.MSFT.length, 1);
  assert.equal(fallback.body.series.MSFT[0].close, 200.12);
  await closeApp(app);
});

test('GET /api/prices/bulk uses the configured alpaca latest quote provider for latest-only requests', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const app = await createSessionTestApp({
    dataDir,
    logger: silentLogger,
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.startsWith('https://data.alpaca.markets/v2/stocks/MSFT/snapshot')) {
        return {
          ok: true,
          json: async () => ({
            latestTrade: {
              p: 251.75,
              t: `${today}T15:15:00Z`,
            },
          }),
        };
      }
      throw new Error(`Unexpected upstream call: ${value}`);
    },
    config: {
      prices: {
        latest: {
          provider: 'alpaca',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      },
      freshness: { maxStaleTradingDays: 3 },
    },
    marketClock: () => ({
      isOpen: true,
      isBeforeOpen: false,
      isAfterClose: false,
      isTradingDay: true,
      isHoliday: false,
      isWeekend: false,
      lastTradingDate: today,
      nextTradingDate: today,
    }),
  });

  const response = await request(app).get('/api/prices/bulk?symbols=MSFT&latest=1');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.errors, {});
  assert.equal(response.body.series.MSFT.length, 1);
  assert.equal(response.body.series.MSFT[0].close, 251.75);
  assert.equal(response.body.series.MSFT[0].date, today);
  assert.equal(response.body.metadata.symbols.MSFT.provider, 'alpaca');
  assert.equal(response.body.metadata.symbols.MSFT.status, 'live');
  await closeApp(app);
});

test('GET /api/returns/daily serves cached payloads even when storage mutates', async () => {
  const baseRows = [
    {
      date: '2024-01-01',
      r_port: 0.01,
      r_ex_cash: 0.011,
      r_spy_100: 0.012,
      r_bench_blended: 0.013,
      r_cash: 0.0001,
    },
  ];
  await seedReturnsTable(baseRows);
  const app = await createSessionTestApp({
    dataDir,
    logger: silentLogger,
    config: { cache: { ttlSeconds: CACHE_TTL_SECONDS } },
  });

  const first = await request(app).get('/api/returns/daily');
  assert.equal(first.status, 200);
  assert.equal(first.headers['cache-control'], `private, max-age=${CACHE_TTL_SECONDS}`);
  assert.equal(first.body.series.r_port.length, 1);

  const mutatedRows = [
    {
      ...baseRows[0],
      r_port: 0.5,
      date: '2024-01-02',
    },
  ];
  await seedReturnsTable(mutatedRows);

  const second = await request(app).get('/api/returns/daily');
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body, 'warm cache should ignore storage mutation');
  await closeApp(app);
});

test('GET /api/returns/daily negotiates 304 when If-None-Match matches cached ETag', async () => {
  const rows = [
    {
      date: '2024-02-01',
      r_port: 0.02,
      r_ex_cash: 0.021,
      r_spy_100: 0.023,
      r_bench_blended: 0.019,
      r_cash: 0.0002,
    },
  ];
  await seedReturnsTable(rows);
  const app = await createSessionTestApp({
    dataDir,
    logger: silentLogger,
    config: { cache: { ttlSeconds: CACHE_TTL_SECONDS } },
  });

  const first = await request(app).get('/api/returns/daily');
  assert.equal(first.status, 200);
  const etag = first.headers.etag;
  assert.ok(typeof etag === 'string' && etag.length > 0);

  const second = await request(app).get('/api/returns/daily').set('If-None-Match', etag);
  assert.equal(second.status, 304);
  assert.equal(second.headers.etag, etag);
  assert.equal(second.headers['cache-control'], `private, max-age=${CACHE_TTL_SECONDS}`);
  assert.equal(second.text, '');
  await closeApp(app);
});

test('POST /api/portfolio/:id flushes cached analytics responses', async () => {
  const initialRows = [
    {
      date: '2024-03-01',
      r_port: 0.01,
      r_ex_cash: 0.015,
      r_spy_100: 0.02,
      r_bench_blended: 0.018,
      r_cash: 0.0003,
    },
  ];
  await seedReturnsTable(initialRows);
  const app = await createSessionTestApp({
    dataDir,
    logger: silentLogger,
    config: { cache: { ttlSeconds: CACHE_TTL_SECONDS } },
  });

  const first = await request(app).get('/api/returns/daily');
  assert.equal(first.status, 200);
  const initialValue = first.body.series.r_port[0].value;
  assert.equal(initialValue, initialRows[0].r_port);

  const updatedRows = [
    {
      date: '2024-03-01',
      r_port: 0.25,
      r_ex_cash: 0.03,
      r_spy_100: 0.04,
      r_bench_blended: 0.033,
      r_cash: 0.0004,
    },
  ];
  await seedReturnsTable(updatedRows);

  const cached = await request(app).get('/api/returns/daily');
  assert.equal(cached.status, 200);
  assert.equal(
    cached.body.series.r_port[0].value,
    initialValue,
    'cache should still serve stale data before invalidation'
  );

  const payload = {
    transactions: [],
    signals: {},
    settings: { autoClip: false },
    cash: { currency: 'USD', apyTimeline: [] },
  };
  const saveResponse = await withSession(
    request(app).post('/api/portfolio/cache-test').send(payload)
  );
  assert.equal(saveResponse.status, 200);

  const refreshed = await request(app).get('/api/returns/daily');
  assert.equal(refreshed.status, 200);
  assert.equal(
    refreshed.body.series.r_port[0].value,
    updatedRows[0].r_port,
    'portfolio save should flush cached analytics data'
  );
  await closeApp(app);
});

async function seedNavTable(rows) {
  const storage = new JsonTableStorage({ dataDir, logger: silentLogger });
  await storage.writeTable('nav_snapshots', rows);
}

async function seedRoiTable(rows) {
  const storage = new JsonTableStorage({ dataDir, logger: silentLogger });
  await storage.writeTable('roi_daily', rows);
}

async function seedPortfolio(id, data) {
  const storage = new JsonTableStorage({ dataDir, logger: silentLogger });
  const { writePortfolioState } = await import('../data/portfolioState.js');
  await writePortfolioState(storage, id, data);
}

test('caching and invalidation for all daily analytics endpoints', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const baseReturns = [
    {
      date: today,
      portfolio_id: 'test-port',
      r_port: 0.05,
      r_ex_cash: 0.055,
      r_spy_100: 0.06,
      r_bench_blended: 0.065,
      r_cash: 0.0005,
    },
  ];
  const baseNav = [
    {
      date: today,
      portfolio_id: 'test-port',
      portfolio_nav: 10000,
      ex_cash_nav: 9000,
      cash_balance: 1000,
      risk_assets_value: 9000,
      stale_price: 0,
    },
  ];
  const baseRoi = [
    {
      date: today,
      portfolio_id: 'test-port',
      portfolio_nav: 10000,
      net_contributions: 9500,
      roi_portfolio_pct: 5.26,
      roi_sp500_pct: 6.0,
      roi_ndx_pct: 7.0,
      source: 'reconstructed',
      updated_at: new Date().toISOString(),
    },
  ];

  await seedReturnsTable(baseReturns);
  await seedNavTable(baseNav);
  await seedRoiTable(baseRoi);
  await seedPortfolio('test-port', {
    transactions: [],
    signals: {},
    settings: { displayName: 'Test Portfolio' },
    cash: { currency: 'USD', apyTimeline: [] },
  });
  await seedPortfolio('other-port', {
    transactions: [],
    signals: {},
    settings: { displayName: 'Other Portfolio' },
    cash: { currency: 'USD', apyTimeline: [] },
  });

  const app = await createSessionTestApp({
    dataDir,
    logger: silentLogger,
    config: { cache: { ttlSeconds: CACHE_TTL_SECONDS } },
  });

  // Query and assert initial cached responses
  const resNav1 = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(resNav1.status, 200);
  assert.equal(resNav1.body.data[0].portfolio_nav, 10000);

  const resRoi1 = await request(app).get('/api/roi/daily?portfolioId=test-port');
  assert.equal(resRoi1.status, 200);
  assert.ok(Array.isArray(resRoi1.body.series.portfolio));

  const resBench1 = await request(app).get('/api/benchmarks/summary?portfolioId=test-port');
  assert.equal(resBench1.status, 200);

  const resCompare1 = await withSession(
    request(app)
      .post('/api/analytics/compare')
      .send({
        portfolioIds: ['test-port', 'other-port'],
      })
  );
  assert.equal(resCompare1.status, 200);

  // 1. Mutate data in storage (verify cache serves stale data)
  const updatedNav = [
    {
      ...baseNav[0],
      portfolio_nav: 20000,
    },
  ];
  await seedNavTable(updatedNav);

  const resNavCached = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(resNavCached.status, 200);
  assert.equal(resNavCached.body.data[0].portfolio_nav, 10000, 'should return cached stale value');

  // 2. Test PUT /api/portfolio/:id (Rename portfolio)
  const renameRes = await withSession(
    request(app).put('/api/portfolio/test-port').send({ displayName: 'Renamed Portfolio' })
  );
  assert.equal(renameRes.status, 200);

  const resNavAfterRename = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(resNavAfterRename.status, 200);
  assert.equal(
    resNavAfterRename.body.data[0].portfolio_nav,
    20000,
    'cache should be flushed by PUT'
  );

  // 3. Test POST /api/portfolio/:id/transactions
  const updatedNav2 = [
    {
      ...baseNav[0],
      portfolio_nav: 30000,
    },
  ];
  await seedNavTable(updatedNav2);

  const resNavCached2 = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(resNavCached2.body.data[0].portfolio_nav, 20000, 'should return cached stale value');

  const appendRes = await withSession(
    request(app).post('/api/portfolio/test-port/transactions').send({ transactions: [] })
  );
  assert.equal(appendRes.status, 200);

  const resNavAfterAppend = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(
    resNavAfterAppend.body.data[0].portfolio_nav,
    30000,
    'cache should be flushed by transactions append'
  );

  // 4. Test POST /api/portfolio/:id/cashRates
  const updatedNav3 = [
    {
      ...baseNav[0],
      portfolio_nav: 40000,
    },
  ];
  await seedNavTable(updatedNav3);

  const resNavCached3 = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(resNavCached3.body.data[0].portfolio_nav, 30000, 'should return cached stale value');

  const cashRatesRes = await withSession(
    request(app).post('/api/portfolio/test-port/cashRates').send({ cashRates: [] })
  );
  assert.equal(cashRatesRes.status, 200);

  const resNavAfterCashRates = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(
    resNavAfterCashRates.body.data[0].portfolio_nav,
    40000,
    'cache should be flushed by cashRates'
  );

  // 5. Test POST /api/portfolio/:id/duplicate
  const updatedNav4 = [
    {
      ...baseNav[0],
      portfolio_nav: 50000,
    },
  ];
  await seedNavTable(updatedNav4);

  const resNavCached4 = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(resNavCached4.body.data[0].portfolio_nav, 40000, 'should return cached stale value');

  const duplicateRes = await withSession(
    request(app).post('/api/portfolio/test-port/duplicate').send({ newId: 'duplicated-port' })
  );
  assert.equal(duplicateRes.status, 200);

  const resNavAfterDuplicate = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(
    resNavAfterDuplicate.body.data[0].portfolio_nav,
    50000,
    'cache should be flushed by duplicate'
  );

  // 6. Test POST /api/import/csv
  const updatedNav5 = [
    {
      ...baseNav[0],
      portfolio_nav: 60000,
    },
  ];
  await seedNavTable(updatedNav5);

  const resNavCached5 = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(resNavCached5.body.data[0].portfolio_nav, 50000, 'should return cached stale value');

  const csvImportRes = await withSession(
    request(app).post('/api/import/csv').send({
      portfolioId: 'test-port',
      dryRun: false,
      profile: 'generic',
      fileContents: 'date,type,ticker,shares,price,amount\n2024-01-01,BUY,AAPL,10,150,1500',
    })
  );
  if (csvImportRes.status !== 200) {
    console.error('CSV IMPORT FAILURE:', csvImportRes.text, csvImportRes.body);
  }
  assert.equal(csvImportRes.status, 200);

  const resNavAfterCsvImport = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(
    resNavAfterCsvImport.body.data[0].portfolio_nav,
    60000,
    'cache should be flushed by CSV import'
  );

  // 7. Test DELETE /api/portfolio/:id
  const updatedNav6 = [
    {
      ...baseNav[0],
      portfolio_nav: 70000,
    },
  ];
  await seedNavTable(updatedNav6);

  const resNavCached6 = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(resNavCached6.body.data[0].portfolio_nav, 60000, 'should return cached stale value');

  const deleteRes = await withSession(request(app).delete('/api/portfolio/other-port'));
  assert.equal(deleteRes.status, 200);

  const resNavAfterDelete = await request(app).get('/api/nav/daily?portfolioId=test-port');
  assert.equal(
    resNavAfterDelete.body.data[0].portfolio_nav,
    70000,
    'cache should be flushed by DELETE'
  );

  await closeApp(app);
});
