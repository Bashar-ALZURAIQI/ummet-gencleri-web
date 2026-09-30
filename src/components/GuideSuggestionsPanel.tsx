import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock3, RefreshCw, Search, Trash2 } from 'lucide-react';
import { canManageGuideSuggestions, type GuideSuggestionStatus } from '../domain/guideSuggestionPolicy.ts';
import {
  deleteGuideSuggestion,
  listGuideSuggestions,
  updateGuideSuggestionStatus,
  type GuideSuggestion,
} from '../services/guideSuggestionService.ts';
import { useApp } from '../context/AppContext.tsx';
import { useSessionDraft } from '../hooks/useSessionDraft';
import { buildSessionDraftKey } from '../domain/sessionDraft';

type Filter = 'ALL' | GuideSuggestionStatus;

const STATUS_CLASS: Record<GuideSuggestionStatus, string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  REVIEWING: 'border-sky-200 bg-sky-50 text-sky-700',
  IMPLEMENTED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-700',
};

const ALL_STATUSES: GuideSuggestionStatus[] = ['PENDING', 'REVIEWING', 'IMPLEMENTED', 'REJECTED'];

export default function GuideSuggestionsPanel({ role }: { role: string | null | undefined }) {
  const { t } = useTranslation();
  const { refreshWorkloadCounts, currentUser } = useApp();
  const authorized = canManageGuideSuggestions(role);
  const [suggestions, setSuggestions] = useState<GuideSuggestion[]>([]);
  
  const draftKey = currentUser?.userId ? buildSessionDraftKey(currentUser.userId, 'admin:guide-suggestions', 'edit', 'tab') : null;
  const draft = useSessionDraft({
    key: draftKey,
    userId: currentUser?.userId ?? null,
    defaultData: { filter: 'ALL' as Filter, query: '' },
    defaultOpen: true,
    validation: 'valid',
    isDirty: () => true
  });
  
  const filter = draft.data.filter;
  const setFilter = (v: Filter) => draft.setData(p => ({ ...p, filter: v }));
  const query = draft.data.query;
  const setQuery = (v: string) => draft.setData(p => ({ ...p, query: v }));

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const statusLabels: Record<GuideSuggestionStatus, string> = useMemo(() => ({
    PENDING: t('admin.guideSuggestions.status.pending', 'قيد الانتظار'),
    REVIEWING: t('admin.guideSuggestions.status.reviewing', 'قيد المراجعة'),
    IMPLEMENTED: t('admin.guideSuggestions.status.implemented', 'تم التنفيذ'),
    REJECTED: t('admin.guideSuggestions.status.rejected', 'مرفوض'),
  }), [t]);

  const filters: { value: Filter; label: string }[] = useMemo(() => [
    { value: 'ALL', label: t('common.all', 'الكل') },
    { value: 'PENDING', label: statusLabels.PENDING },
    { value: 'REVIEWING', label: statusLabels.REVIEWING },
    { value: 'IMPLEMENTED', label: statusLabels.IMPLEMENTED },
    { value: 'REJECTED', label: statusLabels.REJECTED },
  ], [statusLabels, t]);

  const load = useCallback(async () => {
    if (!authorized) {
      setSuggestions([]);
      setLoading(false);
      setError(t('admin.guideSuggestions.unauthorized', 'ليس لديك صلاحية لعرض اقتراحات الدليل.'));
      return;
    }

    setLoading(true);
    setError('');
    const result = await listGuideSuggestions();
    setLoading(false);
    if (!result.ok) {
      console.error('Guide suggestions load failed:', result.error);
      setError(result.error.message || t('admin.guideSuggestions.loadFailed', 'تعذر تحميل اقتراحات الدليل.'));
      return;
    }
    setSuggestions(result.data);
  }, [authorized, t]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ar');
    return suggestions.filter((suggestion) => {
      if (filter !== 'ALL' && suggestion.status !== filter) return false;
      if (!needle) return true;
      return [suggestion.studentName, suggestion.subject, suggestion.description]
        .some((value) => value.toLocaleLowerCase('ar').includes(needle));
    });
  }, [filter, query, suggestions]);

  const updateStatus = async (suggestion: GuideSuggestion, status: GuideSuggestionStatus) => {
    if (!authorized || busyId || suggestion.status === status) return;
    setBusyId(suggestion.id);
    setError('');
    setFeedback('');
    const result = await updateGuideSuggestionStatus(suggestion.id, status);
    setBusyId(null);
    if (!result.ok) {
      console.error('Guide suggestion status update failed:', result.error);
      setError(result.error.message || t('admin.guideSuggestions.updateFailed', 'تعذر تحديث حالة الاقتراح.'));
      return;
    }
    setSuggestions((rows) => rows.map((row) => row.id === suggestion.id ? { ...row, status } : row));
    setFeedback(t('admin.guideSuggestions.statusUpdated', 'تم تحديث حالة الاقتراح إلى «{{status}}».', { status: statusLabels[status] }));
    void refreshWorkloadCounts();
  };

  const remove = async (suggestion: GuideSuggestion) => {
    if (!authorized || busyId) return;
    if (!window.confirm(t('admin.guideSuggestions.confirmDelete', 'هل تريد حذف اقتراح «{{subject}}» نهائياً؟', { subject: suggestion.subject }))) return;
    setBusyId(suggestion.id);
    setError('');
    setFeedback('');
    const result = await deleteGuideSuggestion(suggestion.id);
    setBusyId(null);
    if (!result.ok) {
      console.error('Guide suggestion deletion failed:', result.error);
      setError(result.error.message || t('admin.guideSuggestions.deleteFailed', 'تعذر حذف الاقتراح.'));
      return;
    }
    setSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
    setFeedback(t('admin.guideSuggestions.deletedSuccess', 'تم حذف الاقتراح.'));
    void refreshWorkloadCounts();
  };

  if (!authorized) {
    return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{t('admin.guideSuggestions.unauthorized', 'ليس لديك صلاحية لعرض اقتراحات الدليل.')}</div>;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-navy-900">{t('admin.guideSuggestions.title', 'اقتراحات دليل الطالب')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('admin.guideSuggestions.subtitle', 'راجع الإضافات والتصحيحات الواردة من الطلاب والزوار وحدّث حالة كل اقتراح.')}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="btn-ghost justify-center disabled:cursor-wait disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {t('admin.guideSuggestions.refresh', 'تحديث')}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${filter === item.value ? 'bg-navy-800 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="relative block sm:w-72">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <span className="sr-only">{t('admin.guideSuggestions.searchAria', 'البحث في اقتراحات الدليل')}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="input-field pr-9" placeholder={t('admin.guideSuggestions.searchPlaceholder', 'ابحث بالاسم أو الموضوع...')} />
        </label>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
      {feedback && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{feedback}</div>}

      {loading ? (
        <div className="card flex min-h-48 items-center justify-center gap-2 text-sm font-bold text-gray-500"><RefreshCw className="h-5 w-5 animate-spin" /> {t('admin.guideSuggestions.loading', 'جاري تحميل الاقتراحات...')}</div>
      ) : filtered.length === 0 ? (
        <div className="card flex min-h-48 flex-col items-center justify-center text-center">
          <Clock3 className="h-10 w-10 text-gray-300" />
          <p className="mt-3 font-bold text-navy-900">{t('admin.guideSuggestions.emptyTitle', 'لا توجد اقتراحات مطابقة')}</p>
          <p className="mt-1 text-sm text-gray-500">{t('admin.guideSuggestions.emptySubtitle', 'ستظهر الاقتراحات الجديدة هنا فور وصولها.')}</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((suggestion) => {
            const busy = busyId === suggestion.id;
            const statusLabel = statusLabels[suggestion.status];
            const statusClass = STATUS_CLASS[suggestion.status];
            return (
              <article key={suggestion.id} className="card flex flex-col p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-navy-900">{suggestion.subject}</h3>
                    <p className="mt-1 text-xs text-gray-500">{t('admin.guideSuggestions.submittedBy', 'مقدم من:')} <span className="font-bold text-gray-700">{suggestion.studentName}</span></p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass}`}>{statusLabel}</span>
                </div>
                <p className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-7 text-gray-700">{suggestion.description}</p>
                <div className="mt-4 text-xs text-gray-400">
                  {new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(suggestion.createdAt))}
                </div>
                <div className="mt-auto flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
                  <label className="flex flex-1 items-center gap-2 text-xs font-bold text-gray-600">
                    {t('admin.guideSuggestions.statusLabel', 'الحالة')}
                    <select
                      value={suggestion.status}
                      disabled={busy}
                      onChange={(event) => void updateStatus(suggestion, event.target.value as GuideSuggestionStatus)}
                      className="input-field py-2 text-sm"
                    >
                      {ALL_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void remove(suggestion)}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" /> {t('common.delete', 'حذف')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
