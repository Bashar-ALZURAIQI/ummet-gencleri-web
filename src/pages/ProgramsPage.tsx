import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays, CheckCircle2, History, Sparkles, Plus, Edit3, Trash2, Save,
  CheckCircle2 as Check, X, Users, Layers,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import EventCard from '../components/EventCard';
import Modal from '../components/Modal';
import SiteEditBanner from '../components/SiteEditBanner';
import StatCounter from '../components/StatCounter';
import { categoryLabels, type EventCategory, type UEvent, type ProgramsContent, type SiteEditDiff } from '../data/mockData';
import RequiredMark from '../components/RequiredMark';
import { validateRequired, clearInvalid, isInvalid, fieldId } from '../utils/formValidation';
import ManagedFileField from '../components/ManagedFileField';
import TransientToast, { type ToastMessage } from '../components/TransientToast';
import type { ActivityType, StudentActivityBoardItem } from '../domain/internalEconomyTypes.ts';
import { buildActivityDecisionRequest, toDateTimeLocalValue } from '../domain/internalEconomyInteraction.ts';
import {
  loadStudentActivityBoard,
  setOwnActivityDecision,
} from '../services/internalEconomyService';
import { canCreateExecutiveContent } from '../domain/phaseThreeEconomy.ts';
import { CmsEntityTranslationTabs } from '../components/cmsLocalization/CmsEntityTranslationTabs';
import { useCmsLocalizationRepository } from '../context/CmsLocalizationContext';
import { type LocalizedCmsLocale } from '../domain/cmsLocalization';
import { publishCmsEntityLocales, resolveCanonicalEntityById } from '../domain/cmsLocalizationEditor';
import { getEventCategoryLabel } from '../domain/eventCategoryPresentation';
import { interpolateProgramsAchievementsText } from '../domain/programsAchievements.ts';

type Tab = 'upcoming' | 'past';

