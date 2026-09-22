import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Globe, Info, CheckCircle2 } from 'lucide-react';
import {
  type CmsTarget,
  type LocalizedCmsLocale,
  type LocalizationStatus,
} from '../../domain/cmsLocalization.ts';
import type { CmsFieldKind } from '../../domain/cmsTranslatableFields.ts';
import {
  isTranslatableLocationValue,
  publishCmsEntityFields,
  resolveCmsLocalizationScope,
  saveCmsEntityDraft,
} from '../../domain/cmsLocalizationEditor.ts';
import {
  useCmsLocalizationRepository,
} from '../../context/CmsLocalizationContext.tsx';
import { TranslationStatusBadge } from './TranslationStatusBadge.tsx';
import { LocalizedFieldEditor } from './LocalizedFieldEditor.tsx';

export interface CmsEntityFieldConfig {
  name: string;
  label: string;
  kind: CmsFieldKind;
  canonicalValue: string;
  placeholder?: string;
  isLocation?: boolean;
}

export interface CmsEntityTranslationTabsProps {
  target: CmsTarget | string;
  recordId: string | null;
  committeeId?: string | null;
  canonicalPayload: unknown;
  fields: CmsEntityFieldConfig[];
  canEdit: boolean;
  canPublish?: boolean;
  translations: Record<LocalizedCmsLocale, Record<string, string>>;
  onTranslationChange: (locale: LocalizedCmsLocale, fieldName: string, value: string) => void;
  onDraftSaved?: (locale: LocalizedCmsLocale) => void;
  onPublishOverride?: (locale: LocalizedCmsLocale, fields: Record<string, string>) => Promise<void>;
  onPublished?: (locale: LocalizedCmsLocale) => void;
  children: ReactNode;
}

interface LocaleStatusState {
  status: LocalizationStatus;
  isStale: boolean;
  isManual: boolean;
  manualPaths: readonly string[];
  saving: boolean;
  saveError: string | null;
  publishing: boolean;
  publishError: string | null;
}

const createInitialStatusState = (): LocaleStatusState => ({
  status: 'missing',
  isStale: false,
  isManual: false,
  manualPaths: [],
  saving: false,
  saveError: null,
  publishing: false,
  publishError: null,
});

function statusStateFromScope(
  scope: ReturnType<typeof resolveCmsLocalizationScope>,
): LocaleStatusState {
  return {
    status: scope.status,
    isStale: scope.isStale,
    isManual: scope.isManual,
    manualPaths: scope.manualPaths,
    saving: false,
    saveError: null,
    publishing: false,
    publishError: null,
  };
}

