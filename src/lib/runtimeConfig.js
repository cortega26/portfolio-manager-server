/**
 * @typedef {Object} RuntimeConfig
 * @property {string=} API_BASE_URL Absolute or relative base URL used for API requests.
 * @property {string=} API_SESSION_TOKEN In-memory desktop session token propagated to API requests.
 * @property {string=} ACTIVE_PORTFOLIO_ID Default portfolio identifier injected by the desktop shell.
 * @property {number=} REQUEST_TIMEOUT_MS Optional request timeout override in milliseconds.
 * @property {string=} SESSION_AUTH_HEADER Optional header name for desktop session auth.
 */

const DEFAULT_RUNTIME_CONFIG = Object.freeze({});

let cachedConfig = null;
let loadingPromise = null;

const BASE_URL = typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env.BASE_URL === "string"
  ? import.meta.env.BASE_URL
  : "/";

function normalizeBasePath(pathname) {
  if (!pathname) {
    return "";
  }
  return pathname.replace(/\/+$/u, "");
}

function buildConfigUrl() {
  const base = normalizeBasePath(BASE_URL);
  if (base) {
    return `${base}/config.json`;
  }
  return "/config.json";
}

function coerceNumber(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeRuntimeConfig(input) {
  if (!input || typeof input !== "object") {
    return DEFAULT_RUNTIME_CONFIG;
  }
  const next = {};
  if (typeof input.API_BASE_URL === "string") {
    const trimmed = input.API_BASE_URL.trim();
    if (trimmed.length > 0) {
      next.API_BASE_URL = trimmed;
    }
  }
  if (typeof input.API_SESSION_TOKEN === "string") {
    const trimmed = input.API_SESSION_TOKEN.trim();
    if (trimmed.length > 0) {
      next.API_SESSION_TOKEN = trimmed;
    }
  }
  if (typeof input.ACTIVE_PORTFOLIO_ID === "string") {
    const trimmed = input.ACTIVE_PORTFOLIO_ID.trim();
    if (trimmed.length > 0) {
      next.ACTIVE_PORTFOLIO_ID = trimmed;
    }
  }
  const timeout = coerceNumber(input.REQUEST_TIMEOUT_MS);
  if (typeof timeout === "number" && timeout > 0) {
    next.REQUEST_TIMEOUT_MS = timeout;
  }
  if (typeof input.SESSION_AUTH_HEADER === "string") {
    const trimmed = input.SESSION_AUTH_HEADER.trim();
    if (trimmed.length > 0) {
      next.SESSION_AUTH_HEADER = trimmed;
    }
  }
  return Object.keys(next).length > 0 ? next : DEFAULT_RUNTIME_CONFIG;
}

function toPlainConfig(config) {
  if (!config || config === DEFAULT_RUNTIME_CONFIG) {
    return {};
  }
  return { ...config };
}

function logRuntimeConfigWarning(message, error) {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
    return;
  }
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(message, error);
  }
}

function readInlineRuntimeConfig() {
  if (typeof window === "undefined" || !window.__APP_CONFIG__) {
    return undefined;
  }
  return normalizeRuntimeConfig(window.__APP_CONFIG__);
}

async function fetchConfigFile() {
  if (typeof fetch !== "function") {
    return DEFAULT_RUNTIME_CONFIG;
  }
  try {
    const response = await fetch(buildConfigUrl(), { cache: "no-cache" });
    if (!response.ok) {
      return DEFAULT_RUNTIME_CONFIG;
    }
    const data = await response.json();
    return normalizeRuntimeConfig(data);
  } catch (error) {
    logRuntimeConfigWarning("runtimeConfig: failed to load config.json", error);
    return DEFAULT_RUNTIME_CONFIG;
  }
}

/**
 * Loads the runtime configuration using the documented precedence order.
 * The resolved config is cached for subsequent consumers.
 * @returns {Promise<RuntimeConfig>}
 */
export async function loadRuntimeConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }
  if (!loadingPromise) {
    loadingPromise = (async () => {
      const inlineConfig = readInlineRuntimeConfig();
      if (inlineConfig && inlineConfig !== DEFAULT_RUNTIME_CONFIG) {
        cachedConfig = inlineConfig;
        return cachedConfig;
      }
      const fileConfig = await fetchConfigFile();
      cachedConfig = fileConfig;
      return cachedConfig;
    })();
  }
  return loadingPromise;
}

/**
 * Returns the last loaded runtime config synchronously.
 * @returns {RuntimeConfig}
 */
export function getRuntimeConfigSync() {
  if (cachedConfig) {
    return cachedConfig;
  }
  const inlineConfig = readInlineRuntimeConfig();
  if (inlineConfig && inlineConfig !== DEFAULT_RUNTIME_CONFIG) {
    cachedConfig = inlineConfig;
    return cachedConfig;
  }
  return DEFAULT_RUNTIME_CONFIG;
}

/**
 * Replaces the cached config (intended for tests).
 * @param {RuntimeConfig|null} nextConfig
 */
export function setRuntimeConfigForTesting(nextConfig) {
  if (nextConfig == null) {
    cachedConfig = null;
  } else {
    cachedConfig = normalizeRuntimeConfig(nextConfig);
  }
  loadingPromise = null;
}

/**
 * Merges new runtime configuration values into the active config.
 * Intended for Electron desktop login flows that unlock the API token at runtime.
 * @param {Partial<RuntimeConfig>} nextConfig
 * @returns {RuntimeConfig}
 */
export function mergeRuntimeConfig(nextConfig) {
  const baseConfig = cachedConfig ?? readInlineRuntimeConfig() ?? DEFAULT_RUNTIME_CONFIG;
  cachedConfig = normalizeRuntimeConfig({
    ...toPlainConfig(baseConfig),
    ...toPlainConfig(nextConfig),
  });
  loadingPromise = Promise.resolve(cachedConfig);
  return cachedConfig;
}

export const RUNTIME_CONFIG_DEFAULTS = Object.freeze({
  REQUEST_TIMEOUT_MS: 15000,
});

if (typeof window !== "undefined" && !window.__APP_CONFIG__) {
  // Expose a getter for debugging without clobbering existing inline config.
  Object.defineProperty(window, "__APP_RUNTIME_CONFIG__", {
    get() {
      return cachedConfig ?? DEFAULT_RUNTIME_CONFIG;
    },
    configurable: true,
  });
}

export default DEFAULT_RUNTIME_CONFIG;
