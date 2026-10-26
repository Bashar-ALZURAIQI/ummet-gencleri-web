import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, UserPlus, Mail, Lock, User, GraduationCap, CheckCircle2, AlertCircle, Users, Phone, KeyRound, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import RequiredMark from '../components/RequiredMark';
import PasswordField from '../components/PasswordField';
import TransientToast, { type ToastMessage } from '../components/TransientToast';
import { validateRecoveredPassword } from '../domain/passwordRecovery';
import { validateRequired, clearInvalid, isInvalid, fieldId } from '../utils/formValidation';
import { resolvePublicBrandName } from '../domain/publicBrand';

function passwordStrength(p: string, t: (k: string) => string): { ok: boolean; hint: string } {
  if (p.length < 6) return { ok: false, hint: t('auth.strength.min6') };
  if (!/[A-Z]/.test(p)) return { ok: false, hint: t('auth.strength.uppercase') };
  if (!/[a-z]/.test(p)) return { ok: false, hint: t('auth.strength.lowercase') };
  if (!/[0-9]/.test(p)) return { ok: false, hint: t('auth.strength.numberOrSymbol') };
  return { ok: true, hint: '' };
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login, setView, authError, clearAuthError } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired({ email, password }, ['email', 'password'], setInvalid, t('auth.errors.fillEmailPassword'))) return;
    setLoading(true);
    setError('');
    clearAuthError();
    const res = await login(email.trim(), password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? t('auth.errors.invalidCredentials'));
    }
  };

  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={submit} className="space-y-4">
        {(error || authError) && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error || authError}
          </div>
        )}
        <div>
          <label className="label-field">{t('auth.email')} <RequiredMark /></label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id={fieldId('email')}
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearInvalid(setInvalid, 'email'); setError(''); clearAuthError(); }}
              className={`${isInvalid(invalid, 'email') ? 'input-field-error' : 'input-field'} pr-10`}
              placeholder="student@ummet.org"
              dir="ltr"
            />
          </div>
        </div>
        <div>
          <label className="label-field">{t('auth.password')} <RequiredMark /></label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <PasswordField
              id={fieldId('password')}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearInvalid(setInvalid, 'password'); setError(''); clearAuthError(); }}
              className={`${isInvalid(invalid, 'password') ? 'input-field-error' : 'input-field'} pr-10`}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
        </div>
        <div className="-mt-2 text-left">
          <button
            type="button"
            onClick={() => setView({ kind: 'forgot-password' })}
            className="text-sm font-bold text-navy-700 transition-colors hover:text-navy-900"
          >
            {t('auth.forgotPassword', 'هل نسيت كلمة المرور؟')}
          </button>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
          <LogIn className="h-4 w-4" />
          {loading ? t('auth.loggingIn') : t('auth.loginAction')}
        </button>
        <p className="text-center text-sm text-gray-500">
          {t('auth.noAccount')}{' '}
          <button type="button" onClick={() => setView({ kind: 'register' })} className="font-bold text-navy-700 hover:text-navy-900">
            {t('auth.createAccountLink')}
          </button>
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { requestPasswordReset, setView } = useApp();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setToast({ id: Date.now(), type: 'error', text: t('auth.errors.invalidEmail') });
      return;
    }
    setLoading(true);
    const result = await requestPasswordReset(normalizedEmail);
    setLoading(false);
    setToast(result.ok
      ? { id: Date.now(), type: 'success', text: t('auth.errors.resetLinkSent', 'تم إرسال رابط الاستعادة إلى بريدك الإلكتروني') }
      : { id: Date.now(), type: 'error', text: result.error ?? t('auth.errors.resetLinkFailed') });
  };

  return (
    <AuthShell title={t('auth.forgotPasswordTitle')} subtitle={t('auth.forgotPasswordSubtitle')}>
      <TransientToast message={toast} onClose={() => setToast(null)} />
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="label-field" htmlFor={fieldId('recoveryEmail')}>{t('auth.email')} <RequiredMark /></label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id={fieldId('recoveryEmail')}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input-field pr-10"
              placeholder="student@ummet.org"
              autoComplete="email"
              dir="ltr"
              required
            />
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
          <Send className="h-4 w-4" />
          {loading ? t('auth.sendingResetLink') : t('auth.sendResetLink')}
        </button>
        <button
          type="button"
          onClick={() => setView({ kind: 'login' })}
          className="w-full text-center text-sm font-bold text-navy-700 hover:text-navy-900"
        >
          {t('auth.backToLogin')}
        </button>
      </form>
    </AuthShell>
  );
}

