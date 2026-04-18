/**
 * server/__tests__/helpers/fastifyTestApp.js
 *
 * Drop-in test infrastructure for Fastify — replaces Express createApp / supertest.
 *
 * Exports:
 *   buildFastifyApp(opts)          — async, returns a ready FastifyInstance
 *   createSessionTestApp(opts)     — async, adds session-auth defaults
 *   request(app)                   — supertest-compatible chainable adapter
 *   withSession(chain, token, hdr) — same interface as the Express sessionTestUtils
 *   closeApp(app)                  — calls app.close()
 *
 * Config mapping:
 *   The Express tests pass a partial config object. buildTestConfig() fills every
 *   required ServerConfig field so the Fastify factory never throws for missing keys.
 *
 * Price provider shim:
 *   Express tests pass priceProvider.getDailyAdjustedClose().
 *   Fastify expects historicalPriceLoader.fetchSeries().
 *   adaptPriceProvider(pp) bridges the gap.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createGunzip, createBrotliDecompress } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable, Writable } from 'node:stream';
import path from 'node:path';
import { tmpdir } from 'node:os';

import pino from 'pino';
import { createFastifyApp } from '../../app.fastify.js';
import { createConfiguredPriceProvider, createConfiguredLatestQuoteProvider } from '../../data/priceProviderFactory.js';
import createHistoricalPriceLoader from '../../services/historicalPriceLoader.js';
import JsonTableStorage from '../../data/storage.js';
import { normalizeBenchmarkConfig } from '../../../shared/benchmarks.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const TEST_SESSION_TOKEN = 'desktop-session-token';
export const TEST_SESSION_HEADER = 'X-Session-Token';

// ── Noop price loader (used when no priceProvider is supplied) ─────────────────

const noopHistoricalPriceLoader = {
  async fetchSeries() {
    return { prices: [], cacheHit: false, resolution: null };
  },
};

// ── Adapter: Express priceProvider → Fastify historicalPriceLoader ────────────

/**
 * Creates a persistedLatestCloseLookup function backed by the test's SQLite storage.
 * Reads the 'prices' table and returns the latest row for the given symbol.
 */
function makePersistedLatestCloseLookup(testDataDir, logger) {
  const storage = new JsonTableStorage({ dataDir: testDataDir, logger: logger ?? pino({ level: 'silent' }) });
  return async (symbol) => {
    try {
      const rows = await storage.readTable('prices');
      if (!Array.isArray(rows)) return null;
      const matching = rows
        .filter((row) => typeof row?.ticker === 'string' && row.ticker.toUpperCase() === symbol.toUpperCase())
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const latest = matching[matching.length - 1];
      return latest ?? null;
    } catch {
      return null;
    }
  };
}

/**
 * Wraps an Express-style priceProvider (with getDailyAdjustedClose) into the
 * Fastify historicalPriceLoader interface (with fetchSeries).
 * Tracks calls so tests can assert on call counts.
 */
export function adaptPriceProvider(priceProvider) {
  let callCount = 0;
  const loader = {
    get callCount() { return callCount; },
    async fetchSeries(symbol, _opts) {
      callCount += 1;
      const prices = await priceProvider.getDailyAdjustedClose(symbol);
      return { prices: prices ?? [], cacheHit: false, resolution: null };
    },
  };
  return loader;
}

// ── Config builder ────────────────────────────────────────────────────────────

/**
 * Merges a partial Express-style test config into a full ServerConfig.
 * Every required field gets a safe default.
 */
