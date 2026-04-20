import fetch from "node-fetch";

import {
  AlpacaHistoricalProvider,
  AlpacaLatestQuoteProvider,
  AlphaVantageHistoricalProvider,
  DualPriceProvider,
  FinnhubLatestQuoteProvider,
  TwelveDataQuoteProvider,
  YahooPriceProvider,
  StooqPriceProvider,
} from "./prices.js";

export const PRICE_PROVIDER_NAMES = Object.freeze(["yahoo", "stooq", "alpaca", "alphavantage", "none"]);
export const LATEST_QUOTE_PROVIDER_NAMES = Object.freeze(["alpaca", "twelvedata", "finnhub", "none"]);

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

const HISTORICAL_PROVIDER_FACTORIES = {
  yahoo: ({ fetchImpl, timeoutMs, logger }) =>
    new YahooPriceProvider({ fetchImpl, timeoutMs, logger }),
  stooq: ({ fetchImpl, timeoutMs, logger }) =>
    new StooqPriceProvider({ fetchImpl, timeoutMs, logger }),
  alpaca: ({ fetchImpl, timeoutMs, logger, providersConfig = {} }) =>
    new AlpacaHistoricalProvider({
      fetchImpl,
      timeoutMs,
      logger,
      apiKey: String(providersConfig.alpacaApiKey ?? ""),
      apiSecret: String(providersConfig.alpacaApiSecret ?? ""),
    }),
  alphavantage: ({ fetchImpl, timeoutMs, logger, providersConfig = {} }) =>
    new AlphaVantageHistoricalProvider({
      fetchImpl,
      timeoutMs,
      logger,
      apiKey: String(providersConfig.alphavantageApiKey ?? ""),
    }),
};

function createNamedProvider(name, opts = {}) {
  const factory = HISTORICAL_PROVIDER_FACTORIES[normalizePriceProviderName(name)];
  return factory ? factory(opts) : null;
}

export function createConfiguredPriceProvider({
  config,
  fetchImpl = fetch,
  timeoutMs = 5000,
  logger,
  healthMonitor = null,
} = {}) {
  const providersConfig = config?.prices?.providers ?? {};
  const primaryName = normalizePriceProviderName(
    providersConfig.primary,
    "stooq",
  );
  const fallbackName = normalizePriceProviderName(
    providersConfig.fallback,
    "yahoo",
  );
  const primary = createNamedProvider(primaryName, { fetchImpl, timeoutMs, logger, providersConfig });
  const fallback = createNamedProvider(fallbackName, { fetchImpl, timeoutMs, logger, providersConfig });

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

function buildAlpacaLatestProvider({ fetchImpl, timeoutMs, logger, apiKey, apiSecret }) {
  if (!apiKey || !apiSecret) {
    const reason =
      !apiKey && !apiSecret ? "missing_api_key_and_secret"
        : !apiKey ? "missing_api_key"
          : "missing_api_secret";
    logger?.warn?.("latest_quote_provider_disabled", { provider: "alpaca", reason });
    return null;
  }
  return new AlpacaLatestQuoteProvider({ fetchImpl, timeoutMs, logger, apiKey, apiSecret });
}

function buildFinnhubLatestProvider({ fetchImpl, timeoutMs, logger, apiKey }) {
  if (!apiKey) {
    logger?.warn?.("latest_quote_provider_disabled", { provider: "finnhub", reason: "missing_api_key" });
    return null;
  }
  return new FinnhubLatestQuoteProvider({ fetchImpl, timeoutMs, logger, apiKey });
}

function buildTwelveDataProvider({ fetchImpl, timeoutMs, logger, apiKey, prepost }) {
  if (!apiKey) {
    logger?.warn?.("latest_quote_provider_disabled", { provider: "twelvedata", reason: "missing_api_key" });
    return null;
  }
  return new TwelveDataQuoteProvider({ fetchImpl, timeoutMs, logger, apiKey, prepost });
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
  const apiKey =
    typeof config?.prices?.latest?.apiKey === "string"
      ? config.prices.latest.apiKey.trim()
      : "";
  const apiSecret =
    typeof config?.prices?.latest?.apiSecret === "string"
      ? config.prices.latest.apiSecret.trim()
      : "";

  let innerProvider = null;
  if (providerName === "alpaca") {
    innerProvider = buildAlpacaLatestProvider({ fetchImpl, timeoutMs, logger, apiKey, apiSecret });
  } else if (providerName === "finnhub") {
    innerProvider = buildFinnhubLatestProvider({ fetchImpl, timeoutMs, logger, apiKey });
  } else if (providerName === "twelvedata") {
    const prepost = config?.prices?.latest?.prepost !== false;
    innerProvider = buildTwelveDataProvider({ fetchImpl, timeoutMs, logger, apiKey, prepost });
  }

  return innerProvider
    ? new HealthCheckedLatestQuoteProvider({ provider: innerProvider, healthMonitor })
    : null;
}
