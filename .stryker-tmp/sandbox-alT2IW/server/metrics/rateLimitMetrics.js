// @ts-nocheck
const RECENT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const ONE_MINUTE_MS = 60 * 1000;
const MAX_RECENT_EVENTS = 1000;
const MAX_OFFENDERS = 100;

const scopes = new Map();

function normalizeScope(scope) {
  if (typeof scope === 'string' && scope.trim().length > 0) {
    return scope.trim().toLowerCase();
  }
  return 'unknown';
}

function sanitizeIp(ip) {
  if (typeof ip !== 'string') {
    if (ip === null || ip === undefined) {
      return 'unknown';
    }
    return String(ip);
  }
  const trimmed = ip.trim();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

function ensureScope(scope) {
  const key = normalizeScope(scope);
  if (!scopes.has(key)) {
    scopes.set(key, {
      totalHits: 0,
      lastHitAt: 0,
      limit: null,
      windowMs: null,
      configured: false,
      recentHits: [],
      offenders: new Map(),
    });
  }
  return scopes.get(key);
}

function pruneRecentHits(entry, now) {
  const cutoff = now - RECENT_WINDOW_MS;
  while (entry.recentHits.length > 0 && entry.recentHits[0] < cutoff) {
    entry.recentHits.shift();
  }
  for (const [ip, offender] of entry.offenders) {
    if (offender.lastHitAt < cutoff) {
      entry.offenders.delete(ip);
    }
  }
}

function pruneOffenders(entry) {
  if (entry.offenders.size <= MAX_OFFENDERS) {
    return;
  }
  const sorted = Array.from(entry.offenders.entries()).sort((a, b) => {
    if (a[1].hits === b[1].hits) {
      return a[1].lastHitAt - b[1].lastHitAt;
    }
    return a[1].hits - b[1].hits;
  });
  while (sorted.length > MAX_OFFENDERS) {
    const [ip] = sorted.shift();
    entry.offenders.delete(ip);
  }
}

export function registerRateLimitConfig(scope, { limit, windowMs } = {}) {
  const entry = ensureScope(scope);
  entry.configured = true;
  if (Number.isFinite(limit)) {
    entry.limit = Math.max(1, Math.floor(limit));
  }
  if (Number.isFinite(windowMs)) {
    entry.windowMs = Math.max(0, Math.floor(windowMs));
  }
}

export function recordRateLimitHit({ scope, limit, windowMs, ip } = {}) {
  const entry = ensureScope(scope);
  const now = Date.now();
  pruneRecentHits(entry, now);

  if (Number.isFinite(limit)) {
    entry.limit = Math.max(1, Math.floor(limit));
  }
  if (Number.isFinite(windowMs)) {
    entry.windowMs = Math.max(0, Math.floor(windowMs));
  }

  entry.totalHits += 1;
  entry.lastHitAt = now;
  entry.recentHits.push(now);
  if (entry.recentHits.length > MAX_RECENT_EVENTS) {
    entry.recentHits.splice(0, entry.recentHits.length - MAX_RECENT_EVENTS);
  }

  const ipKey = sanitizeIp(ip);
  const offender = entry.offenders.get(ipKey) ?? { hits: 0, lastHitAt: 0 };
  offender.hits += 1;
  offender.lastHitAt = now;
  entry.offenders.set(ipKey, offender);
  pruneOffenders(entry);
}

function calculateHitsWithin(entry, windowMs, now) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    return entry.recentHits.length;
  }
  const threshold = now - windowMs;
  let count = 0;
  for (let i = entry.recentHits.length - 1; i >= 0; i -= 1) {
    if (entry.recentHits[i] >= threshold) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function calculateHitsLastMinute(entry, now) {
  const threshold = now - ONE_MINUTE_MS;
  let count = 0;
  for (let i = entry.recentHits.length - 1; i >= 0; i -= 1) {
    if (entry.recentHits[i] >= threshold) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function serializeOffenders(entry) {
  const offenders = Array.from(entry.offenders.entries())
    .sort((a, b) => {
      if (b[1].hits === a[1].hits) {
        return b[1].lastHitAt - a[1].lastHitAt;
      }
      return b[1].hits - a[1].hits;
    })
    .slice(0, 5)
    .map(([ip, data]) => ({
      ip,
      hits: data.hits,
      lastHitAt: data.lastHitAt ? new Date(data.lastHitAt).toISOString() : null,
    }));
  return offenders;
}

export function getRateLimitMetrics({ now = Date.now() } = {}) {
  const resolvedNow = Number.isFinite(now) ? now : Date.now();
  const result = {
    totalHits: 0,
    scopes: {},
  };

  for (const [scope, entry] of scopes.entries()) {
    pruneRecentHits(entry, resolvedNow);
    const hitsLastMinute = calculateHitsLastMinute(entry, resolvedNow);
    const hitsLastWindow = calculateHitsWithin(entry, entry.windowMs, resolvedNow);
    result.totalHits += entry.totalHits;
    result.scopes[scope] = {
      configured: entry.configured,
      limit: entry.limit,
      windowMs: entry.windowMs,
      totalHits: entry.totalHits,
      hitsLastMinute,
      hitsLastWindow,
      hitsLast15m: entry.recentHits.length,
      uniqueIpCount: entry.offenders.size,
      lastHitAt: entry.lastHitAt ? new Date(entry.lastHitAt).toISOString() : null,
      topOffenders: serializeOffenders(entry),
    };
  }

  return result;
}

export function resetRateLimitMetrics() {
  scopes.clear();
}

export default {
  registerRateLimitConfig,
  recordRateLimitHit,
  getRateLimitMetrics,
  resetRateLimitMetrics,
};
