import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Camera, CheckCircle2, KeyRound, Save, Trash2, User } from 'lucide-react';
import type {
  OwnProfileOperationKind,
  OwnProfileOperationResult,
  OwnProfileOperationResults,
} from '../domain/ownProfileOperations';
import {
  buildProfileUpdatePayload,
  type EditableProfilePayload,
  validateContactEmail,
  validatePasswordChange,
  validateProfileAvatar,
} from '../domain/profileSettingsPolicy';
import { normalizeProfile } from '../utils/profileNormalize';
import { getAcademicYearPresentation, ACADEMIC_YEAR_KEY_MAP } from '../domain/academicYearPresentation';
import { useSessionDraft } from '../hooks/useSessionDraft';
import { buildSessionDraftKey } from '../domain/sessionDraftState';
import PasswordField from './PasswordField';
import UserAvatar from './UserAvatar';

export interface ProfileSettingsProfile {
  id?: string;
  userId?: string;
  name?: unknown;
  email?: unknown;
  loginEmail?: unknown;
  contactEmail?: unknown;
  phone?: unknown;
  university?: unknown;
  major?: unknown;
  year?: unknown;
  bio?: unknown;
  photo?: unknown;
  avatarPath?: unknown;
  updatedAt?: unknown;
  role?: unknown;
}

interface ProfileSettingsProps {
  profile: ProfileSettingsProfile;
  positionLabel: string;
  onUpdateProfile: (updates: EditableProfilePayload) => Promise<OwnProfileOperationResult>;
  onUploadAvatar: (file: File) => Promise<OwnProfileOperationResult>;
  onDeleteAvatar: () => Promise<OwnProfileOperationResult>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<OwnProfileOperationResult>;
  operationResults: OwnProfileOperationResults;
  onClearOperationResult: (kind: OwnProfileOperationKind) => void;
}

interface FormState {
  name: string;
  contactEmail: string;
  phone: string;
  university: string;
  major: string;
  year: string;
  bio: string;
}

type ResultState = OwnProfileOperationResult | null;

function resultBanner(result: ResultState) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{result.error}</span>
      </div>
    );
  }
  return (
    <div role="status" className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
      <div className="flex items-start gap-2 font-semibold">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{result.message}</span>
      </div>
      {result.warning && <p className="pr-6 text-amber-700">{result.warning}</p>}
    </div>
  );
}

