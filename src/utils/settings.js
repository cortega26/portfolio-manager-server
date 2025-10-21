const STORAGE_KEY = "portfolio-manager-settings";

export function createDefaultSettings() {
  return {
    notifications: {
      email: false,
      push: true,
    },
    alerts: {
      rebalance: true,
      drawdownThreshold: 15,
    },
    privacy: {
      hideBalances: false,
    },
    display: {
      currency: "USD",
      refreshInterval: 15,
      compactTables: false,
    },
    autoClip: false,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function coerceNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  if (typeof merged.notifications.email !== "boolean") {
    merged.notifications.email = Boolean(merged.notifications.email);
  }
  if (typeof merged.notifications.push !== "boolean") {
    merged.notifications.push = true;
  }
  merged.alerts.drawdownThreshold = coerceNumber(
    merged.alerts.drawdownThreshold,
    defaults.alerts.drawdownThreshold,
  );
  merged.display.refreshInterval = coerceNumber(
    merged.display.refreshInterval,
    defaults.display.refreshInterval,
  );
  merged.autoClip = Boolean(merged.autoClip);
  return merged;
}

export function mergeSettings(current, incoming) {
  const normalizedCurrent = normalizeSettings(current);
  const normalizedIncoming = normalizeSettings(incoming);
  return deepMerge(normalizedCurrent, normalizedIncoming);
}

export function loadSettingsFromStorage(storage = null) {
  const localStorageRef =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!localStorageRef) {
    return createDefaultSettings();
  }

  try {
    const raw = localStorageRef.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultSettings();
    }

    const parsed = JSON.parse(raw);
    return normalizeSettings(parsed);
  } catch (error) {
    console.error("Failed to load user settings", error);
    return createDefaultSettings();
  }
}

export function persistSettingsToStorage(settings, storage = null) {
  const localStorageRef =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!localStorageRef) {
    return false;
  }

  try {
    const normalized = normalizeSettings(settings);
    localStorageRef.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch (error) {
    console.error("Failed to persist user settings", error);
    return false;
  }
}

export function updateSetting(settings, path, value) {
  if (!path) {
    return settings;
  }

  const segments = path.split(".");
  const next = { ...settings };
  let cursor = next;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    cursor[segment] = { ...cursor[segment] };
    cursor = cursor[segment];
  }

  cursor[segments.at(-1)] = value;
  return next;
}
