import { createDefaultSettings, normalizeSettings } from '../../shared/settings.js';

const STORAGE_KEY = 'portfolio-manager-settings';

export { createDefaultSettings, normalizeSettings };

export function mergeSettings(current, incoming) {
  const normalizedCurrent = normalizeSettings(current);
  const normalizedIncoming = normalizeSettings(incoming);
  return normalizeSettings({
    ...normalizedCurrent,
    ...normalizedIncoming,
    notifications: {
      ...normalizedCurrent.notifications,
      ...normalizedIncoming.notifications,
    },
    alerts: {
      ...normalizedCurrent.alerts,
      ...normalizedIncoming.alerts,
    },
    privacy: {
      ...normalizedCurrent.privacy,
      ...normalizedIncoming.privacy,
    },
    display: {
      ...normalizedCurrent.display,
      ...normalizedIncoming.display,
    },
  });
}

export function loadSettingsFromStorage(storage = null) {
  const localStorageRef = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
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
    console.error('Failed to load user settings', error);
    return createDefaultSettings();
  }
}

export function persistSettingsToStorage(settings, storage = null) {
  const localStorageRef = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!localStorageRef) {
    return false;
  }

  try {
    const normalized = normalizeSettings(settings);
    localStorageRef.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch (error) {
    console.error('Failed to persist user settings', error);
    return false;
  }
}

export function updateSetting(settings, path, value) {
  if (!path) {
    return settings;
  }

  const segments = path.split('.');
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