export default function ProfileSettings({
  profile,
  positionLabel,
  onUpdateProfile,
  onUploadAvatar,
  onDeleteAvatar,
  onChangePassword,
  operationResults,
  onClearOperationResult,
}: ProfileSettingsProps) {
  const { t } = useTranslation();
  const normalized = useMemo(() => normalizeProfile(profile), [profile]);
  const buildForm = (): FormState => ({
    name: normalized.name,
    contactEmail: normalized.contactEmail,
    phone: normalized.phone,
    university: normalized.university,
    major: normalized.department,
    year: normalized.academicYear,
    bio: normalized.bio,
  });

  const userId = profile.userId ?? profile.id ?? null;
  const draftKey = userId ? buildSessionDraftKey(userId, 'settings:profile', 'edit', 'form') : null;
  
  const profileDraft = useSessionDraft({
    key: draftKey,
    userId: userId,
    defaultData: buildForm(),
    defaultOpen: true,
    validation: { readiness: 'VALID' },
    isDirty: (d) => JSON.stringify(d) !== JSON.stringify(buildForm())
  });

  const form = profileDraft.data;
  const setForm = profileDraft.setData;
  const [passwords, setPasswords] = useState({ current: '', next: '', confirmation: '' });
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [profileResult, setProfileResult] = useState<ResultState>(null);
  const [avatarResult, setAvatarResult] = useState<ResultState>(null);
  const [passwordResult, setPasswordResult] = useState<ResultState>(null);

  useEffect(() => {
    if (!profileDraft.dirty) {
      setForm(buildForm());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const replacePreview = (next: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = next;
    setPreviewUrl(next);
  };

  const selectAvatar = (file: File | null) => {
    onClearOperationResult('avatar');
    setAvatarResult(null);
    if (!file) {
      setSelectedAvatar(null);
      replacePreview(null);
      return;
    }
    const validation = validateProfileAvatar(file);
    if (!validation.ok) {
      setSelectedAvatar(null);
      replacePreview(null);
      setAvatarResult({ ok: false, error: validation.error });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setSelectedAvatar(file);
    replacePreview(URL.createObjectURL(file));
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (profileBusy) return;
    const payload = buildProfileUpdatePayload(form);
    if (!payload.name) {
      setProfileResult({ ok: false, error: t('profile.nameRequired', 'يرجى إدخال الاسم الكامل.') });
      return;
    }
    const emailValidation = validateContactEmail(payload.contactEmail);
    if (!emailValidation.ok) {
      setProfileResult(emailValidation);
      return;
    }
    setProfileBusy(true);
    onClearOperationResult('profile');
    setProfileResult(null);
    const result = await onUpdateProfile(payload);
    if (!mountedRef.current) return;
    setProfileResult(result);
    setProfileBusy(false);
    if (result.ok) {
      profileDraft.clearDraft();
    }
  };

  const uploadAvatar = async () => {
    if (!selectedAvatar || avatarBusy) return;
    setAvatarBusy(true);
    onClearOperationResult('avatar');
    setAvatarResult(null);
    const result = await onUploadAvatar(selectedAvatar);
    if (!mountedRef.current) return;
    setAvatarResult(result);
    setAvatarBusy(false);
    if (result.ok) {
      setSelectedAvatar(null);
      replacePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteAvatar = async () => {
    if (avatarBusy || !window.confirm(t('profile.confirmDeleteAvatar', 'هل تريد حذف الصورة الشخصية الحالية؟'))) return;
    setAvatarBusy(true);
    onClearOperationResult('avatar');
    setAvatarResult(null);
    const result = await onDeleteAvatar();
    if (!mountedRef.current) return;
    setAvatarResult(result);
    setAvatarBusy(false);
    if (result.ok) {
      setSelectedAvatar(null);
      replacePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordBusy) return;
    const validation = validatePasswordChange(passwords.current, passwords.next, passwords.confirmation);
    if (!validation.ok) {
      setPasswordResult(validation);
      return;
    }
    setPasswordBusy(true);
    onClearOperationResult('password');
    setPasswordResult(null);
    const result = await onChangePassword(passwords.current, passwords.next);
    if (!mountedRef.current) return;
    setPasswordResult(result);
    setPasswordBusy(false);
    if (result.ok) setPasswords({ current: '', next: '', confirmation: '' });
  };

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    onClearOperationResult('profile');
    setProfileResult(null);
  };

  const updatePasswordField = (field: keyof typeof passwords, value: string) => {
    setPasswords((current) => ({ ...current, [field]: value }));
    onClearOperationResult('password');
    setPasswordResult(null);
  };

  return (
    <div className="space-y-6">
      <section className="card p-6" aria-labelledby="profile-avatar-heading">
        <h3 id="profile-avatar-heading" className="mb-5 flex items-center gap-2 text-lg font-bold text-navy-900">
          <Camera className="h-5 w-5 text-navy-600" /> {t('profile.avatarHeading', 'الصورة الشخصية')}
        </h3>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserAvatar
            name={normalized.name}
            photo={previewUrl || normalized.photo}
            avatarPath={normalized.avatarPath}
            updatedAt={normalized.updatedAt}
            className="h-24 w-24"
            fallbackClassName="bg-navy-800 text-2xl text-white"
          />
          <div className="min-w-0 flex-1 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => selectAvatar(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:ml-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-4 file:py-2 file:font-bold file:text-navy-700"
              disabled={avatarBusy}
            />
            <p className="text-xs text-gray-500">{t('profile.avatarHelp', 'JPEG أو PNG أو WebP، وبحد أقصى 10 ميجابايت. اختيار الصورة لا يرفعها تلقائياً.')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={uploadAvatar} disabled={!selectedAvatar || avatarBusy} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                <Camera className="h-4 w-4" /> {avatarBusy ? t('profile.uploadingAvatar', 'جارٍ التنفيذ...') : t('profile.uploadAvatar', 'رفع / استبدال الصورة')}
              </button>
              <button type="button" onClick={deleteAvatar} disabled={avatarBusy} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> {t('profile.deleteAvatar', 'حذف الصورة')}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4">{resultBanner(operationResults.avatar ?? avatarResult)}</div>
      </section>

      <section className="card p-6" aria-labelledby="profile-personal-heading">
        <h3 id="profile-personal-heading" className="mb-5 flex items-center gap-2 text-lg font-bold text-navy-900">
          <User className="h-5 w-5 text-navy-600" /> {t('profile.personalHeading', 'البيانات الشخصية')}
        </h3>
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-gray-700">{t('profile.loginEmail', 'بريد الدخول')}
              <input name="loginEmail" type="email" dir="ltr" value={normalized.loginEmail} readOnly className="input-field mt-1 bg-gray-100 text-gray-500" />
            </label>
            <label className="block text-sm font-semibold text-gray-700">{t('profile.position', 'المنصب')}
              <input name="position" value={positionLabel} readOnly className="input-field mt-1 bg-gray-100 text-gray-500" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-gray-700">{t('profile.fullName', 'الاسم الكامل')}
              <input name="name" value={form.name} onChange={(event) => updateField('name', event.target.value)} className="input-field mt-1" required />
            </label>
            <label className="block text-sm font-semibold text-gray-700">{t('profile.contactEmail', 'بريد التواصل')}
              <input name="contactEmail" type="email" dir="ltr" value={form.contactEmail} onChange={(event) => updateField('contactEmail', event.target.value)} className="input-field mt-1" />
            </label>
            <label className="block text-sm font-semibold text-gray-700">{t('profile.phone', 'رقم الهاتف / واتساب')}
              <input name="phone" type="tel" dir="ltr" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} className="input-field mt-1" />
            </label>
            <label className="block text-sm font-semibold text-gray-700">{t('profile.university', 'الجامعة')}
              <input name="university" value={form.university} onChange={(event) => updateField('university', event.target.value)} className="input-field mt-1" />
            </label>
            <label className="block text-sm font-semibold text-gray-700">{t('profile.major', 'التخصص')}
              <input name="major" value={form.major} onChange={(event) => updateField('major', event.target.value)} className="input-field mt-1" />
            </label>
            <label className="block text-sm font-semibold text-gray-700">{t('profile.academicYear', 'السنة الدراسية')}
              <select
                name="year"
                value={form.year}
                onChange={(event) => updateField('year', event.target.value)}
                className="input-field mt-1"
              >
                <option value="">{t('common.selectFromList', 'اختر من القائمة...')}</option>
                {Object.keys(ACADEMIC_YEAR_KEY_MAP).map((canonicalYear) => (
                  <option key={canonicalYear} value={canonicalYear}>
                    {getAcademicYearPresentation(canonicalYear, t)}
                  </option>
                ))}
                {form.year && !ACADEMIC_YEAR_KEY_MAP[form.year] && (
                  <option value={form.year}>{form.year}</option>
                )}
              </select>
            </label>
          </div>
          <label className="block text-sm font-semibold text-gray-700">{t('profile.bio', 'نبذة شخصية')}
            <textarea name="bio" rows={4} value={form.bio} onChange={(event) => updateField('bio', event.target.value)} className="input-field mt-1 resize-y" />
          </label>
          {resultBanner(operationResults.profile ?? profileResult)}
          <button type="submit" disabled={profileBusy} className="btn-primary disabled:opacity-50">
            <Save className="h-4 w-4" /> {profileBusy ? t('profile.saving', 'جارٍ الحفظ...') : t('profile.saveButton', 'حفظ البيانات الشخصية')}
          </button>
        </form>
      </section>

      <section className="card p-6" aria-labelledby="profile-password-heading">
        <h3 id="profile-password-heading" className="mb-5 flex items-center gap-2 text-lg font-bold text-navy-900">
          <KeyRound className="h-5 w-5 text-navy-600" /> {t('profile.passwordHeading', 'تغيير كلمة المرور')}
        </h3>
        <form onSubmit={changePassword} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-semibold text-gray-700">{t('profile.currentPassword', 'كلمة المرور الحالية')}
              <PasswordField name="currentPassword" value={passwords.current} onChange={(event) => updatePasswordField('current', event.target.value)} autoComplete="current-password" className="input-field mt-1" />
            </label>
            <label className="block text-sm font-semibold text-gray-700">{t('profile.newPassword', 'كلمة المرور الجديدة')}
              <PasswordField name="newPassword" value={passwords.next} onChange={(event) => updatePasswordField('next', event.target.value)} autoComplete="new-password" minLength={8} className="input-field mt-1" />
            </label>
            <label className="block text-sm font-semibold text-gray-700">{t('profile.confirmNewPassword', 'تأكيد كلمة المرور الجديدة')}
              <PasswordField name="passwordConfirmation" value={passwords.confirmation} onChange={(event) => updatePasswordField('confirmation', event.target.value)} autoComplete="new-password" minLength={8} className="input-field mt-1" />
            </label>
          </div>
          {resultBanner(operationResults.password ?? passwordResult)}
          <button type="submit" disabled={passwordBusy} className="btn-primary disabled:opacity-50">
            <KeyRound className="h-4 w-4" /> {passwordBusy ? t('profile.changingPassword', 'جارٍ التغيير...') : t('profile.changePasswordButton', 'تغيير كلمة المرور')}
          </button>
        </form>
      </section>
    </div>
  );
}
