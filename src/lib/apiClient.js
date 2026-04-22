import {
  getRuntimeConfigSync,
  loadRuntimeConfig,
  RUNTIME_CONFIG_DEFAULTS,
} from './runtimeConfig.js';

/**
 * @typedef {import('./runtimeConfig.js').RuntimeConfig} RuntimeConfig
 */

/**
 * @typedef {Object} ApiRequestOptions
 * @property {string} [method]
 * @property {HeadersInit} [headers]
 * @property {BodyInit | null} [body]
 * @property {AbortSignal} [signal]
 * @property {boolean} [allowEmptyObject]
 * @property {(meta: { requestId: string | undefined; version: string }) => void} [onRequestMetadata]
 * @property {number} [timeoutMs]
 */

export const API_VERSION_ROUTES = [{ id: 'v1', prefix: '/api/v1' }];

let cachedBaseUrl = null;
let resolvingBaseUrlPromise = null;

function normalizeBaseUrlCandidate(value) {
  if (!value) {
    return undefined;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/u, '');
}

function computeBaseUrl(runtimeConfig) {
  const runtimeCandidate = normalizeBaseUrlCandidate(runtimeConfig?.API_BASE_URL);
  if (runtimeCandidate) {
    return runtimeCandidate;
  }
  const envCandidate = normalizeBaseUrlCandidate(
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE)
      : undefined
  );
  if (envCandidate) {
    return envCandidate;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeBaseUrlCandidate(window.location.origin) ?? '';
  }
  return 'http://localhost:3000';
}

function syncCachedBaseUrlFromRuntimeConfig() {
  const runtimeConfig = getRuntimeConfigSync();
  const runtimeCandidate = normalizeBaseUrlCandidate(runtimeConfig?.API_BASE_URL);
  if (!runtimeCandidate) {
    return null;
  }
  if (cachedBaseUrl !== runtimeCandidate) {
    cachedBaseUrl = runtimeCandidate;
    resolvingBaseUrlPromise = Promise.resolve(runtimeCandidate);
  }
  return runtimeCandidate;
}

function computeTimeout(runtimeConfig, optionsTimeout) {
  if (typeof optionsTimeout === 'number' && optionsTimeout > 0) {
    return optionsTimeout;
  }
  const runtimeTimeout = runtimeConfig?.REQUEST_TIMEOUT_MS;
  if (typeof runtimeTimeout === 'number' && runtimeTimeout > 0) {
    return runtimeTimeout;
  }
  const envTimeout =
    typeof import.meta !== 'undefined' && import.meta.env
      ? Number(import.meta.env.VITE_API_TIMEOUT ?? import.meta.env.VITE_FETCH_TIMEOUT)
      : undefined;
  if (Number.isFinite(envTimeout) && envTimeout > 0) {
    return Number(envTimeout);
  }
  return RUNTIME_CONFIG_DEFAULTS.REQUEST_TIMEOUT_MS;
}

