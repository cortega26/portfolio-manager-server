export const DEFAULT_API_CACHE_TTL_SECONDS = 600;
export const MIN_API_CACHE_TTL_SECONDS = 300;
export const MAX_API_CACHE_TTL_SECONDS = 900;

export const DEFAULT_PRICE_CACHE_TTL_SECONDS = 600;
export const DEFAULT_PRICE_CACHE_CHECK_PERIOD_SECONDS = 120;

export const DEFAULT_MAX_STALE_TRADING_DAYS = 3;

export const RATE_LIMIT_DEFAULTS = Object.freeze({
  general: Object.freeze({ windowMs: 60_000, max: 100 }),
  portfolio: Object.freeze({ windowMs: 60_000, max: 20 }),
  prices: Object.freeze({ windowMs: 60_000, max: 60 }),
});

export const MIN_RATE_LIMIT_WINDOW_MS = 100;
export const MIN_RATE_LIMIT_MAX = 1;

export const MAX_TRANSACTIONS_PER_PORTFOLIO = 250_000;

export const SECURITY_AUDIT_DEFAULT_MAX_EVENTS = 200;
export const SECURITY_AUDIT_MIN_EVENTS = 1;
export const SECURITY_AUDIT_MAX_EVENTS = 1000;
export const SECURITY_AUDIT_DEFAULT_QUERY_LIMIT = 50;
export const SECURITY_AUDIT_MAX_QUERY_LIMIT = 200;

export const PORTFOLIO_SCHEMA_VERSION = 2;
export const CASH_POLICY_SCHEMA_VERSION = 1;
