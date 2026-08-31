import { useEffect, useState } from "react";

const RELATIVE_TIME_REFRESH_MS = 30_000;

/** Forces a re-render on an interval so relative timestamps ("2m ago") advance even when no new data arrives to otherwise trigger a render. */
export function useRelativeTimeTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), RELATIVE_TIME_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
}
