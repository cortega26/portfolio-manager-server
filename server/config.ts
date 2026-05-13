import path from 'node:path';

import {
  normalizeLatestQuoteProviderName,
  normalizePriceProviderName,
} from './data/priceProviderFactory.js';

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
import { normalizeBenchmarkConfig as normalizeBenchmarkConfigShared } from '../shared/benchmarks.js';

import type { ServerConfig } from './types/config.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const _BOOLEAN_MAP = new Map<string, boolean>([
  ['1', true],
  ['true', true],
  ['yes', true],
  ['on', true],
  ['0', false],
  ['false', false],
  ['no', false],
  ['off', false],
]);

function parseBoolean(value: unknown, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  const mapped = _BOOLEAN_MAP.get(normalized);
  return mapped !== undefined ? mapped : defaultValue;
}

function parseNumber(value: unknown, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseInteger(value: unknown, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseList(value: unknown, defaultValue: string[] = []): string[] {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalString(value: unknown, defaultValue = ''): string {
  if (typeof value !== 'string') {
    return defaultValue;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : defaultValue;
}

// ---------------------------------------------------------------------------
// Exported loader
// ---------------------------------------------------------------------------

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = path.resolve(env['DATA_DIR'] ?? './data');
  const fetchTimeoutMs = parseNumber(env['PRICE_FETCH_TIMEOUT_MS'], 5000);
  const featureFlagCashBenchmarks = parseBoolean(env['FEATURES_CASH_BENCHMARKS'], true);
  const featureFlagMonthlyCashPosting = parseBoolean(env['FEATURES_MONTHLY_CASH_POSTING'], false);
  const cashPostingDay = (() => {
    const raw = env['CASH_POSTING_DAY'];
    if (!raw) {
      return 'last' as const;
    }
    const normalized = String(raw).trim().toLowerCase();
    if (['last', 'eom', 'end'].includes(normalized)) {
      return 'last' as const;
    }
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : ('last' as const);
  })();
  const benchmarkConfig = normalizeBenchmarkConfigShared({
    tickers: parseList(env['BENCHMARK_TICKERS']),
    defaultSelection: parseList(env['BENCHMARK_DEFAULT_SELECTION']),
  }) as unknown as ServerConfig['benchmarks'];
  const allowedOrigins = parseList(env['CORS_ALLOWED_ORIGINS'], []);
  const nightlyHour = parseNumber(env['JOB_NIGHTLY_HOUR'], 4);
  const nightlyEnabled = parseBoolean(env['JOB_NIGHTLY_ENABLED'], true);
  const maxStaleTradingDays = parseNumber(
    env['FRESHNESS_MAX_STALE_TRADING_DAYS'],
    DEFAULT_MAX_STALE_TRADING_DAYS as number
  );
  const apiCacheTtlSeconds = parseNumber(
    env['API_CACHE_TTL_SECONDS'],
    DEFAULT_API_CACHE_TTL_SECONDS as number
  );
  const priceCacheTtlSeconds = parseNumber(
    env['PRICE_CACHE_TTL_SECONDS'],
    DEFAULT_PRICE_CACHE_TTL_SECONDS as number
  );
  const priceCacheLiveOpenTtlSeconds = parseNumber(env['PRICE_CACHE_LIVE_OPEN_TTL_SECONDS'], 60);
  const priceCacheLiveClosedTtlSeconds = parseNumber(
    env['PRICE_CACHE_LIVE_CLOSED_TTL_SECONDS'],
    15 * 60
  );
  const priceCacheCheckPeriodSeconds = parseNumber(
    env['PRICE_CACHE_CHECK_PERIOD'],
    DEFAULT_PRICE_CACHE_CHECK_PERIOD_SECONDS as number
  );
  const sessionAuthToken = parseOptionalString(env['PORTFOLIO_SESSION_TOKEN']);
  const sessionAuthHeaderName = parseOptionalString(env['SESSION_AUTH_HEADER'], 'x-session-token');
  const bruteForceMaxAttempts = parseNumber(env['BRUTE_FORCE_MAX_ATTEMPTS'], 5);
  const bruteForceAttemptWindowSeconds = parseNumber(
    env['BRUTE_FORCE_ATTEMPT_WINDOW_SECONDS'],
    15 * 60
  );
  const bruteForceLockoutSeconds = parseNumber(env['BRUTE_FORCE_LOCKOUT_SECONDS'], 15 * 60);
  const bruteForceMaxLockoutSeconds = parseNumber(env['BRUTE_FORCE_MAX_LOCKOUT_SECONDS'], 60 * 60);
  const bruteForceMultiplier = parseNumber(env['BRUTE_FORCE_LOCKOUT_MULTIPLIER'], 2);
  const bruteForceCheckPeriodSeconds = parseNumber(env['BRUTE_FORCE_CHECK_PERIOD'], 60);
  const auditLogMaxEvents = (() => {
    const parsed = parseNumber(
      env['SECURITY_AUDIT_MAX_EVENTS'],
      SECURITY_AUDIT_DEFAULT_MAX_EVENTS as number
    );
    return Math.min(
      SECURITY_AUDIT_MAX_EVENTS as number,
      Math.max(
        SECURITY_AUDIT_MIN_EVENTS as number,
        Math.round(parsed ?? (SECURITY_AUDIT_DEFAULT_MAX_EVENTS as number))
      )
    );
  })();
  const generalRateLimitWindowMs = parseNumber(
    env['RATE_LIMIT_GENERAL_WINDOW_MS'],
    (RATE_LIMIT_DEFAULTS as Record<string, Record<string, number>>)['general']!['windowMs']!
  );
  const generalRateLimitMax = parseNumber(
    env['RATE_LIMIT_GENERAL_MAX'],
    (RATE_LIMIT_DEFAULTS as Record<string, Record<string, number>>)['general']!['max']!
  );
  const portfolioRateLimitWindowMs = parseNumber(
    env['RATE_LIMIT_PORTFOLIO_WINDOW_MS'],
    (RATE_LIMIT_DEFAULTS as Record<string, Record<string, number>>)['portfolio']!['windowMs']!
  );
  const portfolioRateLimitMax = parseNumber(
    env['RATE_LIMIT_PORTFOLIO_MAX'],
    (RATE_LIMIT_DEFAULTS as Record<string, Record<string, number>>)['portfolio']!['max']!
  );
  const pricesRateLimitWindowMs = parseNumber(
    env['RATE_LIMIT_PRICES_WINDOW_MS'],
    (RATE_LIMIT_DEFAULTS as Record<string, Record<string, number>>)['prices']!['windowMs']!
  );
  const pricesRateLimitMax = parseNumber(
    env['RATE_LIMIT_PRICES_MAX'],
    (RATE_LIMIT_DEFAULTS as Record<string, Record<string, number>>)['prices']!['max']!
  );
  const emailDeliveryEnabled = parseBoolean(env['EMAIL_DELIVERY_ENABLED'], false);
  const emailDeliveryConnectionUrl = parseOptionalString(env['EMAIL_DELIVERY_CONNECTION_URL']);
  const emailDeliveryHost = parseOptionalString(env['EMAIL_DELIVERY_HOST']);
  const emailDeliveryPort = parseNumber(env['EMAIL_DELIVERY_PORT'], 587);
  const emailDeliverySecure = parseBoolean(env['EMAIL_DELIVERY_SECURE'], false);
  const emailDeliveryUser = parseOptionalString(env['EMAIL_DELIVERY_USER']);
  const emailDeliveryPass = parseOptionalString(env['EMAIL_DELIVERY_PASS']);
  const emailDeliveryFrom = parseOptionalString(env['EMAIL_DELIVERY_FROM']);
  const emailDeliveryTo = parseList(env['EMAIL_DELIVERY_TO'], []);
  const emailDeliveryReplyTo = parseOptionalString(env['EMAIL_DELIVERY_REPLY_TO']);
  const emailDeliverySubjectPrefix = parseOptionalString(
    env['EMAIL_DELIVERY_SUBJECT_PREFIX'],
    '[Portfolio Manager]'
  );
  const emailDeliveryRetryMaxAttempts = Math.max(
    1,
    parseInteger(env['EMAIL_DELIVERY_RETRY_MAX_ATTEMPTS'], 3)
  );
  const emailDeliveryRetryMinDelaySeconds = Math.max(
    0,
    parseInteger(env['EMAIL_DELIVERY_RETRY_MIN_DELAY_SECONDS'], 60 * 60)
  );
  const emailDeliveryRetryBackoffMultiplier = Math.max(
    1,
    parseInteger(env['EMAIL_DELIVERY_RETRY_BACKOFF_MULTIPLIER'], 2)
  );
  const emailDeliveryRetryAutomatic = parseBoolean(env['EMAIL_DELIVERY_RETRY_AUTOMATIC'], true);
  const emailDeliveryConfigured = Boolean(
    emailDeliveryEnabled &&
    emailDeliveryFrom &&
    emailDeliveryTo.length > 0 &&
    (emailDeliveryConnectionUrl || emailDeliveryHost)
  );
  const latestProvider = normalizeLatestQuoteProviderName(
    env['PRICE_PROVIDER_LATEST'],
    'none'
  ) as string;

  return {
    dataDir,
    fetchTimeoutMs,
    featureFlags: {
      cashBenchmarks: featureFlagCashBenchmarks,
      monthlyCashPosting: featureFlagMonthlyCashPosting,
    },
    benchmarks: benchmarkConfig,
    cash: {
      postingDay: cashPostingDay,
    },
    jobs: {
      nightlyHour,
      nightlyEnabled,
    },
    notifications: {
      emailDelivery: {
        enabled: emailDeliveryEnabled,
        configured: emailDeliveryConfigured,
        from: emailDeliveryFrom,
        to: emailDeliveryTo,
        replyTo: emailDeliveryReplyTo,
        subjectPrefix: emailDeliverySubjectPrefix,
        retry: {
          maxAttempts: emailDeliveryRetryMaxAttempts,
          minDelayMs: emailDeliveryRetryMinDelaySeconds * 1000,
          backoffMultiplier: emailDeliveryRetryBackoffMultiplier,
          automaticRetries: emailDeliveryRetryAutomatic,
        },
        transport: {
          connectionUrl: emailDeliveryConnectionUrl,
          host: emailDeliveryHost,
          port: emailDeliveryPort,
          secure: emailDeliverySecure,
          auth: {
            user: emailDeliveryUser,
            pass: emailDeliveryPass,
          },
        },
      },
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
        liveOpenTtlSeconds: priceCacheLiveOpenTtlSeconds,
        liveClosedTtlSeconds: priceCacheLiveClosedTtlSeconds,
        checkPeriodSeconds: priceCacheCheckPeriodSeconds,
      },
    },
    prices: {
      providers: {
        primary: normalizePriceProviderName(env['PRICE_PROVIDER_PRIMARY'], 'stooq') as string,
        fallback: normalizePriceProviderName(env['PRICE_PROVIDER_FALLBACK'], 'yahoo') as string,
        alpacaApiKey: typeof env['ALPACA_API_KEY'] === 'string' ? env['ALPACA_API_KEY'].trim() : '',
        alpacaApiSecret:
          typeof env['ALPACA_API_SECRET'] === 'string' ? env['ALPACA_API_SECRET'].trim() : '',
        alphavantageApiKey:
          typeof env['ALPHAVANTAGE_API_KEY'] === 'string' ? env['ALPHAVANTAGE_API_KEY'].trim() : '',
      },
      latest: {
        provider: latestProvider,
        apiKey:
          latestProvider === 'alpaca'
            ? typeof env['ALPACA_API_KEY'] === 'string'
              ? env['ALPACA_API_KEY'].trim()
              : ''
            : latestProvider === 'twelvedata' && typeof env['TWELVE_DATA_API_KEY'] === 'string'
              ? env['TWELVE_DATA_API_KEY'].trim()
              : latestProvider === 'finnhub' && typeof env['FINNHUB_API_KEY'] === 'string'
                ? env['FINNHUB_API_KEY'].trim()
                : '',
        apiSecret:
          latestProvider === 'alpaca' && typeof env['ALPACA_API_SECRET'] === 'string'
            ? env['ALPACA_API_SECRET'].trim()
            : '',
        prepost: parseBoolean(env['TWELVE_DATA_PREPOST'], true),
      },
    },
    security: {
      auth: {
        sessionToken: sessionAuthToken,
        headerName: sessionAuthHeaderName,
      },
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
