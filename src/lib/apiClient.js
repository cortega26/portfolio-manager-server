import {
  getRuntimeConfigSync,
  loadRuntimeConfig,
  RUNTIME_CONFIG_DEFAULTS,
} from "./runtimeConfig.js";

/**
 * @typedef {import('./runtimeConfig.js').RuntimeConfig} RuntimeConfig
 */

/**
 * @typedef {Object} ApiRequestOptions
 * @property {string} [method]
 * @property {HeadersInit} [headers]
 * @property {BodyInit | null} [body]
 * @property {AbortSignal} [signal]
 * @property {boolean} [allowLegacyFallback]
 * @property {boolean} [allowEmptyObject]
 * @property {(meta: { requestId: string | undefined; version: string }) => void} [onRequestMetadata]
 * @property {number} [timeoutMs]
 */

const LEGACY_FALLBACK_STATUS = new Set([404, 410]);

export const API_VERSION_ROUTES = [
  { id: "v1", prefix: "/api/v1" },
  { id: "legacy", prefix: "/api" },
];

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
  return trimmed.replace(/\/+$/u, "");
}

function computeBaseUrl(runtimeConfig) {
  const runtimeCandidate = normalizeBaseUrlCandidate(runtimeConfig?.API_BASE_URL);
  if (runtimeCandidate) {
    return runtimeCandidate;
  }
  const envCandidate = normalizeBaseUrlCandidate(
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE
      : undefined,
  );
  if (envCandidate) {
    return envCandidate;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeBaseUrlCandidate(window.location.origin) ?? "";
  }
  return "http://localhost:3000";
}

function computeTimeout(runtimeConfig, optionsTimeout) {
  if (typeof optionsTimeout === "number" && optionsTimeout > 0) {
    return optionsTimeout;
  }
  const runtimeTimeout = runtimeConfig?.REQUEST_TIMEOUT_MS;
  if (typeof runtimeTimeout === "number" && runtimeTimeout > 0) {
    return runtimeTimeout;
  }
  const envTimeout =
    typeof import.meta !== "undefined" && import.meta.env
      ? Number(import.meta.env.VITE_API_TIMEOUT ?? import.meta.env.VITE_FETCH_TIMEOUT)
      : undefined;
  if (Number.isFinite(envTimeout) && envTimeout > 0) {
    return Number(envTimeout);
  }
  return RUNTIME_CONFIG_DEFAULTS.REQUEST_TIMEOUT_MS;
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

function normalizeAbortError(reason, timeoutMs) {
  if (reason instanceof DOMException && reason.name === "AbortError") {
    return reason;
  }
  if (reason instanceof Error && reason.name === "AbortError") {
    return reason;
  }
  const error = new DOMException(
    `Request aborted after ${timeoutMs}ms`,
    timeoutMs ? "TimeoutError" : "AbortError",
  );
  return error;
}

function buildTimeoutController(timeoutMs, externalSignal) {
  if (!timeoutMs) {
    return { signal: externalSignal, cleanup: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"),
    );
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  };

  const onExternalAbort = () => {
    controller.abort(normalizeAbortError(externalSignal.reason, timeoutMs));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  controller.signal.addEventListener("abort", cleanup, { once: true });

  return { signal: controller.signal, cleanup };
}

export function trimTrailingSlash(value) {
  return value.replace(/\/+$/u, "");
}

export async function resolveApiBaseUrl() {
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
    this.name = "ApiError";
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
    },
  );
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

export async function requestApi(path, options = {}) {
  const {
    method = "GET",
    headers,
    body,
    signal,
    allowLegacyFallback = true,
    timeoutMs,
  } = options;
  const normalizedPath = normalizePath(path);
  const baseUrl = trimTrailingSlash(await resolveApiBaseUrl());
  const versions = allowLegacyFallback
    ? API_VERSION_ROUTES
    : API_VERSION_ROUTES.slice(0, 1);
  let lastError;

  const runtimeConfig = getRuntimeConfigSync();
  const resolvedTimeout = computeTimeout(runtimeConfig, timeoutMs);
  const { signal: requestSignal, cleanup } = buildTimeoutController(
    resolvedTimeout,
    signal,
  );

  try {
    for (const { id, prefix } of versions) {
      const url = `${baseUrl}${prefix}${normalizedPath}`;
      const response = await fetch(url, {
        method,
        headers: createHeaders(headers),
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
      if (id === "v1" && allowLegacyFallback && LEGACY_FALLBACK_STATUS.has(response.status)) {
        lastError = error;
        continue;
      }
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

export async function requestJson(path, options = {}) {
  const { allowEmptyObject = false, onRequestMetadata, ...requestOptions } = options;
  const { response, requestId, version } = await requestApi(path, requestOptions);
  if (typeof onRequestMetadata === "function") {
    onRequestMetadata({ requestId, version });
  }
  const data = await parseJson(response, { allowEmptyObject, requestId, version });
  return { data, requestId, version };
}
