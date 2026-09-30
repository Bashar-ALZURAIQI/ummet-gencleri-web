import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Plus } from 'lucide-react';
import RequiredMark from './RequiredMark';
import TransientToast, { type ToastMessage } from './TransientToast';
import { createInternalTask } from '../services/internalEconomyService';
import { useApp } from '../context/AppContext';
import { useSessionDraft } from '../hooks/useSessionDraft';
import { buildSessionDraftKey } from '../domain/sessionDraft';

export default function InternalTaskCreationPanel() {
  const { t } = useTranslation();
  const { currentUser } = useApp();
  const buildForm = () => ({
    title: '',
    description: '',
    pointsReward: 10,
    requiredStudents: 1,
    deadline: '',
  });

  const draftKey = currentUser?.userId ? buildSessionDraftKey(currentUser.userId, 'admin:internal-task', 'create') : null;

  const panelDraft = useSessionDraft({
    key: draftKey,
    userId: currentUser?.userId ?? null,
    defaultData: buildForm(),
    defaultOpen: true,
    validation: 'valid',
    isDirty: (d) => JSON.stringify(d) !== JSON.stringify(buildForm())
  });

  type TaskForm = ReturnType<typeof buildForm>;
  const form = panelDraft.data;
  const setForm = (v: TaskForm | ((p: TaskForm) => TaskForm)) => panelDraft.setData(p => typeof v === 'function' ? v(p) : { ...p, ...v });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = form.title.trim();
    const description = form.description.trim();
    if (!title || !description || form.pointsReward <= 0 || form.requiredStudents <= 0 || !form.deadline) {
      setToast({ id: Date.now(), type: 'error', text: t('admin.tasks.creation.incompleteError', 'يرجى إكمال جميع حقول المهمة بقيم صحيحة.') });
      return;
    }
    const deadline = new Date(form.deadline);
    if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      setToast({ id: Date.now(), type: 'error', text: t('admin.tasks.creation.futureDeadlineError', 'يجب أن يكون موعد إغلاق المهمة في المستقبل.') });
      return;
    }
    setBusy(true);
    const result = await createInternalTask({
      title,
      description,
      pointsReward: Number(form.pointsReward),
      requiredStudents: Number(form.requiredStudents),
      deadline: deadline.toISOString(),
    });
    setBusy(false);
    if (!result.ok) {
      console.error('[internal-economy] task creation failed', result.error);
      setToast({ id: Date.now(), type: 'error', text: result.error.message });
      return;
    }
    setToast({ id: Date.now(), type: 'success', text: t('admin.tasks.creation.successToast', 'تم إنشاء المهمة التطوعية وحفظها في قاعدة البيانات.') });
    panelDraft.clearDraft();
  };

  return (
    <section className="mt-10 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><ClipboardCheck className="h-5 w-5" /></div>
        <div>
          <h3 className="text-lg font-extrabold text-navy-900">{t('admin.tasks.creation.title', 'إنشاء مهمة تطوعية')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('admin.tasks.creation.subtitle', 'تظهر المهمة للطلاب المقبولين حتى يكتمل العدد المطلوب.')}</p>
        </div>
      </div>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="label-field">{t('admin.tasks.creation.titleLabel', 'عنوان المهمة')} <RequiredMark /></label>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="input-field" maxLength={200} />
        </div>
        <div>
          <label className="label-field">{t('admin.tasks.creation.deadlineLabel', 'تاريخ ووقت الإغلاق')} <RequiredMark /></label>
          <input type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="input-field" />
        </div>
        <div className="lg:col-span-2">
          <label className="label-field">{t('admin.tasks.creation.descriptionLabel', 'وصف المهمة')} <RequiredMark /></label>
          <textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input-field resize-none" maxLength={8000} />
        </div>
        <div>
          <label className="label-field">{t('admin.tasks.creation.pointsLabel', 'النقاط المكافأة')} <RequiredMark /></label>
          <input type="number" min="1" value={form.pointsReward} onChange={(event) => setForm({ ...form, pointsReward: Number(event.target.value) })} className="input-field" />
        </div>
        <div>
          <label className="label-field">{t('admin.tasks.creation.studentsLabel', 'عدد الطلاب المطلوبين')} <RequiredMark /></label>
          <input type="number" min="1" value={form.requiredStudents} onChange={(event) => setForm({ ...form, requiredStudents: Number(event.target.value) })} className="input-field" />
        </div>
        <div className="lg:col-span-2 flex justify-end">
          <button type="submit" disabled={busy} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"><Plus className="h-4 w-4" />{busy ? t('admin.tasks.creation.submitting', 'جارٍ الإنشاء...') : t('admin.tasks.creation.submitButton', 'إنشاء المهمة')}</button>
        </div>
      </form>
      <TransientToast message={toast} onClose={() => setToast(null)} />
    </section>
  );
}