export default function ProgramsPage() {
  const {
    events,
    currentUser,
    programsContent,
    canonicalEvents,
    canonicalProgramsContent,
    submitSiteEdit,
    uploadManagedFile,
    savePublishedSiteTarget,
    createPublishedEvent,
    updateOwnedEvent,
    listOwnEventIds,
    refreshPublishedLocalizations,
  } = useApp();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [cat, setCat] = useState<EventCategory | 'all'>('all');
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState<ProgramsContent>(canonicalProgramsContent ?? programsContent);
  const [headerTranslations, setHeaderTranslations] = useState<Record<LocalizedCmsLocale, Record<string, string>>>({
    tr: { badge: '', title: '', description: '', 'achievements.title': '', 'achievements.text': '' },
    en: { badge: '', title: '', description: '', 'achievements.title': '', 'achievements.text': '' },
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [ownedEventIds, setOwnedEventIds] = useState<Set<string>>(new Set());
  const [invalid, setInvalid] = useState<string[]>([]);
  const [draftEventId, setDraftEventId] = useState('');
  const [activityBoard, setActivityBoard] = useState<StudentActivityBoardItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityBusyId, setActivityBusyId] = useState<string | null>(null);
  const [excuseActivity, setExcuseActivity] = useState<StudentActivityBoardItem | null>(null);
  const [excuseText, setExcuseText] = useState('');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const repository = useCmsLocalizationRepository();
  const [translations, setTranslations] = useState<Record<'tr' | 'en', Record<string, string>>>({
    tr: { title: '', description: '', location: '' },
    en: { title: '', description: '', location: '' },
  });
  const [form, setForm] = useState({
    title: '', category: '' as EventCategory, date: '', time: '16:00',
    location: '', description: '', capacity: 50, registered: 0,
    status: '' as 'upcoming' | 'past', image: '', showOnHomepage: false,
    activityType: 'OPTIONAL' as ActivityType, pointsValue: 0, registrationDeadline: '',
  });

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    setToast({ id: Date.now(), type, text });
  }, []);

  const refreshActivityBoard = useCallback(async () => {
    setActivityLoading(true);
    const result = await loadStudentActivityBoard();
    setActivityLoading(false);
    if (!result.ok) {
      console.error('[internal-economy] load activity board failed', result.error);
      notify('error', result.error.message);
      return;
    }
    setActivityBoard(result.data);
  }, [notify]);

  useEffect(() => {
    void refreshActivityBoard();
  }, [refreshActivityBoard, currentUser?.userId]);

  const activityByEventId = useMemo(
    () => new Map(activityBoard.map((activity) => [activity.publicEventId, activity])),
    [activityBoard],
  );

  const saveStudentDecision = useCallback(async (
    activity: StudentActivityBoardItem,
    decision: 'JOINING' | 'DECLINING' | 'IGNORED',
    excuse?: string | null,
  ) => {
    const request = buildActivityDecisionRequest({
      activityId: activity.activityId,
      activityType: activity.type,
      decision,
      excuseText: excuse,
    });
    if (!request.ok) {
      notify('error', request.error);
      return false;
    }
    setActivityBusyId(activity.activityId);
    const result = await setOwnActivityDecision(request.value);
    setActivityBusyId(null);
    if (!result.ok) {
      console.error('[internal-economy] activity decision failed', result.error);
      notify('error', result.error.message);
      return false;
    }
    await refreshActivityBoard();
    notify('success', decision === 'JOINING' ? 'تم حفظ قرار انضمامك بنجاح.' : 'تم حفظ قرار عدم الانضمام بنجاح.');
    return true;
  }, [notify, refreshActivityBoard]);

  const declineActivity = (activity: StudentActivityBoardItem) => {
    if (activity.decision === 'DECLINING') {
      void saveStudentDecision(activity, 'IGNORED', null);
      return;
    }
    if (activity.type === 'MANDATORY') {
      setExcuseActivity(activity);
      setExcuseText(activity.excuseText ?? '');
      return;
    }
    void saveStudentDecision(activity, 'DECLINING', null);
  };

  // Creation is available to every current executive. Editing and deleting
  // existing published cards keep their narrower, existing authorization.
  const isPresident = currentUser?.role === 'PRESIDENT';
  const canAddEvent = canCreateExecutiveContent(currentUser?.role);

  useEffect(() => {
    if (canAddEvent && !isPresident) {
      listOwnEventIds().then(res => {
        if (res.ok && res.data) {
          setOwnedEventIds(new Set(res.data));
        }
      });
    }
  }, [canAddEvent, isPresident, listOwnEventIds]);

  const filtered = events.filter((e) => {
    if (tab === 'upcoming' && e.status !== 'upcoming') return false;
    if (tab === 'past' && e.status !== 'past') return false;
    if (cat !== 'all' && e.category !== cat) return false;
    return true;
  });

  const upcomingCount = events.filter((e) => e.status === 'upcoming').length;
  const pastCount = events.filter((e) => e.status === 'past').length;

  const openAdd = () => {
    setEditId(null);
    setDraftEventId(crypto.randomUUID());
    setForm({ title: '', category: '' as EventCategory, date: '', time: '16:00', location: '', description: '', capacity: 50, registered: 0, status: '' as 'upcoming' | 'past', image: '', showOnHomepage: false, activityType: 'OPTIONAL', pointsValue: 0, registrationDeadline: '' });
    setTranslations({
      tr: { title: '', description: '', location: '' },
      en: { title: '', description: '', location: '' },
    });
    setModalOpen(true);
  };

  const openEdit = (e: UEvent) => {
    const canonicalEvent = resolveCanonicalEntityById(canonicalEvents ?? events, e);
    setEditId(canonicalEvent.id);
    const d = new Date(canonicalEvent.date);
    setForm({
      title: canonicalEvent.title, category: canonicalEvent.category, date: canonicalEvent.date.slice(0, 10), time: d.toTimeString().slice(0, 5),
      location: canonicalEvent.location, description: canonicalEvent.description, capacity: canonicalEvent.capacity, registered: canonicalEvent.registered,
      status: canonicalEvent.status, image: canonicalEvent.image, showOnHomepage: canonicalEvent.showOnHomepage ?? false,
      activityType: canonicalEvent.activityType ?? 'OPTIONAL',
      pointsValue: canonicalEvent.pointsValue ?? 0,
      registrationDeadline: toDateTimeLocalValue(canonicalEvent.registrationDeadline ?? canonicalEvent.date),
    });
    setTranslations({
      tr: { title: '', description: '', location: '' },
      en: { title: '', description: '', location: '' },
    });
    setModalOpen(true);
  };

  const openHeaderEditor = () => {
    setHeaderForm(programsContent);
    setHeaderTranslations({
      tr: { badge: '', title: '', description: '', 'achievements.title': '', 'achievements.text': '' },
      en: { badge: '', title: '', description: '', 'achievements.title': '', 'achievements.text': '' },
    });
    setEditingHeader(true);
  };

  const fmtVal = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
    if (typeof v === 'object') return String(JSON.stringify(v));
    return String(v);
  };

  const eventDiffs = (op: 'add' | 'update' | 'delete', current: UEvent | null, next: UEvent): SiteEditDiff[] => {
    if (op === 'delete' && current) {
      return [{ label: 'حذف الفعالية', oldValue: current.title, newValue: 'سيتم حذف هذه الفعالية من البرامج' }];
    }
    const rows: [string, string, unknown, unknown, boolean][] = [
      ['العنوان', 'title', current?.title, next.title, true],
      ['الفئة', 'category', current?.category ?? '', next.category, false],
      ['التاريخ', 'date', current?.date ?? '', next.date, false],
      ['المكان', 'location', current?.location ?? '', next.location ?? '', true],
      ['الوصف', 'description', current?.description ?? '', next.description ?? '', true],
      ['عدد المقاعد', 'capacity', current?.capacity ?? '', next.capacity, true],
      ['عدد المسجلين', 'registered', current?.registered ?? '', next.registered, true],
      ['العرض في الرئيسية', 'showOnHomepage', current ? (current.showOnHomepage ? 'نعم' : 'لا') : '', next.showOnHomepage ? 'نعم' : 'لا', false],
      ['رابط الصورة', 'image', current?.image ?? '', next.image ?? '', true],
      ['الحالة', 'status', current?.status ?? '', next.status, false],
      ['نوع النشاط الداخلي', 'activityType', current?.activityType ?? '', next.activityType ?? '', false],
      ['قيمة النقاط', 'pointsValue', current?.pointsValue ?? '', next.pointsValue ?? 0, false],
      ['موعد إغلاق التسجيل', 'registrationDeadline', current?.registrationDeadline ?? '', next.registrationDeadline ?? '', false],
    ];
    const diffs: SiteEditDiff[] = [];
    for (const [label, path, oldV, newV, editable] of rows) {
      if (fmtVal(oldV) === fmtVal(newV)) continue;
      diffs.push({ label, path, oldValue: fmtVal(oldV), newValue: fmtVal(newV), editable });
    }
    return diffs;
  };

  const mediaNotice = () => undefined;

  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = validateRequired(form, ['title', 'status', 'category', 'date', 'time', 'location', 'description', 'image', 'capacity', 'activityType', 'registrationDeadline'], setInvalid);
    const capacityOk = form.capacity > 0;
    const pointsOk = form.pointsValue >= 0 && (form.activityType !== 'PAID' || form.pointsValue > 0);
    if (!capacityOk) setInvalid((p) => (p.includes('capacity') ? p : [...p, 'capacity']));
    if (!pointsOk) setInvalid((p) => (p.includes('pointsValue') ? p : [...p, 'pointsValue']));
    if (!ok || !capacityOk || !pointsOk) return;
    const iso = new Date(`${form.date}T${form.time}`).toISOString();
    const registrationDeadline = new Date(form.registrationDeadline).toISOString();
    const image = form.image;
    const publicEventId = editId ?? (draftEventId || crypto.randomUUID());
    if (editId) {
      const current = (canonicalEvents ?? events).find((ev) => ev.id === editId);
      const next: UEvent = {
        ...current!,
        title: form.title, category: form.category, date: iso, location: form.location,
        description: form.description, capacity: Number(form.capacity), registered: Number(form.registered),
        status: form.status, image, showOnHomepage: form.showOnHomepage,
        activityType: form.activityType, pointsValue: Number(form.pointsValue), registrationDeadline,
      };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = eventDiffs('update', current ?? null, next);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'programs', pageLabel: 'البرامج والأنشطة', sectionLabel: next.title,
            target: 'events', op: 'update', recordId: editId, recordValue: next, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setModalOpen(false);
        return;
      }
      let saved;
      if (isPresident) {
        saved = await savePublishedSiteTarget(
          'events',
          (canonicalEvents ?? events).map((ev) => (ev.id === editId ? next : ev)),
        );
      } else {
        saved = await updateOwnedEvent(editId, next);
      }
      if (!saved.ok) {
        if (!isPresident) notify('error', saved.error ?? 'تعذر تعديل الفعالية.');
        return;
      }
    } else {
      const newEvent: UEvent = {
        id: publicEventId, title: form.title, category: form.category, date: iso,
        location: form.location, description: form.description, status: form.status,
        capacity: Number(form.capacity), registered: Number(form.registered), image,
        showOnHomepage: form.showOnHomepage, createdByRole: currentUser?.role,
        activityType: form.activityType, pointsValue: Number(form.pointsValue), registrationDeadline,
      };
      const saved = await createPublishedEvent(newEvent);
      if (!saved.ok) {
        notify('error', saved.error ?? 'تعذر إنشاء الفعالية.');
        return;
      }
      // Bind and publish entered translations to authoritative event ID
      for (const loc of ['tr', 'en'] as const) {
        const trData = translations[loc];
        if (trData.title?.trim() || trData.description?.trim() || trData.location?.trim()) {
          try {
            await repository.publishEventLocalization(publicEventId, loc, trData);
          } catch {
            notify('error', t('cmsLocalization.publishFailed', 'تعذر نشر الترجمة.'));
            return;
          }
        }
      }
      await refreshPublishedLocalizations();
    }
    setModalOpen(false);
    notify('success', editId ? 'تم حفظ الفعالية وإعدادات التسجيل.' : 'تمت إضافة الفعالية وربطها بالتسجيل الدائم.');
  };

  const removeEvent = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الفعالية؟')) return;
    const current = (canonicalEvents ?? events).find((e) => e.id === id);
    if (!current) return;
    if (currentUser?.role === 'MEDIA_HEAD') {
      await submitSiteEdit({
        pageId: 'programs', pageLabel: 'البرامج والأنشطة', sectionLabel: current.title,
        target: 'events', op: 'delete', recordId: id, recordValue: current,
        diffs: eventDiffs('delete', current, current),
      });
      mediaNotice();
      return;
    }
    await savePublishedSiteTarget('events', (canonicalEvents ?? events).filter((event) => event.id !== id));
  };

