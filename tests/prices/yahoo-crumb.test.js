/**
 * Unit tests for YahooPriceProvider crumb authentication:
 *  - Crumb is fetched before first chart request
 *  - Crumb is reused within the TTL (no redundant fetches)
 *  - Cookie header is forwarded to the chart request
 *  - On 401: crumb is invalidated, refreshed, chart retried once (succeeds)
 *  - On 403: same retry behaviour as 401
 *  - Crumb refresh failure propagates as a thrown error
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { YahooPriceProvider } from '../../server/data/prices.js';

const YAHOO_CHART_JSON = {
  chart: {
    result: [
      {
        meta: { symbol: 'SPY' },
        timestamp: [1704124800], // 2024-01-01 17:00 UTC → 2024-01-01 12:00 ET
        indicators: {
          quote: [{ close: [400.0] }],
          adjclose: [{ adjclose: [398.5] }],
        },
      },
    ],
    error: null,
  },
};

/**
 * Build a fetchImpl that sequences through a list of handlers, one per call.
 * Each handler is a function (url, options) → response-like object.
 */
function buildSequentialFetch(handlers) {
  let idx = 0;
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const handler = handlers[idx];
    idx += 1;
    if (!handler) {
      throw new Error(`fetchImpl: unexpected call #${idx} to ${url}`);
    }
    return handler(url, options);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function homepageResponse(cookies = ['A1=abc123; Path=/; Secure']) {
  return {
    ok: true,
    headers: {
      getSetCookie: () => cookies,
      get: (name) => (name === 'set-cookie' ? cookies[0] : null),
    },
    text: async () => '<!DOCTYPE html><html></html>',
  };
}

function crumbResponse(crumb = 'testCrumb1234') {
  return { ok: true, text: async () => crumb };
}

function chartResponse() {
  return { ok: true, status: 200, json: async () => YAHOO_CHART_JSON };
}

test('YahooPriceProvider fetches crumb before the first chart request', async () => {
  const fetch = buildSequentialFetch([
    () => homepageResponse(), // 1. GET finance.yahoo.com
    () => crumbResponse('myCrumb'), // 2. GET getcrumb
    () => chartResponse(), // 3. GET chart
  ]);
  const provider = new YahooPriceProvider({ fetchImpl: fetch, timeoutMs: 1000 });
  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02');

  assert.equal(rows.length, 1, 'parsed one row');
  assert.equal(fetch.calls.length, 3, 'exactly three fetches: home, crumb, chart');
  assert.ok(fetch.calls[0].url.includes('finance.yahoo.com'), 'first call is homepage');
  assert.ok(fetch.calls[1].url.includes('getcrumb'), 'second call is crumb endpoint');
  assert.ok(fetch.calls[2].url.includes('query2.finance.yahoo.com'), 'third call is chart');
  assert.ok(fetch.calls[2].url.includes('crumb=myCrumb'), 'crumb appended to chart URL');
});

test('YahooPriceProvider reuses the crumb within TTL (no redundant crumb fetches)', async () => {
  const fetch = buildSequentialFetch([
    () => homepageResponse(), // 1. GET finance.yahoo.com
    () => crumbResponse('cached'), // 2. GET getcrumb
    () => chartResponse(), // 3. First chart call
    () => chartResponse(), // 4. Second chart call (no new crumb)
  ]);
  const provider = new YahooPriceProvider({ fetchImpl: fetch, timeoutMs: 1000 });
  await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02');
  await provider.getDailyAdjustedClose('AAPL', '2024-01-01', '2024-01-02');

  assert.equal(fetch.calls.length, 4, 'home+crumb once, chart twice');
  // No second homepage or crumb call
  const crumbCalls = fetch.calls.filter((c) => c.url.includes('getcrumb'));
  assert.equal(crumbCalls.length, 1, 'crumb endpoint called exactly once');
});

test('YahooPriceProvider forwards the Cookie header to the chart request', async () => {
  const fetch = buildSequentialFetch([
    () => homepageResponse(['A1=cookievalue; Path=/']),
    () => crumbResponse('aCrumb'),
    () => chartResponse(),
  ]);
  const provider = new YahooPriceProvider({ fetchImpl: fetch, timeoutMs: 1000 });
  await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02');

  const chartCall = fetch.calls[2];
  const cookieHeader = chartCall.options?.headers?.Cookie;
  assert.ok(
    typeof cookieHeader === 'string' && cookieHeader.includes('A1=cookievalue'),
    `Cookie header forwarded to chart: ${cookieHeader}`
  );
});

test('YahooPriceProvider on 401: invalidates crumb, refreshes, retries chart once (succeeds)', async () => {
  const fetch = buildSequentialFetch([
    () => homepageResponse(), // 1. Initial crumb: home
    () => crumbResponse('stale'), // 2. Initial crumb: crumb
    () => ({ ok: false, status: 401 }), // 3. Chart → 401 (stale crumb)
    () => homepageResponse(), // 4. Refresh crumb: home
    () => crumbResponse('fresh'), // 5. Refresh crumb: crumb
    () => chartResponse(), // 6. Retry chart → success
  ]);
  const provider = new YahooPriceProvider({ fetchImpl: fetch, timeoutMs: 1000 });
  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02');

  assert.equal(rows.length, 1, 'retry succeeded and returned data');
  assert.equal(fetch.calls.length, 6, 'six total fetches');

  const retryChartCall = fetch.calls[5];
  assert.ok(retryChartCall.url.includes('crumb=fresh'), 'retry uses the refreshed crumb');
});

test('YahooPriceProvider on 403: invalidates crumb, refreshes, retries chart once (succeeds)', async () => {
  const fetch = buildSequentialFetch([
    () => homepageResponse(),
    () => crumbResponse('stale403'),
    () => ({ ok: false, status: 403 }),
    () => homepageResponse(),
    () => crumbResponse('fresh403'),
    () => chartResponse(),
  ]);
  const provider = new YahooPriceProvider({ fetchImpl: fetch, timeoutMs: 1000 });
  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02');

  assert.equal(rows.length, 1);
  const retryChartCall = fetch.calls[5];
  assert.ok(retryChartCall.url.includes('crumb=fresh403'));
});

test('YahooPriceProvider crumb refresh failure propagates as a thrown error', async () => {
  const fetch = buildSequentialFetch([
    () => homepageResponse(),
    // crumb endpoint returns an empty body → crumb is too short → throws
    () => ({ ok: true, text: async () => '' }),
  ]);
  const provider = new YahooPriceProvider({ fetchImpl: fetch, timeoutMs: 1000 });
  await assert.rejects(
    () => provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02'),
    (error) => {
      assert.equal(error.code, 'PRICE_FETCH_FAILED');
      assert.match(error.message, /crumb/i);
      return true;
    }
  );
});

test('YahooPriceProvider crumb TTL expiry triggers a fresh crumb fetch', async () => {
  const fetch = buildSequentialFetch([
    () => homepageResponse(), // 1. Initial crumb: home
    () => crumbResponse('first'), // 2. Initial crumb: crumb
    () => chartResponse(), // 3. First chart call
    () => homepageResponse(), // 4. Expired TTL: home
    () => crumbResponse('second'), // 5. Expired TTL: crumb
    () => chartResponse(), // 6. Second chart call
  ]);
  // Use a very short TTL so we can expire it immediately
  const provider = new YahooPriceProvider({ fetchImpl: fetch, timeoutMs: 1000, crumbTtlMs: 1 });
  await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02');

  // Force TTL expiry by backdate fetchedAt
  provider._crumbCache.fetchedAt = Date.now() - 100;

  await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02');

  const crumbCalls = fetch.calls.filter((c) => c.url.includes('getcrumb'));
  assert.equal(crumbCalls.length, 2, 'crumb refreshed after TTL expiry');
  assert.ok(fetch.calls[5].url.includes('crumb=second'));
});
