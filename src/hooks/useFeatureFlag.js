/**
 * src/hooks/useFeatureFlag.js
 *
 * SR-100 — React hook for reading a single feature flag reactively.
 *
 * Reads from localStorage on mount and re-reads on storage events so
 * changes in another tab or via DevTools are reflected without a page reload.
 */

import { useEffect, useState } from 'react';

import { getFlag, resolveFlags } from '../lib/featureFlags.js';

/**
 * Returns the current boolean value of a feature flag.
 *
 * @param {string} flagName - one of the keys in FLAG_DEFAULTS
 * @returns {boolean}
 */
export function useFeatureFlag(flagName) {
  const [value, setValue] = useState(() => getFlag(resolveFlags(), flagName));

  useEffect(() => {
    function refresh() {
      setValue(getFlag(resolveFlags(), flagName));
    }

    // Re-evaluate when another tab or DevTools updates localStorage
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
    };
  }, [flagName]);

  return value;
}