function buildTestConfig(partial) {
  const defaults = {
    dataDir: '',
    fetchTimeoutMs: 5000,
    featureFlags: { cashBenchmarks: true, monthlyCashPosting: false },
    benchmarks: {
      tickers: ['SPY', 'QQQ'],
      available: [],
      derived: [],
      defaultSelection: ['spy'],
      priceSymbols: ['SPY', 'QQQ'],
    },
    cash: { postingDay: 'last' },
    jobs: { nightlyHour: 2, nightlyEnabled: false },
    notifications: {
      emailDelivery: {
        enabled: false,
        configured: false,
        from: '',
        to: [],
        replyTo: '',
        subjectPrefix: '',
        retry: {
          maxAttempts: 3,
          minDelayMs: 1000,
          backoffMultiplier: 2,
          automaticRetries: false,
        },
        transport: {
          connectionUrl: '',
          host: '',
          port: 587,
          secure: false,
          auth: { user: '', pass: '' },
        },
      },
    },
    cors: { allowedOrigins: [] },
    freshness: { maxStaleTradingDays: 30 },
    cache: {
      ttlSeconds: 1,
      price: {
        ttlSeconds: 1,
        liveOpenTtlSeconds: 1,
        liveClosedTtlSeconds: 1,
        checkPeriodSeconds: 60,
      },
    },
    prices: {
      providers: { primary: 'stooq', fallback: 'yahoo' },
      latest: {
        provider: 'alpaca',
        apiKey: '',
        apiSecret: '',
        prepost: false,
      },
    },
    security: {
      auth: {
        sessionToken: '',
        headerName: TEST_SESSION_HEADER,
      },
      bruteForce: {
        maxAttempts: 5,
        attemptWindowSeconds: 120,
        baseLockoutSeconds: 2,
        maxLockoutSeconds: 30,
        progressiveMultiplier: 2,
        checkPeriodSeconds: 1,
      },
      auditLog: { maxEvents: 100 },
    },
    rateLimit: {
      general: { windowMs: 60000, max: 1000 },
      portfolio: { windowMs: 60000, max: 200 },
      prices: { windowMs: 60000, max: 500 },
    },
  };

  const merged = deepMerge(defaults, partial ?? {});
  // Re-derive available/derived/priceSymbols from tickers when tickers are provided,
  // since the Fastify benchmarks route reads config.benchmarks.available directly.
  if (Array.isArray(merged.benchmarks?.tickers) && merged.benchmarks.tickers.length > 0) {
    const normalized = normalizeBenchmarkConfig({
      tickers: merged.benchmarks.tickers,
      defaultSelection: merged.benchmarks.defaultSelection ?? [],
    });
    merged.benchmarks = { ...merged.benchmarks, ...normalized };
  }
  return merged;
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)
      && tgtVal && typeof tgtVal === 'object' && !Array.isArray(tgtVal)) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

// ── App factory ───────────────────────────────────────────────────────────────

/**
 * Build a Fastify app ready for inject() calls.
 *
 * @param {object} [opts]
 * @param {string}  [opts.dataDir]           — temp dir (created if omitted)
 * @param {object}  [opts.logger]            — noop by default
 * @param {object}  [opts.config]            — partial ServerConfig
 * @param {object}  [opts.priceProvider]     — Express-style priceProvider (getDailyAdjustedClose)
 * @param {object}  [opts.historicalPriceLoader] — Fastify-style loader (fetchSeries); overrides priceProvider
 * @param {Function}[opts.fetchImpl]        — raw fetch override (for price mocking)
 * @param {Function}[opts.marketClock]       — clock override
 * @param {string}  [opts.staticDir]         — static file dir for SPA mode
 * @param {boolean} [opts.spaFallback]       — enable SPA fallback
 */
export async function buildFastifyApp(opts = {}) {
  const {
    dataDir: suppliedDataDir,
    logger,
    config,
    priceProvider,
    historicalPriceLoader: suppliedLoader,
    fetchImpl,
    marketClock,
    staticDir,
    spaFallback,
  } = opts;

  const dataDir = suppliedDataDir ?? mkdtempSync(path.join(tmpdir(), 'fastify-test-'));

  const appConfig = buildTestConfig(config);
  const effectiveLogger = logger ?? pino({ level: 'silent' });

  let resolvedLoader = suppliedLoader ?? null;

  if (!resolvedLoader && priceProvider && fetchImpl) {
    // Both priceProvider (EOD) and fetchImpl (alpaca) provided:
    // use priceProvider for historical prices, fetchImpl for live quotes.
    const latestQuoteProvider = createConfiguredLatestQuoteProvider({ config: appConfig, fetchImpl, logger: effectiveLogger });
    const persistedLatestCloseLookup = dataDir ? makePersistedLatestCloseLookup(dataDir, effectiveLogger) : null;
    resolvedLoader = createHistoricalPriceLoader({ priceProvider, latestQuoteProvider, persistedLatestCloseLookup, marketClock });
  } else if (!resolvedLoader && priceProvider) {
    const persistedLatestCloseLookup = dataDir ? makePersistedLatestCloseLookup(dataDir, effectiveLogger) : null;
    resolvedLoader = createHistoricalPriceLoader({ priceProvider, latestQuoteProvider: null, persistedLatestCloseLookup, marketClock });
  } else if (!resolvedLoader && fetchImpl) {
    const pp = createConfiguredPriceProvider({ config: appConfig, fetchImpl, logger: effectiveLogger });
    const latestQuoteProvider = createConfiguredLatestQuoteProvider({ config: appConfig, fetchImpl, logger: effectiveLogger });
    resolvedLoader = createHistoricalPriceLoader({ priceProvider: pp, latestQuoteProvider, marketClock });
  }

  resolvedLoader = resolvedLoader ?? noopHistoricalPriceLoader;

  const app = await createFastifyApp({
    dataDir,
    logger: effectiveLogger,
    config: appConfig,
    historicalPriceLoader: resolvedLoader,
    marketClock,
    staticDir,
    spaFallback,
  });

  await app.ready();
  return app;
}

/**
 * Build a session-authenticated Fastify app.
 * Injects TEST_SESSION_TOKEN into the config so auth routes work.
 */
