import { useState } from 'react';
import {
  BookOpen, Home, Bus, Library, GraduationCap, MapPin, Phone, Clock,
  ExternalLink, ChevronLeft, Info, Plus, Edit3, Trash2, Save, X,
  Phone as PhoneIcon, Link as LinkIcon, UtensilsCrossed,
  HeartPulse, ShoppingCart, Wallet, FileText, Download, Building2, Car, Wifi,
  Coffee, Pill, BookMarked, Briefcase, Landmark, Mail, MessageCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import Modal from '../components/Modal';
import SiteEditBanner from '../components/SiteEditBanner';
import RequiredMark from '../components/RequiredMark';
import GuideSuggestionCallout from '../components/GuideSuggestionCallout';
import ManagedFileField from '../components/ManagedFileField';
import SmartClickableText from '../components/SmartClickableText';
import { validateChecks, clearInvalid, isInvalid, fieldId } from '../utils/formValidation';
import { validateGuideContact, validateGuideItem, validateGuideSection } from '../domain/cmsValidation';
import type { GuideSectionData, GuideItem, GuideContact, SiteEditDiff } from '../data/mockData';
import { CmsEntityTranslationTabs } from '../components/cmsLocalization/CmsEntityTranslationTabs';
import { CmsTranslationSection } from '../components/cmsLocalization/CmsTranslationSection';
import { useCmsLocalizationRepository } from '../context/CmsLocalizationContext';
import { type LocalizedCmsLocale } from '../domain/cmsLocalization';
import { publishCmsEntityLocales } from '../domain/cmsLocalizationEditor';
import { resolveGuideLinkTitle } from '../services/guideLinkMetadataService';

const toGuideHost = (value: string): string => {
  if (!value || value.startsWith('mailto:')) return '';
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const iconMap: Record<string, typeof BookOpen> = {
  BookOpen, Home, Bus, Library, GraduationCap, MapPin, Phone, Clock,
  ExternalLink, Info, UtensilsCrossed, HeartPulse, ShoppingCart, Wallet,
  FileText, Building2, Car, Wifi, Coffee, Pill, BookMarked, Briefcase,
  Landmark, Mail, MessageCircle,
};

const iconNames = Object.keys(iconMap);

const colorOptions = [
  { color: 'text-navy-700', bg: 'bg-navy-100' },
  { color: 'text-emerald-700', bg: 'bg-emerald-100' },
  { color: 'text-sky-700', bg: 'bg-sky-100' },
  { color: 'text-gold-700', bg: 'bg-gold-100' },
  { color: 'text-rose-700', bg: 'bg-rose-100' },
  { color: 'text-fuchsia-700', bg: 'bg-fuchsia-100' },
  { color: 'text-teal-700', bg: 'bg-teal-100' },
  { color: 'text-orange-700', bg: 'bg-orange-100' },
];

export default function StudentGuide() {
  const { t } = useTranslation();
  const { currentUser, guideSections, guideQuickInfo, canonicalGuideSections, canonicalGuideQuickInfo, submitSiteEdit, savePublishedSiteTarget, uploadManagedFile, refreshPublishedLocalizations } = useApp();
  const localizationRepo = useCmsLocalizationRepository();
  const canonicalSections = canonicalGuideSections ?? guideSections;
  const [activeSectionId, setActiveSectionId] = useState(guideSections[0]?.id ?? '');
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<GuideSectionData | null>(null);
  const [secTranslations, setSecTranslations] = useState<Record<LocalizedCmsLocale, Record<string, string>>>({
    tr: {},
    en: {},
  });
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GuideItem | null>(null);
  const [itemTranslations, setItemTranslations] = useState<Record<LocalizedCmsLocale, Record<string, string>>>({
    tr: {},
    en: {},
  });
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<GuideContact | null>(null);
  const [contactTranslations, setContactTranslations] = useState<Record<LocalizedCmsLocale, Record<string, string>>>({
    tr: {},
    en: {},
  });
  const [quickInfo, setQuickInfo] = useState(canonicalGuideQuickInfo ?? guideQuickInfo);
  const [editingQuickInfo, setEditingQuickInfo] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);

  const isPresident = currentUser?.role === 'PRESIDENT';
  const isPresidentOrMedia =
    currentUser &&
    (currentUser.role === 'PRESIDENT' || currentUser.role === 'MEDIA_HEAD');

  const activeSection = guideSections.find((s) => s.id === activeSectionId) ?? guideSections[0];

  // Section form state
  const [sectionForm, setSectionForm] = useState({
    label: '', icon: 'BookOpen', color: 'text-navy-700', bg: 'bg-navy-100',
    title: '', intro: '',
  });

  // Item form state
  const [itemForm, setItemForm] = useState({
    heading: '', body: '', tips: [''], documentLabel: '', documentUrl: '',
  });

  // Contact form state
  const [contactForm, setContactForm] = useState({
    label: '', value: '', type: 'phone' as 'phone' | 'link',
  });

  const openAddSection = () => {
    setEditingSection(null);
    setSecTranslations({ tr: {}, en: {} });
    setSectionForm({ label: '', icon: 'BookOpen', color: 'text-navy-700', bg: 'bg-navy-100', title: '', intro: '' });
    setSectionModalOpen(true);
  };

  const openEditSection = (s: GuideSectionData) => {
    const canon = canonicalGuideSections?.find((sec) => sec.id === s.id) ?? s;
    setEditingSection(canon);
    setSecTranslations({ tr: {}, en: {} });
    setSectionForm({ label: canon.label, icon: canon.icon, color: canon.color, bg: canon.bg, title: canon.title, intro: canon.intro });
    setSectionModalOpen(true);
  };

  const mediaNotice = () => undefined;

  const sectionDiffs = (op: 'add' | 'update' | 'delete', current: GuideSectionData | null, next: GuideSectionData): SiteEditDiff[] => {
    if (op === 'delete' && current) {
      return [{ label: 'حذف القسم', oldValue: current.title, newValue: 'سيتم حذف القسم بكامل محتوياته' }];
    }
    const rows: [string, string, unknown, unknown, boolean][] = [
      ['اسم القسم', 'label', current?.label, next.label, true],
      ['العنوان الرئيسي', 'title', current?.title ?? '', next.title ?? '', true],
      ['النص التعريفي', 'intro', current?.intro ?? '', next.intro ?? '', true],
      ['الأيقونة', 'icon', current?.icon, next.icon, false],
      ['اللون', 'color', current?.color, next.color, false],
      ['الخلفية', 'bg', current?.bg, next.bg, false],
    ];
    const diffs: SiteEditDiff[] = [];
    for (const [label, path, oldV, newV, editable] of rows) {
      if (String(oldV ?? '') === String(newV ?? '')) continue;
      diffs.push({ label, path, oldValue: String(oldV ?? ''), newValue: String(newV ?? ''), editable });
    }
    return diffs;
  };

  const itemDiffs = (current: GuideItem | null, next: GuideItem): SiteEditDiff[] => {
    const rows: [string, string, unknown, unknown, boolean][] = [
      ['عنوان المعلومة', 'heading', current?.heading, next.heading, true],
      ['الوصف الرئيسي', 'body', current?.body ?? '', next.body ?? '', true],
      ['الملف المرفق', 'documentUrl', current?.documentUrl ?? '', next.documentUrl ?? '', false],
    ];
    const diffs: SiteEditDiff[] = [];
    for (const [label, path, oldV, newV, editable] of rows) {
      if (String(oldV ?? '') === String(newV ?? '')) continue;
      diffs.push({ label, path, oldValue: String(oldV ?? ''), newValue: String(newV ?? ''), editable });
    }
    if ((current?.tips ?? []).join(' • ') !== next.tips.join(' • ')) {
      diffs.push({ label: 'النقاط الفرعية', path: 'tips', oldValue: JSON.stringify(current?.tips ?? []), newValue: JSON.stringify(next.tips), editable: false });
    }
    return diffs;
  };

  const contactDiffs = (current: GuideContact | null, next: GuideContact): SiteEditDiff[] => {
    const rows: [string, string, string, string, boolean][] = [
      ['الاسم', 'label', current?.label ?? '', next.label, true],
      ['القيمة', 'value', current?.value ?? '', next.value, true],
      ['النوع', 'type', current?.type ?? '', next.type, false],
    ];
    const diffs: SiteEditDiff[] = [];
    for (const [label, path, oldV, newV, editable] of rows) {
      if (oldV === newV) continue;
      diffs.push({ label, path, oldValue: oldV, newValue: newV, editable });
    }
    return diffs;
  };

  const saveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateGuideSection(sectionForm);
    if (!validateChecks(validation.invalid.map((key) => ({ key, ok: false })), setInvalid)) return;
    if (!sectionForm.label.trim()) return;
    const newSecId = 'sec' + Date.now();
    if (editingSection) {
      const next: GuideSectionData = { ...editingSection, ...sectionForm };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = sectionDiffs('update', editingSection, next);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: next.label,
            target: 'guideSections', op: 'update', recordId: editingSection.id, recordValue: next, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setSectionModalOpen(false);
        return;
      }
      const saved = await savePublishedSiteTarget(
        'guideSections',
        (canonicalGuideSections ?? guideSections).map((s) => s.id === editingSection.id ? next : s),
      );
      if (!saved.ok) { alert(saved.error); return; }
    } else {
      const newSection: GuideSectionData = {
        id: newSecId, ...sectionForm, items: [], contacts: [],
      };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = sectionDiffs('add', null, newSection);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: newSection.label,
            target: 'guideSections', op: 'add', recordValue: newSection, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setSectionModalOpen(false);
        return;
      }
      const nextSections = [...(canonicalGuideSections ?? guideSections), newSection];
      const saved = await savePublishedSiteTarget('guideSections', nextSections);
      if (!saved.ok) { alert(saved.error); return; }
      setActiveSectionId(newSection.id);

      try {
        await publishCmsEntityLocales({
          repository: localizationRepo, target: 'guideSections', canonicalPayload: nextSections,
          recordId: newSecId, translations: secTranslations,
        });
        await refreshPublishedLocalizations();
      } catch {
        alert(t('cmsLocalization.publishFailed', 'تعذر نشر الترجمة.'));
        return;
      }
    }
    setSectionModalOpen(false);
  };

  const deleteSection = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا القسم بكامل محتوياته؟')) return;
    const current = canonicalSections.find((s) => s.id === id);
    if (currentUser?.role === 'MEDIA_HEAD' && current) {
      await submitSiteEdit({
        pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: current.label,
        target: 'guideSections', op: 'delete', recordId: id, recordValue: current,
        diffs: sectionDiffs('delete', current, current),
      });
      mediaNotice();
      return;
    }
    const remaining = (canonicalGuideSections ?? guideSections).filter((s) => s.id !== id);
    const saved = await savePublishedSiteTarget('guideSections', remaining);
    if (!saved.ok) { alert(saved.error); return; }
    if (activeSectionId === id) {
      setActiveSectionId(remaining[0]?.id ?? '');
    }
  };

  const openAddItem = () => {
    setEditingItem(null);
    setItemTranslations({ tr: {}, en: {} });
    setItemForm({ heading: '', body: '', tips: [''], documentLabel: '', documentUrl: '' });
    setItemModalOpen(true);
  };

  const openEditItem = (item: GuideItem) => {
    const canonSec = canonicalGuideSections?.find((sec) => sec.id === activeSectionId);
    const canonItem = canonSec?.items?.find((it) => it.id === item.id);
    setEditingItem(canonItem ?? item);
    setItemTranslations({ tr: {}, en: {} });
    setItemForm({
      heading: canonItem?.heading ?? item.heading,
      body: canonItem?.body ?? item.body,
      tips: (canonItem?.tips ?? item.tips).length ? [...(canonItem?.tips ?? item.tips)] : [''],
      documentLabel: canonItem?.documentLabel ?? item.documentLabel ?? '',
      documentUrl: canonItem?.documentUrl ?? item.documentUrl ?? '',
    });
    setItemModalOpen(true);
  };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateGuideItem(itemForm);
    if (!validateChecks(validation.invalid.map((key) => ({ key, ok: false })), setInvalid)) return;
    if (!itemForm.heading.trim()) return;
    const tips = itemForm.tips.filter((t) => t.trim());
    const newItemId = editingItem?.id ?? 'item' + Date.now();
