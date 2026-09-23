import {
  ArrowLeft, Users, CalendarDays, GraduationCap, HeartHandshake, Sparkles, Target,
  TrendingUp, Award, BookOpen, ChevronLeft, Crown, UserCog, Megaphone, ShieldCheck,
  Wallet, Network, ExternalLink, Star, Zap, Globe, Mail, Phone, MapPin,
  CheckCircle2, Clock, FileText, Eye, Heart, Handshake, type LucideIcon,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { resolvePublicBrandName } from '../domain/publicBrand';
import { useTemporalBoundary } from '../hooks/useTemporalBoundary.ts';
import { getEffectiveEventStatus } from '../domain/eventTemporalStatus.ts';
import StatCounter from '../components/StatCounter';
import EventCard from '../components/EventCard';
import Modal from '../components/Modal';
import { EditableField, EditableCard } from '../components/InlineEditOverlay';
import { committeeMeta, type CommitteeId, type NewsItem } from '../data/mockData';
import { getExecutiveSectionLabel } from '../domain/executivePresentation';
import PublicRecognition from '../components/PublicRecognition';

const iconMap: Record<string, LucideIcon> = {
  Users, CalendarDays, GraduationCap, HeartHandshake, Target, BookOpen, Sparkles,
  TrendingUp, Award, Crown, UserCog, Megaphone, ShieldCheck, Wallet, Network,
  Star, Zap, Globe, Mail, Phone, MapPin, CheckCircle2, Clock, FileText, Eye, Heart, Handshake,
};

const committeeIcons: Record<CommitteeId, LucideIcon> = {
  presidency: Crown,
  'vice-presidency': UserCog,
  media: Megaphone,
  academic: GraduationCap,
  supervisory: ShieldCheck,
  activities: CalendarDays,
  finance: Wallet,
};

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { news, events, setView, siteContent, currentUser, canEditSection } = useApp();
  const [activeNews, setActiveNews] = useState<NewsItem | null>(null);
  const sc = siteContent;
  const brandName = resolvePublicBrandName(i18n.language, sc.brand);
  const HeroBadgeOneIcon = iconMap[sc.hero.badge1.icon ?? 'Award'] || Award;
  const HeroBadgeTwoIcon = iconMap[sc.hero.badge2.icon ?? 'TrendingUp'] || TrendingUp;
  const canEdit = !!currentUser && canEditSection('homepage');

  const nowTime = useTemporalBoundary(events.map(e => e.date));
  const effectiveEvents = useMemo(() => events.map(e => ({
    ...e,
    status: getEffectiveEventStatus(e.status, e.date, nowTime)
  })), [events, nowTime]);

  const upcoming = effectiveEvents.filter((e) => e.showOnHomepage && e.status === 'upcoming').slice(0, 3);
  const pinnedNews = news.filter((n) => n.pinnedOnHomepage).slice(0, 3);

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-950 pt-16 lg:pt-20">
        <div className="absolute inset-0">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-navy-700/40 blur-3xl" />
          <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-gold-500/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-navy-600/30 blur-3xl" />
        </div>
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
        />

        <div className="container-app relative grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div className="text-center lg:text-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold text-gold-300 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              <EditableField config={{ path: 'hero.badge', label: 'شارة الهيرو', target: 'site' }} currentValue={sc.hero.badge} canEdit={canEdit}>{sc.hero.badge}</EditableField>
            </span>
            <h1 className="dynamic-text-safe mt-6 text-4xl font-extrabold leading-tight text-white lg:text-6xl">
              <EditableField config={{ path: 'hero.title', label: 'العنوان الرئيسي', target: 'site' }} currentValue={sc.hero.title} canEdit={canEdit}>{sc.hero.title}</EditableField>
              <span className="mt-2 block bg-gradient-to-l rtl:bg-gradient-to-r from-gold-300 to-gold-500 bg-clip-text text-2xl font-bold text-transparent lg:text-3xl">
                <EditableField config={{ path: 'hero.subtitle', label: 'العنوان الفرعي', target: 'site' }} currentValue={sc.hero.subtitle} canEdit={canEdit}>{sc.hero.subtitle}</EditableField>
              </span>
            </h1>
            <p className="dynamic-text-safe mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-300 lg:mx-0 lg:text-lg">
              <EditableField config={{ path: 'hero.description', label: 'وصف الهيرو', type: 'textarea', target: 'site' }} currentValue={sc.hero.description} canEdit={canEdit}>{sc.hero.description}</EditableField>
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <button onClick={() => setView({ kind: 'programs' })} className="btn-gold w-full sm:w-auto max-w-full">
                <EditableField config={{ path: 'hero.primaryBtn', label: 'الزر الأساسي', target: 'site' }} currentValue={sc.hero.primaryBtn} canEdit={canEdit}>{sc.hero.primaryBtn}</EditableField>
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </button>
              <button
                onClick={() => setView({ kind: 'about' })}
                className="inline-flex w-full sm:w-auto max-w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10"
              >
                <EditableField config={{ path: 'hero.secondaryBtn', label: 'الزر الثانوي', target: 'site' }} currentValue={sc.hero.secondaryBtn} canEdit={canEdit}>{sc.hero.secondaryBtn}</EditableField>
              </button>
              <button
                onClick={() => setView({ kind: 'board' })}
                className="inline-flex w-full sm:w-auto max-w-full items-center justify-center gap-2 rounded-xl border border-gold-400/30 bg-gold-500/10 px-6 py-3 text-sm font-semibold text-gold-200 backdrop-blur-sm transition-all hover:bg-gold-500/20"
              >
                <EditableField config={{ path: 'hero.tertiaryBtn', label: 'الزر الثالث', target: 'site' }} currentValue={sc.hero.tertiaryBtn} canEdit={canEdit}>{sc.hero.tertiaryBtn}</EditableField>
              </button>
            </div>
          </div>

          {/* Hero visual */}
          <div className="relative hidden lg:block">
            <div className="relative mx-auto max-w-md">
              <EditableField config={{ path: 'hero.image', label: 'صورة الهيرو', type: 'image', target: 'site' }} currentValue={sc.hero.image} canEdit={canEdit}>
                <img src={sc.hero.image} alt={sc.hero.title} className="rounded-3xl border border-white/10 shadow-2xl" />
              </EditableField>
              <div className="absolute -bottom-6 -right-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-xl">
                <EditableCard
                  canEdit={canEdit}
                  config={{
                    label: 'شارة إحصائية 1',
                    target: 'site',
                    fields: [
                      { path: 'hero.badge2.value', label: 'القيمة', type: 'text' },
                      { path: 'hero.badge2.label', label: 'الوصف' },
                      { path: 'hero.badge2.icon', label: 'الأيقونة', type: 'icon' },
                    ],
                  }}
                  currentValues={{
                    'hero.badge2.value': sc.hero.badge2.value,
                    'hero.badge2.label': sc.hero.badge2.label,
                    'hero.badge2.icon': sc.hero.badge2.icon ?? 'TrendingUp',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                      <HeroBadgeTwoIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xl font-extrabold text-navy-900">{sc.hero.badge2.value}</div>
                      <div className="text-xs text-gray-500">{sc.hero.badge2.label}</div>
                    </div>
                  </div>
                </EditableCard>
              </div>
              <div className="absolute -top-6 -left-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-xl">
                <EditableCard
                  canEdit={canEdit}
                  config={{
                    label: 'شارة إحصائية 2',
                    target: 'site',
                    fields: [
                      { path: 'hero.badge1.value', label: 'القيمة', type: 'text' },
                      { path: 'hero.badge1.label', label: 'الوصف' },
                      { path: 'hero.badge1.icon', label: 'الأيقونة', type: 'icon' },
                    ],
                  }}
                  currentValues={{
                    'hero.badge1.value': sc.hero.badge1.value,
                    'hero.badge1.label': sc.hero.badge1.label,
                    'hero.badge1.icon': sc.hero.badge1.icon ?? 'Award',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-100 text-gold-600">
                      <HeroBadgeOneIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xl font-extrabold text-navy-900">{sc.hero.badge1.value}</div>
                      <div className="text-xs text-gray-500">{sc.hero.badge1.label}</div>
                    </div>
                  </div>
                </EditableCard>
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <svg className="block h-12 w-full text-gray-50 lg:h-16" viewBox="0 0 1440 80" preserveAspectRatio="none">
            <path fill="currentColor" d="M0,40 C240,80 480,0 720,32 C960,64 1200,16 1440,48 L1440,80 L0,80 Z" />
          </svg>
        </div>
      </section>

      {/* Stats */}
      <section className="container-app -mt-2 py-12">
        <div className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-4">
          {sc.stats.map((s, i) => {
            const Icon = iconMap[s.icon] || Users;
            return (
              <EditableCard
                key={i}
                canEdit={canEdit}
                config={{
                  label: `كرت إحصائي ${i + 1}`,
                  target: 'site',
                  fields: [
                    { path: `stats.${i}.value`, label: 'الرقم الإحصائي', type: 'number' },
                    { path: `stats.${i}.label`, label: 'النص التوضيحي' },
                    { path: `stats.${i}.icon`, label: 'الأيقونة', type: 'icon' },
                  ],
                }}
                currentValues={{ [`stats.${i}.value`]: String(s.value), [`stats.${i}.label`]: s.label, [`stats.${i}.icon`]: s.icon }}
              >
                <StatCounter value={s.value} label={s.label} icon={<Icon className="h-6 w-6" />} />
              </EditableCard>
            );
          })}
        </div>
      </section>

      {/* About preview */}
      <section className="container-app py-12">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="text-sm font-bold uppercase tracking-wider text-gold-600">
              <EditableField config={{ path: 'about.badge', label: 'شارة القسم', target: 'site' }} currentValue={sc.about.badge} canEdit={canEdit}>{sc.about.badge}</EditableField>
            </span>
            <h2 className="mt-3 text-3xl font-extrabold text-navy-900 lg:text-4xl">
              <EditableField config={{ path: 'about.title', label: 'عنوان القسم', target: 'site' }} currentValue={sc.about.title} canEdit={canEdit}>{sc.about.title}</EditableField>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-gray-600">
              <EditableField config={{ path: 'about.description', label: 'وصف القسم', type: 'textarea', target: 'site' }} currentValue={sc.about.description} canEdit={canEdit}>{sc.about.description}</EditableField>
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {sc.about.features.map((f, i) => {
                const Icon = iconMap[f.icon] || Sparkles;
                return (
                  <EditableCard
                    key={i}
                    canEdit={canEdit}
                    config={{
                      label: `ميزة ${i + 1}`,
                      target: 'site',
                      fields: [
                        { path: `about.features.${i}.icon`, label: 'الأيقونة', type: 'icon' },
                        { path: `about.features.${i}.title`, label: 'العنوان' },
                        { path: `about.features.${i}.desc`, label: 'الوصف', type: 'textarea' },
                      ],
                    }}
                    currentValues={{ [`about.features.${i}.icon`]: f.icon, [`about.features.${i}.title`]: f.title, [`about.features.${i}.desc`]: f.desc }}
                  >
                    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-navy-900">{f.title}</div>
                        <div className="text-xs text-gray-500">{f.desc}</div>
                      </div>
                    </div>
                  </EditableCard>
                );
              })}
            </div>
            <button
              onClick={() => setView({ kind: 'about' })}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-navy-700 hover:text-navy-900"
            >
              {t('home.readMoreAbout')}
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="relative">
            <EditableField config={{ path: 'about.image', label: 'صورة القسم', type: 'image', target: 'site' }} currentValue={sc.about.image} canEdit={canEdit}>
              <img src={sc.about.image} alt={sc.about.title} className="rounded-3xl shadow-xl" />
            </EditableField>
            <div className="absolute -bottom-5 right-5 left-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-lg sm:left-auto sm:w-64">
              <div className="text-3xl font-extrabold text-navy-900">
                <EditableField config={{ path: 'about.imageBadge.value', label: 'قيمة شارة الصورة', target: 'site' }} currentValue={sc.about.imageBadge.value} canEdit={canEdit}>{sc.about.imageBadge.value}</EditableField>
              </div>
              <div className="text-sm text-gray-500">
                <EditableField config={{ path: 'about.imageBadge.label', label: 'وصف شارة الصورة', target: 'site' }} currentValue={sc.about.imageBadge.label} canEdit={canEdit}>{sc.about.imageBadge.label}</EditableField>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming events */}
      <section className="bg-gray-50 py-16">
        <div className="container-app">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <span className="text-sm font-bold uppercase tracking-wider text-gold-600">{t('home.eventsBadge')}</span>
              <h2 className="mt-2 text-3xl font-extrabold text-navy-900 lg:text-4xl">{t('home.upcomingProgramsTitle')}</h2>
            </div>
            <button
              onClick={() => setView({ kind: 'programs' })}
              className="hidden items-center gap-1.5 text-sm font-bold text-navy-700 hover:text-navy-900 sm:inline-flex"
            >
              {t('common.viewAll')}
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      </section>

      {/* News */}
      <section className="container-app py-16">
        <div className="mb-8">
          <span className="text-sm font-bold uppercase tracking-wider text-gold-600">{t('home.newsBadge')}</span>
          <h2 className="mt-2 text-3xl font-extrabold text-navy-900 lg:text-4xl">{t('home.latestNewsTitle')}</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {pinnedNews.map((n) => (
            <article key={n.id} className="card group flex flex-col overflow-hidden transition-all hover:-translate-y-1 hover:shadow-xl">
              <div className="relative h-44 overflow-hidden">
                <img src={n.image} alt={n.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <span className="absolute top-3 end-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-navy-800 backdrop-blur-sm">{n.category}</span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="text-xs text-gray-400">{n.date}</div>
                <h3 className="mt-2 text-lg font-bold leading-snug text-navy-900 transition-colors group-hover:text-navy-700">{n.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-500">{n.excerpt}</p>
                <div className="mt-4 flex items-center gap-2">
                  <button onClick={() => setActiveNews(n)} className="inline-flex items-center gap-1.5 text-sm font-bold text-navy-700 hover:text-navy-900">
                    {t('common.readMore')}
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  </button>
                  {n.externalUrl && (
                    <a
                      href={n.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-l rtl:bg-gradient-to-r from-fuchsia-600 to-pink-500 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-transform hover:scale-105"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('news.viewSource')}
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Board preview */}
      <section className="bg-gray-50 py-16">
        <div className="container-app">
          <div className="mb-8 text-center">
            <span className="text-sm font-bold uppercase tracking-wider text-gold-600">
              <EditableField config={{ path: 'boardPreview.subtitle', label: 'شارة الهيئة', target: 'site' }} currentValue={sc.boardPreview.subtitle} canEdit={canEdit}>{sc.boardPreview.subtitle}</EditableField>
            </span>
            <h2 className="mt-2 text-3xl font-extrabold text-navy-900 lg:text-4xl">
              <EditableField config={{ path: 'boardPreview.title', label: 'عنوان الهيئة', target: 'site' }} currentValue={sc.boardPreview.title} canEdit={canEdit}>{sc.boardPreview.title}</EditableField>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500">
              <EditableField config={{ path: 'boardPreview.description', label: 'وصف الهيئة', type: 'textarea', target: 'site' }} currentValue={sc.boardPreview.description} canEdit={canEdit}>{sc.boardPreview.description}</EditableField>
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sc.boardPreview.memberIds.map((id) => {
              const cid = id as CommitteeId;
              const meta = committeeMeta[cid];
              const Icon = committeeIcons[cid];
              return (
                <button
                  key={id}
                  onClick={() => setView({ kind: 'committee', committeeId: cid })}
                  className="card group flex items-center gap-4 p-5 text-end transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${meta.color} text-white shadow-md transition-transform group-hover:scale-110`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-navy-900">{getExecutiveSectionLabel(cid, t)}</div>
                    <div className="text-xs text-gray-400">{getExecutiveSectionLabel(cid, t, 'short')}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-6 text-center">
            <button
              onClick={() => setView({ kind: 'board' })}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-navy-700 hover:text-navy-900"
            >
              {t('home.viewFullBoard')}
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </section>

      <PublicRecognition />

      {/* CTA */}
      <section className="container-app pb-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l rtl:bg-gradient-to-r from-navy-800 to-navy-950 px-6 py-12 text-center lg:px-16 lg:py-16">
          <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-gold-500/20 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-navy-500/30 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl font-extrabold text-white lg:text-4xl">{t('home.joinFamily', { brand: brandName })}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-gray-300">
              {t('home.joinDescription')}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button onClick={() => setView({ kind: 'register' })} className="btn-gold">{t('home.createAccountNow')}</button>
              <button
                onClick={() => setView({ kind: 'contact' })}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10"
              >
                {t('navigation.contact')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* News detail modal */}
      <Modal open={!!activeNews} onClose={() => setActiveNews(null)} title={activeNews?.title ?? ''} maxWidth="max-w-2xl">
        {activeNews && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl">
              <img src={activeNews.image} alt={activeNews.title} className="aspect-video w-full object-cover" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded-full bg-navy-50 px-3 py-1 font-bold text-navy-700">{activeNews.category}</span>
              <span>{activeNews.date}</span>
            </div>
            <h3 className="text-xl font-extrabold text-navy-900">{activeNews.title}</h3>
            <p className="text-sm leading-loose text-gray-600">{activeNews.excerpt}</p>
            {activeNews.fullContent && (
              <p className="text-sm leading-loose text-gray-700">{activeNews.fullContent}</p>
            )}
            {activeNews.externalUrl && (
              <a
                href={activeNews.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l rtl:bg-gradient-to-r from-fuchsia-600 to-pink-500 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-105"
              >
                <ExternalLink className="h-4 w-4" />
                {t('news.viewSource')}
              </a>
            )}
            <button onClick={() => setActiveNews(null)} className="btn-ghost">{t('common.close')}</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
