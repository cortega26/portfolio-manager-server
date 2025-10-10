import { useEffect, useRef, useState } from "react";

const MIN_DELAY_MS = 0;
const DEFAULT_DELAY = 300;

export default function useDebouncedValue(value, delay = DEFAULT_DELAY) {
  const safeDelay = Number.isFinite(delay) && delay >= MIN_DELAY_MS ? delay : DEFAULT_DELAY;
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timeoutRef = useRef();
  const isBrowser = typeof window !== "undefined";

  useEffect(() => {
    let cancelled = false;

    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }

    if (!isBrowser) {
      setDebouncedValue(value);
      return () => {
        cancelled = true;
      };
    }

    const timeoutId = setTimeout(() => {
      if (cancelled || typeof window === "undefined") {
        return;
      }
      setDebouncedValue(value);
    }, safeDelay);

    timeoutRef.current = timeoutId;

    return () => {
      cancelled = true;

      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };
  }, [safeDelay, value]);

  return debouncedValue;
}
