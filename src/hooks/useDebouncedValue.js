import { useEffect, useRef, useState } from "react";

const MIN_DELAY_MS = 0;
const DEFAULT_DELAY = 300;

export default function useDebouncedValue(value, delay = DEFAULT_DELAY) {
  const safeDelay = Number.isFinite(delay) && delay >= MIN_DELAY_MS ? delay : DEFAULT_DELAY;
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timeoutRef = useRef();

  useEffect(() => {
    let cancelled = false;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setDebouncedValue(value);
      }
    }, safeDelay);

    timeoutRef.current = timeoutId;

    return () => {
      cancelled = true;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };
  }, [safeDelay, value]);

  return debouncedValue;
}
