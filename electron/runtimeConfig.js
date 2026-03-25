export const DESKTOP_RUNTIME_CONFIG_ENV = "PORTFOLIO_DESKTOP_RUNTIME_CONFIG";
export const DESKTOP_RUNTIME_CONFIG_ARG_PREFIX = "--portfolio-desktop-runtime-config=";

function normalizeString(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNumber(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.round(parsed);
}

export function buildDesktopRuntimeConfig({
  apiBaseUrl,
  sessionToken,
  activePortfolioId,
  sessionAuthHeader,
  requestTimeoutMs,
  API_BASE_URL,
  API_SESSION_TOKEN,
  ACTIVE_PORTFOLIO_ID,
  SESSION_AUTH_HEADER,
  REQUEST_TIMEOUT_MS,
} = {}) {
  const config = {};
  const normalizedBaseUrl = normalizeString(apiBaseUrl ?? API_BASE_URL);
  if (normalizedBaseUrl) {
    config.API_BASE_URL = normalizedBaseUrl;
  }
  const normalizedSessionToken = normalizeString(
    sessionToken ?? API_SESSION_TOKEN,
  );
  if (normalizedSessionToken) {
    config.API_SESSION_TOKEN = normalizedSessionToken;
  }
  const normalizedPortfolioId = normalizeString(
    activePortfolioId ?? ACTIVE_PORTFOLIO_ID,
  );
  if (normalizedPortfolioId) {
    config.ACTIVE_PORTFOLIO_ID = normalizedPortfolioId;
  }
  const normalizedHeader = normalizeString(
    sessionAuthHeader ?? SESSION_AUTH_HEADER,
  );
  if (normalizedHeader) {
    config.SESSION_AUTH_HEADER = normalizedHeader;
  }
  const normalizedTimeout = normalizeNumber(
    requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
  );
  if (normalizedTimeout) {
    config.REQUEST_TIMEOUT_MS = normalizedTimeout;
  }
  return Object.freeze(config);
}

export function encodeDesktopRuntimeConfig(config) {
  return Buffer.from(JSON.stringify(config ?? {}), "utf8").toString("base64");
}

export function buildDesktopRuntimeConfigArg(config) {
  return `${DESKTOP_RUNTIME_CONFIG_ARG_PREFIX}${encodeDesktopRuntimeConfig(config)}`;
}

export function decodeDesktopRuntimeConfig(serializedConfig) {
  if (typeof serializedConfig !== "string" || serializedConfig.trim().length === 0) {
    return Object.freeze({});
  }
  const raw = Buffer.from(serializedConfig, "base64").toString("utf8");
  const parsed = JSON.parse(raw);
  return buildDesktopRuntimeConfig(parsed);
}

export function readDesktopRuntimeConfigFromEnv(env = process.env) {
  return decodeDesktopRuntimeConfig(env?.[DESKTOP_RUNTIME_CONFIG_ENV] ?? "");
}

export function readDesktopRuntimeConfigFromArgv(argv = process.argv) {
  if (!Array.isArray(argv)) {
    return Object.freeze({});
  }
  const encodedConfig = argv.find(
    (entry) =>
      typeof entry === "string" && entry.startsWith(DESKTOP_RUNTIME_CONFIG_ARG_PREFIX),
  );
  if (!encodedConfig) {
    return Object.freeze({});
  }
  return decodeDesktopRuntimeConfig(
    encodedConfig.slice(DESKTOP_RUNTIME_CONFIG_ARG_PREFIX.length),
  );
}
