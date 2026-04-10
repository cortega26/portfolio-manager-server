import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "../config.js";

test("loadConfig provides default pricing, benchmarks, and scheduler settings", () => {
  const config = loadConfig({});

  assert.deepEqual(config.prices.providers, {
    primary: "stooq",
    fallback: "yahoo",
  });
  assert.deepEqual(config.prices.latest, {
    provider: "none",
    apiKey: "",
    apiSecret: "",
    prepost: true,
  });
  assert.equal(config.jobs.nightlyEnabled, true);
  assert.deepEqual(config.benchmarks.tickers, ["SPY", "QQQ"]);
  assert.deepEqual(config.benchmarks.defaultSelection, ["spy", "qqq"]);
  assert.deepEqual(
    config.benchmarks.available.map((entry) => entry.id),
    ["spy", "qqq"],
  );
});

test("loadConfig sanitizes provider names and benchmark selections", () => {
  const config = loadConfig({
    PRICE_PROVIDER_PRIMARY: "invalid",
    PRICE_PROVIDER_FALLBACK: "none",
    PRICE_PROVIDER_LATEST: "ALPACA",
    ALPACA_API_KEY: "  test-key  ",
    ALPACA_API_SECRET: "  test-secret  ",
    PRICE_CACHE_LIVE_OPEN_TTL_SECONDS: "90",
    PRICE_CACHE_LIVE_CLOSED_TTL_SECONDS: "1200",
    BENCHMARK_TICKERS: "QQQ, invalid!, SPY, QQQ",
    BENCHMARK_DEFAULT_SELECTION: "blended, spy, qqq, unknown",
    JOB_NIGHTLY_ENABLED: "false",
  });

  assert.deepEqual(config.prices.providers, {
    primary: "stooq",
    fallback: "none",
  });
  assert.deepEqual(config.prices.latest, {
    provider: "alpaca",
    apiKey: "test-key",
    apiSecret: "test-secret",
    prepost: true,
  });
  assert.equal(config.cache.price.liveOpenTtlSeconds, 90);
  assert.equal(config.cache.price.liveClosedTtlSeconds, 1200);
  assert.equal(config.jobs.nightlyEnabled, false);
  assert.deepEqual(config.benchmarks.tickers, ["QQQ", "SPY"]);
  assert.deepEqual(config.benchmarks.defaultSelection, ["spy", "qqq"]);
});

test("loadConfig falls back to the first configured benchmark when defaults are empty", () => {
  const config = loadConfig({
    BENCHMARK_TICKERS: "QQQ",
    BENCHMARK_DEFAULT_SELECTION: "spy",
  });

  assert.deepEqual(config.benchmarks.tickers, ["QQQ"]);
  assert.deepEqual(config.benchmarks.defaultSelection, ["qqq"]);
});