if (currentUser?.role === 'MEDIA_HEAD') {
      const section = canonicalSections.find((s) => s.id === activeSectionId);
      if (!section) return;
      const nextItem: GuideItem = {
        id: newItemId,
        heading: itemForm.heading,
        body: itemForm.body,
        tips,
        documentLabel: itemForm.documentLabel.trim() ? itemForm.documentLabel.trim() : undefined,
        documentUrl: itemForm.documentUrl.trim() ? itemForm.documentUrl.trim() : undefined,
      };
      const next: GuideSectionData = editingItem
        ? { ...section, items: section.items.map((it) => it.id === editingItem.id ? nextItem : it) }
        : { ...section, items: [...section.items, nextItem] };
      const diffs = itemDiffs(editingItem, nextItem);
      if (diffs.length) {
        const submitted = await submitSiteEdit({
          pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: section.label,
          target: 'guideSections', op: 'update', recordId: section.id, recordValue: next,
          nested: { parentField: 'items', itemId: newItemId },
          diffs,
        });
        if (!submitted) return;
        mediaNotice();
      }
      setItemModalOpen(false);
      return;
    }
let nextSections: GuideSectionData[];
    const nextItemPatch = {
      heading: itemForm.heading,
      body: itemForm.body,
      tips,
      documentLabel: itemForm.documentLabel.trim() ? itemForm.documentLabel.trim() : undefined,
      documentUrl: itemForm.documentUrl.trim() ? itemForm.documentUrl.trim() : undefined,
    };
    if (editingItem) {
      nextSections = (canonicalGuideSections ?? guideSections).map((s) => s.id === activeSectionId ? {
        ...s, items: s.items.map((it) => it.id === editingItem.id ? { ...it, ...nextItemPatch } : it),
      } : s);
    } else {
      const newItem: GuideItem = { id: newItemId, ...nextItemPatch };
      nextSections = (canonicalGuideSections ?? guideSections).map((s) => s.id === activeSectionId ? { ...s, items: [...s.items, newItem] } : s);
    }
    const saved = await savePublishedSiteTarget('guideSections', nextSections);
    if (!saved.ok) { alert(saved.error); return; }

    if (!editingItem) {
      try {
        await publishCmsEntityLocales({
          repository: localizationRepo, target: 'guideSections', canonicalPayload: nextSections,
          recordId: newItemId, translations: itemTranslations,
        });
        await refreshPublishedLocalizations();
      } catch {
        alert(t('cmsLocalization.publishFailed', 'تعذر نشر الترجمة.'));
        return;
      }
    }
    setItemModalOpen(false);
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه المعلومة؟')) return;
    const section = canonicalSections.find((s) => s.id === activeSectionId);
    if (!section) return;
    const item = section.items.find((it) => it.id === itemId);
    if (currentUser?.role === 'MEDIA_HEAD') {
      const next: GuideSectionData = { ...section, items: section.items.filter((it) => it.id !== itemId) };
      await submitSiteEdit({
        pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: section.label,
        target: 'guideSections', op: 'update', recordId: section.id, recordValue: next,
        nested: { parentField: 'items', itemId, remove: true },
        diffs: [{ label: 'حذف معلومة', oldValue: item?.heading ?? '—', newValue: 'سيتم حذف هذه المعلومة', editable: false }],
      });
      mediaNotice();
      return;
    }
    const saved = await savePublishedSiteTarget(
      'guideSections',
      (canonicalGuideSections ?? guideSections).map((s) => s.id === activeSectionId ? { ...s, items: s.items.filter((it) => it.id !== itemId) } : s),
    );
    if (!saved.ok) alert(saved.error);
  };

  const moveItem = async (itemId: string, dir: -1 | 1) => {
    const section = canonicalSections.find((s) => s.id === activeSectionId);
    if (!section) return;
    const items = [...section.items];
    const idx = items.findIndex((it) => it.id === itemId);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    if (currentUser?.role === 'MEDIA_HEAD') {
      const next: GuideSectionData = { ...section, items };
      await submitSiteEdit({
        pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: section.label,
        target: 'guideSections', op: 'update', recordId: section.id, recordValue: next,
        diffs: [{ label: 'إعادة ترتيب المعلومات', path: 'items', oldValue: JSON.stringify(section.items), newValue: JSON.stringify(items), editable: false }],
      });
      mediaNotice();
      return;
    }
    const saved = await savePublishedSiteTarget(
      'guideSections',
      (canonicalGuideSections ?? guideSections).map((s) => s.id === activeSectionId ? { ...s, items } : s),
    );
    if (!saved.ok) alert(saved.error);
  };

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ label: '', value: '', type: 'phone' });
    setContactModalOpen(true);
  };

  const openEditContact = (c: GuideContact) => {
    const canonSec = canonicalGuideSections?.find((sec) => sec.id === activeSectionId);
    const canonContact = canonSec?.contacts?.find((ct) => ct.id === c.id);
    setEditingContact(canonContact ?? c);
    setContactTranslations({ tr: {}, en: {} });
    setContactForm({
      label: canonContact?.label ?? c.label,
      value: canonContact?.value ?? c.value,
      type: canonContact?.type ?? c.type,
    });
    setContactModalOpen(true);
  };

