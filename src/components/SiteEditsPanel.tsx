import { useState } from 'react';
import { Check, X, Pencil, Inbox, Save, ClipboardCheck, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import type { PendingSiteEdit } from '../data/mockData';
import Modal from './Modal';
import UnsavedDraftDecision from './UnsavedDraftDecision';
import { useSessionDraft } from '../hooks/useSessionDraft';
import { buildSessionDraftKey } from '../domain/sessionDraftState';
import { findOpenSessionDraft } from '../domain/sessionDraft';
import { useEffect } from 'react';

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

const technicalIdentity = (edit: PendingSiteEdit) => (
  `target=${edit.target} | path=${edit.diffs.map((row) => row.path ?? '-').join(',')} | recordId=${edit.recordId ?? '-'} | parentField=${edit.nested?.parentField ?? '-'} | itemId=${edit.nested?.itemId ?? '-'}`
);

export default function SiteEditsPanel() {
  const { t } = useTranslation();
  const {
    pendingSiteEdits,
    approveSiteEdit,
    rejectSiteEdit,
    approveSiteEditWithChanges,
    currentUser,
    editRequestsLoading,
    editRequestsError,
  } = useApp();
  const [editingEdit, setEditingEdit] = useState<PendingSiteEdit | null>(null);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'PRESIDENT') return;
    const openDraft = findOpenSessionDraft<{ revised: Record<string, string> }>(currentUser.userId, 'admin:site-edit');
    if (openDraft && openDraft.envelope.open && openDraft.entityId) {
      const edit = pendingSiteEdits?.find(e => e.id === openDraft.entityId && e.status === 'PENDING_PRESIDENT_APPROVAL');
      if (edit && !editingEdit) {
        setEditingEdit(edit);
      }
    }
  }, [currentUser, pendingSiteEdits, editingEdit]);

  const buildDefaultData = () => {
    const init: Record<string, string> = {};
    if (editingEdit) {
      (editingEdit.diffs ?? []).forEach((d, i) => { init[String(i)] = d.newValue; });
    }
    return { revised: init };
  };

  const draftKey = currentUser && editingEdit
    ? buildSessionDraftKey(currentUser.userId, 'admin:site-edit', 'edit', editingEdit.id)
    : null;

  const draft = useSessionDraft({
    key: draftKey,
    userId: currentUser?.userId ?? null,
    defaultData: buildDefaultData(),
    defaultOpen: false,
    validation: {
      readiness: !editingEdit 
        ? 'UNKNOWN' 
        : pendingSiteEdits?.find(e => e.id === editingEdit.id && e.status === 'PENDING_PRESIDENT_APPROVAL')
        ? 'VALID'
        : 'INVALID'
    },
    isDirty: (d) => {
      if (!editingEdit) return false;
      const def = buildDefaultData().revised;
      return Object.keys(d.revised).some(k => d.revised[k] !== def[k]);
    }
  });

  const revised = draft.data.revised;
  const setRevised = (updater: any) => draft.setData(p => ({ ...p, revised: typeof updater === 'function' ? updater(p.revised) : updater }));

  const [busyId, setBusyId] = useState<string | null>(null);

  if (!currentUser || currentUser.role !== 'PRESIDENT') return null;

  const pending = (pendingSiteEdits ?? []).filter((e) => e?.status === 'PENDING_PRESIDENT_APPROVAL');

  const openEdit = (edit: PendingSiteEdit) => {
    setEditingEdit(edit);
    draft.openTarget(buildSessionDraftKey(currentUser!.userId, 'admin:site-edit', 'edit', edit.id));
  };

  const saveRevised = async () => {
    if (!editingEdit) return;
    const diffs = (editingEdit.diffs ?? []).map((d, i) =>
      d.editable === false ? d : { ...d, newValue: revised[String(i)] ?? d.newValue }
    );
    setBusyId(editingEdit.id);
    const result = await approveSiteEditWithChanges(editingEdit.id, diffs);
    setBusyId(null);
    if (result.ok) {
      setEditingEdit(null);
      draft.clearDraft();
    }
  };

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      await (decision === 'approve' ? approveSiteEdit(id) : rejectSiteEdit(id));
    } finally {
      setBusyId(null);
    }
  };

  const editableCount = (editingEdit?.diffs ?? []).filter((d) => d.editable !== false).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900">
          <ClipboardCheck className="h-5 w-5 text-navy-600" />
          {t('admin.siteEdits.title', 'مراجعة تعديلات الموقع')}
        </h3>
        <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-700">
          {t('admin.siteEdits.pendingCount', '{{count}} تعديل معلق', { count: pending.length })}
        </span>
      </div>

      {editRequestsError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {editRequestsError}
        </div>
      )}

      {editRequestsLoading && pending.length === 0 ? (
        <div className="py-14 text-center text-sm text-gray-500">{t('admin.siteEdits.loading', 'جارٍ تحميل الطلبات...')}</div>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <Inbox className="h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">{t('admin.siteEdits.empty', 'لا توجد تعديلات محتوى معلقة قيد اعتماد رئيس الاتحاد حالياً.')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((edit) => (
            <div key={edit?.id ?? Math.random()} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-navy-800 px-3 py-1 text-xs font-bold text-white">
                  {edit.pageLabel}
                </span>
                <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-700">
                  {edit.sectionLabel}
                </span>
                <span className="text-sm font-bold text-navy-900">{edit.submittedBy ?? t('common.unspecified', 'غير محدد')}</span>
                <span className="text-xs text-gray-500">({edit.submittedByRole ?? ''})</span>
                <span className="mr-auto text-xs text-gray-400">{fmtDate(edit.createdAt ?? '')}</span>
              </div>
              <div dir="ltr" className="mt-2 break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">
                {technicalIdentity(edit)}
              </div>

              <div className="mt-3 space-y-2">
                {(edit.diffs ?? []).map((row, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                    <div className="mb-1.5 font-bold text-navy-900">{row.label}</div>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="text-[11px] text-gray-400">{t('admin.siteEdits.currentData', 'البيانات الحالية')}</div>
                        <div className="mt-0.5 break-words text-xs leading-relaxed text-rose-500 line-through">
                          {row.oldValue || '—'}
                        </div>
                      </div>
                      <div className="mt-4 select-none text-base text-gray-300">←</div>
                      <div className="flex-1">
                        <div className="text-[11px] text-gray-400">{t('admin.siteEdits.proposedData', 'البيانات المقترحة')}</div>
                        <div className="mt-0.5 break-words text-xs leading-relaxed font-semibold text-emerald-600">
                          {row.newValue || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => void decide(edit.id, 'approve')}
                  disabled={busyId === edit.id}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
                >
                  <Check className="h-4 w-4" />
                  {t('admin.siteEdits.approveAndPublish', 'اعتماد ونشر 🟢')}
                </button>
                <button
                  onClick={() => void decide(edit.id, 'reject')}
                  disabled={busyId === edit.id}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700"
                >
                  <X className="h-4 w-4" />
                  {t('admin.siteEdits.reject', 'رفض الطلب 🔴')}
                </button>
                <button
                  onClick={() => openEdit(edit)}
                  disabled={busyId === edit.id}
                  className="flex items-center gap-1.5 rounded-lg bg-navy-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-navy-800"
                >
                  <Pencil className="h-4 w-4" />
                  {t('admin.siteEdits.editThenApprove', 'تعديل ثم اعتماد ✏️🟢')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit-then-approve modal */}
      <Modal
        open={draft.open}
        onClose={draft.requestClose || (() => setEditingEdit(null))}
        title={t('admin.siteEdits.editModalTitle', 'تعديل ثم اعتماد: {{section}}', { section: editingEdit?.sectionLabel ?? '' })}
        maxWidth="max-w-2xl"
      >
        {draft.isDecisionOpen ? (
          <UnsavedDraftDecision onContinue={draft.continueEditing} onKeep={draft.keepDraftAndClose} onDiscard={draft.discardDraftAndClose} />
        ) : editingEdit ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-gold-200 bg-gold-50 p-3 text-xs leading-relaxed text-gold-800">
              {t('admin.siteEdits.editInstructions', 'عدّل القيم المقترحة ثم اعتمدها لتُنشر فورًا على الموقع. الحقول غير قابلة للتعديل تظهر للاطلاع فقط.')}
            </p>
            <div dir="ltr" className="break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">
              {technicalIdentity(editingEdit)}
            </div>
            {(editingEdit.diffs ?? []).map((d, i) => (
              <div key={i}>
                <label className="label-field">{d.label}</label>
                {d.editable === false || !d.path ? (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                    <div className="text-[11px] text-gray-400">{t('admin.siteEdits.proposedReadOnly', 'القيمة المقترحة (غير قابلة للتعديل)')}</div>
                    <div className="mt-1 break-words font-semibold text-emerald-700">{d.newValue || '—'}</div>
                  </div>
                ) : (
                  <textarea
                    rows={2}
                    className="input-field resize-none"
                    value={revised[String(i)] ?? d.newValue}
                    onChange={(e) => setRevised({ ...revised, [String(i)]: e.target.value })}
                    dir="auto"
                  />
                )}
              </div>
            ))}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button type="button" onClick={draft.requestClose || (() => setEditingEdit(null))} className="btn-ghost">
                <X className="h-4 w-4" /> {t('common.cancel', 'إلغاء')}
              </button>
              <button
                type="button"
                onClick={() => void saveRevised()}
                disabled={busyId === editingEdit.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
              >
                <Save className="h-4 w-4" />
                {t('admin.siteEdits.saveAndPublishRevised', 'حفظ ونشر التعديل المعدل')}
              </button>
            </div>
            {editableCount === 0 && (
              <p className="text-center text-xs text-gray-400">
                {t('admin.siteEdits.noEditableFields', 'هذا التعديل لا يحتوي حقولًا قابلة للتحرير — ستُعتمده القيم كما اقترحتها اللجنة الإعلامية.')}
              </p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
