import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Coins, RefreshCw, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TransientToast, { type ToastMessage } from './TransientToast';
import { resolveTaskInteraction } from '../domain/internalEconomyInteraction.ts';
import type { StudentTaskBoardItem } from '../domain/internalEconomyTypes.ts';
import {
  loadStudentTaskBoard,
  registerForInternalTask,
} from '../services/internalEconomyService';

export default function StudentTasksPanel() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<StudentTaskBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadStudentTaskBoard();
    setLoading(false);
    if (!result.ok) {
      console.error('[internal-economy] student tasks load failed', result.error);
      setError(result.error.message);
      return;
    }
    setItems(result.data);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const register = async (item: StudentTaskBoardItem) => {
    setBusyId(item.taskId);
    const result = await registerForInternalTask(item.taskId);
    setBusyId(null);
    if (!result.ok) {
      console.error('[internal-economy] task registration failed', result.error);
      setToast({ id: Date.now(), type: 'error', text: result.error.message });
      await load();
      return;
    }
    await load();
    setToast({ id: Date.now(), type: 'success', text: t('tasks.reservedSuccess', 'تم حجز المهمة التطوعية في حسابك.') });
  };

  const cancel = async (item: StudentTaskBoardItem) => {
    if (!confirm(t('tasks.confirmCancel', 'هل أنت متأكد من إلغاء مشاركتك في هذه المهمة؟'))) return;
    setBusyId(item.taskId);
    // Assuming cancelTaskEnrollment will be added to the service
    const { cancelTaskEnrollment } = await import('../services/internalEconomyService');
    const result = await cancelTaskEnrollment(item.taskId);
    setBusyId(null);
    if (!result.ok) {
      console.error('[internal-economy] task cancellation failed', result.error);
      setToast({ id: Date.now(), type: 'error', text: result.error.message });
      await load();
      return;
    }
    await load();
    setToast({ id: Date.now(), type: 'success', text: t('tasks.cancelSuccess', 'تم إلغاء المشاركة بنجاح.') });
  };

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-gray-500"><RefreshCw className="h-4 w-4 animate-spin" /> {t('tasks.loading', 'جارٍ تحميل المهام...')}</div>;

  const localeCode = i18n.language === 'tr' ? 'tr-TR' : i18n.language === 'en' ? 'en-US' : 'ar-EG';

  return (
    <div className="space-y-5">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}<button type="button" onClick={() => void load()} className="mr-3 font-bold underline">{t('tasks.retry', 'إعادة المحاولة')}</button></div>}
      {!error && items.length === 0 && <div className="card py-16 text-center text-sm text-gray-500">{t('tasks.empty', 'لا توجد مهام تطوعية متاحة حالياً.')}</div>}
      <div className="grid gap-5 md:grid-cols-2">
        {items.map((item) => {
          const state = resolveTaskInteraction({
            hasStudent: true,
            access: 'accepted',
            deadline: item.deadline,
            status: item.status,
            requiredStudents: item.requiredStudents,
            enrollmentCount: item.enrollmentCount,
            isEnrolled: item.isEnrolled,
          });
          const remaining = Math.max(0, item.requiredStudents - item.enrollmentCount);
          return (
            <article key={item.taskId} className="card flex flex-col p-6">
              <h3 className="text-lg font-extrabold text-navy-900">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-gray-500">{item.description}</p>
              <div className="mt-5 grid gap-2 text-xs sm:grid-cols-3">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-700"><Coins className="h-4 w-4" /> {t('tasks.points', { count: item.pointsReward, defaultValue: `${item.pointsReward} نقطة` })}</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 font-bold text-violet-700"><Users className="h-4 w-4" /> {t('tasks.remaining', { count: remaining, defaultValue: `متبقٍ ${remaining}` })}</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-2 font-bold text-sky-700"><Clock3 className="h-4 w-4" /> {new Date(item.deadline).toLocaleDateString(localeCode)}</span>
              </div>
              {item.isEnrolled ? (
                <div className="mt-5 space-y-2">
                  <div className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {t('tasks.enrolled', 'تم حجز المهمة')}
                  </div>
                  {item.completionStatus === 'PENDING' && (
                    <button
                      type="button"
                      disabled={busyId === item.taskId}
                      onClick={() => void cancel(item)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyId === item.taskId ? t('tasks.canceling', 'جارٍ الإلغاء...') : t('tasks.cancelParticipation', 'إلغاء المشاركة')}
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!state.canRegister || busyId === item.taskId}
                  onClick={() => void register(item)}
                  className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed ${
                    state.canRegister ? 'bg-navy-800 text-white hover:bg-navy-900' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {busyId === item.taskId ? t('tasks.reserving', 'جارٍ الحجز...') : state.reason === 'DEADLINE' ? t('tasks.deadlineEnded', 'انتهى التسجيل') : state.reason === 'FULL' ? t('tasks.full', 'مكتملة العدد') : t('tasks.willParticipate', 'سأنجز المهمة')}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <TransientToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
