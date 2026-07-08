import { useEffect, useState } from "react";

/**
 * Current timestamp for day-granularity countdowns (trial/expiry displays).
 * Avoids calling `Date.now()` directly during render (impure) while still
 * refreshing periodically so long-lived tabs don't freeze on a stale value.
 */
export function useNow(refreshMs = 60 * 60 * 1_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return now;
}