export function CmsEntityTranslationTabs({
  target,
  recordId,
  committeeId,
  canonicalPayload,
  fields,
  canEdit,
  canPublish,
  translations,
  onTranslationChange,
  onDraftSaved,
  onPublishOverride,
  onPublished,
  children,
}: CmsEntityTranslationTabsProps) {
  const { t } = useTranslation();
  const repository = useCmsLocalizationRepository();

  const isAuthorizedToPublish = canPublish !== undefined
    ? canPublish
    : Boolean(canEdit);

  const [activeTab, setActiveTab] = useState<'ar' | LocalizedCmsLocale>('ar');
  const [trStatus, setTrStatus] = useState<LocaleStatusState>(createInitialStatusState);
  const [enStatus, setEnStatus] = useState<LocaleStatusState>(createInitialStatusState);

  // Load existing translations for recordId on mount / recordId change
  useEffect(() => {
    let cancelled = false;

    async function loadLocale(locale: LocalizedCmsLocale): Promise<{
      statusState: LocaleStatusState;
      loadedFields: Record<string, string>;
    }> {
      try {
        const [draftRecord, publishedRecord] = await Promise.all([
          repository.getDraft(target, locale),
          repository.getPublished(target, locale),
        ]);

        const scope = resolveCmsLocalizationScope({
          draftRecord,
          publishedRecord,
          recordId,
          fieldPaths: fields.map((field) => field.name),
        });
        return {
          statusState: statusStateFromScope(scope),
          loadedFields: scope.values,
        };
      } catch {
        return { statusState: createInitialStatusState(), loadedFields: {} };
      }
    }

    async function loadAll() {
      const [trLoaded, enLoaded] = await Promise.all([
        loadLocale('tr'),
        loadLocale('en'),
      ]);
      if (cancelled) return;

      setTrStatus(trLoaded.statusState);
      setEnStatus(enLoaded.statusState);

      // Populate translations for existing record if not already modified
      for (const [k, v] of Object.entries(trLoaded.loadedFields)) {
        if (!translations.tr[k]) {
          onTranslationChange('tr', k, v);
        }
      }
      for (const [k, v] of Object.entries(enLoaded.loadedFields)) {
        if (!translations.en[k]) {
          onTranslationChange('en', k, v);
        }
      }
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, recordId, repository]);

  const handleSaveDraft = async (locale: LocalizedCmsLocale) => {
    if (!canEdit || (!recordId && target !== 'contactMap' && target !== 'site' && target !== 'programsContent' && target !== 'about' && target !== 'generalInfo')) return;
    const updater = locale === 'tr' ? setTrStatus : setEnStatus;
    const localeTranslations = translations[locale];

    updater((prev) => ({ ...prev, saving: true, saveError: null }));

    try {
const saved = await saveCmsEntityDraft({
        repository,
        target,
        locale,
        canonicalPayload,
        recordId,
        fields: localeTranslations,
        committeeId,
      });
      const publishedRecord = await repository.getPublished(target, locale);
      const scope = resolveCmsLocalizationScope({
        draftRecord: saved,
        publishedRecord,
        recordId,
        fieldPaths: fields.map((field) => field.name),
      });

      updater((prev) => ({
        ...prev,
        ...statusStateFromScope(scope),
        saveError: null,
      }));

      onDraftSaved?.(locale);
    } catch {
      updater((prev) => ({
        ...prev,
        saving: false,
        saveError: t('cmsLocalization.saveFailed', 'تعذر حفظ المسودة.'),
      }));
    }
  };

  const handlePublish = async (locale: LocalizedCmsLocale) => {
    if (!canEdit || !isAuthorizedToPublish || (!recordId && target !== 'contactMap' && target !== 'site' && target !== 'programsContent' && target !== 'about' && target !== 'generalInfo')) return;
    const updater = locale === 'tr' ? setTrStatus : setEnStatus;
    const localeTranslations = translations[locale];

    updater((prev) => ({ ...prev, publishing: true, publishError: null }));

    try {
      const dirtyFields = Object.fromEntries(
        fields
          .filter((field) => localeTranslations[field.name] !== undefined)
          .map((field) => [field.name, localeTranslations[field.name]]),
      );
      if (onPublishOverride) {
        await onPublishOverride(locale, dirtyFields);
      } else {
        await publishCmsEntityFields({
          repository,
          target,
          locale,
          canonicalPayload,
          recordId,
          fields: dirtyFields,
          committeeId,
        });
      }
      const [draftRecord, publishedRecord] = await Promise.all([
        repository.getDraft(target, locale),
        repository.getPublished(target, locale),
      ]);
      const scope = resolveCmsLocalizationScope({
        draftRecord,
        publishedRecord,
        recordId,
        fieldPaths: fields.map((field) => field.name),
      });

      updater((prev) => ({
        ...prev,
        ...statusStateFromScope(scope),
        publishError: null,
      }));

      onDraftSaved?.(locale);
      onPublished?.(locale);
    } catch (err: unknown) {
      console.error('Failed to publish translation', err);
      const msg = err instanceof Error && err.message ? err.message : t('cmsLocalization.publishFailed', `تم حفظ المحتوى الأساسي، لكن تعذر نشر الترجمة ${locale === 'tr' ? 'التركية' : 'الإنجليزية'}.`);
      updater((prev) => ({
        ...prev,
        publishing: false,
        publishError: msg,
      }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Tabs Header */}
      <div className="flex items-center justify-between gap-1 rounded-xl bg-navy-50/70 p-1 border border-navy-100">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('ar')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'ar'
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-navy-600 hover:text-navy-900 hover:bg-white/50'
            }`}
          >
            <Globe className="h-3.5 w-3.5 text-navy-500" />
            <span>{t('cmsLocalization.tabs.arabic', 'العربية (المصدر)')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tr')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'tr'
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-navy-600 hover:text-navy-900 hover:bg-white/50'
            }`}
          >
            <span>Türkçe</span>
            <TranslationStatusBadge status={trStatus.status} size="sm" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('en')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'en'
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-navy-600 hover:text-navy-900 hover:bg-white/50'
            }`}
          >
            <span>English</span>
            <TranslationStatusBadge status={enStatus.status} size="sm" />
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'ar' ? (
        <div dir="rtl" className="space-y-4">
          {children}
        </div>
      ) : (
        <div className="space-y-3.5 rounded-xl border border-navy-100 bg-navy-50/30 p-3.5">
          <div className="flex items-center justify-between border-b border-navy-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-navy-900">
                {activeTab === 'tr' ? 'Türkçe Çeviri' : 'English Translation'}
              </span>
              <TranslationStatusBadge
                status={activeTab === 'tr' ? trStatus.status : enStatus.status}
                size="sm"
              />
            </div>
            <div className="flex items-center gap-2">
              {!recordId && (
                <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {t(
                    'cmsLocalization.bindNotice',
                    'سيتم ربط المسودة بهوية العنصر عند الحفظ الأساسي',
                  )}
                </span>
              )}
            </div>
          </div>

          {fields.map((f) => {
            // Value-aware location guard
            if (f.isLocation && !isTranslatableLocationValue(f.canonicalValue)) {
              return (
                <div
                  key={f.name}
                  className="rounded-lg border border-gray-200 bg-gray-50/80 p-2.5 text-xs text-gray-600 flex items-start gap-2"
                >
                  <Info className="h-4 w-4 shrink-0 text-gray-500 mt-0.5" />
                  <div>
                    <div className="font-semibold text-gray-700">{f.label}</div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {t(
                        'cmsLocalization.technicalLocationExcluded',
                        'الموقع الحالي رابط أو إحداثيات تقنية؛ لا يتم تضمينه في الترجمة التحريرية.',
                      )}
                    </p>
                  </div>
                </div>
              );
            }

            const currentVal = translations[activeTab]?.[f.name] ?? '';

            return (
              <LocalizedFieldEditor
                key={f.name}
                target={target}
                locale={activeTab}
                path={`${recordId ?? 'new'}.${f.name}`}
                label={f.label}
                value={currentVal}
                kind={f.kind}
                placeholder={f.placeholder}
                disabled={!canEdit}
                onChange={(newVal) => onTranslationChange(activeTab, f.name, newVal)}
              />
            );
          })}

          {(activeTab === 'tr' ? trStatus.saveError : enStatus.saveError) && (
            <div
              role="alert"
              className="rounded bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 border border-rose-200"
            >
              {activeTab === 'tr' ? trStatus.saveError : enStatus.saveError}
            </div>
          )}

          {(activeTab === 'tr' ? trStatus.publishError : enStatus.publishError) && (
            <div
              role="alert"
              className="rounded bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 border border-rose-200"
            >
              {activeTab === 'tr' ? trStatus.publishError : enStatus.publishError}
            </div>
          )}


          {(recordId || target === 'contactMap' || target === 'site' || target === 'programsContent' || target === 'about' || target === 'generalInfo') && (
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleSaveDraft(activeTab)}
                disabled={!canEdit || (activeTab === 'tr' ? trStatus.saving : enStatus.saving) || (activeTab === 'tr' ? trStatus.publishing : enStatus.publishing)}
                className="inline-flex items-center gap-1 rounded bg-navy-100 px-3 py-1.5 text-xs font-medium text-navy-800 hover:bg-navy-200 disabled:opacity-50 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                {(activeTab === 'tr' ? trStatus.saving : enStatus.saving)
                  ? t('cmsLocalization.saving', 'جارٍ الحفظ...')
                  : t('cmsLocalization.saveDraft', 'حفظ كمسودة')}
              </button>

              {isAuthorizedToPublish && (
                <button
                  type="button"
                  onClick={() => void handlePublish(activeTab)}
                  disabled={!canEdit || (activeTab === 'tr' ? trStatus.publishing : enStatus.publishing) || (activeTab === 'tr' ? trStatus.saving : enStatus.saving)}
                  className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {(activeTab === 'tr' ? trStatus.publishing : enStatus.publishing)
                    ? t('cmsLocalization.publishing', 'جارٍ النشر...')
                    : t('cmsLocalization.publishChanges', 'نشر الترجمة')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
