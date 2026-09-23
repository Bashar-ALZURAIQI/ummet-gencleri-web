import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ActivityDecisionControls from './ActivityDecisionControls';
import Modal from './Modal';
import RequiredMark from './RequiredMark';
import TransientToast, { type ToastMessage } from './TransientToast';
import { buildActivityDecisionRequest } from '../domain/internalEconomyInteraction.ts';
import type { StudentActivityBoardItem } from '../domain/internalEconomyTypes.ts';
import {
  loadStudentActivityBoard,
  setOwnActivityDecision,
} from '../services/internalEconomyService';

export default function StudentActivitiesPanel({ onJoiningCountChange }: { onJoiningCountChange?: (count: number) => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<StudentActivityBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [excuseItem, setExcuseItem] = useState<StudentActivityBoardItem | null>(null);
  const [excuseText, setExcuseText] = useState('');
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadStudentActivityBoard();
    setLoading(false);
    if (!result.ok) {
      console.error('[internal-economy] student activities load failed', result.error);
      setError(result.error.message);
      return;
    }
    setItems(result.data);
    onJoiningCountChange?.(result.data.filter((item) => item.decision === 'JOINING').length);
  }, [onJoiningCountChange]);

  useEffect(() => { void load(); }, [load]);

  const decidedItems = useMemo(
    () => items.filter((item) => item.decision === 'JOINING' || item.decision === 'DECLINING'),
    [items],
  );

  const submit = useCallback(async (
    item: StudentActivityBoardItem,
    decision: 'JOINING' | 'DECLINING' | 'IGNORED',
    excuse?: string | null,
  ) => {
    const request = buildActivityDecisionRequest({
      activityId: item.activityId,
      activityType: item.type,
      decision,
      excuseText: excuse,
    });
    if (!request.ok) {
      setToast({ id: Date.now(), type: 'error', text: request.error });
      return false;
    }
    setBusyId(item.activityId);
    const result = await setOwnActivityDecision(request.value);
    setBusyId(null);
    if (!result.ok) {
      console.error('[internal-economy] student activity decision failed', result.error);
      setToast({ id: Date.now(), type: 'error', text: result.error.message });
      return false;
    }
    await load();
    setToast({ id: Date.now(), type: 'success', text: t('activities.decisionUpdated', 'تم تحديث قرار النشاط وحفظه في حسابك.') });
    return true;
  }, [load, t]);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-12 text-sm font-semibold text-gray-500"><RefreshCw className="h-4 w-4 animate-spin" /> {t('activities.loading', 'جارٍ تحميل أنشطتك...')}</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 font-bold underline">{t('activities.retry', 'إعادة المحاولة')}</button>
        </div>
      )}
      {!error && decidedItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">{t('activities.noDecided', 'لم تتخذ قراراً بشأن أي نشاط بعد.')}</p>
        </div>
      )}
      {decidedItems.map((item) => (
        <article key={item.activityId} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h4 className="text-base font-extrabold text-navy-900">{item.title}</h4>
          <p className="mt-1 text-sm leading-6 text-gray-500">{item.description}</p>
          <div className="mt-4">
            <ActivityDecisionControls
              item={item}
              hasStudent
              access="accepted"
              loading={false}
              busy={busyId === item.activityId}
              onLogin={() => undefined}
              onJoin={() => {
                if (item.decision === 'JOINING') {
                  void submit(item, 'IGNORED', null);
                } else {
                  void submit(item, 'JOINING', null);
                }
              }}
              onDecline={() => {
                if (item.decision === 'DECLINING') {
                  void submit(item, 'IGNORED', null);
                } else {
                  if (item.type === 'MANDATORY') {
                    setExcuseItem(item);
                    setExcuseText(item.excuseText ?? '');
                  } else void submit(item, 'DECLINING', null);
                }
              }}
            />
          </div>
        </article>
      ))}

      <Modal open={Boolean(excuseItem)} onClose={() => { if (!busyId) setExcuseItem(null); }} title={t('activities.excuseModalTitle', 'تحديث عذر الغياب')} maxWidth="max-w-lg">
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (!excuseItem) return;
          const saved = await submit(excuseItem, 'DECLINING', excuseText);
          if (saved) setExcuseItem(null);
        }} className="space-y-4">
          <div>
            <label className="label-field">{t('activities.excuseLabel', 'عذر الغياب')} <RequiredMark /></label>
            <textarea rows={5} maxLength={4000} value={excuseText} onChange={(event) => setExcuseText(event.target.value)} className="input-field resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={Boolean(busyId)} onClick={() => setExcuseItem(null)} className="btn-ghost">{t('common.cancel', 'إلغاء')}</button>
            <button type="submit" disabled={Boolean(busyId)} className="btn-primary disabled:opacity-60">{busyId ? t('activities.savingExcuse', 'جارٍ الحفظ...') : t('activities.saveExcuse', 'حفظ العذر')}</button>
          </div>
        </form>
      </Modal>
      <TransientToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
