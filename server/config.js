import path from 'path';

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function parseNumber(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseList(value, defaultValue = []) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR ?? './data');
  const fetchTimeoutMs = parseNumber(env.PRICE_FETCH_TIMEOUT_MS, 5000);
  const featureFlagCashBenchmarks = parseBoolean(
    env.FEATURES_CASH_BENCHMARKS,
    true,
  );
  const allowedOrigins = parseList(env.CORS_ALLOWED_ORIGINS, []);
  const nightlyHour = parseNumber(env.JOB_NIGHTLY_HOUR, 4);
  const maxStaleTradingDays = parseNumber(
    env.FRESHNESS_MAX_STALE_TRADING_DAYS,
    3,
  );

  return {
    dataDir,
    fetchTimeoutMs,
    featureFlags: {
      cashBenchmarks: featureFlagCashBenchmarks,
    },
    jobs: {
      nightlyHour,
    },
    cors: {
      allowedOrigins,
    },
    freshness: {
      maxStaleTradingDays,
    },
  };
}

export default loadConfig;
