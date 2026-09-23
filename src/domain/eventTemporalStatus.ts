import { parseValidDate } from './datePresentation.ts';

export function getEffectiveEventStatus(
  persistedStatus: 'upcoming' | 'past',
  eventDate: string | Date | undefined | null,
  nowDate: Date = new Date()
): 'upcoming' | 'past' {
  if (persistedStatus === 'past') return 'past';

  const parsedDate = parseValidDate(eventDate);
  if (!parsedDate) return persistedStatus;

  if (parsedDate <= nowDate) return 'past';

  return 'upcoming';
}
