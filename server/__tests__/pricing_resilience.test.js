import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import request from "supertest";

import JsonTableStorage from "../data/storage.js";
import { createProviderHealthMonitor } from "../data/providerHealth.js";
import { createConfiguredPriceProvider } from "../data/priceProviderFactory.js";
import { createSessionTestApp, withSession } from "./sessionTestUtils.js";

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "portfolio-pricing-resilience-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function seedLatestClose(rows) {
  const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable("prices", []);
  await storage.writeTable("prices", rows);
}

test("signals preview degrades to fresh EOD prices when alpaca live quotes fail auth", async () => {
  const today = new Date().toISOString().slice(0, 10);
  let latestQuoteCalls = 0;
  let historicalCalls = 0;
  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    fetchImpl: async (url) => {
      const value = String(url);
      if (!value.startsWith("https://data.alpaca.markets/v2/stocks/")) {
        throw new Error(`Unexpected upstream call: ${value}`);
      }
      latestQuoteCalls += 1;
      return {
        ok: false,
        status: 401,
        json: async () => ({
          message: "unauthorized",
        }),
      };
    },
    priceProvider: {
      async getDailyAdjustedClose() {
        historicalCalls += 1;
        return [{ date: today, adjClose: 250.5 }];
      },
    },
    config: {
      prices: {
        latest: {
          provider: "alpaca",
          apiKey: "broken-key",
          apiSecret: "broken-secret",
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

  const payload = {
    transactions: [
      { date: "2024-01-01", type: "DEPOSIT", amount: 1000 },
      { date: "2024-01-02", type: "BUY", ticker: "MSFT", amount: -500, price: 100, shares: 5 },
    ],
    signals: {
      MSFT: { pct: 5 },
    },
  };

  const first = await withSession(request(app).post("/api/signals").send(payload));

  assert.equal(first.status, 200);
  assert.deepEqual(first.body.errors, {});
  assert.equal(first.body.prices.MSFT, 250.5);
  assert.equal(first.body.pricing.summary.status, "degraded");
  assert.deepEqual(first.body.pricing.summary.degradedSymbols, ["MSFT"]);
  assert.equal(first.body.pricing.symbols.MSFT.status, "degraded");
  assert.ok(first.body.pricing.symbols.MSFT.warnings.includes("LATEST_QUOTE_UNAVAILABLE"));
  assert.equal(latestQuoteCalls, 1);
  assert.equal(historicalCalls, 1);

  const second = await withSession(request(app).post("/api/signals").send(payload));

  assert.equal(second.status, 200);
  assert.deepEqual(second.body.errors, {});
  assert.equal(second.body.pricing.summary.status, "cache_fresh");
  assert.equal(second.body.pricing.symbols.MSFT.status, "cache_fresh");
  assert.equal(latestQuoteCalls, 1, "misconfigured live provider should be skipped after auth failure");
  assert.equal(historicalCalls, 1, "freshly cached EOD prices should avoid redundant upstream fetches");
});

test("signals preview uses the persisted last close on first load when the market is closed", async () => {
  const today = new Date().toISOString().slice(0, 10);
  await seedLatestClose([
    { ticker: "MSFT", date: today, adj_close: 305.75 },
  ]);

  let historicalCalls = 0;
  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    priceProvider: {
      async getDailyAdjustedClose() {
        historicalCalls += 1;
        throw new Error("historical provider should not be required when persisted last close exists");
      },
    },
    config: {
      freshness: { maxStaleTradingDays: 3 },
    },
    marketClock: () => ({
      isOpen: false,
      isBeforeOpen: false,
      isAfterClose: true,
      isTradingDay: true,
      isHoliday: false,
      isWeekend: false,
      lastTradingDate: today,
      nextTradingDate: "2099-02-02",
    }),
  });

  const payload = {
    transactions: [
      { date: "2024-01-01", type: "DEPOSIT", amount: 1000 },
      { date: "2024-01-02", type: "BUY", ticker: "MSFT", amount: -500, price: 100, shares: 5 },
    ],
    signals: {
      MSFT: { pct: 5 },
    },
  };

  const response = await withSession(request(app).post("/api/signals").send(payload));

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.errors, {});
  assert.equal(response.body.prices.MSFT, 305.75);
  assert.equal(response.body.rows[0].currentPrice, 305.75);
  assert.equal(response.body.rows[0].currentPriceAsOf, today);
  assert.equal(response.body.pricing.summary.status, "eod_fresh");
  assert.equal(response.body.pricing.symbols.MSFT.status, "eod_fresh");
  assert.equal(response.body.pricing.symbols.MSFT.source, "persisted");
  assert.ok(response.body.pricing.symbols.MSFT.warnings.includes("LAST_CLOSE_FALLBACK_USED"));
  assert.equal(response.body.pricing.symbols.MSFT.latestQuoteAttempted, false);
  assert.equal(historicalCalls, 0);
});

