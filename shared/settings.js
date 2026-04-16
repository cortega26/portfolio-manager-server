const DISPLAY_CURRENCY_REGEX = /^[A-Za-z]{3}$/u;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, source) {
  if (!isPlainObject(target)) {
    return target;
  }

  const result = {};
  const keys = new Set([
    ...Object.keys(target ?? {}),
    ...(isPlainObject(source) ? Object.keys(source) : []),
  ]);

  for (const key of keys) {
    const targetValue = target?.[key];
    const sourceValue = source?.[key];
    if (isPlainObject(targetValue)) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    } else {
      result[key] = targetValue;
    }
  }

  return result;
}

function coerceNumber(value, fallback, { min = null, max = null } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const lowerBounded = min === null ? numeric : Math.max(min, numeric);
  return max === null ? lowerBounded : Math.min(max, lowerBounded);
}

function normalizeCurrency(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toUpperCase();
  return DISPLAY_CURRENCY_REGEX.test(normalized) ? normalized : fallback;
}

export function createDefaultSettings() {
  return {
    notifications: {
      email: false,
      push: true,
      signalTransitions: true,
    },
    alerts: {
      rebalance: true,
      drawdownThreshold: 15,
      marketStatus: true,
      roiFallback: true,
    },
    privacy: {
      hideBalances: false,
    },
    display: {
      currency: 'USD',
      refreshInterval: 15,
      compactTables: false,
    },
    autoClip: false,
  };
}

export function normalizeSettings(rawSettings) {
  const defaults = createDefaultSettings();
  if (!isPlainObject(rawSettings)) {
    return defaults;
  }

  const merged = deepMerge(defaults, rawSettings);

  if (!isPlainObject(merged.notifications)) {
    merged.notifications = { ...defaults.notifications };
  }
  merged.notifications.email = Boolean(merged.notifications.email);
  merged.notifications.push = Boolean(merged.notifications.push);
  merged.notifications.signalTransitions = Boolean(merged.notifications.signalTransitions);

  if (!isPlainObject(merged.alerts)) {
    merged.alerts = { ...defaults.alerts };
  }
  merged.alerts.rebalance = Boolean(merged.alerts.rebalance);
  merged.alerts.drawdownThreshold = coerceNumber(
    merged.alerts.drawdownThreshold,
    defaults.alerts.drawdownThreshold,
    { min: 1, max: 50 }
  );
  merged.alerts.marketStatus = Boolean(merged.alerts.marketStatus);
  merged.alerts.roiFallback = Boolean(merged.alerts.roiFallback);

  if (!isPlainObject(merged.privacy)) {
    merged.privacy = { ...defaults.privacy };
  }
  merged.privacy.hideBalances = Boolean(merged.privacy.hideBalances);

  if (!isPlainObject(merged.display)) {
    merged.display = { ...defaults.display };
  }
  merged.display.currency = normalizeCurrency(merged.display.currency, defaults.display.currency);
  merged.display.refreshInterval = coerceNumber(
    merged.display.refreshInterval,
    defaults.display.refreshInterval,
    { min: 1, max: 60 }
  );
  merged.display.compactTables = Boolean(merged.display.compactTables);

  merged.autoClip = Boolean(merged.autoClip);

  return merged;
}