function normalizePath(path) {
  if (typeof path !== 'string') {
    throw new Error('Path must be a non-empty string');
  }
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error('Path must be a non-empty string');
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || trimmed.startsWith('//')) {
    throw new Error('API paths must be relative to the configured base URL');
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function createHeaders(headers) {
  const next = new Headers(headers ?? {});
  if (!next.has('accept')) {
    next.set('Accept', 'application/json');
  }
  return next;
}

function applySessionAuthHeader(headers, runtimeConfig) {
  const token =
    typeof runtimeConfig?.API_SESSION_TOKEN === 'string'
      ? runtimeConfig.API_SESSION_TOKEN.trim()
      : '';
  if (!token) {
    return headers;
  }
  const headerName =
    typeof runtimeConfig?.SESSION_AUTH_HEADER === 'string' &&
    runtimeConfig.SESSION_AUTH_HEADER.trim().length > 0
      ? runtimeConfig.SESSION_AUTH_HEADER.trim()
      : 'X-Session-Token';
  if (!headers.has(headerName)) {
    headers.set(headerName, token);
  }
  return headers;
}

function extractRequestId(response) {
  const requestId = response.headers.get('X-Request-ID');
  if (typeof requestId !== 'string') {
    return undefined;
  }
  const trimmed = requestId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAbortError(reason, timeoutMs) {
  if (reason instanceof DOMException && reason.name === 'AbortError') {
    return reason;
  }
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }
  const error = new DOMException(
    `Request aborted after ${timeoutMs}ms`,
    timeoutMs ? 'TimeoutError' : 'AbortError'
  );
  return error;
}

function buildTimeoutController(timeoutMs, externalSignal) {
  if (!timeoutMs) {
    return { signal: externalSignal, cleanup: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  };

  const onExternalAbort = () => {
    controller.abort(normalizeAbortError(externalSignal.reason, timeoutMs));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  controller.signal.addEventListener('abort', cleanup, { once: true });

  return { signal: controller.signal, cleanup };
}

export function trimTrailingSlash(value) {
  return value.replace(/\/+$/u, '');
}

function isLoopbackHost(hostname) {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

function isSameBrowserOrigin(url) {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return false;
  }
  try {
    return new URL(window.location.origin).origin === url.origin;
  } catch {
    return false;
  }
}

function allowRemoteApiOriginForTesting() {
  if (typeof process === 'undefined') {
    return false;
  }
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

function validateApiBaseUrl(value) {
  const normalized = trimTrailingSlash(value);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Invalid API base URL: ${normalized}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported API base URL protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('API base URL must not include credentials');
  }
  if (
    !isLoopbackHost(parsed.hostname) &&
    !isSameBrowserOrigin(parsed) &&
    !allowRemoteApiOriginForTesting()
  ) {
    throw new Error(`Refusing unexpected API base URL host: ${parsed.hostname}`);
  }
  return parsed.toString().replace(/\/+$/u, '');
}

function buildVersionedApiUrl(baseUrl, prefix, normalizedPath) {
  const validatedBaseUrl = validateApiBaseUrl(baseUrl);
  const requestUrl = new URL(`${prefix}${normalizedPath}`, `${validatedBaseUrl}/`);
  if (requestUrl.origin !== new URL(`${validatedBaseUrl}/`).origin) {
    throw new Error('API request path escaped the configured base URL');
  }
  return requestUrl.toString();
}

export async function resolveApiBaseUrl() {
  const runtimeBaseUrl = syncCachedBaseUrlFromRuntimeConfig();
  if (runtimeBaseUrl) {
    return runtimeBaseUrl;
  }
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  if (!resolvingBaseUrlPromise) {
    resolvingBaseUrlPromise = (async () => {
      const runtimeConfig = await loadRuntimeConfig();
      const base = computeBaseUrl(runtimeConfig);
      cachedBaseUrl = base;
      return base;
    })();
  }
  return resolvingBaseUrlPromise;
}

export function getApiBaseUrlSync() {
  const runtimeBaseUrl = syncCachedBaseUrlFromRuntimeConfig();
  if (runtimeBaseUrl) {
    return runtimeBaseUrl;
  }
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  const runtimeConfig = getRuntimeConfigSync();
  const base = computeBaseUrl(runtimeConfig);
  cachedBaseUrl = base;
  return base;
}

export function invalidateApiBaseUrlCache() {
  cachedBaseUrl = null;
  resolvingBaseUrlPromise = null;
}

export class ApiClientError extends Error {
  constructor(message, metadata) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, metadata);
  }
}

async function buildApiError({ response, requestId, version, method, url, path }) {
  const error = new ApiClientError(
    `${method.toUpperCase()} ${url} failed with status ${response.status}`,
    {
      status: response.status,
      version,
      path,
      url,
      method: method.toUpperCase(),
      requestId,
    }
  );
  let rawBody = '';
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

export async function requestApi(path, options = {}) {
  const { method = 'GET', headers, body, signal, timeoutMs } = options;
  const normalizedPath = normalizePath(path);
  const baseUrl = await resolveApiBaseUrl();
  const versions = API_VERSION_ROUTES;

  const runtimeConfig = getRuntimeConfigSync();
  const resolvedTimeout = computeTimeout(runtimeConfig, timeoutMs);
  const { signal: requestSignal, cleanup } = buildTimeoutController(resolvedTimeout, signal);
  try {
    for (const { id, prefix } of versions) {
      const url = buildVersionedApiUrl(baseUrl, prefix, normalizedPath);
      const response = await fetch(url, {
        method,
        headers: applySessionAuthHeader(createHeaders(headers), runtimeConfig),
        body,
        signal: requestSignal,
      });
      const requestId = extractRequestId(response);
      if (response.ok) {
        return { response, requestId, version: id };
      }
      const error = await buildApiError({
        response,
        requestId,
        version: id,
        method,
        url,
        path: normalizedPath,
      });
      throw error;
    }
  } catch (error) {
    if (requestSignal?.aborted && !(error instanceof ApiClientError)) {
      throw normalizeAbortError(requestSignal.reason, resolvedTimeout);
    }
    throw error;
  } finally {
    cleanup();
  }
  throw new Error(`No API versions responded for ${normalizedPath}`);
}

async function parseJson(response, { allowEmptyObject = false, requestId, version } = {}) {
  // Clone before reading so we can also read the raw text on failure.
  const cloned = response.clone();
  try {
    return await response.json();
  } catch (parseError) {
    if (allowEmptyObject) {
      return {};
    }
    const error = new Error('Failed to parse JSON response');
    error.cause = parseError;
    if (requestId) {
      error.requestId = requestId;
    }
    if (version) {
      error.version = version;
    }
    // Attach a truncated raw body for diagnostics — makes it trivial to see
    // whether the server returned HTML, an error page, or partial content.
    try {
      const raw = await cloned.text();
      error.rawBody = raw.length > 512 ? `${raw.slice(0, 512)}…` : raw;
    } catch {
      // best-effort — ignore if the clone read also fails
    }
    // Surface the error in the console (Electron DevTools or terminal) to aid
    // debugging without requiring the caller to re-throw or catch.
    console.error(
      `[apiClient] parseJson failed ${JSON.stringify({ url: response.url, status: response.status, contentType: response.headers.get('content-type'), requestId: requestId ?? null, version: version ?? null, rawBody: error.rawBody ?? '(could not read body)', cause: parseError?.message ?? String(parseError) })}`
    );
    throw error;
  }
}

export async function requestJson(path, options = {}) {
  const { allowEmptyObject = false, onRequestMetadata, ...requestOptions } = options;
  const { response, requestId, version } = await requestApi(path, requestOptions);
  if (typeof onRequestMetadata === 'function') {
    onRequestMetadata({ requestId, version });
  }
  const data = await parseJson(response, { allowEmptyObject, requestId, version });
  return { data, requestId, version };
}

export async function getRealizedGains(portfolioId, options = {}) {
  return requestJson(`/api/portfolio/${encodeURIComponent(portfolioId)}/realized-gains`, options);
}
