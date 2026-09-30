import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus, RefreshCw, RotateCcw } from 'lucide-react';
import Modal from './Modal';
import TransientToast, { type ToastMessage } from './TransientToast';
import UserAvatar from './UserAvatar';
import { UnsavedDraftDecision } from './UnsavedDraftDecision';
import { useApp } from '../context/AppContext';
import { useSessionDraft } from '../hooks/useSessionDraft';
import { buildSessionDraftKey, findOpenSessionDraft } from '../domain/sessionDraft';
import type { EconomySeason, MemberPointsRow } from '../domain/internalEconomyTypes.ts';
import { canMutateMemberPoints, tierPresentation } from '../domain/phaseThreeEconomy.ts';
import { adjustMemberPoints, endEconomySeason, loadActiveEconomySeason, loadMemberPoints } from '../services/phaseThreeEconomyService.ts';

export default function MemberPointsAdminPanel({ role }: { role: string }) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<MemberPointsRow[]>([]);
  const [season, setSeason] = useState<EconomySeason | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MemberPointsRow | null>(null);
  
  const { currentUser } = useApp();
  
  useEffect(() => {
    if (!currentUser || members.length === 0) return;
    const openDraft = findOpenSessionDraft<{ amount: string, reason: string, requestId: string }>(currentUser.userId, 'admin:member-points');
    if (openDraft && openDraft.envelope.open && openDraft.entityId) {
      const member = members.find(m => m.studentId === openDraft.entityId);
      if (member && !selected) {
        setSelected(member);
      }
    }
  }, [currentUser, members, selected]);

  const draftKey = currentUser && selected
    ? buildSessionDraftKey(currentUser.userId, 'admin:member-points', 'create', selected.studentId)
    : null;

  const draft = useSessionDraft({
    key: draftKey,
    userId: currentUser?.userId ?? null,
    defaultData: { amount: '', reason: '', requestId: '' },
    defaultOpen: false,
    validation: 'valid',
    isDirty: (d) => d.amount.trim() !== '' || d.reason.trim() !== ''
  });

  const amount = draft.data.amount;
  const setAmount = (v: string) => draft.setData(p => ({ ...p, amount: v }));
  const reason = draft.data.reason;
  const setReason = (v: string) => draft.setData(p => ({ ...p, reason: v }));
  const requestId = draft.data.requestId;

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const president = canMutateMemberPoints(role);
  const notify = (type: ToastMessage['type'], text: string) => setToast({ id: Date.now(), type, text });

  const refresh = useCallback(async () => {
    setLoading(true);
    const [m, s] = await Promise.all([loadMemberPoints(), loadActiveEconomySeason()]);
    setLoading(false);
    if (m.ok) setMembers(m.data);
    else {
      console.error('member points load failed', m.error);
      notify('error', m.error.message);
    }
    if (s.ok) setSeason(s.data);
    else console.error('season load failed', s.error);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = (member: MemberPointsRow) => {
    setSelected(member);
    draft.openTarget(buildSessionDraftKey(currentUser!.userId, 'admin:member-points', 'create', member.studentId));
    draft.setData(prev => prev.requestId ? prev : { ...prev, requestId: crypto.randomUUID() });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!selected || !requestId || !Number.isInteger(value) || value === 0 || reason.trim().length < 3) {
      notify('error', t('admin.memberPoints.invalidAdjustment', 'أدخل رقماً صحيحاً غير صفري وسبباً واضحاً.'));
      return;
    }
    setBusy(true);
    const result = await adjustMemberPoints({ studentId: selected.studentId, amount: value, reason: reason.trim(), requestId });
    setBusy(false);
    if (!result.ok) {
      console.error('manual point adjustment failed', result.error);
      notify('error', result.error.message);
      return;
    }
    setSelected(null);
    draft.clearDraft();
    notify('success', t('admin.memberPoints.adjustmentSuccess', 'تم حفظ حركة النقاط في السجل المالي.'));
    await refresh();
  };

  const endSeason = async () => {
    if (!season) return;
    const next = prompt(t('admin.memberPoints.endSeasonPrompt', 'اكتب اسم الموسم الجديد:'), t('admin.memberPoints.defaultNewSeason', 'الموسم الجديد'))?.trim();
    if (!next) return;
    if (!confirm(t('admin.memberPoints.endSeasonConfirm', 'سيتم تصفير أرصدة جميع الطلاب مع إبقاء السجل كأرشيف. هل أنت متأكد؟'))) return;
    setBusy(true);
    const result = await endEconomySeason(season.id, next);
    setBusy(false);
    if (!result.ok) {
      console.error('season close failed', result.error);
      notify('error', result.error.message);
      return;
    }
    notify('success', t('admin.memberPoints.endSeasonSuccess', 'تم إنهاء الموسم وتصفير الأرصدة وبدء الموسم الجديد.'));
    await refresh();
  };

  const formatTierLabel = (tierKey: 'GOLD' | 'SILVER' | 'BRONZE') => {
    switch (tierKey) {
      case 'GOLD':
        return t('admin.memberPoints.tiers.gold', 'عضو نخبوي');
      case 'SILVER':
        return t('admin.memberPoints.tiers.silver', 'عضو فعال');
      case 'BRONZE':
      default:
        return t('admin.memberPoints.tiers.bronze', 'عضو مبادر');
    }
  };

  return (
    <section className="card p-6">
      <TransientToast message={toast} onClose={() => setToast(null)} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-navy-900">{t('admin.memberPoints.title', 'إدارة نقاط الأعضاء')}</h2>
          <p className="text-sm text-gray-500">{season ? t('admin.memberPoints.season', 'الموسم: {{season}}', { season: season.label }) : t('admin.memberPoints.seasonLoading', 'جارٍ تحميل الموسم...')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void refresh()} className="btn-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {t('admin.memberPoints.refresh', 'تحديث')}
          </button>
          {president && (
            <button onClick={() => void endSeason()} disabled={busy || !season} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white">
              <RotateCcw className="h-4 w-4" /> {t('admin.memberPoints.endSeasonButton', 'إنهاء الموسم')}
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="p-3">{t('admin.memberPoints.table.member', 'العضو')}</th>
              <th className="p-3">{t('admin.memberPoints.table.balance', 'الرصيد')}</th>
              <th className="p-3">{t('admin.memberPoints.table.tier', 'الوسام')}</th>
              {president && <th className="p-3">{t('admin.memberPoints.table.action', 'إجراء')}</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const tier = tierPresentation(member.totalPoints);
              return (
                <tr key={member.studentId} className="border-b border-gray-100">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={member.studentName} avatarPath={member.avatarPath} className="h-10 w-10" />
                      <span className="font-bold text-navy-900">{member.studentName}</span>
                      {member.needsWarning && (
                        <span title={t('admin.memberPoints.negativeWarningTitle', 'الرصيد -50 أو أقل')}>
                          <AlertTriangle className="h-5 w-5 text-rose-600" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`p-3 text-lg font-extrabold ${member.totalPoints < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {member.totalPoints}
                  </td>
                  <td className="p-3">{tier.medal} {formatTierLabel(tier.tier)}</td>
                  {president && (
                    <td className="p-3">
                      <button onClick={() => open(member)} className="btn-secondary">
                        <Plus className="h-4 w-4" /> {t('admin.memberPoints.adjustButton', 'إضافة/خصم')}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Modal open={draft.open} onClose={draft.requestClose || (() => setSelected(null))} title={t('admin.memberPoints.modal.title', 'تعديل نقاط {{name}}', { name: selected?.studentName ?? '' })}>
        {draft.isDecisionOpen ? (
          <UnsavedDraftDecision onContinue={draft.continueEditing} onKeep={draft.keepDraftAndClose} onDiscard={draft.discardDraftAndClose} />
        ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label-field">{t('admin.memberPoints.modal.amountLabel', 'القيمة الموقعة')}</label>
            <input className="input-field" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('admin.memberPoints.modal.amountPlaceholder', 'مثال: 10 أو -5')} required />
          </div>
          <div>
            <label className="label-field">{t('admin.memberPoints.modal.reasonLabel', 'سبب التعديل')}</label>
            <textarea className="input-field min-h-28" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={draft.requestClose || (() => setSelected(null))} className="btn-secondary">{t('common.cancel', 'إلغاء')}</button>
            <button disabled={busy} className="btn-primary">{busy ? t('admin.memberPoints.modal.savingButton', 'جارٍ الحفظ...') : t('admin.memberPoints.modal.saveButton', 'حفظ الحركة')}</button>
          </div>
        </form>
        )}
      </Modal>
    </section>
  );
}