export function UpdatePasswordPage() {
  const { t } = useTranslation();
  const {
    authInitializing,
    passwordRecoveryReady,
    updateRecoveredPassword,
    finishPasswordRecovery,
    setView,
  } = useApp();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [verificationTimedOut, setVerificationTimedOut] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const navigationTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!authInitializing) {
      setVerificationTimedOut(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setVerificationTimedOut(true), 15000);
    return () => window.clearTimeout(timeoutId);
  }, [authInitializing]);

  useEffect(() => () => {
    if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateRecoveredPassword(password, confirmation);
    if (!validation.ok) {
      const errorMsg = validation.error === 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف.'
        ? t('auth.errors.passwordMin8')
        : validation.error === 'تأكيد كلمة المرور الجديدة غير مطابق.'
        ? t('auth.errors.passwordMismatch')
        : validation.error;
      setToast({ id: Date.now(), type: 'error', text: errorMsg });
      return;
    }
    setLoading(true);
    const result = await updateRecoveredPassword(password);
    setLoading(false);
    if (!result.ok) {
      setToast({ id: Date.now(), type: 'error', text: result.error ?? t('auth.errors.updatePasswordFailed') });
      return;
    }
    setCompleted(true);
    setToast({ id: Date.now(), type: 'success', text: t('auth.errors.updatePasswordSuccess', 'تم تغيير كلمة المرور بنجاح') });
    navigationTimer.current = window.setTimeout(() => {
      void finishPasswordRecovery();
    }, 1400);
  };

  if (authInitializing) {
    if (verificationTimedOut) {
      return (
        <AuthShell title={t('auth.invalidLinkTitle')} subtitle={t('auth.invalidLinkSubtitle')}>
          <div className="space-y-5">
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {t('auth.invalidLinkAlert')}
            </div>
            <button type="button" onClick={() => setView({ kind: 'forgot-password' })} className="btn-primary w-full">
              {t('auth.requestNewResetLink')}
            </button>
          </div>
        </AuthShell>
      );
    }
    return (
      <AuthShell title={t('auth.verifyingRecoveryTitle')} subtitle={t('auth.verifyingRecoverySubtitle')}>
        <div className="py-8 text-center text-sm font-semibold text-gray-500">{t('auth.verifyingRecoveryMessage')}</div>
      </AuthShell>
    );
  }

  if (!passwordRecoveryReady && !completed) {
    return (
      <AuthShell title={t('auth.invalidLinkTitle')} subtitle={t('auth.invalidLinkSubtitle')}>
        <div className="space-y-5">
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {t('auth.invalidLinkAlert')}
          </div>
          <button type="button" onClick={() => setView({ kind: 'forgot-password' })} className="btn-primary w-full">
            {t('auth.requestNewResetLink')}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.updatePasswordTitle')} subtitle={t('auth.updatePasswordSubtitle')}>
      <TransientToast message={toast} onClose={() => setToast(null)} />
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold text-gray-700">{t('auth.newPassword')}
          <PasswordField
            name="newPassword"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            className="input-field mt-1"
            leadingIcon={<KeyRound className="absolute right-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />}
            required
          />
        </label>
        <label className="block text-sm font-semibold text-gray-700">{t('auth.confirmPassword')}
          <PasswordField
            name="passwordConfirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            className="input-field mt-1"
            leadingIcon={<KeyRound className="absolute right-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />}
            required
          />
        </label>
        <button type="submit" disabled={loading || completed} className="btn-primary w-full disabled:opacity-60">
          <KeyRound className="h-4 w-4" />
          {completed ? t('auth.passwordUpdated') : loading ? t('auth.savingNewPassword') : t('auth.saveNewPassword')}
        </button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const { registerWithApplication, setView, siteContent } = useApp();
  const [form, setForm] = useState({ name: '', email: '', password: '', university: '', major: '', year: '', phone: '', motivation: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailWarning, setEmailWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const strength = passwordStrength(form.password, t);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired(form, ['name', 'email', 'password', 'university', 'major', 'year', 'phone', 'motivation'], setInvalid, t('auth.errors.fillRequired'))) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError(t('auth.errors.invalidEmail'));
      return;
    }
    if (!/^05\d{9}$/.test(form.phone)) {
      setError(t('auth.errors.phoneFormat'));
      return;
    }
    if (!strength.ok) {
      setError(`${t('auth.strength.weakPrefix')}${strength.hint}`);
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    setEmailWarning('');
    const res = await registerWithApplication(
      form.name.trim(),
      form.email.trim(),
      form.password,
      form.university.trim(),
      form.major.trim(),
      form.year,
      form.phone.trim(),
      form.motivation.trim()
    );
    setLoading(false);
    setEmailWarning(res.emailWarning ?? '');
    if (!res.ok) {
      setError(res.error ?? t('auth.errors.registrationFailed'));
    } else if (res.requiresEmailConfirmation) {
      setForm({ name: '', email: '', password: '', university: '', major: '', year: '', phone: '', motivation: '' });
      setSuccess(t('auth.registrationSuccess'));
    }
  };

  const brandName = resolvePublicBrandName(i18n.language, siteContent.brand);

  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={t('home.joinFamily', { brand: brandName })} wide>
      <div className="mb-4 rounded-xl border border-gold-200 bg-gold-50 p-3 text-xs text-gold-800">
        <span className="font-bold">{t('auth.registrationNoticeLabel')} </span>{t('auth.registrationNoticeText')}
      </div>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}
        {emailWarning && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {emailWarning}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field">{t('auth.fullName')} <RequiredMark /></label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id={fieldId('name')}
                type="text"
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: e.target.value }); clearInvalid(setInvalid, 'name'); setError(''); }}
                className={`${isInvalid(invalid, 'name') ? 'input-field-error' : 'input-field'} pr-10`}
                placeholder={t('auth.namePlaceholder')}
              />
            </div>
          </div>
          <div>
            <label className="label-field">{t('auth.email')} <RequiredMark /></label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id={fieldId('email')}
                type="email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); clearInvalid(setInvalid, 'email'); setError(''); }}
                className={`${isInvalid(invalid, 'email') ? 'input-field-error' : 'input-field'} pr-10`}
                placeholder="example@email.com"
                dir="ltr"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="label-field">{t('auth.password')} <RequiredMark /></label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <PasswordField
              id={fieldId('password')}
              value={form.password}
              onChange={(e) => { setForm({ ...form, password: e.target.value }); clearInvalid(setInvalid, 'password'); setError(''); }}
              className={`${isInvalid(invalid, 'password') ? 'input-field-error' : 'input-field'} pr-10`}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          <p className={`mt-1.5 text-xs ${form.password && !strength.ok ? 'text-rose-600' : 'text-gray-400'}`}>
            {t('auth.passwordHint')}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field">{t('auth.university')} <RequiredMark /></label>
            <div className="relative">
              <GraduationCap className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id={fieldId('university')}
                type="text"
                value={form.university}
                onChange={(e) => { setForm({ ...form, university: e.target.value }); clearInvalid(setInvalid, 'university'); setError(''); }}
                className={`${isInvalid(invalid, 'university') ? 'input-field-error' : 'input-field'} pr-10`}
                placeholder={t('auth.universityPlaceholder')}
              />
            </div>
          </div>
          <div>
            <label className="label-field">{t('auth.major')} <RequiredMark /></label>
            <input
              id={fieldId('major')}
              type="text"
              value={form.major}
              onChange={(e) => { setForm({ ...form, major: e.target.value }); clearInvalid(setInvalid, 'major'); setError(''); }}
              className={isInvalid(invalid, 'major') ? 'input-field-error' : 'input-field'}
              placeholder={t('auth.majorPlaceholder')}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field">{t('auth.year')} <RequiredMark /></label>
            <select
              id={fieldId('year')}
              value={form.year}
              onChange={(e) => { setForm({ ...form, year: e.target.value }); clearInvalid(setInvalid, 'year'); setError(''); }}
              className={isInvalid(invalid, 'year') ? 'input-field-error' : 'input-field'}
            >
              <option value="">{t('auth.selectYearPlaceholder')}</option>
              <option value="السنة الأولى">{t('auth.years.first')}</option>
              <option value="السنة الثانية">{t('auth.years.second')}</option>
              <option value="السنة الثالثة">{t('auth.years.third')}</option>
              <option value="السنة الرابعة">{t('auth.years.fourth')}</option>
              <option value="دراسات عليا">{t('auth.years.postgraduate')}</option>
            </select>
          </div>
          <div>
            <label className="label-field">{t('auth.phone')} <RequiredMark /></label>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id={fieldId('phone')}
                type="tel"
                maxLength={11}
                value={form.phone}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 11); setForm({ ...form, phone: v }); clearInvalid(setInvalid, 'phone'); setError(''); }}
                className={`${isInvalid(invalid, 'phone') ? 'input-field-error' : 'input-field'} pr-10`}
                placeholder="0537 592 24 78"
                dir="ltr"
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-400">{t('auth.phoneHelper')}</p>
          </div>
        </div>
        <div>
          <label className="label-field">{t('auth.motivation')} <RequiredMark /></label>
          <textarea
            id={fieldId('motivation')}
            rows={3}
            value={form.motivation}
            onChange={(e) => { setForm({ ...form, motivation: e.target.value }); clearInvalid(setInvalid, 'motivation'); setError(''); }}
            className={`${isInvalid(invalid, 'motivation') ? 'input-field-error' : 'input-field'} resize-none`}
            placeholder={t('auth.motivationPlaceholder')}
          />
        </div>
        <button type="submit" disabled={loading} className="btn-gold w-full disabled:opacity-60">
          <UserPlus className="h-4 w-4" />
          {loading ? t('auth.creatingAccount') : t('auth.submitApplication')}
        </button>
        <p className="text-center text-sm text-gray-500">
          {t('auth.haveAccount')}{' '}
          <button type="button" onClick={() => setView({ kind: 'login' })} className="font-bold text-navy-700 hover:text-navy-900">
            {t('auth.loginLink')}
          </button>
        </p>
      </form>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle: string; children: React.ReactNode; wide?: boolean }) {
  const { i18n } = useTranslation();
  const { siteContent } = useApp();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-50 via-gray-50 to-navy-100 pt-16 lg:pt-20">
      <div className={`w-full animate-slide-up px-4 py-10 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="card overflow-hidden shadow-xl">
          {/* Header */}
          <div className="bg-gradient-to-l from-navy-800 to-navy-950 px-6 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white backdrop-blur-sm">
              <Users className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-white">{title}</h1>
            <p className="mt-1 text-sm text-gray-300">{subtitle}</p>
          </div>
          <div className="p-6 lg:p-8">{children}</div>
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {resolvePublicBrandName(i18n.language, siteContent.brand)}
        </div>
      </div>
    </div>
  );
}
