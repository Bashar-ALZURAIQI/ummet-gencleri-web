import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Images, Filter, Play, Calendar, MapPin, Camera, Video, X,
  Plus, Edit3, Trash2, Save, Link as LinkIcon, Image as ImageIcon, Film, ExternalLink,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from '../components/Modal';
import SiteEditBanner from '../components/SiteEditBanner';
import RequiredMark from '../components/RequiredMark';
import { validateRequired, clearInvalid, isInvalid, fieldId } from '../utils/formValidation';
import type { GalleryAlbum, GalleryCategory, GalleryMedia, SiteEditDiff } from '../data/mockData';
import ManagedFileField from '../components/ManagedFileField';
import { CmsEntityTranslationTabs } from '../components/cmsLocalization/CmsEntityTranslationTabs';
import { useCmsLocalizationRepository } from '../context/CmsLocalizationContext';
import { type LocalizedCmsLocale } from '../domain/cmsLocalization';
import { publishCmsEntityLocales, resolveCanonicalEntityById } from '../domain/cmsLocalizationEditor';
import { formatPublicDate } from '../domain/datePresentation';
import { canCreateExecutiveContent } from '../domain/phaseThreeEconomy.ts';

export default function MediaGallery() {
  const {
    currentUser,
    galleryAlbums,
    galleryCategories,
    canonicalGalleryAlbums,
    canonicalGalleryCategories,
    submitSiteEdit,
    uploadManagedFile,
    savePublishedSiteTarget,
    refreshPublishedLocalizations,
    listOwnAlbumIds,
    updateOwnedGalleryAlbum,
    appendOwnedGalleryMedia,
    createGalleryAlbum,
  } = useApp();
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<string>('all');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<GalleryMedia | null>(null);
  const [ownedAlbumIds, setOwnedAlbumIds] = useState<Set<string>>(new Set());

  // Album modal
  const localizationRepo = useCmsLocalizationRepository();
  const [albumModalOpen, setAlbumModalOpen] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<GalleryAlbum | null>(null);
  const [albumTranslations, setAlbumTranslations] = useState<Record<LocalizedCmsLocale, Record<string, string>>>({
    tr: {},
    en: {},
  });
  const [albumForm, setAlbumForm] = useState({
    title: '', categoryId: '', date: '', location: '',
    coverImage: '', photoCount: 0, videoCount: 0, description: '',
  });

  // Category modal
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<GalleryCategory | null>(null);
  const [categoryTranslations, setCategoryTranslations] = useState<Record<LocalizedCmsLocale, Record<string, string>>>({
    tr: {},
    en: {},
  });
  const [categoryForm, setCategoryForm] = useState({ label: '' });

  // Media modal (add media to album)
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [editingMediaId, setEditingMediaId] = useState<string>('');
  const [mediaTranslations, setMediaTranslations] = useState<Record<LocalizedCmsLocale, Record<string, string>>>({
    tr: {},
    en: {},
  });
  const [localizedCategories, setLocalizedCategories] = useState<Record<string, string>>({});

  useEffect(() => {
    if (i18n.language === 'ar') {
      setLocalizedCategories({});
      return;
    }
    const loc = (i18n.language === 'tr' ? 'tr' : 'en') as LocalizedCmsLocale;
    let cancelled = false;
    void localizationRepo.getPublished('galleryCategories', loc).then((rec) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      if (rec && Array.isArray(rec.payload)) {
        for (const item of rec.payload as Record<string, unknown>[]) {
          if (item && typeof item.id === 'string' && typeof item.label === 'string' && item.label.trim()) {
            map[item.id] = item.label;
          }
        }
      }
      setLocalizedCategories(map);
    }).catch(() => {
      if (!cancelled) setLocalizedCategories({});
    });
    return () => { cancelled = true; };
  }, [i18n.language, localizationRepo, galleryCategories]);

  const [mediaForm, setMediaForm] = useState({
    type: 'photo' as 'photo' | 'video',
    source: 'upload' as 'upload' | 'external',
    url: '', thumbnail: '', caption: '', photoUrl: '',
  });

  const [invalid, setInvalid] = useState<string[]>([]);

  const isPresident = currentUser?.role === 'PRESIDENT';
  const isPresidentOrMedia =
    currentUser &&
    (currentUser.role === 'PRESIDENT' || currentUser.role === 'MEDIA_HEAD');
  const canManageAlbum = currentUser && canCreateExecutiveContent(currentUser.role);

  useEffect(() => {
    if (canManageAlbum && !isPresident) {
      listOwnAlbumIds().then(res => {
        if (res.ok && res.data) {
          setOwnedAlbumIds(new Set(res.data));
        }
      });
    }
  }, [canManageAlbum, isPresident, listOwnAlbumIds]);

  const mediaNotice = () => undefined;

  const fmtVal = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
    if (typeof v === 'object') return String(JSON.stringify(v));
    return String(v);
  };

  const albumDiffs = (op: 'add' | 'update' | 'delete', current: GalleryAlbum | null, next: GalleryAlbum): SiteEditDiff[] => {
    if (op === 'delete' && current) {
      return [{ label: 'حذف الألبوم', oldValue: current.title, newValue: 'سيتم حذف الألبوم بكامل محتوياته' }];
    }
    const rows: [string, string, unknown, unknown, boolean][] = [
      ['عنوان الألبوم', 'title', current?.title, next.title, true],
      ['التصنيف', 'categoryId', current?.categoryId ?? '', next.categoryId, false],
      ['التاريخ', 'date', current?.date ?? '', next.date, false],
      ['المكان', 'location', current?.location ?? '', next.location ?? '', true],
      ['رابط صورة الغلاف', 'coverImage', current?.coverImage ?? '', next.coverImage ?? '', true],
      ['عدد الصور', 'photoCount', current?.photoCount ?? '', next.photoCount, true],
      ['عدد الفيديوهات', 'videoCount', current?.videoCount ?? '', next.videoCount, true],
      ['الوصف', 'description', current?.description ?? '', next.description ?? '', true],
    ];
    const diffs: SiteEditDiff[] = [];
    for (const [label, path, oldV, newV, editable] of rows) {
      if (fmtVal(oldV) === fmtVal(newV)) continue;
      diffs.push({ label, path, oldValue: fmtVal(oldV), newValue: fmtVal(newV), editable });
    }
    return diffs;
  };

  const categoryDiffs = (op: 'add' | 'update' | 'delete', current: GalleryCategory | null, next: GalleryCategory): SiteEditDiff[] => {
    if (op === 'delete' && current) {
      return [{ label: 'حذف التصنيف', oldValue: current.label, newValue: 'سيتم حذف هذا التصنيف' }];
    }
    const diff: SiteEditDiff = { label: 'اسم التصنيف', path: 'label', oldValue: current?.label ?? '', newValue: next.label, editable: true };
    return op === 'add' || current?.label !== next.label ? [diff] : [];
  };

  const filtered = filter === 'all' ? galleryAlbums : galleryAlbums.filter((a) => a.categoryId === filter);
  const selectedAlbum = galleryAlbums.find((a) => a.id === selectedAlbumId) ?? null;

  // === Album CRUD ===
  const openAddAlbum = () => {
    setEditingAlbum(null);
    setAlbumTranslations({ tr: {}, en: {} });
    setAlbumForm({
      title: '', categoryId: galleryCategories[0]?.id ?? '', date: new Date().toISOString().slice(0, 10),
      location: '', coverImage: '', photoCount: 0, videoCount: 0, description: '',
    });
    setAlbumModalOpen(true);
  };

  const openEditAlbum = (album: GalleryAlbum) => {
    const canonicalAlbum = resolveCanonicalEntityById(canonicalGalleryAlbums ?? galleryAlbums, album);
    setEditingAlbum(canonicalAlbum);
    setAlbumTranslations({ tr: {}, en: {} });
    setAlbumForm({
      title: canonicalAlbum.title, categoryId: canonicalAlbum.categoryId, date: canonicalAlbum.date,
      location: canonicalAlbum.location, coverImage: canonicalAlbum.coverImage,
      photoCount: canonicalAlbum.photoCount, videoCount: canonicalAlbum.videoCount, description: canonicalAlbum.description,
    });
    setAlbumModalOpen(true);
  };

  const saveAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired({
      albumTitle: albumForm.title,
      albumCategory: albumForm.categoryId,
      albumDate: albumForm.date,
      albumLocation: albumForm.location,
      albumCover: albumForm.coverImage,
      albumDescription: albumForm.description,
    }, ['albumTitle', 'albumCategory', 'albumDate', 'albumLocation', 'albumCover', 'albumDescription'], setInvalid)) return;
    if (!albumForm.title.trim() || !albumForm.categoryId) return;
    if (editingAlbum) {
      const next: GalleryAlbum = { ...editingAlbum, ...albumForm };
      if (isPresident) {
        const saved = await savePublishedSiteTarget(
          'galleryAlbums',
          (canonicalGalleryAlbums ?? galleryAlbums).map((album) => album.id === editingAlbum.id ? next : album),
        );
        if (!saved.ok) return;
      } else if (ownedAlbumIds.has(editingAlbum.id)) {
        const saved = await updateOwnedGalleryAlbum(editingAlbum.id, next);
        if (!saved.ok) {
          alert(saved.error ?? t('admin.gallery.editFailed', 'تعذر تعديل الألبوم.'));
          return;
        }
      } else if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = albumDiffs('update', editingAlbum, next);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'gallery', pageLabel: 'معرض الصور', sectionLabel: next.title,
            target: 'galleryAlbums', op: 'update', recordId: editingAlbum.id, recordValue: next, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setAlbumModalOpen(false);
        return;
      }
    } else {
      const newAlbumId = 'album' + Date.now();
      const newAlbum: GalleryAlbum = {
        id: newAlbumId, ...albumForm, media: [], createdByRole: currentUser?.role,
      };
      if (isPresident) {
        const saved = await savePublishedSiteTarget('galleryAlbums', [newAlbum, ...(canonicalGalleryAlbums ?? galleryAlbums)]);
        if (!saved.ok) return;
        try {
          await publishCmsEntityLocales({
            repository: localizationRepo, target: 'galleryAlbums',
            canonicalPayload: [newAlbum, ...(canonicalGalleryAlbums ?? galleryAlbums)],
            recordId: newAlbumId, translations: albumTranslations,
          });
          await refreshPublishedLocalizations();
        } catch {
          alert(t('cmsLocalization.publishFailed', 'تعذر نشر الترجمة.'));
          return;
        }
      } else if (canManageAlbum) {
        const saved = await createGalleryAlbum(newAlbum);
        if (!saved.ok) {
          alert(saved.error ?? t('admin.gallery.createFailed', 'تعذر إنشاء الألبوم.'));
          return;
        }
        setOwnedAlbumIds(prev => new Set([...prev, newAlbumId]));
        // NOTE: Translation publishing for non-presidents might need a draft or is skipped here for simplicity.
        // If they want to translate, they can do it via draft if they are MEDIA_HEAD, or wait for President.
      } else if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = albumDiffs('add', null, newAlbum);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'gallery', pageLabel: 'معرض الصور', sectionLabel: newAlbum.title,
            target: 'galleryAlbums', op: 'add', recordValue: newAlbum, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setAlbumModalOpen(false);
        return;
      }
    }
    setAlbumModalOpen(false);
  };

  const deleteAlbum = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الألبوم بكامل محتوياته؟')) return;
    const current = (canonicalGalleryAlbums ?? galleryAlbums).find((a) => a.id === id);
    if (!current) return;
    if (isPresident) {
      const saved = await savePublishedSiteTarget('galleryAlbums', (canonicalGalleryAlbums ?? galleryAlbums).filter((album) => album.id !== id));
      if (!saved.ok) return;
    } else if (currentUser?.role === 'MEDIA_HEAD') {
      await submitSiteEdit({
        pageId: 'gallery', pageLabel: 'معرض الصور', sectionLabel: current.title,
        target: 'galleryAlbums', op: 'delete', recordId: id, recordValue: current,
        diffs: albumDiffs('delete', current, current),
      });
      mediaNotice();
      return;
    } else {
      alert("ليس لديك صلاحية لحذف الألبوم بالكامل.");
      return;
    }
    if (selectedAlbumId === id) setSelectedAlbumId(null);
  };

  // === Category CRUD ===
  const openAddCategory = () => {
    setEditingCategory(null);
    setCategoryTranslations({ tr: {}, en: {} });
    setCategoryForm({ label: '' });
    setCategoryModalOpen(true);
  };

  const openEditCategory = (cat: GalleryCategory) => {
    const canonicalCategory = resolveCanonicalEntityById(canonicalGalleryCategories ?? galleryCategories, cat);
    setEditingCategory(canonicalCategory);
    setCategoryTranslations({ tr: {}, en: {} });
    setCategoryForm({ label: canonicalCategory.label });
    setCategoryModalOpen(true);
  };

  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequired({ catLabel: categoryForm.label }, ['catLabel'], setInvalid)) return;
    if (!categoryForm.label.trim()) return;
    if (editingCategory) {
      const next: GalleryCategory = { ...editingCategory, ...categoryForm };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = categoryDiffs('update', editingCategory, next);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'gallery', pageLabel: 'معرض الصور', sectionLabel: next.label,
            target: 'galleryCategories', op: 'update', recordId: editingCategory.id, recordValue: next, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setCategoryModalOpen(false);
        return;
      }
      const saved = await savePublishedSiteTarget(
        'galleryCategories',
        (canonicalGalleryCategories ?? galleryCategories).map((category) => category.id === editingCategory.id ? next : category),
      );
      if (!saved.ok) return;
    } else {
      const newCatId = 'cat' + Date.now();
      const newCat: GalleryCategory = { id: newCatId, label: categoryForm.label };
      if (currentUser?.role === 'MEDIA_HEAD') {
        const diffs = categoryDiffs('add', null, newCat);
        if (diffs.length) {
          const submitted = await submitSiteEdit({
            pageId: 'gallery', pageLabel: 'معرض الصور', sectionLabel: newCat.label,
            target: 'galleryCategories', op: 'add', recordValue: newCat, diffs,
          });
          if (!submitted) return;
          mediaNotice();
        }
        setCategoryModalOpen(false);
        return;
      }
      const saved = await savePublishedSiteTarget('galleryCategories', [...(canonicalGalleryCategories ?? galleryCategories), newCat]);
      if (!saved.ok) return;

      try {
        await publishCmsEntityLocales({
          repository: localizationRepo, target: 'galleryCategories',
          canonicalPayload: [...(canonicalGalleryCategories ?? galleryCategories), newCat],
          recordId: newCatId, translations: categoryTranslations,
        });
        await refreshPublishedLocalizations();
      } catch {
        alert(t('cmsLocalization.publishFailed', 'تعذر نشر الترجمة.'));
        return;
      }
    }
    setCategoryModalOpen(false);
  };

  const deleteCategory = async (id: string) => {
    const albumsInCat = galleryAlbums.filter((a) => a.categoryId === id);
    if (albumsInCat.length > 0) {
      alert('لا يمكن حذف هذا التصنيف لأنه يحتوي على ألبومات. يرجى نقل أو حذف الألبومات أولاً.');
      return;
    }
    if (!confirm('هل أنت متأكد من حذف هذا التصنيف؟')) return;
    const current = (canonicalGalleryCategories ?? galleryCategories).find((c) => c.id === id);
    if (currentUser?.role === 'MEDIA_HEAD' && current) {
      await submitSiteEdit({
        pageId: 'gallery', pageLabel: 'معرض الصور', sectionLabel: current.label,
        target: 'galleryCategories', op: 'delete', recordId: id, recordValue: current,
        diffs: categoryDiffs('delete', current, current),
      });
      mediaNotice();
      return;
    }
    const saved = await savePublishedSiteTarget('galleryCategories', (canonicalGalleryCategories ?? galleryCategories).filter((category) => category.id !== id));
    if (!saved.ok) return;
    if (filter === id) setFilter('all');
  };

  // === Media CRUD ===
  const openAddMedia = () => {
    const newMediaId = 'media' + Date.now();
    setEditingMediaId(newMediaId);
    setMediaForm({ type: 'photo', source: 'upload', url: '', thumbnail: '', caption: '', photoUrl: '' });
    setMediaTranslations({ tr: {}, en: {} });
    setMediaModalOpen(true);
  };

  const saveMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    const mediaFields = mediaForm.type === 'video'
      ? ['mediaUrl', 'mediaThumbnail', 'mediaCaption']
      : ['mediaUrl', 'mediaCaption', 'mediaPhotoUrl'];
    if (!validateRequired({
      mediaUrl: mediaForm.url,
      mediaThumbnail: mediaForm.thumbnail,
      mediaCaption: mediaForm.caption,
      mediaPhotoUrl: mediaForm.photoUrl,
    }, mediaFields, setInvalid)) return;
    if (!mediaForm.url.trim() || !selectedAlbumId) return;
    const newMedia: GalleryMedia = {
      id: editingMediaId || ('media' + Date.now()),
      type: mediaForm.type,
      url: mediaForm.url,
      thumbnail: mediaForm.thumbnail || undefined,
      caption: mediaForm.caption || undefined,
      photoUrl: mediaForm.photoUrl.trim() || undefined,
      createdByRole: currentUser?.role,
    };
    const buildNext = (a: GalleryAlbum) => {
      const media = [...a.media, newMedia];
      return {
        ...a,
        media,
        photoCount: newMedia.type === 'photo' ? a.photoCount + 1 : a.photoCount,
        videoCount: newMedia.type === 'video' ? a.videoCount + 1 : a.videoCount,
      };
    };
    if (isPresident) {
      const nextAlbums = (canonicalGalleryAlbums ?? galleryAlbums)
        .map((album) => album.id === selectedAlbumId ? buildNext(album) : album);
      const saved = await savePublishedSiteTarget('galleryAlbums', nextAlbums);
      if (!saved.ok) return;
      try {
        await publishCmsEntityLocales({
          repository: localizationRepo, target: 'galleryAlbums', canonicalPayload: nextAlbums,
          recordId: newMedia.id, translations: mediaTranslations,
        });
        await refreshPublishedLocalizations();
      } catch {
        alert(t('cmsLocalization.publishFailed', 'تعذر نشر الترجمة.'));
        return;
      }
    } else if (ownedAlbumIds.has(selectedAlbumId)) {
      const saved = await appendOwnedGalleryMedia(selectedAlbumId, newMedia);
      if (!saved.ok) {
        alert(saved.error ?? t('admin.gallery.mediaFailed', 'تعذر حفظ الوسائط.'));
        return;
      }
    } else if (currentUser?.role === 'MEDIA_HEAD') {
      const current = (canonicalGalleryAlbums ?? galleryAlbums).find((a) => a.id === selectedAlbumId);
      if (!current) return;
      const next = buildNext(current);
      const diffs: SiteEditDiff[] = [
        { label: 'نوع الوسائط', path: 'type', oldValue: '', newValue: newMedia.type, editable: false },
        { label: 'رابط الوسائط', path: 'url', oldValue: '', newValue: newMedia.url, editable: false },
        ...(newMedia.thumbnail ? [{ label: 'الصورة المصغرة', path: 'thumbnail', oldValue: '', newValue: newMedia.thumbnail, editable: false } as SiteEditDiff] : []),
        ...(newMedia.caption ? [{ label: 'الوصف', path: 'caption', oldValue: '', newValue: newMedia.caption, editable: false } as SiteEditDiff] : []),
        ...(newMedia.photoUrl ? [{ label: 'رابط المنشور الخارجي', path: 'photoUrl', oldValue: '', newValue: newMedia.photoUrl, editable: false } as SiteEditDiff] : []),
      ];
      const submitted = await submitSiteEdit({
        pageId: 'gallery', pageLabel: 'معرض الصور', sectionLabel: current.title,
        target: 'galleryAlbums', op: 'update', recordId: current.id, recordValue: next, diffs,
        nested: { parentField: 'media', itemId: newMedia.id },
      });
      if (!submitted) return;
      mediaNotice();
    }
    setMediaModalOpen(false);
  };

  const deleteMedia = async (mediaId: string) => {
    if (!selectedAlbum) return;
    if (!confirm('هل أنت متأكد من حذف هذه الوسائط؟')) return;
    const canonicalAlbum = resolveCanonicalEntityById(canonicalGalleryAlbums ?? galleryAlbums, selectedAlbum);
    const media = canonicalAlbum.media.find((m) => m.id === mediaId);
    if (!media) return;
    const buildNext = (a: GalleryAlbum) => ({
      ...a,
      media: a.media.filter((m) => m.id !== mediaId),
      photoCount: media.type === 'photo' ? a.photoCount - 1 : a.photoCount,
      videoCount: media.type === 'video' ? a.videoCount - 1 : a.videoCount,
    });
    if (isPresident) {
      await savePublishedSiteTarget(
        'galleryAlbums',
        (canonicalGalleryAlbums ?? galleryAlbums).map((album) => album.id === canonicalAlbum.id ? buildNext(album) : album),
      );
    } else if (ownedAlbumIds.has(canonicalAlbum.id)) {
      const saved = await updateOwnedGalleryAlbum(canonicalAlbum.id, buildNext(canonicalAlbum));
      if (!saved.ok) {
        alert(saved.error ?? t('admin.gallery.mediaDeleteFailed', 'تعذر حذف الوسائط.'));
      }
    } else if (currentUser?.role === 'MEDIA_HEAD') {
      const next = buildNext(canonicalAlbum);
      const diffs: SiteEditDiff[] = [
        { label: 'حذف وسائط', oldValue: media.url, newValue: 'سيتم حذف هذه الوسائط', editable: false },
      ];
      await submitSiteEdit({
        pageId: 'gallery', pageLabel: 'معرض الصور', sectionLabel: canonicalAlbum.title,
        target: 'galleryAlbums', op: 'update', recordId: canonicalAlbum.id, recordValue: next, diffs,
        nested: { parentField: 'media', itemId: mediaId, remove: true },
      });
      mediaNotice();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-50 to-gray-50 pt-20 lg:pt-24">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-l from-navy-900 to-navy-950 py-16">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url(https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/768b3f4d-af0f-4c45-8a0c-0cb65aca4610.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="container-app relative">
          <div className="flex items-center gap-3 text-gold-400">
            <Images className="h-6 w-6" />
            <span className="text-sm font-bold tracking-wide">{t('gallery.badge')}</span>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">{t('gallery.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
            {t('gallery.description')}
          </p>
        </div>
      </div>

      <div className="container-app py-10">
        <SiteEditBanner pageId="gallery" />
        {/* Filter tabs */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-500">
            <Filter className="h-4 w-4" />
            {t('gallery.filter')}
          </div>
          <button
            onClick={() => setFilter('all')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              filter === 'all'
                ? 'bg-navy-800 text-white shadow-lg'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Images className="h-4 w-4" />
            {t('common.all')}
          </button>
          {galleryCategories.map((cat) => (
            <div key={cat.id} className="group relative">
              <button
                onClick={() => setFilter(cat.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                  filter === cat.id
                    ? 'bg-navy-800 text-white shadow-lg'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Images className="h-4 w-4" />
                {localizedCategories[cat.id] || cat.label}
              </button>
              {isPresidentOrMedia && (
                <div className="absolute -top-2 -left-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditCategory(cat); }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-navy-700 shadow ring-1 ring-gray-200 hover:bg-navy-50"
                    title={t('common.edit')}
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-rose-600 shadow ring-1 ring-gray-200 hover:bg-rose-50"
                    title={t('common.delete')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {isPresidentOrMedia && (
            <button
              onClick={openAddCategory}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-navy-300 px-3 py-2 text-xs font-bold text-navy-600 transition-colors hover:bg-navy-50"
            >
              <Plus className="h-3.5 w-3.5" /> {t('gallery.addCategory')}
            </button>
          )}
        </div>

        {/* Albums grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((album) => (
            <div
              key={album.id}
              onClick={() => setSelectedAlbumId(album.id)}
              className="group relative cursor-pointer overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-gray-100 transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="absolute left-3 top-3 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {(isPresidentOrMedia || ownedAlbumIds.has(album.id)) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditAlbum(album); }}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-navy-700 shadow backdrop-blur-sm hover:bg-white"
                    title={t('common.edit')}
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                )}
                {isPresidentOrMedia && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteAlbum(album.id); }}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-rose-600 shadow backdrop-blur-sm hover:bg-white"
                    title={t('common.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={album.coverImage}
                  alt={album.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                {album.videoCount > 0 && (
                  <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
                    <Play className="h-3 w-3" />
                    {t('gallery.videoCount', { count: album.videoCount })}
                  </div>
                )}
                <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
                  <Camera className="h-3 w-3" />
                  {t('gallery.photoCount', { count: album.photoCount })}
                </div>
                <div className="absolute bottom-0 right-0 left-0 p-4">
                  <h3 className="text-lg font-bold text-white drop-shadow-lg">{album.title}</h3>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatPublicDate(album.date, i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {album.location}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600">{album.description}</p>
              </div>
            </div>
          ))}
        </div>

        {canManageAlbum && (
          <button
            onClick={openAddAlbum}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-navy-200 px-4 py-4 text-sm font-bold text-navy-600 transition-colors hover:border-navy-300 hover:bg-navy-50"
          >
            <Plus className="h-5 w-5" /> {t('gallery.addNewAlbum')}
          </button>
        )}

        {filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-gray-400">{t('gallery.noAlbums')}</div>
        )}
      </div>

      {/* Album detail modal */}
      {selectedAlbum && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedAlbumId(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedAlbumId(null)}
              className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative aspect-video overflow-hidden rounded-t-2xl">
              <img src={selectedAlbum.coverImage} alt={selectedAlbum.title} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-0 right-0 left-0 p-6">
                <h2 className="text-2xl font-extrabold text-white drop-shadow-lg">{selectedAlbum.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-200">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatPublicDate(selectedAlbum.date, i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {selectedAlbum.location}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm leading-relaxed text-gray-600">{selectedAlbum.description}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-navy-50 px-4 py-2 text-sm font-bold text-navy-700">
                  <Camera className="h-4 w-4" />
                  {t('gallery.photoCount', { count: selectedAlbum.photoCount })}
                </div>
                {selectedAlbum.videoCount > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-2 text-sm font-bold text-sky-700">
                    <Video className="h-4 w-4" />
                    {t('gallery.videoCount', { count: selectedAlbum.videoCount })}
                  </div>
                )}
                {(isPresidentOrMedia || (selectedAlbum && ownedAlbumIds.has(selectedAlbum.id))) && (
                  <button
                    onClick={openAddMedia}
                    className="mr-auto inline-flex items-center gap-1.5 rounded-xl bg-navy-700 px-4 py-2 text-sm font-bold text-white hover:bg-navy-800"
                  >
                    <Plus className="h-4 w-4" /> {t('gallery.addMedia')}
                  </button>
                )}
              </div>

              {/* Media grid */}
              {selectedAlbum.media.length > 0 ? (
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {selectedAlbum.media.map((m) => (
                    <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100">
                      {m.type === 'photo' ? (
                        <img
                          src={m.url}
                          alt={m.caption ?? ''}
                          onClick={() => setLightboxMedia(m)}
                          className="h-full w-full cursor-pointer object-cover transition-transform duration-300 hover:scale-105"
                        />
                      ) : (
                        <div
                          onClick={() => setLightboxMedia(m)}
                          className="relative h-full w-full cursor-pointer"
                        >
                          <img src={m.thumbnail ?? m.url} alt={m.caption ?? ''} className="h-full w-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/40">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                              <Play className="h-6 w-6 text-navy-800" />
                            </div>
                          </div>
                        </div>
                      )}
                      {m.caption && (
                        <div className="absolute bottom-0 right-0 left-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-xs text-white">{m.caption}</p>
                        </div>
                      )}
                      {(isPresidentOrMedia || (selectedAlbum && ownedAlbumIds.has(selectedAlbum.id))) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteMedia(m.id); }}
                          className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-rose-600 opacity-0 shadow transition-opacity group-hover:opacity-100 hover:bg-white"
                          title="حذف"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 py-8 text-center text-sm text-gray-400">لا توجد وسائط في هذا الألبوم بعد.</div>
              )}
              <p className="mt-4 text-center text-xs text-gray-400">اضغط على الصور لعرضها بالحجم الكامل</p>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxMedia && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4"
          onClick={() => setLightboxMedia(null)}
        >
          <button
            onClick={() => setLightboxMedia(null)}
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
          {lightboxMedia.type === 'photo' ? (
            <div className="flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-4">
              <img
                src={lightboxMedia.url}
                alt={lightboxMedia.caption ?? ''}
                className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                {lightboxMedia.caption && (
                  <span className="text-sm text-gray-300">{lightboxMedia.caption}</span>
                )}
                {lightboxMedia.photoUrl && (
                  <a
                    href={lightboxMedia.photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-fuchsia-600 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105"
                  >
                    <ExternalLink className="h-4 w-4" />
                    زيارة المنشور على الانستغرام
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
              <div className="aspect-video w-full overflow-hidden rounded-lg">
                <iframe
                  src={lightboxMedia.url}
                  className="h-full w-full"
                  title={lightboxMedia.caption ?? 'video'}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Album Modal */}
      <Modal open={albumModalOpen} onClose={() => setAlbumModalOpen(false)} title={editingAlbum ? 'تعديل الألبوم' : 'إضافة ألبوم جديد'} maxWidth="max-w-lg">
        <form onSubmit={saveAlbum} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={fieldId('albumCategory')} className="label-field">التصنيف <RequiredMark /></label>
              <select
                id={fieldId('albumCategory')}
                required
                className={`input-field ${isInvalid(invalid, 'albumCategory')}`}
                value={albumForm.categoryId}
                onChange={(e) => { setAlbumForm({ ...albumForm, categoryId: e.target.value }); clearInvalid(setInvalid, 'albumCategory'); }}
              >
                <option value="">اختر تصنيفًا</option>
                {galleryCategories.map((c) => (
                  <option key={c.id} value={c.id}>{localizedCategories[c.id] || c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={fieldId('albumDate')} className="label-field">التاريخ <RequiredMark /></label>
              <input id={fieldId('albumDate')} required type="date" className={`input-field ${isInvalid(invalid, 'albumDate')}`} value={albumForm.date} onChange={(e) => { setAlbumForm({ ...albumForm, date: e.target.value }); clearInvalid(setInvalid, 'albumDate'); }} />
            </div>
          </div>
          <ManagedFileField
            usage="gallery-image"
            label="صورة غلاف الألبوم"
            currentUrl={albumForm.coverImage}
            required
            error={isInvalid(invalid, 'albumCover') ? 'يرجى رفع صورة غلاف الألبوم.' : null}
            onUpload={(file, onProgress) => uploadManagedFile('gallery-image', file, onProgress)}
            onUploaded={(asset) => {
              setAlbumForm((current) => ({ ...current, coverImage: asset.publicUrl }));
              clearInvalid(setInvalid, 'albumCover');
            }}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={fieldId('albumPhotoCount')} className="label-field">عدد الصور <RequiredMark /></label>
              <input id={fieldId('albumPhotoCount')} required type="number" min="0" className={`input-field ${isInvalid(invalid, 'albumPhotoCount')}`} value={albumForm.photoCount} onChange={(e) => { setAlbumForm({ ...albumForm, photoCount: parseInt(e.target.value) || 0 }); clearInvalid(setInvalid, 'albumPhotoCount'); }} />
            </div>
            <div>
              <label htmlFor={fieldId('albumVideoCount')} className="label-field">عدد الفيديوهات <RequiredMark /></label>
              <input id={fieldId('albumVideoCount')} required type="number" min="0" className={`input-field ${isInvalid(invalid, 'albumVideoCount')}`} value={albumForm.videoCount} onChange={(e) => { setAlbumForm({ ...albumForm, videoCount: parseInt(e.target.value) || 0 }); clearInvalid(setInvalid, 'albumVideoCount'); }} />
            </div>
          </div>

          <CmsEntityTranslationTabs
            onPublished={refreshPublishedLocalizations}
            target="galleryAlbums"
            recordId={editingAlbum?.id ?? null}
            canonicalPayload={editingAlbum ? (canonicalGalleryAlbums ?? galleryAlbums).map((a) => a.id === editingAlbum.id ? { ...a, ...albumForm } : a) : (canonicalGalleryAlbums ?? galleryAlbums)}
            fields={[
              {
                name: 'title',
                label: 'عنوان الألبوم',
                kind: 'title',
                canonicalValue: albumForm.title,
                placeholder: 'عنوان الألبوم',
              },
              {
                name: 'location',
                label: 'المكان',
                kind: 'text',
                isLocation: true,
                canonicalValue: albumForm.location,
                placeholder: 'المكان',
              },
              {
                name: 'description',
                label: 'الوصف',
                kind: 'description',
                canonicalValue: albumForm.description,
                placeholder: 'الوصف',
              },
            ]}
            canEdit={Boolean(isPresidentOrMedia)}
            canPublish={Boolean(isPresident)}
            translations={albumTranslations}
            onTranslationChange={(loc, name, val) => {
              setAlbumTranslations((prev) => ({
                ...prev,
                [loc]: { ...prev[loc], [name]: val },
              }));
            }}
          >
            <div>
              <label htmlFor={fieldId('albumTitle')} className="label-field">عنوان الألبوم <RequiredMark /></label>
              <input id={fieldId('albumTitle')} required className={`input-field ${isInvalid(invalid, 'albumTitle')}`} value={albumForm.title} onChange={(e) => { setAlbumForm({ ...albumForm, title: e.target.value }); clearInvalid(setInvalid, 'albumTitle'); }} />
            </div>
            <div>
              <label htmlFor={fieldId('albumLocation')} className="label-field">المكان <RequiredMark /></label>
              <input id={fieldId('albumLocation')} required className={`input-field ${isInvalid(invalid, 'albumLocation')}`} value={albumForm.location} onChange={(e) => { setAlbumForm({ ...albumForm, location: e.target.value }); clearInvalid(setInvalid, 'albumLocation'); }} />
            </div>
            <div>
              <label htmlFor={fieldId('albumDescription')} className="label-field">الوصف <RequiredMark /></label>
              <textarea id={fieldId('albumDescription')} required rows={2} className={`input-field resize-none ${isInvalid(invalid, 'albumDescription')}`} value={albumForm.description} onChange={(e) => { setAlbumForm({ ...albumForm, description: e.target.value }); clearInvalid(setInvalid, 'albumDescription'); }} />
            </div>
          </CmsEntityTranslationTabs>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAlbumModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> حفظ
            </button>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} title={editingCategory ? 'تعديل التصنيف' : 'إضافة تصنيف جديد'} maxWidth="max-w-sm">
        <form onSubmit={saveCategory} className="space-y-4">
          <CmsEntityTranslationTabs
            onPublished={refreshPublishedLocalizations}
            target="galleryCategories"
            recordId={editingCategory?.id ?? null}
            canonicalPayload={editingCategory ? (canonicalGalleryCategories ?? galleryCategories).map((c) => c.id === editingCategory.id ? { ...c, ...categoryForm } : c) : (canonicalGalleryCategories ?? galleryCategories)}
            fields={[
              {
                name: 'label',
                label: 'اسم التصنيف',
                kind: 'title',
                canonicalValue: categoryForm.label,
                placeholder: 'اسم التصنيف',
              },
            ]}
            canEdit={Boolean(isPresidentOrMedia)}
            canPublish={Boolean(isPresident)}
            translations={categoryTranslations}
            onTranslationChange={(loc, name, val) => {
              setCategoryTranslations((prev) => ({
                ...prev,
                [loc]: { ...prev[loc], [name]: val },
              }));
            }}
          >
            <div>
              <label htmlFor={fieldId('catLabel')} className="label-field">اسم التصنيف <RequiredMark /></label>
              <input id={fieldId('catLabel')} required className={`input-field ${isInvalid(invalid, 'catLabel')}`} value={categoryForm.label} onChange={(e) => { setCategoryForm({ label: e.target.value }); clearInvalid(setInvalid, 'catLabel'); }} placeholder="مثال: الأنشطة الرياضية" />
            </div>
          </CmsEntityTranslationTabs>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCategoryModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> حفظ
            </button>
          </div>
        </form>
      </Modal>

      {/* Media Modal */}
      <Modal open={mediaModalOpen} onClose={() => setMediaModalOpen(false)} title="إضافة صور/فيديوهات للألبوم" maxWidth="max-w-md">
        <form onSubmit={saveMedia} className="space-y-4">
          <div>
            <label className="label-field">نوع الوسائط</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMediaForm({ ...mediaForm, type: 'photo', source: 'upload', url: '', thumbnail: '' })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                  mediaForm.type === 'photo' ? 'border-navy-600 bg-navy-50 text-navy-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ImageIcon className="h-4 w-4" /> صورة
              </button>
              <button
                type="button"
                onClick={() => setMediaForm({ ...mediaForm, type: 'video', source: 'external', url: '', thumbnail: '' })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                  mediaForm.type === 'video' ? 'border-navy-600 bg-navy-50 text-navy-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Film className="h-4 w-4" /> فيديو
              </button>
            </div>
          </div>
          {mediaForm.type === 'video' && (
            <div>
              <label className="label-field">مصدر الفيديو</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMediaForm({ ...mediaForm, source: 'upload', url: '' })} className={mediaForm.source === 'upload' ? 'btn-primary' : 'btn-ghost'}>رفع فيديو</button>
                <button type="button" onClick={() => setMediaForm({ ...mediaForm, source: 'external', url: '' })} className={mediaForm.source === 'external' ? 'btn-primary' : 'btn-ghost'}>رابط YouTube / Vimeo</button>
              </div>
            </div>
          )}
          {mediaForm.type === 'photo' || mediaForm.source === 'upload' ? (
            <ManagedFileField
              usage={mediaForm.type === 'photo' ? 'gallery-image' : 'video-file'}
              label={mediaForm.type === 'photo' ? 'الصورة' : 'ملف الفيديو'}
              currentUrl={mediaForm.url}
              required
              error={isInvalid(invalid, 'mediaUrl') ? 'يرجى رفع الملف قبل الإضافة.' : null}
              onUpload={(file, onProgress) => uploadManagedFile(
                mediaForm.type === 'photo' ? 'gallery-image' : 'video-file',
                file,
                onProgress,
              )}
              onUploaded={(asset) => {
                setMediaForm((current) => ({ ...current, url: asset.publicUrl }));
                clearInvalid(setInvalid, 'mediaUrl');
              }}
            />
          ) : (
            <div>
              <label htmlFor={fieldId('mediaUrl')} className="label-field">رابط YouTube أو Vimeo <RequiredMark /></label>
              <input
                id={fieldId('mediaUrl')}
                required
                type="url"
                className={`input-field ${isInvalid(invalid, 'mediaUrl')}`}
                dir="ltr"
                placeholder="https://www.youtube.com/embed/..."
                value={mediaForm.url}
                onChange={(e) => { setMediaForm({ ...mediaForm, url: e.target.value }); clearInvalid(setInvalid, 'mediaUrl'); }}
              />
            </div>
          )}
          {mediaForm.type === 'video' && (
            <ManagedFileField
              usage="gallery-image"
              label="الصورة المصغرة للفيديو"
              currentUrl={mediaForm.thumbnail}
              required
              error={isInvalid(invalid, 'mediaThumbnail') ? 'يرجى رفع صورة مصغرة للفيديو.' : null}
              onUpload={(file, onProgress) => uploadManagedFile('gallery-image', file, onProgress)}
              onUploaded={(asset) => {
                setMediaForm((current) => ({ ...current, thumbnail: asset.publicUrl }));
                clearInvalid(setInvalid, 'mediaThumbnail');
              }}
            />
          )}
          <CmsEntityTranslationTabs
            onPublished={refreshPublishedLocalizations}
            target="galleryAlbums"
            recordId={editingMediaId || null}
            canonicalPayload={canonicalGalleryAlbums ?? galleryAlbums}
            fields={[
              {
                name: 'caption',
                label: 'تعليق / وصف',
                kind: 'description',
                canonicalValue: mediaForm.caption,
                placeholder: 'تعليق / وصف',
              },
            ]}
            canEdit={Boolean(isPresidentOrMedia)}
            canPublish={Boolean(isPresident)}
            translations={mediaTranslations}
            onTranslationChange={(loc, name, val) => {
              setMediaTranslations((prev) => ({
                ...prev,
                [loc]: { ...prev[loc], [name]: val },
              }));
            }}
          >
            <div>
              <label htmlFor={fieldId('mediaCaption')} className="label-field">تعليق / وصف <RequiredMark /></label>
              <input id={fieldId('mediaCaption')} required className={`input-field ${isInvalid(invalid, 'mediaCaption')}`} value={mediaForm.caption} onChange={(e) => { setMediaForm({ ...mediaForm, caption: e.target.value }); clearInvalid(setInvalid, 'mediaCaption'); }} />
            </div>
          </CmsEntityTranslationTabs>
          <div>
            <label htmlFor={fieldId('mediaPhotoUrl')} className="label-field">رابط المنشور (انستغرام / فيسبوك) {mediaForm.type === 'photo' ? <RequiredMark /> : <span className="text-gray-400">(اختياري للفيديو)</span>}</label>
            <div className="relative">
              <LinkIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input id={fieldId('mediaPhotoUrl')} required={mediaForm.type === 'photo'} className={`input-field pr-10 ${isInvalid(invalid, 'mediaPhotoUrl')}`} dir="ltr" placeholder="https://www.instagram.com/..." value={mediaForm.photoUrl} onChange={(e) => { setMediaForm({ ...mediaForm, photoUrl: e.target.value }); clearInvalid(setInvalid, 'mediaPhotoUrl'); }} />
            </div>
            <p className="mt-1 text-xs text-gray-400">{mediaForm.type === 'photo' ? 'إجباري: رابط منشور الصورة على انستغرام/فيسبوك. يظهر زر "زيارة المنشور" عند عرض الصورة.' : 'اختياري: رابط منشور الفيديو على انستغرام/فيسبوك.'}</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
            <LinkIcon className="h-4 w-4 shrink-0" />
            <span>الصور والفيديوهات المحلية تُرفع كملفات؛ روابط YouTube وVimeo تبقى روابط خارجية.</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setMediaModalOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> إضافة
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
