import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Pencil, ClipboardCheck, Inbox, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { committeeMeta, type PendingProfileEdit } from '../data/mockData';
import EditDiffTable from './EditDiffTable';
import ExecutiveEditDraftEditor from './ExecutiveEditDraftEditor';
import Modal from './Modal';
import { UnsavedDraftDecision } from './UnsavedDraftDecision';
import { useSessionDraft } from '../hooks/useSessionDraft';
import { buildSessionDraftKey, findOpenSessionDraft, removeSessionDraft } from '../domain/sessionDraft';
import { useEffect } from 'react';

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

export default function ProfileEditsPanel() {
  const { t } = useTranslation();
  const {
    pendingProfileEdits,
    approveProfileEdit,
    approveProfileEditWithChanges,
    rejectProfileEdit,
    currentUser,
    editRequestsLoading,
    editRequestsError,
  } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PendingProfileEdit | null>(null);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'PRESIDENT') return;
    const openDraft = findOpenSessionDraft<{ responsibilities: string, stats: {label: string; value: string}[], members: {name: string; position: string}[] }>(currentUser.userId, 'admin:profile-edit');
    if (openDraft && openDraft.envelope.open && openDraft.entityId) {
      if (editRequestsLoading) return;
      const edit = pendingProfileEdits?.find(e => e.id === openDraft.entityId && e.status === 'PENDING_APPROVAL');
      if (edit) {
        if (!editing) setEditing(edit);
      } else {
        removeSessionDraft(openDraft.key);
      }
    }
  }, [currentUser, pendingProfileEdits, editing, editRequestsLoading]);

  const buildDefaultData = () => {
    if (!editing) return { responsibilities: '', stats: [], members: [] };
    const snapshot = editing.snapshot;
    return {
      responsibilities: snapshot.responsibilities.join('\n'),
      stats: snapshot.stats.map(s => ({ ...s })),
      members: snapshot.members.map(m => ({ name: m.name, position: m.position }))
    };
  };

  const draftKey = currentUser && editing
    ? buildSessionDraftKey(currentUser.userId, 'admin:profile-edit', 'edit', editing.id)
    : null;

  const draft = useSessionDraft({
    key: draftKey,
    userId: currentUser?.userId ?? null,
    defaultData: buildDefaultData(),
    defaultOpen: false,
    validation: !editing 
        ? 'unknown' 
        : pendingProfileEdits?.find(e => e.id === editing.id && e.status === 'PENDING_APPROVAL')
        ? 'valid'
        : 'invalid',
    isDirty: (d) => {
      if (!editing) return false;
      const def = buildDefaultData();
      return (
        d.responsibilities !== def.responsibilities ||
        JSON.stringify(d.stats) !== JSON.stringify(def.stats) ||
        JSON.stringify(d.members) !== JSON.stringify(def.members)
      );
    }
  });

  const openEdit = (edit: PendingProfileEdit) => {
    setEditing(edit);
    const snapshot = edit.snapshot;
    const initialData = {
      responsibilities: snapshot.responsibilities.join('\n'),
      stats: snapshot.stats.map(s => ({ ...s })),
      members: snapshot.members.map(m => ({ name: m.name, position: m.position }))
    };
    draft.openTarget(buildSessionDraftKey(currentUser!.userId, 'admin:profile-edit', 'edit', edit.id), initialData);
  };

  if (!currentUser || currentUser.role !== 'PRESIDENT') return null;

  const pending = (pendingProfileEdits ?? []).filter((e) => e?.status === 'PENDING_APPROVAL');

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      await (decision === 'approve' ? approveProfileEdit(id) : rejectProfileEdit(id));
    } finally {
      setBusyId(null);
    }
  };

  const approveEdited = async (snapshot: PendingProfileEdit['snapshot']) => {
    if (!editing) return;
    setBusyId(editing.id);
    try {
      const result = await approveProfileEditWithChanges(editing.id, snapshot, t('admin.profileEdits.presidentRevisedNote', 'اعتمد الرئيس نسخة منقحة من الطلب.'));
      if (result.ok) {
        setEditing(null);
        draft.clearDraft();
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900">
          <ClipboardCheck className="h-5 w-5 text-navy-600" />
          {t('admin.profileEdits.title', 'طلبات تعديل بيانات الهيئة التنفيذية')}
        </h3>
        <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-700">
          {t('admin.profileEdits.pendingCount', '{{count}} طلب معلق', { count: pending.length })}
        </span>
      </div>

      {editRequestsError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {editRequestsError}
        </div>
      )}

      {editRequestsLoading && pending.length === 0 ? (
        <div className="py-14 text-center text-sm text-gray-500">{t('admin.profileEdits.loading', 'جارٍ تحميل الطلبات...')}</div>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <Inbox className="h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">{t('admin.profileEdits.empty', 'لا توجد طلبات تعديل معلقة قيد اعتماد رئيس الاتحاد حالياً.')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((edit) => (
            <div key={edit?.id ?? Math.random()} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-navy-800 px-3 py-1 text-xs font-bold text-white">
                  {committeeMeta[edit.committeeId]?.name ?? edit.committeeId}
                </span>
                <span className="text-sm font-bold text-navy-900">{edit.submittedBy ?? t('admin.board.unspecified', 'غير محدد')}</span>
                <span className="text-xs text-gray-500">({edit.submittedByRole ?? ''})</span>
                <span className="mr-auto text-xs text-gray-400">{fmtDate(edit.createdAt ?? '')}</span>
              </div>

              <div className="mt-3">
                {edit.detailsUnavailable ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {t('admin.profileEdits.detailsUnavailable', 'تعذر قراءة تفاصيل هذا الطلب القديم')}
                  </div>
                ) : (
                  <EditDiffTable rows={edit.summary ?? []} />
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {!edit.detailsUnavailable && (
                  <>
                    <button
                      onClick={() => void decide(edit.id, 'approve')}
                      disabled={busyId !== null}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      {t('admin.profileEdits.approve', 'موافقة')}
                    </button>
                    <button
                      onClick={() => openEdit(edit)}
                      disabled={busyId !== null}
                      className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" />
                      {t('admin.profileEdits.editDraft', 'تعديل الطلب')}
                    </button>
                  </>
                )}
                <button
                  onClick={() => void decide(edit.id, 'reject')}
                  disabled={busyId !== null}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  {t('admin.profileEdits.reject', 'رفض')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={draft.open}
        onClose={draft.requestClose || (() => setEditing(null))}
        title={t('admin.profileEdits.editModalTitle', 'تعديل الطلب قبل الموافقة')}
        maxWidth="max-w-3xl"
      >
        {draft.isDecisionOpen ? (
          <UnsavedDraftDecision onContinue={draft.continueEditing} onKeep={draft.keepDraftAndClose} onDiscard={draft.discardDraftAndClose} />
        ) : editing ? (
          <ExecutiveEditDraftEditor
            snapshot={editing.snapshot}
            busy={busyId === editing.id}
            onCancel={draft.requestClose || (() => setEditing(null))}
            onSubmit={approveEdited}
            draftData={draft.data}
            setDraftData={draft.setData}
          />
        ) : null}
      </Modal>
    </div>
  );
}
