const STORAGE_KEY = "portfolio-manager-settings";

export function createDefaultSettings() {
  return {
    notifications: {
      email: false,
      push: false,
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
  };
}

function deepMerge(target, source) {
  if (!source || typeof source !== "object") {
    return target;
  }

  return Object.keys(target).reduce((acc, key) => {
    if (typeof target[key] === "object" && !Array.isArray(target[key])) {
      acc[key] = deepMerge(target[key], source[key]);
    } else if (Object.prototype.hasOwnProperty.call(source, key)) {
      acc[key] = source[key];
    } else {
      acc[key] = target[key];
    }
    return acc;
  }, {});
}

export function loadSettingsFromStorage(storage = null) {
  const defaults = createDefaultSettings();
  const localStorageRef =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!localStorageRef) {
    return defaults;
  }

  try {
    const raw = localStorageRef.getItem(STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return defaults;
    }

    return deepMerge(defaults, parsed);
  } catch (error) {
    console.error("Failed to load user settings", error);
    return defaults;
  }
}

export function persistSettingsToStorage(settings, storage = null) {
  const localStorageRef =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!localStorageRef) {
    return false;
  }

  try {
    localStorageRef.setItem(STORAGE_KEY, JSON.stringify(settings));
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
