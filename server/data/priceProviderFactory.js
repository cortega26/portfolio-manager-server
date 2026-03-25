import fetch from "node-fetch";

import {
  DualPriceProvider,
  TwelveDataQuoteProvider,
  YahooPriceProvider,
  StooqPriceProvider,
} from "./prices.js";

export const PRICE_PROVIDER_NAMES = Object.freeze(["yahoo", "stooq", "none"]);
export const LATEST_QUOTE_PROVIDER_NAMES = Object.freeze(["twelvedata", "none"]);

export function normalizePriceProviderName(value, fallback = "none") {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (PRICE_PROVIDER_NAMES.includes(normalized)) {
    return normalized;
  }
  return fallback;
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
} = {}) {
  const primaryName = normalizePriceProviderName(
    config?.prices?.providers?.primary,
    "yahoo",
  );
  const fallbackName = normalizePriceProviderName(
    config?.prices?.providers?.fallback,
    "stooq",
  );
  const primary = createNamedProvider(primaryName, { fetchImpl, timeoutMs, logger });
  const fallback = createNamedProvider(fallbackName, { fetchImpl, timeoutMs, logger });

  if (primary && fallback) {
    return new DualPriceProvider({ primary, fallback, logger });
  }
  if (primary) {
    return primary;
  }
  if (fallback) {
    return fallback;
  }
  throw new Error("No price providers configured");
}

export function createConfiguredLatestQuoteProvider({
  config,
  fetchImpl = fetch,
  timeoutMs = 5000,
  logger,
} = {}) {
  const providerName = normalizeLatestQuoteProviderName(
    config?.prices?.latest?.provider,
    "none",
  );
  if (providerName !== "twelvedata") {
    return null;
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
  return new TwelveDataQuoteProvider({
    fetchImpl,
    timeoutMs,
    logger,
    apiKey,
    prepost: config?.prices?.latest?.prepost !== false,
  });
}
