import { requestJson as requestJsonInternal } from "../lib/apiClient.js";
import { validateAndNormalizePortfolioPayload } from "./portfolioSchema.js";

const PORTFOLIO_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

function normalizePortfolioId(portfolioId) {
  if (typeof portfolioId !== "string") {
    throw new Error("Portfolio ID must be a string");
  }
  const trimmed = portfolioId.trim();
  if (!PORTFOLIO_ID_REGEX.test(trimmed)) {
    throw new Error(
      "Portfolio ID must match [A-Za-z0-9_-]{1,64} before sending to the server",
    );
  }
  return trimmed;
}

function normalizeKey(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildPortfolioHeaders({ apiKey, newApiKey } = {}, baseHeaders = {}) {
  const headers = { ...baseHeaders };
  const normalizedKey = normalizeKey(apiKey);
  const normalizedNewKey = normalizeKey(newApiKey);
  if (normalizedKey) {
    headers["X-Portfolio-Key"] = normalizedKey;
  }
  if (normalizedNewKey) {
    headers["X-Portfolio-Key-New"] = normalizedNewKey;
  }
  return headers;
}

async function requestJson(path, options = {}) {
  return requestJsonInternal(path, options);
}

export async function fetchPrices(symbol, range = "1y", options = {}) {
  const params = new URLSearchParams();
  if (range !== undefined && range !== null) {
    params.set("range", String(range));
  }
  const encodedSymbol = encodeURIComponent(String(symbol));
  const query = params.toString();
  return requestJson(`/prices/${encodedSymbol}${query ? `?${query}` : ""}`, {
    signal: options.signal,
    onRequestMetadata: options.onRequestMetadata,
  });
}

function normalizeBulkSymbols(symbols) {
  if (Array.isArray(symbols)) {
    return symbols;
  }
  if (typeof symbols === "string") {
    return symbols.split(",");
  }
  return [];
}

export async function fetchBulkPrices(
  symbols,
  { range = "1y", latestOnly = false, signal, onRequestMetadata } = {},
) {
  const candidateSymbols = normalizeBulkSymbols(symbols)
    .map((symbol) => (typeof symbol === "string" ? symbol.trim() : ""))
    .filter((symbol) => symbol.length > 0);
  const uniqueSymbols = Array.from(new Set(candidateSymbols));
  if (uniqueSymbols.length === 0) {
    return { series: new Map(), errors: {}, metadata: {}, requestId: undefined, version: undefined };
  }
  const params = new URLSearchParams();
  params.set("symbols", uniqueSymbols.join(","));
  if (range !== undefined && range !== null) {
    params.set("range", String(range));
  }
  if (latestOnly) {
    params.set("latest", "1");
  }
  const query = params.toString();
  const { data, requestId, version } = await requestJson(`/prices/bulk${query ? `?${query}` : ""}`, {
    signal,
    onRequestMetadata,
  });
  const series = new Map();
  const rawSeries = data?.series ?? {};
  for (const [symbol, entries] of Object.entries(rawSeries)) {
    const normalized = symbol.toUpperCase();
    series.set(
      normalized,
      Array.isArray(entries)
        ? entries.map((entry) => ({ ...entry }))
        : [],
    );
  }
  for (const symbol of uniqueSymbols) {
    const normalized = symbol.toUpperCase();
    if (!series.has(normalized)) {
      series.set(normalized, []);
    }
  }
  return {
    series,
    errors: data?.errors ?? {},
    metadata: data?.metadata ?? {},
    requestId,
    version,
  };
}

const RETURN_VIEWS = new Set(["port", "excash", "spy", "bench", "cash"]);

function normalizeDateParam(value) {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date && Number.isFinite(value.getTime?.())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function buildReturnViewsParam(views) {
  if (!Array.isArray(views) || views.length === 0) {
    return "port,spy,bench";
  }
  const normalized = Array.from(
    new Set(
      views
        .map((view) => String(view).toLowerCase())
        .filter((view) => RETURN_VIEWS.has(view)),
    ),
  );
  if (normalized.length === 0) {
    return "port,spy,bench";
  }
  return normalized.join(",");
}

export async function fetchDailyReturns({
  from,
  to,
  views,
  signal,
  onRequestMetadata,
} = {}) {
  const params = new URLSearchParams();
  const normalizedFrom = normalizeDateParam(from);
  const normalizedTo = normalizeDateParam(to);
  if (normalizedFrom) {
    params.set("from", normalizedFrom);
  }
  if (normalizedTo) {
    params.set("to", normalizedTo);
  }
  params.set("views", buildReturnViewsParam(views));
  const query = params.toString();
  return requestJson(`/returns/daily${query ? `?${query}` : ""}`, {
    signal,
    onRequestMetadata,
  });
}

export async function fetchNavSnapshots({
  from,
  to,
  page,
  perPage,
  signal,
  onRequestMetadata,
} = {}) {
  const params = new URLSearchParams();
  const normalizedFrom = normalizeDateParam(from);
  const normalizedTo = normalizeDateParam(to);
  if (normalizedFrom) {
    params.set("from", normalizedFrom);
  }
  if (normalizedTo) {
    params.set("to", normalizedTo);
  }
  if (Number.isFinite(page)) {
    const pageValue = Math.max(1, Math.floor(page));
    params.set("page", String(pageValue));
  }
  if (Number.isFinite(perPage)) {
    const capped = Math.min(500, Math.max(1, Math.floor(perPage)));
    params.set("per_page", String(capped));
  }
  const query = params.toString();
  return requestJson(`/nav/daily${query ? `?${query}` : ""}`, {
    signal,
    onRequestMetadata,
  });
}

export async function persistPortfolio(portfolioId, body, options = {}) {
  const { signal, onRequestMetadata, ...headerOptions } = options;
  const normalizedId = normalizePortfolioId(portfolioId);
  const payload = validateAndNormalizePortfolioPayload(body ?? {});
  const headers = buildPortfolioHeaders(headerOptions, {
    "Content-Type": "application/json",
  });
  return requestJson(`/portfolio/${normalizedId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    allowEmptyObject: true,
    signal,
    onRequestMetadata,
  });
}

export async function retrievePortfolio(portfolioId, options = {}) {
  const { signal, onRequestMetadata, ...headerOptions } = options;
  const normalizedId = normalizePortfolioId(portfolioId);
  const headers = buildPortfolioHeaders(headerOptions);
  const requestOptions = { signal, onRequestMetadata };
  if (Object.keys(headers).length > 0) {
    requestOptions.headers = headers;
  }
  return requestJson(`/portfolio/${normalizedId}`, requestOptions);
}

export async function fetchMonitoringSnapshot(options = {}) {
  return requestJson("/monitoring", {
    signal: options.signal,
    onRequestMetadata: options.onRequestMetadata,
  });
}

export async function fetchSecurityStats(options = {}) {
  return requestJson("/security/stats", {
    signal: options.signal,
    onRequestMetadata: options.onRequestMetadata,
  });
}

export async function fetchSecurityEvents({ limit, signal, onRequestMetadata } = {}) {
  const params = new URLSearchParams();
  if (Number.isFinite(limit)) {
    params.set("limit", String(Math.max(1, Math.floor(limit))));
  }
  const query = params.toString();
  return requestJson(`/security/events${query ? `?${query}` : ""}`, {
    signal,
    onRequestMetadata,
  });
}
