import path from 'path';

import {
  DEFAULT_API_CACHE_TTL_SECONDS,
  DEFAULT_MAX_STALE_TRADING_DAYS,
  DEFAULT_PRICE_CACHE_CHECK_PERIOD_SECONDS,
  DEFAULT_PRICE_CACHE_TTL_SECONDS,
  RATE_LIMIT_DEFAULTS,
  SECURITY_AUDIT_DEFAULT_MAX_EVENTS,
  SECURITY_AUDIT_MAX_EVENTS,
  SECURITY_AUDIT_MIN_EVENTS,
} from '../shared/constants.js';

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
  const featureFlagMonthlyCashPosting = parseBoolean(
    env.FEATURES_MONTHLY_CASH_POSTING,
    false,
  );
  const cashPostingDay = (() => {
    const raw = env.CASH_POSTING_DAY;
    if (!raw) {
      return 'last';
    }
    const normalized = String(raw).trim().toLowerCase();
    if (['last', 'eom', 'end'].includes(normalized)) {
      return 'last';
    }
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : 'last';
  })();
  const allowedOrigins = parseList(env.CORS_ALLOWED_ORIGINS, []);
  const nightlyHour = parseNumber(env.JOB_NIGHTLY_HOUR, 4);
  const maxStaleTradingDays = parseNumber(
    env.FRESHNESS_MAX_STALE_TRADING_DAYS,
    DEFAULT_MAX_STALE_TRADING_DAYS,
  );
  const apiCacheTtlSeconds = parseNumber(
    env.API_CACHE_TTL_SECONDS,
    DEFAULT_API_CACHE_TTL_SECONDS,
  );
  const priceCacheTtlSeconds = parseNumber(
    env.PRICE_CACHE_TTL_SECONDS,
    DEFAULT_PRICE_CACHE_TTL_SECONDS,
  );
  const priceCacheCheckPeriodSeconds = parseNumber(
    env.PRICE_CACHE_CHECK_PERIOD,
    DEFAULT_PRICE_CACHE_CHECK_PERIOD_SECONDS,
  );
  const bruteForceMaxAttempts = parseNumber(env.BRUTE_FORCE_MAX_ATTEMPTS, 5);
  const bruteForceAttemptWindowSeconds = parseNumber(env.BRUTE_FORCE_ATTEMPT_WINDOW_SECONDS, 15 * 60);
  const bruteForceLockoutSeconds = parseNumber(env.BRUTE_FORCE_LOCKOUT_SECONDS, 15 * 60);
  const bruteForceMaxLockoutSeconds = parseNumber(env.BRUTE_FORCE_MAX_LOCKOUT_SECONDS, 60 * 60);
  const bruteForceMultiplier = parseNumber(env.BRUTE_FORCE_LOCKOUT_MULTIPLIER, 2);
  const bruteForceCheckPeriodSeconds = parseNumber(env.BRUTE_FORCE_CHECK_PERIOD, 60);
  const auditLogMaxEvents = (() => {
    const parsed = parseNumber(
      env.SECURITY_AUDIT_MAX_EVENTS,
      SECURITY_AUDIT_DEFAULT_MAX_EVENTS,
    );
    return Math.min(
      SECURITY_AUDIT_MAX_EVENTS,
      Math.max(SECURITY_AUDIT_MIN_EVENTS, Math.round(parsed ?? SECURITY_AUDIT_DEFAULT_MAX_EVENTS)),
    );
  })();
  const generalRateLimitWindowMs = parseNumber(
    env.RATE_LIMIT_GENERAL_WINDOW_MS,
    RATE_LIMIT_DEFAULTS.general.windowMs,
  );
  const generalRateLimitMax = parseNumber(
    env.RATE_LIMIT_GENERAL_MAX,
    RATE_LIMIT_DEFAULTS.general.max,
  );
  const portfolioRateLimitWindowMs = parseNumber(
    env.RATE_LIMIT_PORTFOLIO_WINDOW_MS,
    RATE_LIMIT_DEFAULTS.portfolio.windowMs,
  );
  const portfolioRateLimitMax = parseNumber(
    env.RATE_LIMIT_PORTFOLIO_MAX,
    RATE_LIMIT_DEFAULTS.portfolio.max,
  );
  const pricesRateLimitWindowMs = parseNumber(
    env.RATE_LIMIT_PRICES_WINDOW_MS,
    RATE_LIMIT_DEFAULTS.prices.windowMs,
  );
  const pricesRateLimitMax = parseNumber(
    env.RATE_LIMIT_PRICES_MAX,
    RATE_LIMIT_DEFAULTS.prices.max,
  );

  return {
    dataDir,
    fetchTimeoutMs,
    featureFlags: {
      cashBenchmarks: featureFlagCashBenchmarks,
      monthlyCashPosting: featureFlagMonthlyCashPosting,
    },
    cash: {
      postingDay: cashPostingDay,
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
    cache: {
      ttlSeconds: apiCacheTtlSeconds,
      price: {
        ttlSeconds: priceCacheTtlSeconds,
        checkPeriodSeconds: priceCacheCheckPeriodSeconds,
      },
    },
    security: {
      bruteForce: {
        maxAttempts: bruteForceMaxAttempts,
        attemptWindowSeconds: bruteForceAttemptWindowSeconds,
        baseLockoutSeconds: bruteForceLockoutSeconds,
        maxLockoutSeconds: bruteForceMaxLockoutSeconds,
        progressiveMultiplier: bruteForceMultiplier,
        checkPeriodSeconds: bruteForceCheckPeriodSeconds,
      },
      auditLog: {
        maxEvents: auditLogMaxEvents,
      },
    },
    rateLimit: {
      general: {
        windowMs: generalRateLimitWindowMs,
        max: generalRateLimitMax,
      },
      portfolio: {
        windowMs: portfolioRateLimitWindowMs,
        max: portfolioRateLimitMax,
      },
      prices: {
        windowMs: pricesRateLimitWindowMs,
        max: pricesRateLimitMax,
      },
    },
  };
}

export default loadConfig;
