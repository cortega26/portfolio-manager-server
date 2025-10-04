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

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR ?? './data');
  const fetchTimeoutMs = parseNumber(env.PRICE_FETCH_TIMEOUT_MS, 5000);
  const featureFlagCashBenchmarks = parseBoolean(
    env.FEATURES_CASH_BENCHMARKS,
    true,
  );

  return {
    dataDir,
    fetchTimeoutMs,
    featureFlags: {
      cashBenchmarks: featureFlagCashBenchmarks,
    },
    jobs: {
      nightlyHour: parseNumber(env.JOB_NIGHTLY_HOUR, 1),
    },
  };
}

export default loadConfig;
