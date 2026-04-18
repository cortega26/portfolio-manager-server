import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createSessionTestApp, request, closeApp } from './helpers/fastifyTestApp.js';
import JsonTableStorage from "../data/storage.js";

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {}, child() { return this; } };

let dataDir;
let storage;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "benchmarks-summary-"));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable("returns_daily", []);
  await storage.ensureTable("nav_snapshots", []);
  await storage.ensureTable("transactions", []);
  await storage.ensureTable("prices", []);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test("benchmarks summary exposes matched-flow money weighted benchmarks and marks partial windows", async () => {
  await storage.writeTable("returns_daily", [
    {
      date: "2024-01-02",
      r_port: 0,
      r_ex_cash: 0,
      r_bench_blended: 0,
      r_spy_100: 0,
      r_qqq_100: 0,
      r_cash: 0,
    },
    {
      date: "2024-06-28",
      r_port: 0.12,
      r_ex_cash: 0.11,
      r_bench_blended: 0.09,
      r_spy_100: 0.1,
      r_qqq_100: 0.105,
      r_cash: 0.01,
    },
  ]);
  await storage.writeTable("nav_snapshots", [
    { date: "2024-01-02", portfolio_nav: 1000, ex_cash_nav: 900, cash_balance: 100, risk_assets_value: 900, stale_price: false },
    { date: "2024-06-28", portfolio_nav: 1700, ex_cash_nav: 1500, cash_balance: 200, risk_assets_value: 1500, stale_price: false },
  ]);
  await storage.writeTable("transactions", [
    { date: "2024-01-02", type: "DEPOSIT", amount: 1000 },
    { date: "2024-03-15", type: "DEPOSIT", amount: 250 },
  ]);
  await storage.writeTable("prices", [
    { ticker: "SPY", date: "2024-01-02", adj_close: 100 },
    { ticker: "SPY", date: "2024-03-15", adj_close: 110 },
    { ticker: "SPY", date: "2024-06-28", adj_close: 121 },
    { ticker: "QQQ", date: "2024-01-02", adj_close: 200 },
    { ticker: "QQQ", date: "2024-03-15", adj_close: 210 },
    { ticker: "QQQ", date: "2024-06-28", adj_close: 252 },
  ]);

  const app = await createSessionTestApp({
    dataDir,
    logger: noopLogger,
    config: {
      freshness: { maxStaleTradingDays: 4000 },
    },
  });

  const response = await request(app).get(
    "/api/benchmarks/summary?from=2024-01-02&to=2024-06-28",
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.money_weighted.method, "xirr");
  assert.equal(response.body.money_weighted.basis, "matched_external_flows");
  assert.equal(response.body.money_weighted.partial, true);
  assert.equal(response.body.money_weighted.start_date, "2024-01-02");
  assert.equal(response.body.money_weighted.end_date, "2024-06-28");
  assert.equal(typeof response.body.money_weighted.portfolio, "number");
  assert.equal(typeof response.body.money_weighted.benchmarks.spy, "number");
  assert.equal(typeof response.body.money_weighted.benchmarks.qqq, "number");
  await closeApp(app);
});

test("benchmarks summary returns null when a matched-flow benchmark cannot be calculated", async () => {
  await storage.writeTable("returns_daily", [
    {
      date: "2024-01-02",
      r_port: 0,
      r_ex_cash: 0,
      r_bench_blended: 0,
      r_spy_100: 0,
      r_qqq_100: 0,
      r_cash: 0,
    },
    {
      date: "2025-01-10",
      r_port: 0.08,
      r_ex_cash: 0.07,
      r_bench_blended: 0.05,
      r_spy_100: 0.06,
      r_qqq_100: 0.09,
      r_cash: 0.01,
    },
  ]);
  await storage.writeTable("nav_snapshots", [
    { date: "2024-01-02", portfolio_nav: 1000, ex_cash_nav: 900, cash_balance: 100, risk_assets_value: 900, stale_price: false },
    { date: "2025-01-10", portfolio_nav: 1250, ex_cash_nav: 1100, cash_balance: 150, risk_assets_value: 1100, stale_price: false },
  ]);
  await storage.writeTable("transactions", [
    { date: "2024-01-02", type: "DEPOSIT", amount: 1000 },
  ]);
  await storage.writeTable("prices", [
    { ticker: "SPY", date: "2024-01-02", adj_close: 100 },
    { ticker: "SPY", date: "2025-01-10", adj_close: 112 },
    { ticker: "QQQ", date: "2025-01-10", adj_close: 250 },
  ]);

  const app = await createSessionTestApp({
    dataDir,
    logger: noopLogger,
    config: {
      freshness: { maxStaleTradingDays: 4000 },
    },
  });

  const response = await request(app).get(
    "/api/benchmarks/summary?from=2024-01-02&to=2025-01-10",
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.money_weighted.partial, false);
  assert.equal(typeof response.body.money_weighted.benchmarks.spy, "number");
  assert.equal(response.body.money_weighted.benchmarks.qqq, null);
  await closeApp(app);
});

