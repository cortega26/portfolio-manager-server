import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "../config.js";

test("loadConfig provides default pricing, benchmarks, and scheduler settings", () => {
  const config = loadConfig({});

  assert.deepEqual(config.prices.providers, {
    primary: "yahoo",
    fallback: "stooq",
  });
  assert.deepEqual(config.prices.latest, {
    provider: "none",
    apiKey: "",
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
    PRICE_PROVIDER_LATEST: "TWELVEDATA",
    TWELVE_DATA_API_KEY: "  test-key  ",
    TWELVE_DATA_PREPOST: "false",
    BENCHMARK_TICKERS: "QQQ, invalid!, SPY, QQQ",
    BENCHMARK_DEFAULT_SELECTION: "blended, spy, qqq, unknown",
    JOB_NIGHTLY_ENABLED: "false",
  });

  assert.deepEqual(config.prices.providers, {
    primary: "yahoo",
    fallback: "none",
  });
  assert.deepEqual(config.prices.latest, {
    provider: "twelvedata",
    apiKey: "test-key",
    prepost: false,
  });
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
