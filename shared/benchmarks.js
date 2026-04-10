const DEFAULT_MARKET_TICKERS = Object.freeze(["SPY", "QQQ"]);
const DEFAULT_SELECTION = Object.freeze(["spy", "qqq"]);

const KNOWN_MARKET_BENCHMARKS = Object.freeze({
  SPY: Object.freeze({
    id: "spy",
    ticker: "SPY",
    label: "S&P 500",
  }),
  QQQ: Object.freeze({
    id: "qqq",
    ticker: "QQQ",
    label: "Nasdaq-100",
  }),
});

const DERIVED_BENCHMARKS = Object.freeze([
  Object.freeze({
    id: "blended",
    label: "Cash-Matched S&P 500",
    kind: "derived",
  }),
]);

function slugifyBenchmarkId(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeBenchmarkTicker(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9._/-]{1,32}$/u.test(normalized)) {
    return "";
  }
  return normalized;
}

export function buildMarketBenchmarkDefinition(ticker) {
  const normalizedTicker = normalizeBenchmarkTicker(ticker);
  if (!normalizedTicker) {
    return null;
  }
  const known = KNOWN_MARKET_BENCHMARKS[normalizedTicker];
  if (known) {
    return {
      ...known,
      kind: "market",
    };
  }
  const generatedId = slugifyBenchmarkId(normalizedTicker);
  if (!generatedId) {
    return null;
  }
  return {
    id: generatedId,
    ticker: normalizedTicker,
    label: normalizedTicker,
    kind: "market",
  };
}

export function normalizeBenchmarkTickers(values) {
  const list = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(",")
      : [];
  const seen = new Set();
  const result = [];
  for (const value of list) {
    const ticker = normalizeBenchmarkTicker(value);
    if (!ticker || seen.has(ticker)) {
      continue;
    }
    seen.add(ticker);
    result.push(ticker);
  }
  return result.length > 0 ? result : [...DEFAULT_MARKET_TICKERS];
}

export function sanitizeBenchmarkSelection(selection, availableIds, fallback = DEFAULT_SELECTION) {
  const availableSet =
    availableIds instanceof Set
      ? availableIds
      : new Set(
          (Array.isArray(availableIds) ? availableIds : [])
            .map((value) => String(value))
            .filter(Boolean),
        );
  const deduped = Array.from(
    new Set(
      (Array.isArray(selection) ? selection : [])
        .map((value) => String(value).trim())
        .filter((value) => availableSet.has(value)),
    ),
  );
  if (deduped.length > 0) {
    return deduped;
  }
  const normalizedFallback = Array.from(
    new Set(
      (Array.isArray(fallback) ? fallback : [])
        .map((value) => String(value).trim())
        .filter((value) => availableSet.has(value)),
    ),
  );
  if (normalizedFallback.length > 0) {
    return normalizedFallback;
  }
  return Array.from(availableSet.values()).slice(0, 1);
}

export function normalizeBenchmarkConfig(raw = {}) {
  const tickers = normalizeBenchmarkTickers(raw?.tickers);
  const available = tickers
    .map((ticker) => buildMarketBenchmarkDefinition(ticker))
    .filter(Boolean);
  const availableIds = new Set(available.map((entry) => entry.id));
  const defaults = sanitizeBenchmarkSelection(raw?.defaultSelection, availableIds);
  return {
    tickers,
    available,
    derived: DERIVED_BENCHMARKS.map((entry) => ({ ...entry })),
    defaultSelection: defaults,
    priceSymbols: tickers,
  };
}

export function getDefaultBenchmarkConfig() {
  return normalizeBenchmarkConfig({
    tickers: DEFAULT_MARKET_TICKERS,
    defaultSelection: DEFAULT_SELECTION,
  });
}

export const DEFAULT_BENCHMARK_TICKERS = DEFAULT_MARKET_TICKERS;
export const DEFAULT_BENCHMARK_SELECTION = DEFAULT_SELECTION;
