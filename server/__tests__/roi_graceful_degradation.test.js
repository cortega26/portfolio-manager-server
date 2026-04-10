/**
 * Regression test: /api/roi/daily must serve cached data when the price provider
 * is unavailable, rather than propagating a 503.
 *
 * Root cause that motivated this test: on non-trading days (e.g. Saturday) the
 * effectiveTo date used to be today's calendar date, which is always > the last
 * return row date (last Friday). This triggered a mandatory rebuild via
 * ensureRange(). If the price provider threw during that rebuild, the endpoint
 * returned 503 with no data, even though perfectly valid ROI rows existed in
 * storage from the previous daily-close run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import request from "supertest";

import JsonTableStorage from "../data/storage.js";
import { flushPriceCache } from "../cache/priceCache.js";
import { createSessionTestApp, withSession } from "./sessionTestUtils.js";

const noopLogger = { info() {}, warn() {}, error() {} };

// A price provider that always throws — simulates a provider outage
class FailingPriceProvider {
  async getDailyAdjustedClose() {
    throw new Error("upstream_provider_unavailable");
  }
}

let dataDir;
let storage;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "roi-degradation-"));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable("transactions", []);
  await storage.ensureTable("roi_daily", []);
  await storage.ensureTable("returns_daily", []);
  await storage.ensureTable("nav_snapshots", []);
  await storage.ensureTable("prices", []);
  flushPriceCache();
});

afterEach(() => {
  flushPriceCache();
  rmSync(dataDir, { recursive: true, force: true });
});

test("roi/daily returns 200 with existing data when rebuild fails due to provider outage", async () => {
  const txDate = "2024-06-03"; // a known trading day

  // Seed a BUY transaction
  await storage.upsertRow(
    "transactions",
    {
      id: "tx-1",
      date: txDate,
      type: "BUY",
      ticker: "AAPL",
      shares: 10,
      amount: 1800,
      price_per_share: 180,
    },
    ["id"],
  );

  // Seed a pre-computed ROI row (as if daily_close had already run)
  await storage.upsertRow(
    "roi_daily",
    {
      date: txDate,
      portfolio_nav: 1800,
      net_contributions: 1800,
      roi_portfolio_pct: 0,
      roi_sp500_pct: 0,
      roi_ndx_pct: 0,
    },
    ["date"],
  );

  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    priceProvider: new FailingPriceProvider(),
  });

  const response = await withSession(
    request(app).get(`/api/roi/daily?from=${txDate}`),
  );

  // Must not return 503 — existing ROI data should be served gracefully
  assert.equal(response.status, 200, `Expected 200 but got ${response.status}: ${JSON.stringify(response.body)}`);

  // Portfolio series should contain the seeded row
  const series = response.body?.series;
  assert.ok(Array.isArray(series?.portfolio), "series.portfolio should be an array");
  assert.equal(series.portfolio.length, 1, "should have one portfolio data point");
  assert.equal(series.portfolio[0].date, txDate);
  assert.equal(series.portfolio[0].value, 0);
});

test("roi/daily still returns 503 when rebuild fails AND no existing roi rows exist", async () => {
  const txDate = "2024-06-03";

  // Seed a BUY transaction but NO roi_daily rows
  await storage.upsertRow(
    "transactions",
    {
      id: "tx-1",
      date: txDate,
      type: "BUY",
      ticker: "AAPL",
      shares: 10,
      amount: 1800,
      price_per_share: 180,
    },
    ["id"],
  );

  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    priceProvider: new FailingPriceProvider(),
  });

  const response = await withSession(
    request(app).get(`/api/roi/daily?from=${txDate}`),
  );

  // With no existing data AND failing provider, 503 is the correct behaviour
  assert.equal(response.status, 503, `Expected 503 but got ${response.status}`);
});
