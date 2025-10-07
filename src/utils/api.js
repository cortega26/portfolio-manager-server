import { validateAndNormalizePortfolioPayload } from "./portfolioSchema.js";

export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://portfolio-api.carlosortega77.workers.dev";

const PORTFOLIO_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const API_VERSION_ROUTES = [
  { id: "v1", prefix: "/api/v1" },
  { id: "legacy", prefix: "/api" },
];
const LEGACY_FALLBACK_STATUS = new Set([404, 410]);

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

function trimTrailingSlash(value) {
  return value.replace(/\/+$/u, "");
}

function normalizePath(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("Path must be a non-empty string");
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function createHeaders(headers) {
  const next = new Headers(headers ?? {});
  if (!next.has("accept")) {
    next.set("Accept", "application/json");
  }
  return next;
}

function extractRequestId(response) {
  const requestId = response.headers.get("X-Request-ID");
  if (typeof requestId !== "string") {
    return undefined;
  }
  const trimmed = requestId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function buildApiError({ response, requestId, version, method, url, path }) {
  const error = new Error(
    `${method.toUpperCase()} ${url} failed with status ${response.status}`,
  );
  error.name = "ApiError";
  error.status = response.status;
  error.version = version;
  error.path = path;
  error.url = url;
  error.method = method.toUpperCase();
  if (requestId) {
    error.requestId = requestId;
  }
  let rawBody = "";
  try {
    rawBody = await response.text();
  } catch (readError) {
    error.body = undefined;
    error.cause = readError;
    return error;
  }
  if (!rawBody) {
    return error;
  }
  try {
    error.body = JSON.parse(rawBody);
  } catch (parseError) {
    error.body = rawBody;
    error.cause = parseError;
  }
  return error;
}

async function requestApi(path, options = {}) {
  const {
    method = "GET",
    headers,
    body,
    signal,
    allowLegacyFallback = true,
  } = options;
  const normalizedPath = normalizePath(path);
  const baseUrl = trimTrailingSlash(API_BASE);
  const versions = allowLegacyFallback
    ? API_VERSION_ROUTES
    : API_VERSION_ROUTES.slice(0, 1);
  let lastError;

  for (const { id, prefix } of versions) {
    const url = `${baseUrl}${prefix}${normalizedPath}`;
    const response = await fetch(url, {
      method,
      headers: createHeaders(headers),
      body,
      signal,
    });
    const requestId = extractRequestId(response);
    if (response.ok) {
      return { response, version: id, requestId };
    }
    const error = await buildApiError({
      response,
      requestId,
      version: id,
      method,
      url,
      path: normalizedPath,
    });
    if (id === "v1" && allowLegacyFallback && LEGACY_FALLBACK_STATUS.has(response.status)) {
      lastError = error;
      continue;
    }
    throw error;
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error(`No API versions responded for ${normalizedPath}`);
}

async function parseJson(response, { allowEmptyObject = false, requestId, version } = {}) {
  try {
    return await response.json();
  } catch (parseError) {
    if (allowEmptyObject) {
      return {};
    }
    const error = new Error("Failed to parse JSON response");
    error.cause = parseError;
    if (requestId) {
      error.requestId = requestId;
    }
    if (version) {
      error.version = version;
    }
    throw error;
  }
}

async function requestJson(path, options = {}) {
  const {
    allowEmptyObject = false,
    onRequestMetadata,
    ...requestOptions
  } = options;
  const { response, requestId, version } = await requestApi(path, requestOptions);
  if (typeof onRequestMetadata === "function") {
    onRequestMetadata({ requestId, version });
  }
  const data = await parseJson(response, { allowEmptyObject, requestId, version });
  return { data, requestId, version };
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
