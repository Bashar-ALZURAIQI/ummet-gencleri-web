import { useState, useEffect, useMemo } from 'react';
import { parseValidDate } from '../domain/datePresentation.ts';

/**
 * A lightweight shared time-boundary mechanism.
 * Determines the nearest future event datetime and schedules a reevaluation
 * when that boundary is reached, ensuring the UI automatically transitions
 * 'upcoming' events to 'past' without aggressive polling.
 */
export function useTemporalBoundary(targetDates: (string | Date | undefined | null)[]) {
  const [now, setNow] = useState(() => new Date());

  // Use stringified dates to prevent unnecessary effect triggers on re-renders
  const datesKey = useMemo(() => {
    return targetDates
      .map(d => (d instanceof Date ? d.toISOString() : (d || '')))
      .join('|');
  }, [targetDates]);

  useEffect(() => {
    const validDates = datesKey
      .split('|')
      .filter(Boolean)
      .map(d => parseValidDate(d))
      .filter((d): d is Date => d !== null && d > new Date())
      .sort((a, b) => a.getTime() - b.getTime());

    if (validDates.length === 0) return;

    const nextBoundary = validDates[0];
    const delay = nextBoundary.getTime() - Date.now();

    if (delay <= 0) {
      setNow(new Date());
      return;
    }

    // Maximum timeout limit is 2^31-1 (approx 24.8 days)
    const safeDelay = Math.min(delay, 2147483647);

    const timeoutId = setTimeout(() => {
      setNow(new Date());
    }, safeDelay);

    return () => clearTimeout(timeoutId);
  }, [datesKey, now]);

  return now;
}
