import { useState, useEffect } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * inactivity.  Useful for preventing rapid re-fetches while the user types.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
