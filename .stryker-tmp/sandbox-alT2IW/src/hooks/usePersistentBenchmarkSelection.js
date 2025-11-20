// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "dashboard.benchmarkSelection.v1";

function readStoredSelection() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed
      .map((value) => String(value))
      .filter((value) => value.trim().length > 0);
  } catch (error) {
    console.error(error);
    return null;
  }
}

function sanitizeSelection(selection, availableSet, fallback) {
  const deduped = Array.from(
    new Set(
      (Array.isArray(selection) ? selection : [])
        .map((value) => String(value))
        .filter((value) => availableSet.has(value)),
    ),
  );
  if (deduped.length > 0) {
    return deduped;
  }
  if (Array.isArray(fallback) && fallback.length > 0) {
    const normalizedFallback = fallback.filter((value) => availableSet.has(value));
    if (normalizedFallback.length > 0) {
      return normalizedFallback;
    }
  }
  return Array.from(availableSet.values()).slice(0, 1);
}

export function usePersistentBenchmarkSelection(availableIds, defaultSelection) {
  const availableSet = useMemo(
    () => new Set((availableIds ?? []).map((value) => String(value))),
    [availableIds],
  );
  const [selection, setSelection] = useState(() => {
    const stored = readStoredSelection();
    if (stored) {
      return stored;
    }
    if (Array.isArray(defaultSelection) && defaultSelection.length > 0) {
      return defaultSelection.map((value) => String(value));
    }
    return [];
  });

  useEffect(() => {
    setSelection((prev) => sanitizeSelection(prev, availableSet, defaultSelection));
  }, [availableSet, defaultSelection]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch (error) {
      console.error(error);
    }
  }, [selection]);

  const setSelectionSafe = useCallback(
    (nextValue) => {
      setSelection((prev) => {
        const resolved = typeof nextValue === "function" ? nextValue(prev) : nextValue;
        return sanitizeSelection(resolved, availableSet, defaultSelection);
      });
    },
    [availableSet, defaultSelection],
  );

  return [selection, setSelectionSafe];
}

export function getBenchmarkStorageKey() {
  return STORAGE_KEY;
}
