import fetch from "node-fetch";

import {
  AlpacaLatestQuoteProvider,
  DualPriceProvider,
  TwelveDataQuoteProvider,
  YahooPriceProvider,
  StooqPriceProvider,
} from "./prices.js";

export const PRICE_PROVIDER_NAMES = Object.freeze(["yahoo", "stooq", "none"]);
export const LATEST_QUOTE_PROVIDER_NAMES = Object.freeze(["alpaca", "twelvedata", "none"]);

export function normalizePriceProviderName(value, fallback = "none") {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (PRICE_PROVIDER_NAMES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

class HealthCheckedPriceProvider {
  constructor({ provider, healthMonitor, logger }) {
    this.provider = provider;
    this.healthMonitor = healthMonitor;
    this.logger = logger;
    this.providerKey =
      typeof provider?.providerKey === "string"
        ? provider.providerKey
        : String(provider?.constructor?.name ?? "provider").toLowerCase();
  }

  async getDailyAdjustedClose(symbol, from, to) {
    if (this.healthMonitor && !this.healthMonitor.isHealthy(this.providerKey)) {
      this.healthMonitor.logSkip(this.providerKey, {
        symbol,
        from,
        to,
        kind: "historical",
      });
      const error = new Error(`Provider ${this.providerKey} is temporarily unhealthy`);
      error.code = "PRICE_PROVIDER_UNHEALTHY";
      error.status = 503;
      throw error;
    }
    try {
      const result = await this.provider.getDailyAdjustedClose(symbol, from, to);
      this.healthMonitor?.recordSuccess(this.providerKey);
      return result;
    } catch (error) {
      this.healthMonitor?.recordFailure(this.providerKey, error);
      throw error;
    }
  }
}

class HealthCheckedLatestQuoteProvider {
  constructor({ provider, healthMonitor }) {
    this.provider = provider;
    this.healthMonitor = healthMonitor;
    this.providerKey =
      typeof provider?.providerKey === "string"
        ? provider.providerKey
        : String(provider?.constructor?.name ?? "provider").toLowerCase();
  }

  async getLatestQuote(symbol) {
    if (this.healthMonitor && !this.healthMonitor.isHealthy(this.providerKey)) {
      this.healthMonitor.logSkip(this.providerKey, {
        symbol,
        kind: "latest",
      });
      const error = new Error(`Provider ${this.providerKey} is temporarily unhealthy`);
      error.code = "PRICE_PROVIDER_UNHEALTHY";
      error.status = 503;
      throw error;
    }
    try {
      const result = await this.provider.getLatestQuote(symbol);
      this.healthMonitor?.recordSuccess(this.providerKey);
      return result;
    } catch (error) {
      this.healthMonitor?.recordFailure(this.providerKey, error);
      throw error;
    }
  }
}

export function normalizeLatestQuoteProviderName(value, fallback = "none") {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (LATEST_QUOTE_PROVIDER_NAMES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function createNamedProvider(name, { fetchImpl = fetch, timeoutMs = 5000, logger } = {}) {
  switch (normalizePriceProviderName(name)) {
    case "yahoo":
      return new YahooPriceProvider({ fetchImpl, timeoutMs, logger });
    case "stooq":
      return new StooqPriceProvider({ fetchImpl, timeoutMs, logger });
    default:
      return null;
  }
}

export function createConfiguredPriceProvider({
  config,
  fetchImpl = fetch,
  timeoutMs = 5000,
  logger,
  healthMonitor = null,
} = {}) {
  const primaryName = normalizePriceProviderName(
    config?.prices?.providers?.primary,
    "stooq",
  );
  const fallbackName = normalizePriceProviderName(
    config?.prices?.providers?.fallback,
    "yahoo",
  );
  const primary = createNamedProvider(primaryName, { fetchImpl, timeoutMs, logger });
  const fallback = createNamedProvider(fallbackName, { fetchImpl, timeoutMs, logger });

  if (primary && fallback) {
    return new DualPriceProvider({ primary, fallback, logger, healthMonitor });
  }
  if (primary) {
    return new HealthCheckedPriceProvider({ provider: primary, healthMonitor, logger });
  }
  if (fallback) {
    return new HealthCheckedPriceProvider({ provider: fallback, healthMonitor, logger });
  }
  throw new Error("No price providers configured");
}

export function createConfiguredLatestQuoteProvider({
  config,
  fetchImpl = fetch,
  timeoutMs = 5000,
  logger,
  healthMonitor = null,
} = {}) {
  const providerName = normalizeLatestQuoteProviderName(
    config?.prices?.latest?.provider,
    "none",
  );
  if (providerName !== "twelvedata") {
    if (providerName !== "alpaca") {
      return null;
    }
    const apiKey =
      typeof config?.prices?.latest?.apiKey === "string"
        ? config.prices.latest.apiKey.trim()
        : "";
    const apiSecret =
      typeof config?.prices?.latest?.apiSecret === "string"
        ? config.prices.latest.apiSecret.trim()
        : "";
    if (!apiKey || !apiSecret) {
      logger?.warn?.("latest_quote_provider_disabled", {
        provider: providerName,
        reason: !apiKey && !apiSecret
          ? "missing_api_key_and_secret"
          : !apiKey
            ? "missing_api_key"
            : "missing_api_secret",
      });
      return null;
    }
    const provider = new AlpacaLatestQuoteProvider({
      fetchImpl,
      timeoutMs,
      logger,
      apiKey,
      apiSecret,
    });
    return new HealthCheckedLatestQuoteProvider({ provider, healthMonitor });
  }
  const apiKey =
    typeof config?.prices?.latest?.apiKey === "string"
      ? config.prices.latest.apiKey.trim()
      : "";
  if (!apiKey) {
    logger?.warn?.("latest_quote_provider_disabled", {
      provider: providerName,
      reason: "missing_api_key",
    });
    return null;
  }
  const provider = new TwelveDataQuoteProvider({
    fetchImpl,
    timeoutMs,
    logger,
    apiKey,
    prepost: config?.prices?.latest?.prepost !== false,
  });
  return new HealthCheckedLatestQuoteProvider({ provider, healthMonitor });
}