test("bulk latest pricing returns degraded metadata instead of hard errors when alpaca fails but EOD fallback succeeds", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    fetchImpl: async (url) => {
      const value = String(url);
      if (!value.startsWith("https://data.alpaca.markets/v2/stocks/")) {
        throw new Error(`Unexpected upstream call: ${value}`);
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({
          message: "unauthorized",
        }),
      };
    },
    priceProvider: {
      async getDailyAdjustedClose() {
        return [{ date: today, adjClose: 312.34 }];
      },
    },
    config: {
      prices: {
        latest: {
          provider: "alpaca",
          apiKey: "broken-key",
          apiSecret: "broken-secret",
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

  const response = await request(app).get("/api/prices/bulk?symbols=MSFT&latest=1");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.errors, {});
  assert.equal(response.body.series.MSFT.length, 1);
  assert.equal(response.body.series.MSFT[0].close, 312.34);
  assert.equal(response.body.metadata.symbols.MSFT.status, "degraded");
  assert.equal(response.body.metadata.symbols.MSFT.source, "historical");
  assert.ok(response.body.metadata.symbols.MSFT.warnings.includes("LATEST_QUOTE_UNAVAILABLE"));
  assert.equal(response.body.metadata.summary.status, "degraded");
  assert.deepEqual(response.body.metadata.summary.degradedSymbols, ["MSFT"]);
});

test("bulk latest pricing serves the persisted last close when live pricing is unavailable", async () => {
  const today = new Date().toISOString().slice(0, 10);
  await seedLatestClose([
    { ticker: "MSFT", date: today, adj_close: 312.34 },
  ]);

  let historicalCalls = 0;
  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    priceProvider: {
      async getDailyAdjustedClose() {
        historicalCalls += 1;
        throw new Error("historical provider should not be required when persisted last close exists");
      },
    },
    config: {
      freshness: { maxStaleTradingDays: 3 },
    },
    marketClock: () => ({
      isOpen: false,
      isBeforeOpen: false,
      isAfterClose: true,
      isTradingDay: true,
      isHoliday: false,
      isWeekend: false,
      lastTradingDate: today,
      nextTradingDate: "2099-02-02",
    }),
  });

  const response = await request(app).get("/api/prices/bulk?symbols=MSFT&latest=1");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.errors, {});
  assert.equal(response.body.series.MSFT.length, 1);
  assert.equal(response.body.series.MSFT[0].close, 312.34);
  assert.equal(response.body.series.MSFT[0].date, today);
  assert.equal(response.body.metadata.symbols.MSFT.status, "eod_fresh");
  assert.equal(response.body.metadata.symbols.MSFT.source, "persisted");
  assert.ok(response.body.metadata.symbols.MSFT.warnings.includes("LAST_CLOSE_FALLBACK_USED"));
  assert.equal(response.body.metadata.summary.status, "eod_fresh");
  assert.equal(historicalCalls, 0);
});

test("bulk latest pricing skips alpaca outside market hours and serves EOD without live attempt", async () => {
  const today = new Date().toISOString().slice(0, 10);
  let latestQuoteCalls = 0;
  let historicalCalls = 0;
  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    fetchImpl: async (url) => {
      latestQuoteCalls += 1;
      throw new Error(`Unexpected upstream call: ${String(url)}`);
    },
    priceProvider: {
      async getDailyAdjustedClose() {
        historicalCalls += 1;
        return [{ date: today, adjClose: 401.25 }];
      },
    },
    config: {
      prices: {
        latest: {
          provider: "alpaca",
          apiKey: "alpaca-key",
          apiSecret: "alpaca-secret",
        },
      },
      freshness: { maxStaleTradingDays: 3 },
    },
    marketClock: () => ({
      isOpen: false,
      isBeforeOpen: false,
      isAfterClose: true,
      isTradingDay: true,
      isHoliday: false,
      isWeekend: false,
      lastTradingDate: today,
      nextTradingDate: "2099-02-02",
    }),
  });

  const response = await request(app).get("/api/prices/bulk?symbols=SPY&latest=1");

  assert.equal(response.status, 200);
  assert.equal(latestQuoteCalls, 0);
  assert.equal(historicalCalls, 1);
  assert.deepEqual(response.body.errors, {});
  assert.equal(response.body.metadata.symbols.SPY.status, "eod_fresh");
  assert.equal(response.body.metadata.symbols.SPY.latestQuoteAttempted, false);
  assert.equal(response.body.metadata.summary.status, "eod_fresh");
});

