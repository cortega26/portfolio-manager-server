// @ts-nocheck
import crypto from 'crypto';

import NodeCache from 'node-cache';

const DEFAULT_TTL_SECONDS = 600;
const DEFAULT_CHECK_PERIOD_SECONDS = 120;

let priceCache = createCache();

function createCache({ ttlSeconds = DEFAULT_TTL_SECONDS, checkPeriodSeconds = DEFAULT_CHECK_PERIOD_SECONDS } = {}) {
  const stdTTL = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : DEFAULT_TTL_SECONDS;
  const checkperiod = Number.isFinite(checkPeriodSeconds) && checkPeriodSeconds > 0
    ? Math.round(checkPeriodSeconds)
    : DEFAULT_CHECK_PERIOD_SECONDS;

  return new NodeCache({
    stdTTL,
    checkperiod,
    useClones: false,
  });
}

function buildKey(symbol, range) {
  const normalizedSymbol = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
  const normalizedRange = typeof range === 'string' && range.trim() ? range.trim().toLowerCase() : '1y';
  return `${normalizedSymbol}:${normalizedRange}`;
}

export function configurePriceCache({ ttlSeconds, checkPeriodSeconds } = {}) {
  priceCache = createCache({ ttlSeconds, checkPeriodSeconds });
}

export function flushPriceCache() {
  priceCache.flushAll();
  priceCache.flushStats?.();
}

export function generateETag(data) {
  return crypto
    .createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');
}

export function setCachedPrice(symbol, range, data) {
  const key = buildKey(symbol, range);
  const etag = generateETag(data);
  priceCache.set(key, {
    data,
    etag,
    timestamp: Date.now(),
  });
  return etag;
}

export function getCachedPrice(symbol, range) {
  return priceCache.get(buildKey(symbol, range));
}

function calculateHitRate(stats) {
  const total = (stats.hits ?? 0) + (stats.misses ?? 0);
  if (total <= 0) {
    return 0;
  }
  return Number(((stats.hits ?? 0) / total * 100).toFixed(2));
}

export function getCacheStats() {
  const stats = priceCache.getStats();
  return {
    keys: priceCache.keys().length,
    hits: stats.hits ?? 0,
    misses: stats.misses ?? 0,
    hitRate: calculateHitRate(stats),
  };
}
