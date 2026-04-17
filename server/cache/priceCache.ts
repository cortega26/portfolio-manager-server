// server/cache/priceCache.ts
import { createHash } from 'node:crypto';

import NodeCache from 'node-cache';

const DEFAULT_TTL_SECONDS = 600;
const DEFAULT_CHECK_PERIOD_SECONDS = 120;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheConfig {
  ttlSeconds?: number;
  checkPeriodSeconds?: number;
}

interface CacheEntry<T = unknown> {
  data: T;
  etag: string;
  timestamp: number;
}

export interface CacheStats {
  keys: number;
  hits: number;
  misses: number;
  hitRate: number;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let priceCache = createCache();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createCache({
  ttlSeconds = DEFAULT_TTL_SECONDS,
  checkPeriodSeconds = DEFAULT_CHECK_PERIOD_SECONDS,
}: CacheConfig = {}): NodeCache {
  const stdTTL =
    Number.isFinite(ttlSeconds) && ttlSeconds > 0
      ? ttlSeconds
      : DEFAULT_TTL_SECONDS;
  const checkperiod =
    Number.isFinite(checkPeriodSeconds) && checkPeriodSeconds > 0
      ? Math.round(checkPeriodSeconds)
      : DEFAULT_CHECK_PERIOD_SECONDS;

  return new NodeCache({
    stdTTL,
    checkperiod,
    useClones: false,
  });
}

function buildKey(symbol: unknown, range: unknown): string {
  const normalizedSymbol =
    typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
  const normalizedRange =
    typeof range === 'string' && range.trim()
      ? range.trim().toLowerCase()
      : '1y';
  return `${normalizedSymbol}:${normalizedRange}`;
}

function calculateHitRate(stats: { hits?: number; misses?: number }): number {
  const total = (stats.hits ?? 0) + (stats.misses ?? 0);
  if (total <= 0) {
    return 0;
  }
  return Number((((stats.hits ?? 0) / total) * 100).toFixed(2));
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export function configurePriceCache({
  ttlSeconds,
  checkPeriodSeconds,
}: CacheConfig = {}): void {
  priceCache = createCache({ ttlSeconds, checkPeriodSeconds });
}

export function flushPriceCache(): void {
  priceCache.flushAll();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (priceCache as any).flushStats?.();
}

export function generateETag(data: unknown): string {
  return createHash('md5').update(JSON.stringify(data)).digest('hex');
}

export function setCachedPrice(
  symbol: unknown,
  range: unknown,
  data: unknown,
  { ttlSeconds }: { ttlSeconds?: number } = {},
): string {
  const key = buildKey(symbol, range);
  const etag = generateETag(data);
  const payload: CacheEntry = {
    data,
    etag,
    timestamp: Date.now(),
  };
  if (Number.isFinite(ttlSeconds) && (ttlSeconds as number) > 0) {
    priceCache.set(key, payload, Math.round(ttlSeconds as number));
  } else {
    priceCache.set(key, payload);
  }
  return etag;
}

export function getCachedPrice(
  symbol: unknown,
  range: unknown,
  { maxAgeMs }: { maxAgeMs?: number } = {},
): CacheEntry | undefined {
  const cached = priceCache.get<CacheEntry>(buildKey(symbol, range));
  if (!cached) {
    return cached;
  }
  if (Number.isFinite(maxAgeMs) && (maxAgeMs as number) >= 0) {
    const timestamp = Number(cached.timestamp);
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > (maxAgeMs as number)) {
      return undefined;
    }
  }
  return cached;
}

export function getCacheStats(): CacheStats {
  const stats = priceCache.getStats();
  return {
    keys: priceCache.keys().length,
    hits: stats.hits ?? 0,
    misses: stats.misses ?? 0,
    hitRate: calculateHitRate(stats),
  };
}