test("alpaca symbol-level no data falls back to EOD without marking the provider unhealthy", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    fetchImpl: async (url) => {
      const value = String(url);
      if (!value.startsWith("https://data.alpaca.markets/v2/stocks/")) {
        throw new Error(`Unexpected upstream call: ${value}`);
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    },
    priceProvider: {
      async getDailyAdjustedClose() {
        return [{ date: today, adjClose: 299.12 }];
      },
    },
    config: {
      prices: {
        latest: {
          provider: "alpaca",
          apiKey: "alpaca-key",
          apiSecret: "alpaca-secret",
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

  const first = await request(app).get("/api/prices/bulk?symbols=SPY&latest=1");
  const second = await request(app).get("/api/prices/bulk?symbols=QQQ&latest=1");

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(first.body.errors, {});
  assert.deepEqual(second.body.errors, {});
  assert.equal(first.body.metadata.symbols.SPY.status, "degraded");
  assert.equal(second.body.metadata.symbols.QQQ.status, "degraded");
});

test("bulk latest pricing still rejects stale persisted closes beyond the freshness window", async () => {
  await seedLatestClose([
    { ticker: "MSFT", date: "2000-01-03", adj_close: 199.99 },
  ]);

  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    priceProvider: {
      async getDailyAdjustedClose() {
        throw new Error("historical provider unavailable");
      },
    },
    config: {
      freshness: { maxStaleTradingDays: 1 },
    },
    marketClock: () => ({
      isOpen: false,
      isBeforeOpen: false,
      isAfterClose: true,
      isTradingDay: true,
      isHoliday: false,
      isWeekend: false,
      lastTradingDate: "2000-01-03",
      nextTradingDate: "2000-01-04",
    }),
  });

  const response = await request(app).get("/api/prices/bulk?symbols=MSFT&latest=1");

  assert.equal(response.status, 200);
  assert.equal(response.body.series.MSFT.length, 0);
  assert.deepEqual(response.body.errors.MSFT, {
    code: "STALE_DATA",
    status: 503,
    message: "Historical prices are stale for this symbol.",
  });
  assert.equal(response.body.metadata.symbols.MSFT.status, "unavailable");
});

test("configured provider health skips yahoo after repeated upstream failures and prefers stooq", async () => {
  let yahooCalls = 0;
  let stooqCalls = 0;
  const healthMonitor = createProviderHealthMonitor({ logger: noopLogger });
  const provider = createConfiguredPriceProvider({
    config: {
      prices: {
        providers: {
          primary: "yahoo",
          fallback: "stooq",
        },
      },
    },
    logger: noopLogger,
    healthMonitor,
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.startsWith("https://query1.finance.yahoo.com/")) {
        yahooCalls += 1;
        return {
          ok: false,
          status: 503,
          text: async () => "upstream unavailable",
        };
      }
      if (value.startsWith("https://stooq.com/")) {
        stooqCalls += 1;
        return {
          ok: true,
          text: async () =>
            "Date,Open,High,Low,Close,Volume\n2024-02-01,1,1,1,100.25,1000\n2024-02-02,1,1,1,101.75,1000",
        };
      }
      throw new Error(`Unexpected upstream call: ${value}`);
    },
  });

  await provider.getDailyAdjustedClose("MSFT", "2024-02-01", "2024-02-02");
  await provider.getDailyAdjustedClose("AAPL", "2024-02-01", "2024-02-02");
  await provider.getDailyAdjustedClose("NVDA", "2024-02-01", "2024-02-02");

  assert.equal(yahooCalls, 2, "yahoo should stop being retried after hitting the unhealthy threshold");
  assert.equal(stooqCalls, 3, "stooq should keep serving as the resilient fallback");
  assert.equal(healthMonitor.isHealthy("yahoo"), false);
  assert.equal(healthMonitor.isHealthy("stooq"), true);
});
