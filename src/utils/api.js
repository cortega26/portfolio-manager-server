import { validateAndNormalizePortfolioPayload } from "./portfolioSchema.js";

export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://portfolio-api.carlosortega77.workers.dev";

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

export async function fetchPrices(symbol, range = "1y") {
  const response = await fetch(
    `${API_BASE}/api/prices/${symbol}?range=${range}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch prices for ${symbol}`);
  }

  return response.json();
}

export async function persistPortfolio(portfolioId, body, options = {}) {
  const normalizedId = normalizePortfolioId(portfolioId);
  const payload = validateAndNormalizePortfolioPayload(body ?? {});
  const response = await fetch(`${API_BASE}/api/portfolio/${normalizedId}`, {
    method: "POST",
    headers: buildPortfolioHeaders(options, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Unable to save portfolio ${normalizedId}`);
  }

  return response.json().catch(() => ({}));
}

export async function retrievePortfolio(portfolioId, options = {}) {
  const normalizedId = normalizePortfolioId(portfolioId);
  const headers = buildPortfolioHeaders(options);
  const fetchOptions = Object.keys(headers).length > 0 ? { headers } : undefined;
  const response = await fetch(`${API_BASE}/api/portfolio/${normalizedId}`, fetchOptions);
  if (!response.ok) {
    throw new Error(`Unable to load portfolio ${normalizedId}`);
  }

  return response.json();
}

export async function fetchMonitoringSnapshot(options = {}) {
  const response = await fetch(`${API_BASE}/api/monitoring`, {
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error("Unable to load monitoring snapshot");
  }
  return response.json();
}

export async function fetchSecurityStats(options = {}) {
  const response = await fetch(`${API_BASE}/api/security/stats`, {
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error("Unable to load security statistics");
  }
  return response.json();
}

export async function fetchSecurityEvents({ limit, signal } = {}) {
  const params = new URLSearchParams();
  if (Number.isFinite(limit)) {
    params.set("limit", String(Math.max(1, Math.floor(limit))));
  }
  const query = params.toString();
  const response = await fetch(
    `${API_BASE}/api/security/events${query ? `?${query}` : ""}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error("Unable to load security audit events");
  }
  return response.json();
}
