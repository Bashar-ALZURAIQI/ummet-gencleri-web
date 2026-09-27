import { useEffect, useState } from 'react';
import { CalendarDays, Lightbulb, CheckCircle2, Clock, LogOut, Send, Sparkles, UserCircle, GraduationCap, Mail, Building2, Video, XCircle, PartyPopper, FileText, Pencil, MessageSquareReply, X, ClipboardCheck, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { applicationStatusLabels, applicationStatusColors, SUGGESTION_TARGETS, SUGGESTION_TARGET_LABEL, ROLE_LABEL, type Suggestion, type SuggestionTargetRole, type ApplicationStatus } from '../data/mockData';
import Modal from '../components/Modal';
import ProfileSettings from '../components/ProfileSettings';
import UserAvatar from '../components/UserAvatar';
import RequiredMark from '../components/RequiredMark';
import { validateRequired, clearInvalid, isInvalid, fieldId } from '../utils/formValidation';
import { dismissWelcomeMessage, readWelcomeMessageDismissed } from '../domain/welcomeMessageDismissal';
import PushNotificationControl from '../components/PushNotificationControl';
import StudentActivitiesPanel from '../components/StudentActivitiesPanel';
import StudentTasksPanel from '../components/StudentTasksPanel';
import StudentGamificationPanel from '../components/StudentGamificationPanel';
import { SidebarLayout } from '../components/SidebarLayout';
import { studentPortalTabs, type StudentPortalTabId } from '../domain/phaseThreeEconomy';
import { resolvePublicBrandName } from '../domain/publicBrand';
import { getAcademicYearPresentation } from '../domain/academicYearPresentation';
import { getExecutiveSectionLabel, getExecutiveRoleLabel } from '../domain/executivePresentation';

const STUDENT_TAB_ICONS = {
  activities: CalendarDays,
  tasks: ClipboardCheck,
  achievements: Trophy,
  suggestions: Lightbulb,
  messages: Mail,
  application: FileText,
} satisfies Record<StudentPortalTabId, typeof CalendarDays>;

export default function StudentDashboard() {
  const { t, i18n } = useTranslation();
  const {
    currentStudent,
    currentUser,
    suggestions,
    submitSuggestion,
    logout,
    setView,
    myApplication,
    studentAccess,
    updateOwnProfile,
    uploadOwnAvatar,
    deleteOwnAvatar,
    changeOwnPassword,
    ownProfileOperationResults,
    clearOwnProfileOperationResult,
    contactMessages,
    contactMessagesLoading,
    contactMessagesError,
  } = useApp();
  const [tab, setTab] = useState<StudentPortalTabId>('activities');
  const [form, setForm] = useState({ title: '', body: '', category: '', targetRole: '' });
  const [invalid, setInvalid] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { suggestionsLoading, suggestionsError } = useApp();
  const [refreshPending, setRefreshPending] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [joiningActivityCount, setJoiningActivityCount] = useState(0);

  const localeCode = i18n.language === 'tr' ? 'tr-TR' : i18n.language === 'en' ? 'en-US' : 'ar-EG';

  const roleLabels: Record<string, string> = {
    PRESIDENT: t('roles.unionPresident', 'رئيس الاتحاد'),
    VICE_PRESIDENT: t('roles.vicePresident', 'نائب الرئيس'),
    COMMITTEE_HEAD: t('roles.committeeHead', 'مسؤول لجنة'),
    STUDENT: t('roles.student', 'طالب'),
  };

  if (!currentStudent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 pt-20 text-center">
        <UserCircle className="h-16 w-16 text-gray-300" />
        <h2 className="text-xl font-bold text-navy-900">{t('student.loginRequiredTitle', 'يجب تسجيل الدخول أولًا')}</h2>
        <p className="text-sm text-gray-500">{t('student.loginRequiredText', 'للوصول إلى لوحة تحكم الطالب، سجّل الدخول أو أنشئ حسابًا.')}</p>
        <button onClick={() => setView({ kind: 'login' })} className="btn-primary">{t('auth.login', 'تسجيل الدخول')}</button>
      </div>
    );
  }

  if (studentAccess === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 pt-20 text-center">
        <Clock className="h-9 w-9 animate-pulse text-navy-500" aria-label={t('student.verifyingMembership', 'جارٍ التحقق من حالة العضوية')} />
      </main>
    );
  }

  if (studentAccess === 'removed') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-rose-700 px-6 pt-20 text-center">
        <h1 className="max-w-2xl text-2xl font-extrabold text-white sm:text-4xl">{t('student.removedMessage', 'مع الأسف، أنت لم تعد عضواً في الاتحاد')}</h1>
      </main>
    );
  }

  if (studentAccess === 'pending') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 pt-20 text-center">
        <h1 className="text-2xl font-extrabold text-navy-900 sm:text-3xl">{t('student.pendingReviewNotice', 'أهلاً بك، طلبك تحت المعاينة')}</h1>
      </main>
    );
  }

  if (studentAccess === 'interview') {
    const interview = myApplication?.interview;
    const interviewDate = interview?.date ? new Date(interview.date) : null;
    return (
      <main className="flex min-h-screen items-center justify-center bg-sky-50 px-6 pt-20">
        <section className="w-full max-w-xl rounded-3xl border border-sky-200 bg-white p-8 text-center shadow-lg">
          <Video className="mx-auto h-12 w-12 text-sky-600" />
          <h1 className="mt-4 text-2xl font-extrabold text-navy-900">{t('student.interviewAcceptedTitle', 'تم قبولك في المقابلة')}</h1>
          <div className="mt-6 space-y-3 text-sm text-gray-600">
            <p>{t('student.dateLabel', 'التاريخ')}: <strong>{interviewDate?.toLocaleDateString(localeCode, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) || t('student.toBeDetermined', 'سيتم تحديده قريباً')}</strong></p>
            <p>{t('student.timeLabel', 'الوقت')}: <strong>{interview?.time || t('student.toBeDetermined', 'سيتم تحديده قريباً')}</strong></p>
            {interview?.meetingUrl && (
              <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl bg-sky-600 px-5 py-2.5 font-bold text-white hover:bg-sky-700">
                {t('student.interviewLink', 'رابط المقابلة')}
              </a>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (studentAccess === 'rejected') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-rose-50 px-6 pt-20 text-center">
        <h1 className="max-w-2xl text-2xl font-extrabold text-rose-800">{myApplication?.rejectionReason || t('student.applicationBanner.rejectedFallback', 'نعتذر عن عدم قبول طلبك في هذه الدورة.')}</h1>
      </main>
    );
  }

  const mySuggestions = suggestions.filter((s) => s.studentId === currentStudent.id);
  const isAccepted = studentAccess === 'accepted';
  const studentTabs = studentPortalTabs(!!myApplication).map((item) => ({
    ...item,
    label: t(`student.tabs.${item.id}`, item.label),
    icon: STUDENT_TAB_ICONS[item.id],
  }));

  const submitSuggestionLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired(form, ['title', 'targetRole', 'category', 'body'], setInvalid)) return;
    setSubmitting(true);
    setSubmitError(null);
    const ok = await submitSuggestion({
      targetRole: form.targetRole,
      category: form.category,
      title: form.title,
      content: form.body.trim()
    });
    setSubmitting(false);
    if (!ok) {
      setSubmitError(t('suggestionsV2.suggestionSubmitFailure', 'Failed to submit suggestion.'));
      return;
    }
    setForm({ title: '', body: '', category: '', targetRole: '' });
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <div className="h-screen overflow-hidden bg-gray-50 pt-16 lg:pt-20">
      <SidebarLayout<StudentPortalTabId>
        items={studentTabs}
        activeId={tab}
        onSelect={setTab}
        title={t('student.sidebarTitle', 'أقسام الطالب')}
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-gradient-to-l from-navy-800 to-navy-950">
        <div className="container-app py-10">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <UserAvatar
                name={currentStudent.name}
                photo={currentUser?.photo}
                avatarPath={currentUser?.avatarPath}
                updatedAt={currentUser?.updatedAt}
                className="h-16 w-16"
                fallbackClassName="bg-white/10 text-2xl text-white backdrop-blur-sm"
              />
              <div>
                <h1 className="text-2xl font-extrabold text-white lg:text-3xl">{currentStudent.name || t('student.defaultStudentName', 'طالب')}</h1>
                <p className="mt-1 flex items-center gap-2 text-sm text-gray-300">
                  <GraduationCap className="h-4 w-4" />
                  {currentStudent.university || '—'} - {currentStudent.major || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10"
              >
                <Pencil className="h-4 w-4" />
                {t('student.editProfile', 'تعديل الملف الشخصي')}
              </button>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                {t('auth.logout', 'تسجيل الخروج')}
              </button>
            </div>
          </div>

          {/* Mini stats */}
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { icon: CalendarDays, label: t('student.stats.registeredActivities', 'فعاليات مسجلة'), value: joiningActivityCount },
              { icon: Lightbulb, label: t('student.stats.submittedSuggestions', 'اقتراحات مقدمة'), value: mySuggestions.length },
              { icon: Clock, label: t('student.stats.memberSince', 'عضو منذ'), value: currentStudent.joinedAt || '—' },
              { icon: CheckCircle2, label: t('student.stats.status', 'الحالة'), value: currentStudent.status === 'active' ? t('student.status.active', 'نشط') : t('student.status.inactive', 'غير نشط') },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <Icon className="h-5 w-5 text-gold-300" />
                  <div className="mt-2 text-lg font-extrabold text-white">{s.value}</div>
                  <div className="text-xs text-gray-300">{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="container-app pb-10">
        {/* Application status banner */}
        {myApplication && currentUser && (
          <ApplicationBanner
            status={myApplication.status}
            application={myApplication}
            userId={currentUser.userId}
          />
        )}

        {isAccepted && <PushNotificationControl />}

        {tab === 'activities' ? (
          <div>
            {/* Profile card */}
            <div className="mb-6 grid gap-4 lg:grid-cols-3">
              <div className="card p-5 lg:col-span-1">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-400">
                    <UserCircle className="h-4 w-4" /> {t('student.profileTitle', 'الملف الشخصي')}
                  </h3>
                  <button
                    onClick={() => setEditOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:bg-navy-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('common.edit', 'تعديل')}
                  </button>
                </div>
                <dl className="space-y-3 text-sm">
                  {[
                    { icon: Mail, label: t('student.profileEmail', 'البريد'), value: currentStudent.email, ltr: true },
                    { icon: Building2, label: t('student.profileUniversity', 'الجامعة'), value: currentStudent.university },
                    { icon: GraduationCap, label: t('student.profileMajor', 'التخصص'), value: currentStudent.major },
                    { icon: UserCircle, label: t('student.profileYear', 'السنة'), value: getAcademicYearPresentation(currentStudent.year, t) },
                  ].map((r) => {
                    const Icon = r.icon;
                    return (
                      <div key={r.label} className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-600">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <dt className="text-xs text-gray-400">{r.label}</dt>
                          <dd className="font-semibold text-navy-900" dir={r.ltr ? 'ltr' : undefined}>{r.value}</dd>
                        </div>
                      </div>
                    );
                  })}
                </dl>
              </div>

              <div className="card p-5 lg:col-span-2">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-400">
                  <CalendarDays className="h-4 w-4" /> {t('student.myRegisteredActivities', 'فعالياتي المسجلة')}
                </h3>
                <StudentActivitiesPanel onJoiningCountChange={setJoiningActivityCount} />
              </div>
            </div>
          </div>
        ) : tab === 'tasks' ? (
          <StudentTasksPanel />
        ) : tab === 'achievements' ? (
          <StudentGamificationPanel />
        ) : tab === 'suggestions' ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Submit suggestion */}
            <div className="card p-6 lg:col-span-1">
              <h3 className="flex items-center gap-2 text-lg font-bold text-navy-900">
                <Sparkles className="h-5 w-5 text-gold-500" />
                {t('student.suggestions.title', 'قدّم اقتراحًا')}
              </h3>
              <p className="mt-1 text-sm text-gray-500">{t('student.suggestions.subtitle', 'شاركنا أفكارك لتطوير أنشطة الاتحاد.')}</p>
              {sent && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 animate-fade-in-fast">
                  <CheckCircle2 className="h-4 w-4" />
                  {t('student.suggestions.success', 'تم إرسال اقتراحك بنجاح!')}
                </div>
              )}
              {submitError && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 animate-fade-in-fast">
                  <XCircle className="h-4 w-4" />
                  {submitError}
                </div>
              )}
              <form onSubmit={submitSuggestionLocal} className="mt-4 space-y-3">
                <div>
                  <label className="label-field">{t('student.suggestions.titleLabel', 'العنوان')} <RequiredMark /></label>
                  <input
                    id={fieldId('title')}
                    type="text"
                    value={form.title}
                    onChange={(e) => { setForm({ ...form, title: e.target.value }); clearInvalid(setInvalid, 'title'); }}
                    className={isInvalid(invalid, 'title') ? 'input-field-error' : 'input-field'}
                    placeholder={t('student.suggestions.titlePlaceholder', 'عنوان الاقتراح')}
                  />
                </div>
                <div>
                  <label className="label-field">
                    {t('student.suggestions.targetRoleLabel', 'الجهة الموجه إليها الاقتراح')} <RequiredMark />
                  </label>
                  <select
                    id={fieldId('targetRole')}
                    value={form.targetRole}
                    onChange={(e) => { setForm({ ...form, targetRole: e.target.value }); clearInvalid(setInvalid, 'targetRole'); }}
                    className={isInvalid(invalid, 'targetRole') ? 'input-field-error' : 'input-field'}
                  >
                    <option value="">{t('common.selectFromList', 'اختر من القائمة...')}</option>
                    {SUGGESTION_TARGETS.map((tRole) => (
                      <option key={tRole.role} value={tRole.role}>
                        {getExecutiveSectionLabel(tRole.role, t) || roleLabels[tRole.role] || tRole.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-field">{t('student.suggestions.categoryLabel', 'التصنيف')} <RequiredMark /></label>
                  <select
                    id={fieldId('category')}
                    value={form.category}
                    onChange={(e) => { setForm({ ...form, category: e.target.value }); clearInvalid(setInvalid, 'category'); }}
                    className={isInvalid(invalid, 'category') ? 'input-field-error' : 'input-field'}
                  >
                    <option value="">{t('common.selectFromList', 'اختر من القائمة...')}</option>
                    <option value="اقتراح نشاط">{t('student.suggestions.categories.activity', 'اقتراح نشاط')}</option>
                    <option value="شكوى">{t('student.suggestions.categories.complaint', 'شكوى')}</option>
                    <option value="تطوير مؤسسي">{t('student.suggestions.categories.development', 'تطوير مؤسسي')}</option>
                    <option value="برامج">{t('student.suggestions.categories.programs', 'برامج')}</option>
                    <option value="أخرى">{t('student.suggestions.categories.other', 'أخرى')}</option>
                  </select>
                </div>
                <div>
                  <label className="label-field">{t('student.suggestions.detailsLabel', 'التفاصيل')} <RequiredMark /></label>
                  <textarea
                    id={fieldId('body')}
                    rows={4}
                    value={form.body}
                    onChange={(e) => { setForm({ ...form, body: e.target.value }); clearInvalid(setInvalid, 'body'); }}
                    className={`${isInvalid(invalid, 'body') ? 'input-field-error' : 'input-field'} resize-none`}
                    placeholder={t('student.suggestions.detailsPlaceholder', 'اشرح فكرتك بالتفصيل...')}
                  />
                </div>
                <button type="submit" className="btn-primary w-full" disabled={submitting}>
                  <Send className="h-4 w-4" />
                  {t('common.send', 'إرسال')}
                </button>
              </form>
            </div>

            {/* My suggestions */}
            <div className="lg:col-span-2">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy-900">
                <Lightbulb className="h-5 w-5 text-gold-500" />
                {t('student.suggestions.previousTitle', 'اقتراحاتي السابقة')}
              </h3>
              {mySuggestions.length === 0 ? (
                <div className="card flex flex-col items-center justify-center py-12 text-center">
                  <Lightbulb className="h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-sm text-gray-500">{t('student.suggestions.empty', 'لم تقدم أي اقتراح بعد.')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mySuggestions.map((s) => (
                    <div key={s.id} className="card p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-gold-50 px-2.5 py-0.5 text-xs font-bold text-gold-700">{t('student.suggestions.directedTo', 'موجّه إلى: ')}{getExecutiveSectionLabel(s.targetRole, t) || roleLabels[s.targetRole] || SUGGESTION_TARGET_LABEL[s.targetRole]}</span>
                          <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-bold text-navy-700">{s.category}</span>
                          <h4 className="text-sm font-bold text-navy-900">{s.title}</h4>
                        </div>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.content}</p>
                      <div className="mt-3 text-xs text-gray-400">{s.createdAt}</div>
                      {s.responses.length > 0 && (
                        <div className="mt-4 space-y-3">
                          {s.responses.map((r) => (
                            <div key={r.id} className="rounded-xl border border-navy-100 bg-navy-50 p-4">
                              <div className="mb-2 flex items-center justify-between text-xs font-bold text-navy-700">
                                <span className="flex items-center gap-2">
                                  <MessageSquareReply className="h-4 w-4" />
                                  {t('student.suggestions.replyFrom', 'رد: ')}{r.by} ({getExecutiveRoleLabel(r.byRole, t) || roleLabels[r.byRole] || r.byRole})
                                </span>
                                <span className="text-gray-400">{r.at}</span>
                              </div>
                              <p className="text-sm leading-relaxed text-navy-800">{r.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : tab === 'messages' ? (
          <StudentContactMessages
            messages={contactMessages}
            loading={contactMessagesLoading}
            error={contactMessagesError}
            onNewMessage={() => setView({ kind: 'contact' })}
          />
        ) : tab === 'application' && myApplication ? (
          <ApplicationDetails application={myApplication} isAccepted={isAccepted} />
        ) : null}
          </div>
        </div>
      </SidebarLayout>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={t('student.editProfile', 'تعديل الملف الشخصي')} maxWidth="max-w-4xl">
        {currentUser && (
          <ProfileSettings
            profile={currentUser}
            positionLabel={roleLabels[currentUser.role] || ROLE_LABEL[currentUser.role]}
            onUpdateProfile={updateOwnProfile}
            onUploadAvatar={uploadOwnAvatar}
            onDeleteAvatar={deleteOwnAvatar}
            onChangePassword={changeOwnPassword}
            operationResults={ownProfileOperationResults}
            onClearOperationResult={clearOwnProfileOperationResult}
          />
        )}
      </Modal>
    </div>
  );
}

function StudentContactMessages({ messages, loading, error, onNewMessage }: {
  messages: ReturnType<typeof useApp>['contactMessages'];
  loading: boolean;
  error: string | null;
  onNewMessage: () => void;
}) {
  const { t, i18n } = useTranslation();
  const localeCode = i18n.language === 'tr' ? 'tr-TR' : i18n.language === 'en' ? 'en-US' : 'ar-EG';
  const formatDate = (value: string) => new Intl.DateTimeFormat(localeCode, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  const roleLabels: Record<string, string> = {
    PRESIDENT: t('roles.unionPresident', 'رئيس الاتحاد'),
    VICE_PRESIDENT: t('roles.vicePresident', 'نائب الرئيس'),
    COMMITTEE_HEAD: t('roles.committeeHead', 'مسؤول لجنة'),
    STUDENT: t('roles.student', 'طالب'),
  };

  if (loading) return <div className="card p-10 text-center text-sm text-gray-500">{t('student.messages.loading', 'جاري تحميل رسائلك...')}</div>;
  if (error) return <div className="card border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error}</div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-navy-900">{t('student.messages.title', 'استفساراتي السابقة')}</h3>
          <p className="text-sm text-gray-500">{t('student.messages.subtitle', 'تظهر هنا ردود الرئيس أو نائب الرئيس على رسائلك.')}</p>
        </div>
        <button type="button" onClick={onNewMessage} className="btn-primary"><Send className="h-4 w-4" /> {t('student.messages.newMessage', 'رسالة جديدة')}</button>
      </div>
      {!messages.length ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Mail className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">{t('student.messages.empty', 'لم ترسل أي استفسار بعد.')}</p>
        </div>
      ) : messages.map((message) => (
        <article key={message.id} className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="font-extrabold text-navy-900">{message.subject}</h4>
              <p className="mt-1 text-xs text-gray-400">{formatDate(message.createdAt)}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${message.reply ? 'bg-emerald-100 text-emerald-700' : 'bg-gold-100 text-gold-700'}`}>
              {message.reply ? t('student.messages.replied', 'تم الرد') : t('student.messages.waiting', 'قيد الانتظار')}
            </span>
          </div>
          <p className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-7 text-gray-700">{message.message}</p>
          {message.reply && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-800"><MessageSquareReply className="h-4 w-4" /> {t('student.messages.adminReply', 'رد الإدارة')}</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-gray-800">{message.reply.replyText}</p>
              <p className="mt-3 text-xs text-emerald-800">{message.reply.repliedByName} ({roleLabels[message.reply.repliedByRole] || ROLE_LABEL[message.reply.repliedByRole]}) · {formatDate(message.reply.repliedAt)}</p>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
function ApplicationBanner({
  status,
  application,
  userId,
}: {
  status: ApplicationStatus;
  application: NonNullable<ReturnType<typeof useApp>['myApplication']>;
  userId: string;
}) {
  const { t, i18n } = useTranslation();
  const { siteContent } = useApp();
  const brand = resolvePublicBrandName(i18n.language, siteContent.brand);
  const localeCode = i18n.language === 'tr' ? 'tr-TR' : i18n.language === 'en' ? 'en-US' : 'ar-EG';

  const [acceptedBannerHidden, setAcceptedBannerHidden] = useState(() => (
    status === 'accepted'
      && typeof window !== 'undefined'
      && readWelcomeMessageDismissed(window.localStorage, userId)
  ));

  useEffect(() => {
    setAcceptedBannerHidden(
      status === 'accepted'
        && typeof window !== 'undefined'
        && readWelcomeMessageDismissed(window.localStorage, userId),
    );
  }, [status, userId]);

  if (!application) return null;
  if (status === 'accepted' && acceptedBannerHidden) return null;
  const interviewDate = application.interview ? new Date(application.interview.date) : null;

  const configs: Record<ApplicationStatus, { icon: typeof Clock; bg: string; border: string; title: string; body: React.ReactNode }> = {
    pending: {
      icon: Clock,
      bg: 'bg-gold-50',
      border: 'border-gold-200',
      title: t('student.applicationBanner.pendingTitle', 'طلبك قيد المراجعة من قبل إدارة الاتحاد'),
      body: <span>{t('student.applicationBanner.pendingBody', { date: application.appliedAt, defaultValue: `تم استلام طلب انضمامك بتاريخ ${application.appliedAt}. سيتم مراجعة طلبك والتواصل معك قريبًا.` })}</span>,
    },
    interview: {
      icon: Video,
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      title: t('student.applicationBanner.interviewTitle', 'تمت الموافقة المبدئية! موعد مقابلتك الشخصية'),
      body: (
        <span>
          {t('student.applicationBanner.interviewBody', {
            date: interviewDate?.toLocaleDateString(localeCode, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) || t('student.toBeDetermined', 'سيتم تحديده قريباً'),
            time: application.interview?.time || t('student.toBeDetermined', 'سيتم تحديده قريباً'),
            defaultValue: `موعد مقابلتك يوم ${interviewDate?.toLocaleDateString(localeCode, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} الساعة ${application.interview?.time}.`
          })}
          {' '}{t('student.interviewLink', 'رابط المقابلة')}:{' '}
          <a href={application.interview?.meetingUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-sky-700 underline hover:text-sky-900" dir="ltr">{application.interview?.meetingUrl}</a>
        </span>
      ),
    },
    accepted: {
      icon: PartyPopper,
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      title: t('student.applicationBanner.acceptedTitle', 'مبروك لقد تم قبولك في الاتحاد'),
      body: <span>{t('student.applicationBanner.acceptedBody', { brand, defaultValue: `أصبحت عضوًا كامل الصلاحيات في ${brand}. يمكنك الآن التسجيل في الفعاليات والمشاركة في جميع الأنشطة.` })}</span>,
    },
    rejected: {
      icon: XCircle,
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      title: t('student.applicationBanner.rejectedTitle', 'شكرًا واعتذار'),
      body: <span>{application.rejectionReason || t('student.applicationBanner.rejectedFallback', 'نعتذر عن عدم قبول طلبك في هذه الدورة. نرحب بك لتقديم طلب جديد في الدورة القادمة.')}</span>,
    },
  };
  const cfg = configs[status];
  const Icon = cfg.icon;

  return (
    <div className={`mb-6 flex items-start gap-4 rounded-2xl border ${cfg.border} ${cfg.bg} p-5 animate-fade-in`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${status === 'accepted' ? 'bg-emerald-500' : status === 'rejected' ? 'bg-rose-500' : status === 'interview' ? 'bg-sky-500' : 'bg-gold-500'} text-white`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-extrabold text-navy-900">{cfg.title}</div>
        <div className="mt-1 text-sm leading-relaxed text-gray-600">{cfg.body}</div>
      </div>
      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${applicationStatusColors[status]}`}>
        {status === 'pending'
          ? t('student.applicationDetails.underReviewStage', 'قيد المراجعة')
          : status === 'interview'
            ? t('student.applicationDetails.interviewStage', 'المقابلة')
            : status === 'accepted'
              ? t('student.applicationStatus.accepted', 'مقبول')
              : status === 'rejected'
                ? t('student.applicationStatus.rejected', 'مرفوض')
                : applicationStatusLabels[status]}
      </span>
      {status === 'accepted' && (
        <button
          type="button"
          onClick={() => {
            setAcceptedBannerHidden(true);
            if (typeof window !== 'undefined') {
              dismissWelcomeMessage(window.localStorage, userId);
            }
          }}
          className="shrink-0 rounded-lg p-1.5 text-emerald-700 transition-colors hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label={t('student.applicationBanner.closeWelcome', 'إغلاق رسالة الترحيب')}
          title={t('common.close', 'إغلاق')}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ApplicationDetails({ application, isAccepted }: { application: NonNullable<ReturnType<typeof useApp>['myApplication']>; isAccepted: boolean }) {
  const { t, i18n } = useTranslation();
  const { siteContent } = useApp();
  const brand = resolvePublicBrandName(i18n.language, siteContent.brand);
  const localeCode = i18n.language === 'tr' ? 'tr-TR' : i18n.language === 'en' ? 'en-US' : 'ar-EG';

  const steps: { key: ApplicationStatus; label: string; icon: typeof Clock }[] = [
    { key: 'pending', label: t('student.applicationDetails.underReviewStage', 'قيد المراجعة'), icon: Clock },
    { key: 'interview', label: t('student.applicationDetails.interviewStage', 'المقابلة'), icon: Video },
    { key: 'accepted', label: t('student.applicationDetails.finalAcceptance', 'القبول النهائي'), icon: CheckCircle2 },
  ];
  const currentIdx = application.status === 'rejected' ? 0 : steps.findIndex((s) => s.key === application.status);

  return (
    <div className="space-y-6">
      {/* Progress tracker */}
      {application.status !== 'rejected' && (
        <div className="card p-6">
          <h3 className="mb-6 text-lg font-bold text-navy-900">{t('student.applicationDetails.stagesTitle', 'مراحل طلب الانضمام')}</h3>
          <div className="flex items-center justify-between">
            {steps.map((step, i) => {
              const Icon = step.icon;
              const done = i < currentIdx;
              const current = i === currentIdx;
              return (
                <div key={step.key} className="flex flex-1 flex-col items-center gap-2">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all ${done ? 'bg-emerald-500 text-white' : current ? 'bg-navy-800 text-white shadow-lg ring-4 ring-navy-100' : 'bg-gray-100 text-gray-400'}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className={`text-xs font-bold ${done || current ? 'text-navy-900' : 'text-gray-400'}`}>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Application info */}
      <div className="card p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy-900">
          <FileText className="h-5 w-5 text-navy-600" />
          {t('student.applicationDetails.detailsTitle', 'تفاصيل الطلب')}
        </h3>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            { label: t('student.applicationDetails.name', 'الاسم'), value: application.name },
            { label: t('student.applicationDetails.email', 'البريد الإلكتروني'), value: application.email, ltr: true },
            { label: t('student.applicationDetails.university', 'الجامعة'), value: application.university },
            { label: t('student.applicationDetails.major', 'التخصص'), value: application.major },
            { label: t('student.applicationDetails.academicYear', 'السنة الدراسية'), value: getAcademicYearPresentation(application.year, t) },
            { label: t('student.applicationDetails.appliedAt', 'تاريخ التقديم'), value: application.appliedAt },
            {
              label: t('student.stats.status', 'الحالة'),
              value: application.status === 'pending'
                ? t('student.applicationDetails.underReviewStage', 'قيد المراجعة')
                : application.status === 'interview'
                  ? t('student.applicationDetails.interviewStage', 'المقابلة')
                  : application.status === 'accepted'
                    ? t('student.applicationStatus.accepted', 'مقبول')
                    : application.status === 'rejected'
                      ? t('student.applicationStatus.rejected', 'مرفوض')
                      : applicationStatusLabels[application.status],
            },
            ...(application.decidedAt ? [{ label: t('student.applicationDetails.decisionDate', 'تاريخ القرار'), value: application.decidedAt }] : []),
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-600">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <dt className="text-xs text-gray-400">{r.label}</dt>
                <dd className="text-sm font-semibold text-navy-900" dir={(r as { ltr?: boolean }).ltr ? 'ltr' : undefined}>{r.value}</dd>
              </div>
            </div>
          ))}
        </dl>
        {application.motivation && (
          <div className="mt-4">
            <div className="mb-1 text-xs text-gray-400">{t('student.applicationDetails.motivation', 'دوافع الانضمام')}</div>
            <p className="rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">{application.motivation}</p>
          </div>
        )}
      </div>

      {/* Interview info */}
      {application.interview && (
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy-900">
            <Video className="h-5 w-5 text-sky-600" />
            {t('student.applicationDetails.interviewTitle', 'تفاصيل المقابلة')}
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-center">
              <CalendarDays className="mx-auto h-6 w-6 text-sky-600" />
              <div className="mt-2 text-xs text-gray-500">{t('student.dateLabel', 'التاريخ')}</div>
              <div className="text-sm font-bold text-navy-900">{new Date(application.interview.date).toLocaleDateString(localeCode, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-center">
              <Clock className="mx-auto h-6 w-6 text-sky-600" />
              <div className="mt-2 text-xs text-gray-500">{t('student.timeLabel', 'الوقت')}</div>
              <div className="text-sm font-bold text-navy-900">{application.interview.time}</div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-center">
              <Video className="mx-auto h-6 w-6 text-sky-600" />
              <div className="mt-2 text-xs text-gray-500">{t('student.interviewLink', 'رابط المقابلة')}</div>
              <a href={application.interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block max-w-full truncate text-sm font-bold text-sky-700 underline hover:text-sky-900" dir="ltr">{application.interview.meetingUrl}</a>
            </div>
          </div>
          <a href={application.interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 w-full sm:w-auto">
            <Video className="h-4 w-4" />
            {t('student.applicationDetails.joinInterview', 'الانضمام إلى المقابلة')}
          </a>
        </div>
      )}

      {/* Rejection info */}
      {application.status === 'rejected' && (
        <div className="card border-rose-100 bg-rose-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-900">{t('student.applicationDetails.rejectionTitle', 'رسالة شكر واعتذار')}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {application.rejectionReason || t('student.applicationBanner.rejectedFallback', 'نعتذر عن عدم قبول طلبك في هذه الدورة. نرحب بك لتقديم طلب جديد في الدورة القادمة.')}
              </p>
              <p className="mt-3 text-sm font-semibold text-navy-700">{t('student.applicationDetails.rejectionClosing', 'نتمنى لك التوفيق في مسيرتك، ونرحب بك دائمًا في فعالياتنا العامة.')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Accepted: full access notice */}
      {isAccepted && (
        <div className="card border-emerald-100 bg-emerald-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <PartyPopper className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-900">{t('student.applicationDetails.fullAccessTitle', 'صلاحيات العضو الكاملة مفعّلة')}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {t('student.applicationDetails.fullAccessNotice', { brand, defaultValue: `يمكنك الآن التسجيل في جميع الفعاليات، تقديم الاقتراحات، والمشاركة في أنشطة الاتحاد الكاملة. أهلًا بك في عائلة ${brand}!` })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Suggestion['status'] }) {
  const { t } = useTranslation();
  const map: Record<Suggestion['status'], { label: string; cls: string }> = {
    new: { label: t('student.suggestions.statusNew', 'جديد'), cls: 'bg-sky-100 text-sky-700' },
    reviewing: { label: t('student.suggestions.statusReviewing', 'قيد المراجعة'), cls: 'bg-gold-100 text-gold-700' },
    implemented: { label: t('student.suggestions.statusImplemented', 'تم الإجراء'), cls: 'bg-emerald-100 text-emerald-700' },
    closed: { label: t('student.suggestions.statusClosed', 'مغلق'), cls: 'bg-slate-200 text-slate-700' },
  };
  const m = map[status] ?? map.new;
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${m.cls}`}>{m.label}</span>;
}