test("benchmarks summary includes annualized returns when period >= 365 days", async () => {
  await storage.writeTable("returns_daily", [
    {
      date: "2024-01-02",
      r_port: 0,
      r_ex_cash: 0,
      r_bench_blended: 0,
      r_spy_100: 0,
      r_qqq_100: 0,
      r_cash: 0,
    },
    {
      date: "2025-01-10",
      r_port: 0.08,
      r_ex_cash: 0.07,
      r_bench_blended: 0.05,
      r_spy_100: 0.06,
      r_qqq_100: 0.09,
      r_cash: 0.01,
    },
  ]);
  await storage.writeTable("nav_snapshots", [
    { date: "2024-01-02", portfolio_nav: 1000, ex_cash_nav: 900, cash_balance: 100, risk_assets_value: 900, stale_price: false },
    { date: "2025-01-10", portfolio_nav: 1250, ex_cash_nav: 1100, cash_balance: 150, risk_assets_value: 1100, stale_price: false },
  ]);
  await storage.writeTable("transactions", [
    { date: "2024-01-02", type: "DEPOSIT", amount: 1000 },
  ]);
  await storage.writeTable("prices", [
    { ticker: "SPY", date: "2024-01-02", adj_close: 100 },
    { ticker: "SPY", date: "2025-01-10", adj_close: 112 },
  ]);

  const app = await createSessionTestApp({
    dataDir,
    logger: noopLogger,
    config: {
      freshness: { maxStaleTradingDays: 4000 },
    },
  });

  const response = await request(app).get(
    "/api/benchmarks/summary?from=2024-01-02&to=2025-01-10",
  );

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.summary.annualized_r_port, "number");
  assert.equal(typeof response.body.summary.annualized_r_spy_100, "number");
  assert.equal(typeof response.body.summary.annualized_r_bench_blended, "number");
  await closeApp(app);
});

test("benchmarks summary does NOT include annualized returns when period < 365 days", async () => {
  await storage.writeTable("returns_daily", [
    {
      date: "2024-01-02",
      r_port: 0,
      r_ex_cash: 0,
      r_bench_blended: 0,
      r_spy_100: 0,
      r_qqq_100: 0,
      r_cash: 0,
    },
    {
      date: "2024-06-28",
      r_port: 0.12,
      r_ex_cash: 0.11,
      r_bench_blended: 0.09,
      r_spy_100: 0.1,
      r_qqq_100: 0.105,
      r_cash: 0.01,
    },
  ]);
  await storage.writeTable("nav_snapshots", [
    { date: "2024-01-02", portfolio_nav: 1000, ex_cash_nav: 900, cash_balance: 100, risk_assets_value: 900, stale_price: false },
    { date: "2024-06-28", portfolio_nav: 1700, ex_cash_nav: 1500, cash_balance: 200, risk_assets_value: 1500, stale_price: false },
  ]);
  await storage.writeTable("transactions", [
    { date: "2024-01-02", type: "DEPOSIT", amount: 1000 },
  ]);
  await storage.writeTable("prices", [
    { ticker: "SPY", date: "2024-01-02", adj_close: 100 },
    { ticker: "SPY", date: "2024-06-28", adj_close: 121 },
  ]);

  const app = await createSessionTestApp({
    dataDir,
    logger: noopLogger,
    config: {
      freshness: { maxStaleTradingDays: 4000 },
    },
  });

  const response = await request(app).get(
    "/api/benchmarks/summary?from=2024-01-02&to=2024-06-28",
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.summary.annualized_r_port, undefined);
  assert.equal(response.body.summary.annualized_r_spy_100, undefined);
  await closeApp(app);
});

test("benchmarks summary includes max_drawdown with value, peak_date, and trough_date", async () => {
  await storage.writeTable("returns_daily", [
    {
      date: "2024-01-02",
      r_port: 0,
      r_ex_cash: 0,
      r_bench_blended: 0,
      r_spy_100: 0,
      r_qqq_100: 0,
      r_cash: 0,
    },
    {
      date: "2024-01-03",
      r_port: 0.10,
      r_ex_cash: 0.09,
      r_bench_blended: 0.08,
      r_spy_100: 0.07,
      r_qqq_100: 0.06,
      r_cash: 0.01,
    },
    {
      date: "2024-01-04",
      r_port: -0.20,
      r_ex_cash: -0.18,
      r_bench_blended: -0.15,
      r_spy_100: -0.12,
      r_qqq_100: -0.10,
      r_cash: 0.01,
    },
  ]);
  await storage.writeTable("nav_snapshots", [
    { date: "2024-01-02", portfolio_nav: 1000, ex_cash_nav: 900, cash_balance: 100, risk_assets_value: 900, stale_price: false },
    { date: "2024-01-04", portfolio_nav: 900, ex_cash_nav: 800, cash_balance: 100, risk_assets_value: 800, stale_price: false },
  ]);
  await storage.writeTable("transactions", [
    { date: "2024-01-02", type: "DEPOSIT", amount: 1000 },
  ]);
  await storage.writeTable("prices", [
    { ticker: "SPY", date: "2024-01-02", adj_close: 100 },
    { ticker: "SPY", date: "2024-01-04", adj_close: 95 },
  ]);

  const app = await createSessionTestApp({
    dataDir,
    logger: noopLogger,
    config: {
      freshness: { maxStaleTradingDays: 4000 },
    },
  });

  const response = await request(app).get(
    "/api/benchmarks/summary?from=2024-01-02&to=2024-01-04",
  );

  assert.equal(response.status, 200);
  assert.ok(response.body.max_drawdown !== null, "max_drawdown should be present");
  assert.equal(typeof response.body.max_drawdown.value, "number");
  assert.ok(response.body.max_drawdown.value < 0, "max_drawdown value should be negative");
  assert.equal(typeof response.body.max_drawdown.peak_date, "string");
  assert.equal(typeof response.body.max_drawdown.trough_date, "string");
  await closeApp(app);
});
