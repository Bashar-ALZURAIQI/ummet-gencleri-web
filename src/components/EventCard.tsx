import { CalendarDays, MapPin, Users, Clock, CheckCircle2, ExternalLink, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { categoryColors, type UEvent } from '../data/mockData';
import type { StudentActivityBoardItem } from '../domain/internalEconomyTypes.ts';
import { formatEnrollmentCount } from '../domain/internalEconomyInteraction.ts';
import { getEventCategoryLabel } from '../domain/eventCategoryPresentation.ts';
import { formatPublicDate, formatPublicTime } from '../domain/datePresentation.ts';
import ActivityDecisionControls from './ActivityDecisionControls';

export default function EventCard({ event, activity, activityLoading = false, activityBusy = false, onJoin, onDecline, presentation = 'registration' }: {
  event: UEvent;
  /** On the homepage, show a navigation CTA instead of registration controls.
   *  The homepage does not load the member's activity enrollment state. */
  presentation?: 'registration' | 'homepage';
  activity?: StudentActivityBoardItem | null;
  activityLoading?: boolean;
  activityBusy?: boolean;
  onJoin?: (activity: StudentActivityBoardItem) => void;
  onDecline?: (activity: StudentActivityBoardItem) => void;
}) {
  const { currentUser, setView, studentAccess } = useApp();
  const { t, i18n } = useTranslation();
  const registered = activity?.joiningCount ?? event.registered;
  const capacity = activity?.maxCapacity ?? event.capacity;
  const isFull = capacity !== null && registered >= capacity;
  const dateStr = formatPublicDate(event.date, i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = formatPublicTime(event.date, i18n.language);

  return (
    <article className="card group flex min-w-0 flex-col overflow-hidden transition-all hover:-translate-y-1 hover:shadow-xl">
      <div className="relative h-44 overflow-hidden">
        <img
          src={event.image}
          alt={event.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-navy-950/10 to-transparent" />
        <span
          className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold ${categoryColors[event.category] || 'bg-navy-50 text-navy-700'}`}
        >
          {getEventCategoryLabel(event.category, t)}
        </span>
        {event.status === 'past' && (
          <span className="absolute top-3 left-3 rounded-full bg-navy-900/80 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
            {t('programs.pastBadge')}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="dynamic-text-safe text-lg font-bold leading-snug text-navy-900 transition-colors group-hover:text-navy-700">
          {event.title}
        </h3>
        <p className="dynamic-text-safe mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500">
          {event.description}
        </p>

        <div className="mt-4 space-y-2 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-navy-500" />
            <span>{dateStr}</span>
            <Clock className="h-4 w-4 shrink-0 text-navy-500" />
            <span>{timeStr}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-navy-500" />
            <span className="dynamic-text-safe">{event.location}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-navy-500" />
            <span>
              {formatEnrollmentCount(registered, capacity, t)}
            </span>
          </div>
        </div>

        {/* Capacity bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all ${
              isFull ? 'bg-rose-500' : 'bg-navy-600'
            }`}
            style={{ width: `${capacity ? Math.min(100, (registered / capacity) * 100) : 0}%` }}
          />
        </div>

        <div className="mt-5 flex-1" />

        {event.eventUrl && (
          <a
            href={event.eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2.5 text-sm font-semibold text-fuchsia-700 transition-colors hover:bg-fuchsia-100"
          >
            <ExternalLink className="h-4 w-4" />
            {t('programs.visitEvent')}
          </a>
        )}

        {event.status === 'upcoming' ? (
          presentation === 'homepage' ? (
            <button
              type="button"
              onClick={() => setView({ kind: 'programs' })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition-colors hover:bg-navy-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
            >
              {t('home.viewEventInPrograms')}
              <ArrowLeft className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
            </button>
          ) : (
          <ActivityDecisionControls
            item={activity ?? null}
            hasStudent={Boolean(currentUser)}
            access={studentAccess}
            loading={activityLoading}
            busy={activityBusy}
            onLogin={() => setView({ kind: 'login' })}
            onJoin={() => activity && onJoin?.(activity)}
            onDecline={() => activity && onDecline?.(activity)}
          />
          )
        ) : (
          <span className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {t('programs.endedEvent')}
          </span>
        )}
      </div>
    </article>
  );
}
