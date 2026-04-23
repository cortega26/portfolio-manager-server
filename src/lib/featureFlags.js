/**
 * src/lib/featureFlags.js
 *
 * SR-100 — Feature flag registry and resolver.
 *
 * Flags default to false (off). Overrides come from:
 *  1. A localStorage key `portfolio-manager-feature-flags` (JSON object)
 *  2. Programmatic overrides passed to resolveFlags()
 *
 * Flags are evaluated at call time via getFlag(). Changing localStorage
 * takes effect on next call — no hot-reload is provided at this layer;
 * use the React hook (useFeatureFlag) for reactive updates.
 */

/** @type {Record<string, boolean>} */
export const FLAG_DEFAULTS = {
  'redesign.todayShell': false,
  'redesign.trustBadges': false,
  'redesign.ledgerOpsCenter': false,
  'redesign.policyGuidance': false,
};

const STORAGE_KEY = 'portfolio-manager-feature-flags';

/**
 * Reads stored overrides from localStorage (browser only).
 * Returns an empty object when localStorage is unavailable.
 *
 * @returns {Record<string, boolean>}
 */
function readStoredOverrides() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Resolves the full flag map by merging defaults with stored overrides and
 * programmatic overrides, in that priority order:
 *
 *   defaults → storedOverrides → programmaticOverrides
 *
 * Only known flag names (from FLAG_DEFAULTS) are retained in the output.
 * Unknown flag names in overrides are silently ignored.
 *
 * Flag values are coerced to boolean.
 *
 * @param {Record<string, unknown>} [programmaticOverrides]
 * @returns {Record<string, boolean>}
 */
export function resolveFlags(programmaticOverrides = {}) {
  const stored = readStoredOverrides();
  const merged = { ...FLAG_DEFAULTS };

  for (const key of Object.keys(FLAG_DEFAULTS)) {
    if (Object.prototype.hasOwnProperty.call(stored, key)) {
      merged[key] = Boolean(stored[key]);
    }
    if (Object.prototype.hasOwnProperty.call(programmaticOverrides, key)) {
      merged[key] = Boolean(programmaticOverrides[key]);
    }
  }

  return merged;
}

/**
 * Returns the boolean value of a single feature flag from a resolved flag map.
 * Returns false if the flag name is not known.
 *
 * @param {Record<string, boolean>} flags - result of resolveFlags()
 * @param {string} name
 * @returns {boolean}
 */
export function getFlag(flags, name) {
  if (!Object.prototype.hasOwnProperty.call(flags, name)) return false;
  return Boolean(flags[name]);
}