export async function createSessionTestApp(opts = {}) {
  const { config = {}, ...rest } = opts;

  const sessionConfig = deepMerge(config, {
    security: {
      auth: {
        sessionToken: TEST_SESSION_TOKEN,
        headerName: TEST_SESSION_HEADER,
      },
    },
  });

  return buildFastifyApp({ ...rest, config: sessionConfig });
}

/** Close a Fastify app (call in afterEach). */
export async function closeApp(app) {
  await app.close();
}

// ── Supertest-compatible adapter ──────────────────────────────────────────────

/**
 * Returns a supertest-like builder for Fastify inject().
 *
 * Usage:
 *   const res = await request(app).get('/api/foo').set('X-Session-Token', token);
 *   assert.equal(res.status, 200);
 *   assert.ok(res.body.items);
 */
export function request(app) {
  return {
    get: (url) => new InjectChain(app, 'GET', url),
    post: (url) => new InjectChain(app, 'POST', url),
    put: (url) => new InjectChain(app, 'PUT', url),
    delete: (url) => new InjectChain(app, 'DELETE', url),
    patch: (url) => new InjectChain(app, 'PATCH', url),
  };
}

class InjectChain {
  constructor(app, method, url) {
    this._app = app;
    this._method = method;
    this._url = url;
    this._headers = {};
    this._payload = undefined;
    this._expectations = [];
  }

  set(name, value) {
    this._headers[name.toLowerCase()] = value;
    return this;
  }

  send(data) {
    this._payload = data;
    return this;
  }

  /**
   * expect(statusCode)              — assert HTTP status
   * expect(headerName, regexOrStr)  — assert response header value
   */
  expect(statusOrHeader, matcher) {
    this._expectations.push({ statusOrHeader, matcher });
    return this;
  }

  async _execute() {
    const injectOpts = {
      method: this._method,
      url: this._url,
      headers: this._headers,
    };

    if (this._payload !== undefined) {
      // Pass JSON objects as payload; strings (like malformed JSON) as raw body
      if (typeof this._payload === 'string') {
        injectOpts.payload = this._payload;
        // Only set content-type if not already set
        if (!this._headers['content-type']) {
          injectOpts.headers = { ...injectOpts.headers, 'content-type': 'application/json' };
        }
      } else {
        injectOpts.payload = this._payload;
      }
    }

    const res = await this._app.inject(injectOpts);

    // Decompress body if needed (inject() applies compression)
    let rawPayload = res.rawPayload;
    const encoding = res.headers['content-encoding'];
    if (encoding === 'gzip') {
      const chunks = [];
      await pipeline(
        Readable.from(rawPayload),
        createGunzip(),
        new Writable({ write(chunk, _, cb) { chunks.push(chunk); cb(); } }),
      );
      rawPayload = Buffer.concat(chunks);
    } else if (encoding === 'br') {
      const chunks = [];
      await pipeline(
        Readable.from(rawPayload),
        createBrotliDecompress(),
        new Writable({ write(chunk, _, cb) { chunks.push(chunk); cb(); } }),
      );
      rawPayload = Buffer.concat(chunks);
    }
    const decodedPayload = rawPayload.toString('utf8');

    let body;
    const contentType = (res.headers['content-type'] ?? '').toLowerCase();
    if (contentType.includes('application/json')) {
      try {
        body = JSON.parse(decodedPayload);
      } catch {
        body = {};
      }
    } else if (contentType.includes('text/html') || contentType.includes('text/plain')) {
      body = {};
    } else {
      // Try JSON parse; fall back to empty object
      try {
        body = JSON.parse(decodedPayload);
      } catch {
        body = {};
      }
    }

    const response = {
      status: res.statusCode,
      statusCode: res.statusCode,
      body,
      text: decodedPayload,
      headers: res.headers,
    };

    // Run inline .expect() assertions
    for (const { statusOrHeader, matcher } of this._expectations) {
      if (typeof statusOrHeader === 'number') {
        assert.equal(
          response.status,
          statusOrHeader,
          `Expected HTTP ${statusOrHeader}, got ${response.status}`,
        );
      } else if (typeof statusOrHeader === 'string') {
        const headerVal = String(response.headers[statusOrHeader.toLowerCase()] ?? '');
        if (matcher instanceof RegExp) {
          assert.ok(
            matcher.test(headerVal),
            `Header "${statusOrHeader}" expected to match ${matcher}, got "${headerVal}"`,
          );
        } else if (typeof matcher === 'string') {
          assert.equal(headerVal, matcher);
        }
      }
    }

    return response;
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  catch(reject) {
    return this._execute().catch(reject);
  }
}

// ── Session helper ─────────────────────────────────────────────────────────────

/**
 * Mirrors sessionTestUtils.withSession() — sets the session token header on the chain.
 */
export function withSession(
  chain,
  token = TEST_SESSION_TOKEN,
  headerName = TEST_SESSION_HEADER,
) {
  return chain.set(headerName, token);
}
