import NodeCache from 'node-cache';

const DEFAULT_CONFIG = {
  maxAttempts: 5,
  attemptWindowSeconds: 15 * 60,
  baseLockoutSeconds: 15 * 60,
  maxLockoutSeconds: 60 * 60,
  progressiveMultiplier: 2,
  checkPeriodSeconds: 60,
};

let config = { ...DEFAULT_CONFIG };
let failureCache = createFailureCache(config);
let lockoutCache = createLockoutCache(config);

function createFailureCache({ attemptWindowSeconds, checkPeriodSeconds }) {
  return new NodeCache({
    stdTTL: Math.max(1, Math.ceil(attemptWindowSeconds)),
    checkperiod: Math.max(1, Math.ceil(checkPeriodSeconds)),
    useClones: false,
  });
}

function createLockoutCache({ maxLockoutSeconds, checkPeriodSeconds }) {
  return new NodeCache({
    stdTTL: Math.max(1, Math.ceil(maxLockoutSeconds)),
    checkperiod: Math.max(1, Math.ceil(checkPeriodSeconds)),
    useClones: false,
  });
}

const toKey = (portfolioId, ip) => `${portfolioId ?? 'unknown'}::${ip ?? 'unknown'}`;

function fromKey(key) {
  if (typeof key !== 'string') {
    return { portfolioId: null, ip: null };
  }
  const [portfolioPart = 'unknown', ipPart = 'unknown'] = key.split('::');
  const portfolioId = portfolioPart === 'unknown' ? null : portfolioPart;
  const ip = ipPart === 'unknown' ? null : ipPart;
  return { portfolioId, ip };
}

export function configureBruteForce(options = {}) {
  config = {
    ...DEFAULT_CONFIG,
    ...normalizeConfig(options),
  };
  failureCache = createFailureCache(config);
  lockoutCache = createLockoutCache(config);
}

function normalizeConfig(options) {
  const normalized = { ...options };
  for (const key of Object.keys(normalized)) {
    const value = normalized[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      const numeric = Number.parseFloat(value);
      normalized[key] = Number.isFinite(numeric) ? numeric : value;
    }
  }
  return normalized;
}

export function registerAuthFailure(portfolioId, ip, now = Date.now()) {
  const key = toKey(portfolioId, ip);
  const lockout = lockoutCache.get(key);
  if (lockout && lockout.lockedUntil > now) {
    return formatLockoutResult(lockout, now);
  }

  let failureState = failureCache.get(key);
  if (!failureState || now - failureState.firstFailureAt > config.attemptWindowSeconds * 1000) {
    failureState = { count: 0, firstFailureAt: now };
  }
  failureState.count += 1;
  failureState.firstFailureAt ??= now;
  failureCache.set(key, failureState, Math.max(1, Math.ceil(config.attemptWindowSeconds)));

  if (failureState.count >= config.maxAttempts) {
    const nextLockout = applyLockout(key, failureState.count, now, lockout);
    failureCache.del(key);
    return formatLockoutResult(nextLockout, now, { justLocked: true });
  }

  return {
    blocked: false,
    failures: failureState.count,
    remainingAttempts: Math.max(0, config.maxAttempts - failureState.count),
  };
}

export function clearAuthFailures(portfolioId, ip) {
  const key = toKey(portfolioId, ip);
  failureCache.del(key);
  lockoutCache.del(key);
}

export function checkBruteForceLockout(portfolioId, ip, now = Date.now()) {
  const key = toKey(portfolioId, ip);
  const lockout = lockoutCache.get(key);
  if (!lockout) {
    return { blocked: false };
  }
  if (lockout.lockedUntil <= now) {
    lockoutCache.del(key);
    return { blocked: false };
  }
  return formatLockoutResult(lockout, now);
}

export function getBruteForceStats() {
  const now = Date.now();
  const lockouts = [];
  for (const key of lockoutCache.keys()) {
    const entry = lockoutCache.get(key);
    if (!entry || entry.lockedUntil <= now) {
      continue;
    }
    const { portfolioId, ip } = fromKey(key);
    lockouts.push({
      portfolioId,
      ip,
      lockoutCount: entry.lockoutCount,
      lockedUntil: new Date(entry.lockedUntil).toISOString(),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
      attempts: entry.attempts,
    });
  }
  lockouts.sort((a, b) => b.retryAfterSeconds - a.retryAfterSeconds);

  return {
    config: { ...config },
    activeFailureKeys: failureCache.keys().length,
    activeLockouts: lockoutCache.keys().length,
    lockouts,
  };
}

function applyLockout(key, attempts, now, previousLockout) {
  const priorCount = previousLockout?.lockoutCount ?? 0;
  const durationSeconds = Math.min(
    config.maxLockoutSeconds,
    config.baseLockoutSeconds * Math.pow(config.progressiveMultiplier, priorCount),
  );
  const safeDurationMs = Math.max(1000, durationSeconds * 1000);
  const lockedUntil = now + safeDurationMs;
  const entry = {
    lockoutCount: priorCount + 1,
    lockedUntil,
    attempts,
  };
  const ttlSeconds = Math.max(
    Math.ceil(safeDurationMs / 1000),
    Math.ceil(config.maxLockoutSeconds),
  );
  lockoutCache.set(key, entry, ttlSeconds);
  return entry;
}

function formatLockoutResult(lockout, now, extras = {}) {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockout.lockedUntil - now) / 1000));
  return {
    blocked: true,
    retryAfterSeconds,
    lockoutCount: lockout.lockoutCount,
    lockedUntil: lockout.lockedUntil,
    attempts: lockout.attempts,
    ...extras,
  };
}

