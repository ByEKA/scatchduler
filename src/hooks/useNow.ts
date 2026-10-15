import { useEffect, useState } from 'react';

/**
 * The current time, re-read every `intervalMs` (60 s by default), for relative times and
 * countdowns. Components call this instead of reading the clock while rendering: the clock is
 * read once on mount and then only in the interval callback.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
