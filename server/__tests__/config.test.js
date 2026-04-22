import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "../config.js";

test("loadConfig provides default pricing, benchmarks, and scheduler settings", () => {
  const config = loadConfig({});

  assert.deepEqual(config.prices.providers, {
    primary: "stooq",
    fallback: "yahoo",
    alpacaApiKey: "",
    alpacaApiSecret: "",
    alphavantageApiKey: "",
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
    alpacaApiKey: "test-key",
    alpacaApiSecret: "test-secret",
    alphavantageApiKey: "",
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

test("loadConfig parses email delivery settings", () => {
  const config = loadConfig({
    EMAIL_DELIVERY_ENABLED: "true",
    EMAIL_DELIVERY_CONNECTION_URL: " smtp://user:pass@mail.local:2525 ",
    EMAIL_DELIVERY_FROM: " alerts@example.com ",
    EMAIL_DELIVERY_TO: " first@example.com, second@example.com ",
    EMAIL_DELIVERY_REPLY_TO: " support@example.com ",
    EMAIL_DELIVERY_SUBJECT_PREFIX: " [Signals] ",
    EMAIL_DELIVERY_USER: " smtp-user ",
    EMAIL_DELIVERY_PASS: " smtp-pass ",
    EMAIL_DELIVERY_RETRY_MAX_ATTEMPTS: "5",
    EMAIL_DELIVERY_RETRY_MIN_DELAY_SECONDS: "90",
    EMAIL_DELIVERY_RETRY_BACKOFF_MULTIPLIER: "3",
    EMAIL_DELIVERY_RETRY_AUTOMATIC: "false",
  });

  assert.deepEqual(config.notifications.emailDelivery, {
    enabled: true,
    configured: true,
    from: "alerts@example.com",
    to: ["first@example.com", "second@example.com"],
    replyTo: "support@example.com",
    subjectPrefix: "[Signals]",
    retry: {
      maxAttempts: 5,
      minDelayMs: 90_000,
      backoffMultiplier: 3,
      automaticRetries: false,
    },
    transport: {
      connectionUrl: "smtp://user:pass@mail.local:2525",
      host: "",
      port: 587,
      secure: false,
      auth: {
        user: "smtp-user",
        pass: "smtp-pass",
      },
    },
  });
});

test("loadConfig sanitizes retry policy for email delivery", () => {
  const config = loadConfig({
    EMAIL_DELIVERY_RETRY_MAX_ATTEMPTS: "0",
    EMAIL_DELIVERY_RETRY_MIN_DELAY_SECONDS: "-15",
    EMAIL_DELIVERY_RETRY_BACKOFF_MULTIPLIER: "0",
    EMAIL_DELIVERY_RETRY_AUTOMATIC: "true",
  });

  assert.deepEqual(config.notifications.emailDelivery.retry, {
    maxAttempts: 1,
    minDelayMs: 0,
    backoffMultiplier: 1,
    automaticRetries: true,
  });
});