const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateGuideContact(contactForm);
    if (!validateChecks(validation.invalid.map((key) => ({ key, ok: false })), setInvalid)) return;
    if (!contactForm.label.trim() || !contactForm.value.trim()) return;

    // Resolve a human-readable title for link contacts. Failures (offline
    // function, blocked/private targets, timeouts) degrade silently to the
    // hostname fallback so the editor is never blocked from saving.
    let resolvedTitle: string | undefined;
    if (contactForm.type === 'link' && contactForm.value.trim()) {
      try {
        const metadata = await resolveGuideLinkTitle(contactForm.value.trim());
        if (metadata.ok && metadata.title && metadata.host) {
          resolvedTitle = metadata.title;
        } else if (metadata.host) {
          resolvedTitle = metadata.host;
        }
      } catch {
        // keep undefined
      }
    }

    if (currentUser?.role === 'MEDIA_HEAD') {
      const section = canonicalSections.find((s) => s.id === activeSectionId);
      if (!section) return;
      const contactId = editingContact?.id ?? 'ct' + Date.now();
      const nextContact: GuideContact = { id: contactId, ...contactForm };
      if (resolvedTitle) nextContact.title = resolvedTitle;
      const next: GuideSectionData = editingContact
        ? { ...section, contacts: section.contacts.map((c) => c.id === editingContact.id ? nextContact : c) }
        : { ...section, contacts: [...section.contacts, nextContact] };
      const diffs = contactDiffs(editingContact, nextContact);
      if (diffs.length) {
        const submitted = await submitSiteEdit({
          pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: section.label,
          target: 'guideSections', op: 'update', recordId: section.id, recordValue: next,
          nested: { parentField: 'contacts', itemId: contactId },
          diffs,
        });
        if (!submitted) return;
        mediaNotice();
      }
      setContactModalOpen(false);
      return;
    }
    let nextSections: GuideSectionData[];
    const contactId = editingContact?.id ?? 'ct' + Date.now();
    if (editingContact) {
      nextSections = (canonicalGuideSections ?? guideSections).map((s) => s.id === activeSectionId ? {
        ...s, contacts: s.contacts.map((c) => c.id === editingContact.id ? { ...c, ...contactForm, ...(resolvedTitle ? { title: resolvedTitle } : {}) } : c),
      } : s);
    } else {
      const newContact: GuideContact = { id: contactId, ...contactForm };
      if (resolvedTitle) newContact.title = resolvedTitle;
      nextSections = (canonicalGuideSections ?? guideSections).map((s) => s.id === activeSectionId ? { ...s, contacts: [...s.contacts, newContact] } : s);
    }
    const saved = await savePublishedSiteTarget('guideSections', nextSections);
    if (!saved.ok) { alert(saved.error); return; }
    if (!editingContact) {
      try {
        await publishCmsEntityLocales({
          repository: localizationRepo, target: 'guideSections', canonicalPayload: nextSections,
          recordId: contactId, translations: contactTranslations,
        });
        await refreshPublishedLocalizations();
      } catch {
        alert(t('cmsLocalization.publishFailed', 'تعذر نشر الترجمة.'));
        return;
      }
    }
    setContactModalOpen(false);
  };

  const deleteContact = async (contactId: string) => {
    const section = canonicalSections.find((s) => s.id === activeSectionId);
    if (!section) return;
    const c = section.contacts.find((ct) => ct.id === contactId);
    if (currentUser?.role === 'MEDIA_HEAD') {
      const next: GuideSectionData = { ...section, contacts: section.contacts.filter((ct) => ct.id !== contactId) };
      await submitSiteEdit({
        pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: section.label,
        target: 'guideSections', op: 'update', recordId: section.id, recordValue: next,
        nested: { parentField: 'contacts', itemId: contactId, remove: true },
        diffs: [{ label: 'حذف جهة اتصال', oldValue: c?.label ?? '—', newValue: 'سيتم حذف جهة الاتصال هذه', editable: false }],
      });
      mediaNotice();
      return;
    }
    const saved = await savePublishedSiteTarget(
      'guideSections',
      (canonicalGuideSections ?? guideSections).map((s) => s.id === activeSectionId ? { ...s, contacts: s.contacts.filter((contact) => contact.id !== contactId) } : s),
    );
    if (!saved.ok) alert(saved.error);
  };

  const saveQuickInfo = async () => {
    if (!quickInfo.trim()) {
      setInvalid(['quickInfo']);
      const el = document.getElementById(fieldId('quickInfo'));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
      alert('يرجى تعبئة كافة الحقول المطلوبة قبل الحفظ');
      return;
    }
    if (currentUser?.role === 'MEDIA_HEAD') {
      if (quickInfo !== (canonicalGuideQuickInfo ?? guideQuickInfo)) {
        const submitted = await submitSiteEdit({
          pageId: 'guide', pageLabel: 'دليل الطالب', sectionLabel: 'المعلومة السريعة',
          target: 'guideQuickInfo', op: 'update', recordId: 'quick', recordValue: quickInfo,
          diffs: [{ label: 'المعلومة السريعة', path: 'value', oldValue: canonicalGuideQuickInfo ?? guideQuickInfo, newValue: quickInfo }],
        });
        if (!submitted) return;
        mediaNotice();
      }
      setEditingQuickInfo(false);
      return;
    }
    const saved = await savePublishedSiteTarget('guideQuickInfo', quickInfo);
    if (!saved.ok) { alert(saved.error); return; }
    setEditingQuickInfo(false);
  };

  const ActiveIcon = activeSection ? iconMap[activeSection.icon] ?? BookOpen : BookOpen;

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-50 to-gray-50 pt-20 lg:pt-24">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-l from-navy-900 to-navy-950 py-16">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url(https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/3a3b4fe6-66cd-4514-94c1-747963cf0a63.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="container-app relative">
          <div className="flex items-center gap-3 text-gold-400">
            <BookOpen className="h-6 w-6" />
            <span className="text-sm font-bold tracking-wide">{t('guide.badge')}</span>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">{t('guide.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
            {t('guide.description')}
          </p>
        </div>
      </div>

      <div className="container-app py-10">
        <SiteEditBanner pageId="guide" />
        <GuideSuggestionCallout />
        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="card overflow-hidden p-2">
              <nav className="space-y-1">
                {guideSections.map((section) => {
                  const Icon = iconMap[section.icon] ?? BookOpen;
                  return (
                    <div key={section.id} className="group relative">
                      <button
                        onClick={() => setActiveSectionId(section.id)}
                        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                          activeSectionId === section.id
                            ? 'bg-navy-800 text-white shadow'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${activeSectionId === section.id ? 'bg-white/20' : section.bg}`}>
                          <Icon className={`h-4 w-4 ${activeSectionId === section.id ? 'text-white' : section.color}`} />
                        </div>
                        {section.label}
                        {activeSectionId === section.id && <ChevronLeft className="mr-auto h-4 w-4" />}
                      </button>
                      {isPresidentOrMedia && (
                        <div className="absolute left-2 top-1/2 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditSection(section); }}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-navy-700 shadow-sm hover:bg-white"
                            title="تعديل القسم"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteSection(section.id); }}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-rose-600 shadow-sm hover:bg-white"
                            title="حذف القسم"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
              {isPresidentOrMedia && (
                <button
                  onClick={openAddSection}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-navy-300 px-4 py-2.5 text-xs font-bold text-navy-600 transition-colors hover:bg-navy-50"
                >
                  <Plus className="h-4 w-4" /> {t('guide.addSection')}
                </button>
              )}
            </div>
            {/* Quick info card */}
            <div className="mt-4 card bg-gradient-to-br from-navy-50 to-gold-50 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-navy-900">
                  <Info className="h-5 w-5" />
                  <span className="text-sm font-bold">{t('guide.quickInfo')}</span>
                </div>
                {isPresidentOrMedia && !editingQuickInfo && (
                  <button
                    onClick={() => {
                      setQuickInfo(canonicalGuideQuickInfo ?? guideQuickInfo);
                      setEditingQuickInfo(true);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/60 text-navy-600 hover:bg-white"
                    title={t('common.edit')}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {editingQuickInfo ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    id={fieldId('quickInfo')}
                    rows={3}
                    className={`w-full resize-none rounded-lg border bg-white px-3 py-2 text-xs leading-relaxed text-gray-700 focus:border-navy-400 focus:outline-none ${isInvalid(invalid, 'quickInfo')}`}
                    value={quickInfo}
                    onChange={(e) => { setQuickInfo(e.target.value); clearInvalid(setInvalid, 'quickInfo'); }}
                  />
                  <CmsTranslationSection
                    target="guideQuickInfo"
                    path="value"
                    label={t('guide.quickInfo')}
                    kind="description"
                    canonicalValue={quickInfo}
                    canonicalPayload={canonicalGuideQuickInfo ?? guideQuickInfo}
                    canEdit={Boolean(isPresidentOrMedia)}
                    canPublish={Boolean(isPresident)}
                    onPublished={refreshPublishedLocalizations}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveQuickInfo}
                      className="inline-flex items-center gap-1 rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-navy-800"
                    >
                      <Save className="h-3 w-3" /> {t('common.save')}
                    </button>
                    <button
                      onClick={() => { setEditingQuickInfo(false); setQuickInfo(canonicalGuideQuickInfo ?? guideQuickInfo); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      <X className="h-3 w-3" /> {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-gray-600"><SmartClickableText text={guideQuickInfo} /></p>
              )}
            </div>
          </aside>

          {/* Content */}
          <div className="space-y-6">
            {/* Section header */}
            <div className="card overflow-hidden">
              <div className={`flex items-center gap-4 ${activeSection.bg} p-6`}>
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow ${activeSection.color}`}>
                  <ActiveIcon className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-navy-900">{activeSection.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{activeSection.intro}</p>
                </div>
              </div>
            </div>

            {/* Items */}
            {activeSection.items.map((item, idx) => (
              <div key={item.id} className="card group relative p-6">
                {isPresidentOrMedia && (
                  <div className="absolute left-4 top-4 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => moveItem(item.id, -1)}
                      disabled={idx === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                      title="تحريك لأعلى"
                    >
                      <ChevronLeft className="h-4 w-4 rotate-90" />
                    </button>
                    <button
                      onClick={() => moveItem(item.id, 1)}
                      disabled={idx === activeSection.items.length - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                      title="تحريك لأسفل"
                    >
                      <ChevronLeft className="h-4 w-4 -rotate-90" />
                    </button>
                    <button
                      onClick={() => openEditItem(item)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-navy-50 text-navy-700 hover:bg-navy-100"
                      title="تعديل"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100"
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-sm font-bold text-white">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-navy-900">{item.heading}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600"><SmartClickableText text={item.body} /></p>
                    {item.tips.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {item.tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                            <SmartClickableText text={tip} />
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.documentUrl && (
                      <a
                        href={item.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-navy-50 px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-100"
                      >
                        <Download className="h-4 w-4" /> {item.documentLabel?.trim() || 'تحميل الملف'}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isPresidentOrMedia && (
              <button
                onClick={openAddItem}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-navy-200 px-4 py-4 text-sm font-bold text-navy-600 transition-colors hover:border-navy-300 hover:bg-navy-50"
              >
                <Plus className="h-5 w-5" /> {t('guide.addItem')}
              </button>
            )}

            {/* Contacts */}
            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-bold text-navy-900">
                  <Phone className="h-5 w-5 text-navy-600" />
                  {t('guide.importantContacts')}
                </h3>
                {isPresidentOrMedia && (
                  <button
                    onClick={openAddContact}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-700 hover:bg-navy-100"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t('guide.addContact')}
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeSection.contacts.map((contact) => {
                  const Icon = contact.type === 'phone' ? PhoneIcon : LinkIcon;
                  return (
                    <div key={contact.id} className="group relative flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-100 text-navy-700">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-400">{contact.label}</div>
                        {contact.type === 'phone' ? (
                          <a href={`tel:${contact.value.replace(/[^+\d]/g, '')}`} className="text-sm font-bold text-navy-900" dir="ltr">{contact.value}</a>
                        ) : (
                          <a href={contact.value.startsWith('http') ? contact.value : `https://${contact.value}`} target="_blank" rel="noopener noreferrer" className="flex flex-col min-w-0 text-sm font-bold text-navy-900 underline decoration-navy-200 hover:text-navy-700">
                            <span className="truncate font-bold text-navy-900" dir="ltr">{contact.title || toGuideHost(contact.value) || contact.value}</span>
                            {toGuideHost(contact.value) && (
                              <span className="truncate text-xs font-medium text-gray-400 no-underline" dir="ltr">{toGuideHost(contact.value)}</span>
                            )}
                          </a>
                        )}
                      </div>
                      {isPresidentOrMedia && (
                        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => openEditContact(contact)}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-navy-700 shadow-sm hover:bg-navy-50"
                            title="تعديل"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteContact(contact.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-rose-600 shadow-sm hover:bg-rose-50"
                            title="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {activeSection.contacts.length === 0 && (
                  <div className="col-span-2 py-6 text-center text-sm text-gray-400">لا توجد جهات اتصال لهذا القسم.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Modal */}
      <Modal open={sectionModalOpen} onClose={() => setSectionModalOpen(false)} title={editingSection ? 'تعديل القسم' : 'إضافة قسم جديد'} maxWidth="max-w-lg">
        <form onSubmit={saveSection} className="space-y-4">
          <CmsEntityTranslationTabs
            onPublished={refreshPublishedLocalizations}
            target="guideSections"
            recordId={editingSection?.id ?? null}
            canonicalPayload={canonicalGuideSections ?? guideSections}
            fields={[
              {
                name: 'label',
                label: 'اسم القسم',
                kind: 'title',
                canonicalValue: sectionForm.label,
                placeholder: 'اسم القسم',
              },
              {
                name: 'title',
                label: 'العنوان الرئيسي',
                kind: 'title',
                canonicalValue: sectionForm.title,
                placeholder: 'العنوان الرئيسي',
              },
              {
                name: 'intro',
                label: 'النص التعريفي',
                kind: 'description',
                canonicalValue: sectionForm.intro,
                placeholder: 'النص التعريفي',
              },
            ]}
            canEdit={Boolean(isPresidentOrMedia)}
            canPublish={Boolean(isPresident)}
            translations={secTranslations}
            onTranslationChange={(loc, name, val) => {
              setSecTranslations((prev) => ({
                ...prev,
                [loc]: { ...prev[loc], [name]: val },
              }));
            }}
          >
            <div>
              <label htmlFor={fieldId('secLabel')} className="label-field">اسم القسم <RequiredMark /></label>
              <input id={fieldId('secLabel')} required className={`input-field ${isInvalid(invalid, 'secLabel')}`} value={sectionForm.label} onChange={(e) => { setSectionForm({ ...sectionForm, label: e.target.value }); clearInvalid(setInvalid, 'secLabel'); }} placeholder="مثال: المطاعم" />
            </div>
            <div>
              <label htmlFor={fieldId('secTitle')} className="label-field">العنوان الرئيسي <RequiredMark /></label>
              <input id={fieldId('secTitle')} required className={`input-field ${isInvalid(invalid, 'secTitle')}`} value={sectionForm.title} onChange={(e) => { setSectionForm({ ...sectionForm, title: e.target.value }); clearInvalid(setInvalid, 'secTitle'); }} placeholder="مثال: دليل المطاعم" />
            </div>
            <div>
              <label htmlFor={fieldId('secIntro')} className="label-field">النص التعريفي <RequiredMark /></label>
              <textarea id={fieldId('secIntro')} required rows={2} className={`input-field resize-none ${isInvalid(invalid, 'secIntro')}`} value={sectionForm.intro} onChange={(e) => { setSectionForm({ ...sectionForm, intro: e.target.value }); clearInvalid(setInvalid, 'secIntro'); }} />
            </div>
          </CmsEntityTranslationTabs>
          <div>
            <label className="label-field">الأيقونة</label>
            <div className="flex flex-wrap gap-2">
              {iconNames.map((name) => {
                const Icon = iconMap[name];
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSectionForm({ ...sectionForm, icon: name })}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-colors ${
                      sectionForm.icon === name ? 'border-navy-600 bg-navy-50' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-5 w-5 text-navy-700" />
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="label-field">اللون</label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  onClick={() => setSectionForm({ ...sectionForm, color: c.color, bg: c.bg })}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 ${c.bg} ${c.color} ${
                    sectionForm.color === c.color ? 'border-navy-600 ring-2 ring-navy-200' : 'border-transparent'
                  }`}
                >
                  <BookOpen className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setSectionModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> حفظ
            </button>
          </div>
        </form>
      </Modal>

      {/* Item Modal */}
      <Modal open={itemModalOpen} onClose={() => setItemModalOpen(false)} title={editingItem ? 'تعديل المعلومة' : 'إضافة معلومة/دليل جديد'} maxWidth="max-w-lg">
        <form onSubmit={saveItem} className="space-y-4">
          <CmsEntityTranslationTabs
            onPublished={refreshPublishedLocalizations}
            target="guideSections"
            recordId={editingItem?.id ?? null}
            canonicalPayload={canonicalGuideSections ?? guideSections}
            fields={[
              {
                name: 'heading',
                label: 'عنوان الكرت',
                kind: 'title',
                canonicalValue: itemForm.heading,
                placeholder: 'عنوان الكرت',
              },
              {
                name: 'body',
                label: 'الوصف الرئيسي',
                kind: 'richText',
                canonicalValue: itemForm.body,
                placeholder: 'الوصف الرئيسي',
              },
              ...itemForm.tips.map((tip, i) => ({
                name: `tips.${i}`,
                label: `النقطة الفرعية ${i + 1}`,
                kind: 'text' as const,
                canonicalValue: tip,
                placeholder: `نقطة ${i + 1}`,
              })),
            ]}
            canEdit={Boolean(isPresidentOrMedia)}
            canPublish={Boolean(isPresident)}
            translations={itemTranslations}
            onTranslationChange={(loc, name, val) => {
              setItemTranslations((prev) => ({
                ...prev,
                [loc]: { ...prev[loc], [name]: val },
              }));
            }}
          >
            <div>
              <label htmlFor={fieldId('itemHeading')} className="label-field">عنوان الكرت <RequiredMark /></label>
              <input id={fieldId('itemHeading')} required className={`input-field ${isInvalid(invalid, 'itemHeading')}`} value={itemForm.heading} onChange={(e) => { setItemForm({ ...itemForm, heading: e.target.value }); clearInvalid(setInvalid, 'itemHeading'); }} />
            </div>
            <div>
              <label htmlFor={fieldId('itemBody')} className="label-field">الوصف الرئيسي <RequiredMark /></label>
              <textarea id={fieldId('itemBody')} required rows={2} className={`input-field resize-none ${isInvalid(invalid, 'itemBody')}`} value={itemForm.body} onChange={(e) => { setItemForm({ ...itemForm, body: e.target.value }); clearInvalid(setInvalid, 'itemBody'); }} />
            </div>
            <div>
              <label className="label-field">النقاط الفرعية</label>
              <div className="space-y-2">
                {itemForm.tips.map((tip, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="input-field"
                      value={tip}
                      onChange={(e) => setItemForm({ ...itemForm, tips: itemForm.tips.map((t, j) => j === i ? e.target.value : t) })}
                      placeholder={`نقطة ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => setItemForm({ ...itemForm, tips: itemForm.tips.filter((_, j) => j !== i) })}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setItemForm({ ...itemForm, tips: [...itemForm.tips, ''] })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-navy-300 px-3 py-1.5 text-xs font-bold text-navy-600 hover:bg-navy-50"
                >
                  <Plus className="h-3.5 w-3.5" /> إضافة نقطة
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <ManagedFileField
                usage="guide-document"
                label="ملف قابل للتحميل (اختياري)"
                currentUrl={itemForm.documentUrl || undefined}
                onUpload={(file, onProgress) => uploadManagedFile('guide-document', file, onProgress)}
                onUploaded={(asset) => setItemForm((prev) => ({ ...prev, documentUrl: asset.publicUrl }))}
              />
              {itemForm.documentUrl && (
                <div className="flex flex-wrap gap-2">
                  <input
                    className="input-field"
                    placeholder="عنوان الزر (اختياري) — مثال: نموذج التسجيل"
                    value={itemForm.documentLabel}
                    onChange={(e) => setItemForm({ ...itemForm, documentLabel: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setItemForm({ ...itemForm, documentUrl: '', documentLabel: '' })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"
                  >
                    <X className="h-3.5 w-3.5" /> إزالة الملف
                  </button>
                </div>
              )}
            </div>
          </CmsEntityTranslationTabs>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setItemModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> حفظ
            </button>
          </div>
        </form>
      </Modal>

      {/* Contact Modal */}
      <Modal open={contactModalOpen} onClose={() => setContactModalOpen(false)} title={editingContact ? 'تعديل جهة اتصال' : 'إضافة جهة اتصال'} maxWidth="max-w-md">
        <form onSubmit={saveContact} className="space-y-4">
          <CmsEntityTranslationTabs
            onPublished={refreshPublishedLocalizations}
            target="guideSections"
            recordId={editingContact?.id ?? null}
            canonicalPayload={canonicalGuideSections ?? guideSections}
            fields={[
              {
                name: 'label',
                label: 'الاسم',
                kind: 'title',
                canonicalValue: contactForm.label,
                placeholder: 'مثال: قسم شؤون الطلاب',
              },
            ]}
            canEdit={Boolean(isPresidentOrMedia)}
            canPublish={Boolean(isPresident)}
            translations={contactTranslations}
            onTranslationChange={(loc, name, val) => {
              setContactTranslations((prev) => ({
                ...prev,
                [loc]: { ...prev[loc], [name]: val },
              }));
            }}
          >
            <div>
              <label htmlFor={fieldId('contactLabel')} className="label-field">الاسم <RequiredMark /></label>
              <input id={fieldId('contactLabel')} required className={`input-field ${isInvalid(invalid, 'contactLabel')}`} value={contactForm.label} onChange={(e) => { setContactForm({ ...contactForm, label: e.target.value }); clearInvalid(setInvalid, 'contactLabel'); }} placeholder="مثال: قسم شؤون الطلاب" />
            </div>
          </CmsEntityTranslationTabs>
          <div>
            <label htmlFor={fieldId('contactValue')} className="label-field">القيمة <RequiredMark /></label>
            <input id={fieldId('contactValue')} required className={`input-field ${isInvalid(invalid, 'contactValue')}`} dir="ltr" value={contactForm.value} onChange={(e) => { setContactForm({ ...contactForm, value: e.target.value }); clearInvalid(setInvalid, 'contactValue'); }} placeholder={contactForm.type === 'phone' ? '+90 442 231 0000' : 'https://example.com'} />
          </div>
          <div>
            <label className="label-field">النوع</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setContactForm({ ...contactForm, type: 'phone' })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                  contactForm.type === 'phone' ? 'border-navy-600 bg-navy-50 text-navy-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <PhoneIcon className="h-4 w-4" /> رقم هاتف
              </button>
              <button
                type="button"
                onClick={() => setContactForm({ ...contactForm, type: 'link' })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                  contactForm.type === 'link' ? 'border-navy-600 bg-navy-50 text-navy-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LinkIcon className="h-4 w-4" /> رابط موقع
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setContactModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> حفظ
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