const saveHeader = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired({ ...headerForm }, ['badge', 'title', 'description'], setInvalid)) return;
    const emptyAchievements = [
      headerForm.achievements.title.trim() ? '' : 'achievements.title',
      headerForm.achievements.text.trim() ? '' : 'achievements.text',
    ].filter(Boolean);
    if (emptyAchievements.length > 0) {
      setInvalid(emptyAchievements);
      const first = document.getElementById(`fld_${emptyAchievements[0]}`);
      first?.focus();
      alert('يرجى تعبئة كافة الحقول المطلوبة قبل الإرسال/الحفظ');
      return;
    }
    if (currentUser?.role === 'MEDIA_HEAD') {
      const diffs = [
        { label: 'الشارة', path: 'badge', oldValue: programsContent.badge, newValue: headerForm.badge },
        { label: 'العنوان الرئيسي', path: 'title', oldValue: programsContent.title, newValue: headerForm.title },
        { label: 'النص الوصفي', path: 'description', oldValue: programsContent.description, newValue: headerForm.description },
        { label: 'عنوان الإنجازات', path: 'achievements.title', oldValue: programsContent.achievements.title, newValue: headerForm.achievements.title },
        { label: 'نص الإنجازات', path: 'achievements.text', oldValue: programsContent.achievements.text, newValue: headerForm.achievements.text },
        { label: 'عدد الفعاليات', path: 'achievements.eventsCount', oldValue: String(programsContent.achievements.eventsCount), newValue: String(headerForm.achievements.eventsCount) },
        { label: 'عدد الطلاب المستفيدين', path: 'achievements.studentsCount', oldValue: String(programsContent.achievements.studentsCount), newValue: String(headerForm.achievements.studentsCount) },
        { label: 'عدد الجامعات', path: 'achievements.universitiesCount', oldValue: String(programsContent.achievements.universitiesCount), newValue: String(headerForm.achievements.universitiesCount) },
      ].filter((d) => d.oldValue !== d.newValue);
      if (diffs.length) {
        const submitted = await submitSiteEdit({
          pageId: 'programs', pageLabel: 'البرامج والأنشطة', sectionLabel: 'ترويسة الصفحة',
          target: 'programsContent', op: 'update', recordId: 'header', recordValue: headerForm, diffs,
        });
        if (!submitted) return;
        mediaNotice();
      }
      setEditingHeader(false);
      return;
    }
    const saved = await savePublishedSiteTarget('programsContent', headerForm);
    if (!saved.ok) return;
    try {
      await publishCmsEntityLocales({
        repository, target: 'programsContent', canonicalPayload: headerForm,
        recordId: 'header', translations: headerTranslations,
      });
      await refreshPublishedLocalizations();
    } catch {
      notify('error', t('cmsLocalization.publishFailed', 'تعذر نشر الترجمة.'));
      return;
    }
    setEditingHeader(false);
  };

  return (
    <div className="animate-fade-in pt-16 lg:pt-20">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 py-16 text-center lg:py-20">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
        <div className="absolute -top-20 left-1/4 h-72 w-72 rounded-full bg-gold-500/15 blur-3xl" />
        <div className="container-app relative">
          {editingHeader ? (
            <form onSubmit={saveHeader} className="mx-auto max-w-2xl space-y-3 text-right">
              <CmsEntityTranslationTabs
                onPublished={refreshPublishedLocalizations}
                target="programsContent"
                recordId="header"
                canonicalPayload={headerForm}
                fields={[
                  {
                    name: 'badge',
                    label: t('programs.headerModal.badge', 'الشارة'),
                    kind: 'title',
                    canonicalValue: headerForm.badge,
                    placeholder: 'الشارة',
                  },
                  {
                    name: 'title',
                    label: t('programs.headerModal.title', 'العنوان الرئيسي'),
                    kind: 'title',
                    canonicalValue: headerForm.title,
                    placeholder: 'العنوان الرئيسي',
                  },
                  {
                    name: 'description',
                    label: t('programs.headerModal.description', 'النص الوصفي'),
                    kind: 'description',
                    canonicalValue: headerForm.description,
                    placeholder: 'النص الوصفي',
                  },
                  {
                    name: 'achievements.title',
                    label: t('programs.headerModal.achievementsTitle', 'عنوان الإنجازات'),
                    kind: 'title',
                    canonicalValue: headerForm.achievements.title,
                    placeholder: 'عنوان الإنجازات',
                  },
                  {
                    name: 'achievements.text',
                    label: t('programs.headerModal.achievementsText', 'نص الإنجازات'),
                    kind: 'description',
                    canonicalValue: headerForm.achievements.text,
                    placeholder: 'اكتب وصفًا للإنجازات ويمكن استخدام {events} و{students} و{universities} لامكانية وضعها داخل الجملة',
                  },
                ]}
                canEdit={Boolean(isPresident)}
                translations={headerTranslations}
                onTranslationChange={(loc, name, val) => {
                  setHeaderTranslations((prev) => ({
                    ...prev,
                    [loc]: { ...prev[loc], [name]: val },
                  }));
                }}
              >
                <div>
                  <label className="mb-1.5 block text-right text-xs font-bold text-gold-300">الشارة <RequiredMark /></label>
                  <input
                    id={fieldId('badge')}
                    className={`${isInvalid(invalid, 'badge') ? 'input-field-dark-error' : 'w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-gray-400 focus:border-gold-400 focus:outline-none'}`}
                    value={headerForm.badge}
                    onChange={(e) => { setHeaderForm({ ...headerForm, badge: e.target.value }); clearInvalid(setInvalid, 'badge'); }}
                    placeholder="الشارة"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-right text-xs font-bold text-gold-300">العنوان الرئيسي <RequiredMark /></label>
                  <input
                    id={fieldId('title')}
                    className={`${isInvalid(invalid, 'title') ? 'input-field-dark-error' : 'w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-lg font-bold text-white placeholder:text-gray-400 focus:border-gold-400 focus:outline-none'}`}
                    value={headerForm.title}
                    onChange={(e) => { setHeaderForm({ ...headerForm, title: e.target.value }); clearInvalid(setInvalid, 'title'); }}
                    placeholder="العنوان الرئيسي"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-right text-xs font-bold text-gold-300">النص الوصفي <RequiredMark /></label>
                  <textarea
                    id={fieldId('description')}
                    rows={2}
                    className={`${isInvalid(invalid, 'description') ? 'input-field-dark-error resize-none' : 'w-full resize-none rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-gray-400 focus:border-gold-400 focus:outline-none'}`}
                    value={headerForm.description}
                    onChange={(e) => { setHeaderForm({ ...headerForm, description: e.target.value }); clearInvalid(setInvalid, 'description'); }}
                    placeholder="النص الوصفي"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-right text-xs font-bold text-gold-300">عنوان الإنجازات <RequiredMark /></label>
                  <input
                    id={fieldId('achievements.title')}
                    className={`${isInvalid(invalid, 'achievements.title') ? 'input-field-dark-error' : 'w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-gray-400 focus:border-gold-400 focus:outline-none'}`}
                    value={headerForm.achievements.title}
                    onChange={(e) => { setHeaderForm((c) => ({ ...c, achievements: { ...c.achievements, title: e.target.value } })); clearInvalid(setInvalid, 'achievements.title'); }}
                    placeholder="عنوان الإنجازات"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-right text-xs font-bold text-gold-300">نص الإنجازات <RequiredMark /></label>
                  <textarea
                    id={fieldId('achievements.text')}
                    rows={2}
                    className={`${isInvalid(invalid, 'achievements.text') ? 'input-field-dark-error resize-none' : 'w-full resize-none rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-gray-400 focus:border-gold-400 focus:outline-none'}`}
                    value={headerForm.achievements.text}
                    onChange={(e) => { setHeaderForm((c) => ({ ...c, achievements: { ...c.achievements, text: e.target.value } })); clearInvalid(setInvalid, 'achievements.text'); }}
                    placeholder="اكتب وصفًا للإنجازات ويمكن استخدام {events} و{students} و{universities}"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-right text-xs font-bold text-gold-300">عدد الفعاليات</label>
                    <input
                      id={fieldId('achievements.eventsCount')}
                      type="number"
                      min="0"
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-gray-400 focus:border-gold-400 focus:outline-none"
                      value={headerForm.achievements.eventsCount}
                      onChange={(e) => { setHeaderForm((c) => ({ ...c, achievements: { ...c.achievements, eventsCount: Math.max(0, Number(e.target.value)) } })); }}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-right text-xs font-bold text-gold-300">عدد الطلاب المستفيدين</label>
                    <input
                      id={fieldId('achievements.studentsCount')}
                      type="number"
                      min="0"
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-gray-400 focus:border-gold-400 focus:outline-none"
                      value={headerForm.achievements.studentsCount}
                      onChange={(e) => { setHeaderForm((c) => ({ ...c, achievements: { ...c.achievements, studentsCount: Math.max(0, Number(e.target.value)) } })); }}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-right text-xs font-bold text-gold-300">عدد الجامعات</label>
                    <input
                      id={fieldId('achievements.universitiesCount')}
                      type="number"
                      min="0"
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-gray-400 focus:border-gold-400 focus:outline-none"
                      value={headerForm.achievements.universitiesCount}
                      onChange={(e) => { setHeaderForm((c) => ({ ...c, achievements: { ...c.achievements, universitiesCount: Math.max(0, Number(e.target.value)) } })); }}
                    />
                  </div>
                </div>
              </CmsEntityTranslationTabs>
              <div className="flex justify-center gap-2">
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-gold-400 px-4 py-2 text-sm font-bold text-navy-950 hover:bg-gold-300">
                  <Save className="h-4 w-4" /> حفظ
                </button>
                <button type="button" onClick={() => { setEditingHeader(false); setHeaderForm(programsContent); }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
                  <X className="h-4 w-4" /> إلغاء
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center justify-center gap-3">
                <span className="text-sm font-bold uppercase tracking-wider text-gold-300">{programsContent.badge}</span>
                {isPresident && (
                  <button
                    onClick={openHeaderEditor}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-gold-300 transition-colors hover:bg-white/20"
                    title="تعديل الترويسة"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <h1 className="mt-3 text-4xl font-extrabold text-white lg:text-5xl">{programsContent.title}</h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-gray-300">{programsContent.description}</p>
            </>
          )}
        </div>
      </section>

      <section className="container-app py-12">
        <SiteEditBanner pageId="programs" />
        {/* Tabs + Add button */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm">
            <button
              onClick={() => setTab('upcoming')}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
                tab === 'upcoming' ? 'bg-navy-800 text-white shadow' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              {t('programs.upcomingTab')}
              <span className={`rounded-full px-2 py-0.5 text-xs ${tab === 'upcoming' ? 'bg-white/20' : 'bg-gray-100'}`}>{upcomingCount}</span>
            </button>
            <button
              onClick={() => setTab('past')}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
                tab === 'past' ? 'bg-navy-800 text-white shadow' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <History className="h-4 w-4" />
              {t('programs.pastTab')}
              <span className={`rounded-full px-2 py-0.5 text-xs ${tab === 'past' ? 'bg-white/20' : 'bg-gray-100'}`}>{pastCount}</span>
            </button>
          </div>

          {canAddEvent && (
            <button onClick={openAdd} className="btn-primary">
              <Plus className="h-4 w-4" /> {t('programs.addNewEvent')}
            </button>
          )}
        </div>

        {/* Category filter */}
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            onClick={() => setCat('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              cat === 'all' ? 'bg-navy-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('common.all')}
          </button>
          {(Object.keys(categoryLabels) as EventCategory[]).map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                cat === c ? 'bg-navy-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {getEventCategoryLabel(c, t)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-20 text-center">
            <CalendarDays className="h-12 w-12 text-gray-300" />
            <p className="mt-4 text-gray-500">{t('programs.noEvents')}</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((e) => (
              <div key={e.id} className="relative">
                <EventCard
                  event={e}
                  activity={activityByEventId.get(e.id) ?? null}
                  activityLoading={activityLoading}
                  activityBusy={activityBusyId === activityByEventId.get(e.id)?.activityId}
                  onJoin={(activity) => {
                    if (activity.decision === 'JOINING') {
                      void saveStudentDecision(activity, 'IGNORED', null);
                    } else {
                      void saveStudentDecision(activity, 'JOINING', null);
                    }
                  }}
                  onDecline={declineActivity}
                />
                {(isPresident || ownedEventIds.has(e.id)) && (
                  <div className="absolute top-3 left-3 z-10 flex gap-1.5">
                    <button
                      onClick={() => openEdit(e)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-navy-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white"
                      title={t('common.edit')}
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    {isPresident && (
                      <button
                        onClick={() => removeEvent(e.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-rose-600 shadow-md backdrop-blur-sm transition-colors hover:bg-white"
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Achievements banner for past tab — CMS-editable numbers, never derived from events */}
        {tab === 'past' && (
          <div className="relative mt-12 rounded-3xl border border-emerald-100 bg-emerald-50 p-8">
            {isPresident && (
              <button
                onClick={openHeaderEditor}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-navy-700 shadow-sm ring-1 ring-emerald-200 transition-colors hover:bg-emerald-50"
                title={t('programs.headerModal.achievementsTitle', 'تعديل الإنجازات')}
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-navy-900">{programsContent.achievements.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {interpolateProgramsAchievementsText(programsContent.achievements.text, programsContent.achievements)}
                </p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCounter
                value={programsContent.achievements.eventsCount}
                label={t('programs.achievementsStatEvents')}
                icon={<CalendarDays className="h-5 w-5" />}
              />
              <StatCounter
                value={programsContent.achievements.studentsCount}
                label={t('programs.achievementsStatStudents')}
                icon={<Users className="h-5 w-5" />}
                suffix="+"
              />
              <StatCounter
                value={programsContent.achievements.universitiesCount}
                label={t('programs.achievementsStatUniversities')}
                icon={<Layers className="h-5 w-5" />}
                suffix="+"
              />
            </div>
          </div>
        )}
      </section>

      {/* Add/Edit Event Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'تعديل فعالية' : 'إضافة فعالية جديدة'} maxWidth="max-w-xl">
        <form onSubmit={saveEvent} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">النوع <RequiredMark /></label>
              <select id={fieldId('status')} className={`${isInvalid(invalid, 'status') ? 'input-field-error' : 'input-field'}`} value={form.status} onChange={(e) => { setForm({ ...form, status: e.target.value as 'upcoming' | 'past' }); clearInvalid(setInvalid, 'status'); }}>
                <option value="">اختر نوع الفعالية...</option>
                <option value="upcoming">قادمة</option>
                <option value="past">سابقة</option>
              </select>
            </div>
            <div>
              <label className="label-field">الفئة <RequiredMark /></label>
              <select id={fieldId('category')} className={`${isInvalid(invalid, 'category') ? 'input-field-error' : 'input-field'}`} value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value as EventCategory }); clearInvalid(setInvalid, 'category'); }}>
                <option value="">اختر الفئة...</option>
                {(Object.keys(categoryLabels) as EventCategory[]).map((c) => (
                  <option key={c} value={c}>{getEventCategoryLabel(c, t)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">نوع النشاط الداخلي <RequiredMark /></label>
              <select id={fieldId('activityType')} value={form.activityType} onChange={(e) => { setForm({ ...form, activityType: e.target.value as ActivityType }); clearInvalid(setInvalid, 'activityType'); }} className={isInvalid(invalid, 'activityType') ? 'input-field-error' : 'input-field'}>
                <option value="MANDATORY">إلزامي</option>
                <option value="OPTIONAL">اختياري</option>
                <option value="PAID">حصري مدفوع بالنقاط</option>
              </select>
            </div>
            <div>
              <label className="label-field">قيمة النقاط <RequiredMark /></label>
              <input id={fieldId('pointsValue')} type="number" min="0" value={form.pointsValue} onChange={(e) => { setForm({ ...form, pointsValue: Number(e.target.value) }); clearInvalid(setInvalid, 'pointsValue'); }} className={isInvalid(invalid, 'pointsValue') ? 'input-field-error' : 'input-field'} />
              <p className="mt-1 text-xs text-gray-400">في النشاط الحصري تمثل هذه القيمة رسوم الانضمام.</p>
            </div>
          </div>
          <div>
            <label className="label-field">تاريخ ووقت إغلاق التسجيل <RequiredMark /></label>
            <input id={fieldId('registrationDeadline')} type="datetime-local" value={form.registrationDeadline} onChange={(e) => { setForm({ ...form, registrationDeadline: e.target.value }); clearInvalid(setInvalid, 'registrationDeadline'); }} className={isInvalid(invalid, 'registrationDeadline') ? 'input-field-error' : 'input-field'} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">التاريخ <RequiredMark /></label>
              <input id={fieldId('date')} type="date" className={`${isInvalid(invalid, 'date') ? 'input-field-error' : 'input-field'}`} value={form.date} onChange={(e) => { setForm({ ...form, date: e.target.value }); clearInvalid(setInvalid, 'date'); }} />
            </div>
            <div>
              <label className="label-field">الوقت <RequiredMark /></label>
              <input id={fieldId('time')} type="time" className={`${isInvalid(invalid, 'time') ? 'input-field-error' : 'input-field'}`} value={form.time} onChange={(e) => { setForm({ ...form, time: e.target.value }); clearInvalid(setInvalid, 'time'); }} />
            </div>
          </div>
          <ManagedFileField
            usage="event-image"
            label="صورة الفعالية"
            currentUrl={form.image}
            required
            error={isInvalid(invalid, 'image') ? 'يرجى رفع صورة الفعالية قبل الحفظ.' : null}
            onUpload={(file, onProgress) => uploadManagedFile('event-image', file, onProgress)}
            onUploaded={(asset) => {
              setForm((current) => ({ ...current, image: asset.publicUrl }));
              clearInvalid(setInvalid, 'image');
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">عدد المقاعد <RequiredMark /></label>
              <input id={fieldId('capacity')} type="number" className={`${isInvalid(invalid, 'capacity') ? 'input-field-error' : 'input-field'}`} value={form.capacity} onChange={(e) => { setForm({ ...form, capacity: Number(e.target.value) }); clearInvalid(setInvalid, 'capacity'); }} />
            </div>
            <div>
              <label className="label-field">عدد المسجلين <RequiredMark /></label>
              <input id={fieldId('registered')} type="number" className={`${isInvalid(invalid, 'registered') ? 'input-field-error' : 'input-field'}`} value={form.registered} onChange={(e) => { setForm({ ...form, registered: Number(e.target.value) }); clearInvalid(setInvalid, 'registered'); }} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={form.showOnHomepage} onChange={(e) => setForm({ ...form, showOnHomepage: e.target.checked })} className="h-4 w-4 accent-navy-700" />
            <span className="text-sm font-semibold text-navy-900">عرض في الصفحة الرئيسية</span>
          </label>

          <CmsEntityTranslationTabs
            onPublished={refreshPublishedLocalizations}
            target="events"
            recordId={editId}
            canonicalPayload={editId ? (canonicalEvents ?? events).map((ev) => (ev.id === editId ? { ...ev, title: form.title, description: form.description, location: form.location } : ev)) : (canonicalEvents ?? events)}
            fields={[
              {
                name: 'title',
                label: 'عنوان الفعالية',
                kind: 'title',
                canonicalValue: form.title,
                placeholder: 'عنوان الفعالية',
              },
              {
                name: 'location',
                label: 'المكان',
                kind: 'text',
                canonicalValue: form.location,
                placeholder: 'مكان الفعالية',
                isLocation: true,
              },
              {
                name: 'description',
                label: 'الوصف',
                kind: 'description',
                canonicalValue: form.description,
                placeholder: 'وصف الفعالية',
              },
            ]}
            canEdit={canAddEvent && (!editId || isPresident || ownedEventIds.has(editId))}
            canPublish={canAddEvent && (!editId || isPresident || ownedEventIds.has(editId))}
            translations={translations}
            onTranslationChange={(loc, name, val) => {
              setTranslations((prev) => ({
                ...prev,
                [loc]: { ...prev[loc], [name]: val },
              }));
            }}
          >
            <div>
              <label className="label-field">عنوان الفعالية <RequiredMark /></label>
              <input id={fieldId('title')} className={`${isInvalid(invalid, 'title') ? 'input-field-error' : 'input-field'}`} value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); clearInvalid(setInvalid, 'title'); }} placeholder="عنوان الفعالية" />
            </div>
            <div>
              <label className="label-field">المكان <RequiredMark /></label>
              <input id={fieldId('location')} className={`${isInvalid(invalid, 'location') ? 'input-field-error' : 'input-field'}`} value={form.location} onChange={(e) => { setForm({ ...form, location: e.target.value }); clearInvalid(setInvalid, 'location'); }} placeholder="مكان الفعالية" />
            </div>
            <div>
              <label className="label-field">الوصف <RequiredMark /></label>
              <textarea id={fieldId('description')} rows={2} className={`${isInvalid(invalid, 'description') ? 'input-field-error' : 'input-field'} resize-none`} value={form.description} onChange={(e) => { setForm({ ...form, description: e.target.value }); clearInvalid(setInvalid, 'description'); }} placeholder="وصف الفعالية" />
            </div>
          </CmsEntityTranslationTabs>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Check className="h-4 w-4" /> {editId ? 'حفظ' : 'إضافة'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(excuseActivity)} onClose={() => { if (!activityBusyId) setExcuseActivity(null); }} title="عذر عدم حضور النشاط الإلزامي" maxWidth="max-w-lg">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!excuseActivity) return;
            const saved = await saveStudentDecision(excuseActivity, 'DECLINING', excuseText);
            if (saved) {
              setExcuseActivity(null);
              setExcuseText('');
            }
          }}
          className="space-y-4"
        >
          <p className="text-sm leading-6 text-gray-600">هذا النشاط إلزامي، لذلك يجب توضيح عذر الغياب قبل حفظ قرارك.</p>
          <div>
            <label className="label-field">عذر الغياب <RequiredMark /></label>
            <textarea value={excuseText} onChange={(event) => setExcuseText(event.target.value)} rows={5} maxLength={4000} className="input-field resize-none" placeholder="اكتب العذر بوضوح..." />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={Boolean(activityBusyId)} onClick={() => setExcuseActivity(null)} className="btn-ghost">إلغاء</button>
            <button type="submit" disabled={Boolean(activityBusyId)} className="btn-primary disabled:opacity-60">{activityBusyId ? 'جارٍ الحفظ...' : 'إرسال العذر'}</button>
          </div>
        </form>
      </Modal>
      <TransientToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
