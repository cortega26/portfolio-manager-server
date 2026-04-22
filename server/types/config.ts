// server/types/config.ts

export type CashPostingDay = 'last' | number;

export interface FeatureFlags {
  cashBenchmarks: boolean;
  monthlyCashPosting: boolean;
}

export interface BenchmarksConfig {
  tickers: string[];
  available: unknown[];
  derived: unknown[];
  defaultSelection: string[];
  priceSymbols: string[];
}

export interface CashConfig {
  postingDay: CashPostingDay;
}

export interface JobsConfig {
  nightlyHour: number;
  nightlyEnabled: boolean;
}

export interface EmailRetryConfig {
  maxAttempts: number;
  minDelayMs: number;
  backoffMultiplier: number;
  automaticRetries: boolean;
}

export interface EmailTransportConfig {
  connectionUrl: string;
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailDeliveryConfig {
  enabled: boolean;
  configured: boolean;
  from: string;
  to: string[];
  replyTo: string;
  subjectPrefix: string;
  retry: EmailRetryConfig;
  transport: EmailTransportConfig;
}

export interface NotificationsConfig {
  emailDelivery: EmailDeliveryConfig;
}

export interface CorsConfig {
  allowedOrigins: string[];
}

export interface FreshnessConfig {
  maxStaleTradingDays: number;
}

export interface PriceCacheConfig {
  ttlSeconds: number;
  liveOpenTtlSeconds: number;
  liveClosedTtlSeconds: number;
  checkPeriodSeconds: number;
}

export interface CacheConfig {
  ttlSeconds: number;
  price: PriceCacheConfig;
}

export interface PriceProvidersConfig {
  primary: string;
  fallback: string;
  alpacaApiKey: string;
  alpacaApiSecret: string;
  alphavantageApiKey: string;
}

export interface LatestPriceConfig {
  provider: string;
  apiKey: string;
  apiSecret: string;
  prepost: boolean;
}

export interface PricesConfig {
  providers: PriceProvidersConfig;
  latest: LatestPriceConfig;
}

export interface BruteForceConfig {
  maxAttempts: number;
  attemptWindowSeconds: number;
  baseLockoutSeconds: number;
  maxLockoutSeconds: number;
  progressiveMultiplier: number;
  checkPeriodSeconds: number;
}

export interface AuditLogConfig {
  maxEvents: number;
}

export interface AuthConfig {
  sessionToken: string;
  headerName: string;
}

export interface SecurityConfig {
  auth?: AuthConfig;
  bruteForce: BruteForceConfig;
  auditLog: AuditLogConfig;
}

export interface RateLimitWindow {
  windowMs: number;
  max: number;
}

export interface RateLimitConfig {
  general: RateLimitWindow;
  portfolio: RateLimitWindow;
  prices: RateLimitWindow;
}

export interface ServerConfig {
  dataDir: string;
  fetchTimeoutMs: number;
  featureFlags: FeatureFlags;
  benchmarks: BenchmarksConfig;
  cash: CashConfig;
  jobs: JobsConfig;
  notifications: NotificationsConfig;
  cors: CorsConfig;
  freshness: FreshnessConfig;
  cache: CacheConfig;
  prices: PricesConfig;
  security: SecurityConfig;
  rateLimit: RateLimitConfig;
}
