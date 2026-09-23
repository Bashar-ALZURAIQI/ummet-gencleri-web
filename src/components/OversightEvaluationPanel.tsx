import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import TransientToast, { type ToastMessage } from './TransientToast';
import UserAvatar from './UserAvatar';
import { activityDraftComplete } from '../domain/phaseThreeEconomy.ts';
import type { ActivityEvaluationRow, AttendanceStatus } from '../domain/internalEconomyTypes.ts';
import { finalizeActivityEvaluation, loadActivityEvaluations, saveActivityAttendance } from '../services/phaseThreeEconomyService.ts';

const groupRows = <T,>(rows: T[], keyOf: (row: T) => string): T[][] => (
  Array.from(rows.reduce((groups, row) => {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
    return groups;
  }, new Map<string, T[]>()).values())
);

export default function OversightEvaluationPanel() {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<ActivityEvaluationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const attendanceLabels: Record<AttendanceStatus, string> = useMemo(() => ({
    ON_TIME: t('admin.oversight.attendance.onTime', 'في الوقت (100%)'),
    LATE: t('admin.oversight.attendance.late', 'تأخر قليلاً (75%)'),
    VERY_LATE: t('admin.oversight.attendance.veryLate', 'تأخر جداً (30%)'),
    ABSENT: t('admin.oversight.attendance.absent', 'غائب'),
  }), [t]);

  const notify = (type: ToastMessage['type'], text: string) => setToast({ id: Date.now(), type, text });

  const refresh = useCallback(async () => {
    setLoading(true);
    const a = await loadActivityEvaluations();
    setLoading(false);
    if (!a.ok) {
      console.error('activity evaluation load failed', a.error);
      notify('error', a.error.message);
    } else {
      setActivities(a.data);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const activityGroups = useMemo(() => groupRows(activities, (row) => row.activityId), [activities]);

  const saveAttendance = async (row: ActivityEvaluationRow, status: AttendanceStatus) => {
    if (!row.studentId) return;
    setBusy(`${row.activityId}:${row.studentId}`);
    const result = await saveActivityAttendance(row.activityId, row.studentId, status);
    setBusy(null);
    if (!result.ok) {
      console.error('attendance save failed', result.error);
      notify('error', result.error.message);
      return;
    }
    setActivities((cur) => cur.map((item) => (
      item.activityId === row.activityId && item.studentId === row.studentId
        ? { ...item, attendanceStatus: status }
        : item
    )));
  };

  const closeActivity = async (rows: ActivityEvaluationRow[]) => {
    if (!activityDraftComplete(rows) || !confirm(t('admin.oversight.confirmClose', 'سيتم إغلاق النشاط وتوزيع النقاط نهائياً. هل تريد المتابعة؟'))) return;
    setBusy(rows[0].activityId);
    const result = await finalizeActivityEvaluation(rows[0].activityId);
    setBusy(null);
    if (!result.ok) {
      console.error('activity finalization failed', result.error);
      notify('error', result.error.message);
      return;
    }
    setActivities((cur) => cur.filter((r) => r.activityId !== rows[0].activityId));
    notify('success', t('admin.oversight.closedSuccess', 'تم إغلاق النشاط وتوزيع النقاط بنجاح.'));
  };

  return (
    <section className="card p-6">
      <TransientToast message={toast} onClose={() => setToast(null)} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-navy-900">{t('admin.oversight.title', 'الرقابة والتحضير')}</h2>
          <p className="text-sm text-gray-500">{t('admin.oversight.subtitle', 'احفظ حضور كل طالب ثم أغلق النشاط لتوزيع النقاط ذرياً.')}</p>
        </div>
        <button className="btn-secondary" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {t('admin.oversight.refresh', 'تحديث')}
        </button>
      </div>
      {!loading && activityGroups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500">
          {t('admin.oversight.empty', 'لا توجد أنشطة بانتظار التحضير والتقييم حالياً.')}
        </div>
      )}
      <div className="space-y-5">
        {activityGroups.map((group) => {
          const rows = group ?? [];
          if (!rows.length) return null;
          return (
            <article key={rows[0].activityId} className="rounded-2xl border border-gray-200 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-navy-900">{rows[0].activityTitle}</h3>
                  <p className="text-xs text-gray-500">
                    {rows[0].activityType === 'PAID'
                      ? t('admin.oversight.paidNotice', 'مدفوع: لا تُمنح نقاط حضور')
                      : t('admin.oversight.pointsValue', 'قيمة النشاط: {{points}}', { points: rows[0].pointsValue })}
                  </p>
                </div>
                <button
                  disabled={!activityDraftComplete(rows) || busy === rows[0].activityId}
                  onClick={() => void closeActivity(rows)}
                  className="btn-primary"
                >
                  <CheckCircle2 className="h-4 w-4" /> {t('admin.oversight.closeAndDistribute', 'إغلاق وتوزيع النقاط')}
                </button>
              </div>
              <div className="space-y-2">
                {rows.map((row) => {
                  if (!row.studentId) {
                    return (
                      <div key="no-students" className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">
                        {t('admin.oversight.noStudentsEnrolled', 'لا يوجد طلاب مسجلون في هذا النشاط.')}
                      </div>
                    );
                  }
                  return (
                    <div key={row.studentId} className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 p-3">
                      <UserAvatar name={row.studentName ?? ''} avatarPath={row.avatarPath} className="h-9 w-9" />
                      <span className="min-w-36 flex-1 font-semibold">{row.studentName}</span>
                      {row.decision === 'IGNORED' ? (
                        <span className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 border border-rose-200">
                          {rows[0].activityType === 'MANDATORY'
                            ? t('admin.oversight.ignoredPenalty', 'لم يرد (-20)')
                            : t('admin.oversight.ignoredNoPenalty', 'لم يرد')}
                        </span>
                      ) : (
                        <select
                          value={row.attendanceStatus ?? ''}
                          disabled={busy === `${row.activityId}:${row.studentId}`}
                          onChange={(e) => void saveAttendance(row, e.target.value as AttendanceStatus)}
                          className="input-field max-w-xs"
                        >
                          <option value="" disabled>{t('admin.oversight.selectAttendance', 'اختر الحضور')}</option>
                          {Object.entries(attendanceLabels).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
