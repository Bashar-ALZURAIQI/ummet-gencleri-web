import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Menu, X, ChevronDown, Shield, Home, Info, CalendarDays, Mail,
  LogIn, LogOut, LayoutDashboard, Crown, UserCog, Megaphone, GraduationCap,
  ShieldCheck, Wallet, Network, Images, BookOpen, HelpCircle, Newspaper,
} from 'lucide-react';
import { useApp, type View } from '../context/AppContext';
import { committeeMeta, committeeOrder, type CommitteeId } from '../data/mockData';
import { EditableCard } from './InlineEditOverlay';
import UserAvatar from './UserAvatar';
import BrandMark from './BrandMark';
import LanguageSwitcher from './LanguageSwitcher';
import { canExposeAdminUi } from '../domain/liveIdentityRouting';
import { resolvePublicBrandName } from '../domain/publicBrand';
import { splitNavLabel } from '../domain/navLabel';
import { getExecutiveSectionLabel } from '../domain/executivePresentation';
import { loadLastAdminTab } from '../domain/adminTabMemory';

const committeeIcons: Record<CommitteeId, typeof Crown> = {
  presidency: Crown,
  'vice-presidency': UserCog,
  media: Megaphone,
  academic: GraduationCap,
  supervisory: ShieldCheck,
  activities: CalendarDays,
  finance: Wallet,
};

export function NavLabel({ label }: { label: string }) {
  const lines = splitNavLabel(label);
  if (lines.length <= 1) {
    return <span className="whitespace-nowrap">{lines[0] || label}</span>;
  }
  return (
    <span className="flex flex-col items-center justify-center text-center leading-tight">
      {lines.map((line, idx) => (
        <span key={idx} className="whitespace-nowrap">
          {line}
        </span>
      ))}
    </span>
  );
}

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const {
    view,
    navigate,
    currentUser,
    logout,
    siteContent,
    committees,
    canEditSection,
    authInitializing,
    identityRefreshing,
  } = useApp();
  const adminUiAllowed = canExposeAdminUi(currentUser?.role, authInitializing, identityRefreshing);
  const canEdit = !!currentUser && canEditSection('homepage');
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const navItems: { label: string; view: View; icon: typeof Home }[] = [
    { label: t('navigation.home'), view: { kind: 'home' }, icon: Home },
    { label: t('navigation.about'), view: { kind: 'about' }, icon: Info },
    { label: t('navigation.programs'), view: { kind: 'programs' }, icon: CalendarDays },
    { label: t('navigation.gallery'), view: { kind: 'gallery' }, icon: Images },
    { label: t('navigation.news'), view: { kind: 'news' }, icon: Newspaper },
    { label: t('navigation.guide'), view: { kind: 'guide' }, icon: BookOpen },
    { label: t('navigation.faq'), view: { kind: 'faq' }, icon: HelpCircle },
    { label: t('navigation.contact'), view: { kind: 'contact' }, icon: Mail },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (v: View) => v.kind === view.kind;
  const isBoardActive =
    view.kind === 'board' || view.kind === 'committee';

  const go = (v: View) => {
    navigate(v);
    setMobileOpen(false);
    setBoardOpen(false);
    setProfileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goAdmin = () => {
    const lastTab = currentUser?.userId ? loadLastAdminTab(currentUser.userId) : null;
    go({ kind: 'admin', ...(lastTab ? { tab: lastTab } : {}) });
  };

  const goStudentPortal = () => {
    if (authInitializing || identityRefreshing) return;
    if (currentUser?.role === 'STUDENT') go({ kind: 'student-dashboard' });
    else if (adminUiAllowed) goAdmin();
    else go({ kind: 'login' });
  };

  const roleLabel = (role: string, committee?: CommitteeId) => {
    if (role === 'PRESIDENT') return t('roles.unionPresident');
    if (role === 'VICE_PRESIDENT') return t('roles.vicePresident');
    if (committee && committeeMeta[committee]) {
      const localizedShortName = getExecutiveSectionLabel(committee, t, 'short') || committeeMeta[committee].shortName;
      return t('roles.committeeOfficer', { committee: localizedShortName });
    }
    return t('roles.member');
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 shadow-md backdrop-blur-md'
          : 'bg-white/80 backdrop-blur-sm'
      }`}
    >
      <nav className="container-app flex h-16 items-center justify-between lg:h-20 2xl:max-w-[90rem]">
        {/* Logo */}
        <button
          onClick={() => go({ kind: 'home' })}
          className="flex min-w-0 flex-1 items-center gap-2.5 transition-transform hover:scale-[1.02] sm:gap-3"
        >
          <BrandMark
            logoUrl={siteContent.brand.logoUrl}
            logoIcon={siteContent.brand.logoIcon}
          />
          <EditableCard
            className="min-w-0"
            canEdit={canEdit}
            config={{
              label: 'اسم الاتحاد',
              target: 'site',
              fields: [
                { path: 'brand.name', label: 'الاسم بالعربي' },
                { path: 'brand.nameTr', label: 'الاسم باللاتيني' },
              ],
            }}
            currentValues={{ 'brand.name': siteContent.brand.name, 'brand.nameTr': siteContent.brand.nameTr }}
          >
            <div className="text-start min-w-0 whitespace-nowrap">
              <div className="truncate text-sm font-extrabold leading-tight text-navy-900 sm:text-base lg:text-lg">
                {resolvePublicBrandName(i18n.language, siteContent.brand)}
              </div>
              {i18n.language === 'ar' && (
                <div className="truncate text-[10px] font-medium text-gray-500 lg:text-xs">
                  {siteContent.brand.nameTr}
                </div>
              )}
            </div>
          </EditableCard>
        </button>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 xl:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.view);
            return (
              <button
                key={item.label}
                onClick={() => go(item.view)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-all xl:px-3 xl:text-sm ${
                  active
                    ? 'bg-navy-50 text-navy-800'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-navy-700'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <NavLabel label={item.label} />
              </button>
            );
          })}

          {/* Board dropdown */}
          <div className="relative">
            <button
              onClick={() => setBoardOpen((o) => !o)}
              onBlur={() => setTimeout(() => setBoardOpen(false), 150)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-all xl:px-3 xl:text-sm ${
                isBoardActive
                  ? 'bg-navy-50 text-navy-800'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-navy-700'
              }`}
            >
              <Network className="h-4 w-4 shrink-0" />
              <NavLabel label={t('navigation.executiveBoard')} />
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${boardOpen ? 'rotate-180' : ''}`} />
            </button>
            {boardOpen && (
              <div className="absolute left-1/2 top-full mt-2 w-64 -translate-x-1/2 animate-scale-in rounded-2xl border border-gray-100 bg-white p-2 shadow-xl">
                <button
                  onMouseDown={() => go({ kind: 'board' })}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-bold text-navy-900 transition-colors hover:bg-navy-50"
                >
                  <Network className="h-4 w-4 text-navy-600 shrink-0" />
                  {t('navigation.executiveBoardOverview')}
                </button>
                <div className="my-1 h-px bg-gray-100" />
                {committeeOrder.map((id) => {
                  const Icon = committeeIcons[id];
                  const c = committees.find((x) => x.id === id);
                  return (
                    <button
                      key={id}
                      onMouseDown={() => go({ kind: 'committee', committeeId: id })}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm font-medium text-gray-700 transition-colors hover:bg-navy-50 hover:text-navy-800"
                    >
                      <Icon className="h-4 w-4 text-navy-500 shrink-0" />
                      {getExecutiveSectionLabel(id, t) || c?.name || committeeMeta[id].name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Student portal direct button */}
          <button
            onClick={goStudentPortal}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-all xl:px-3 xl:text-sm ${
              ['student-dashboard', 'login', 'register', 'forgot-password', 'update-password'].includes(view.kind)
                ? 'bg-navy-50 text-navy-800'
                : 'text-gray-600 hover:bg-gray-50 hover:text-navy-700'
            }`}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <NavLabel label={t('dashboard.studentPortal')} />
          </button>
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher variant="desktop" />
          {currentUser ? (
            /* Profile dropdown (logged in) */
            <div className="relative hidden sm:block">
              <button
                onClick={() => setProfileOpen((o) => !o)}
                onBlur={() => setTimeout(() => setProfileOpen(false), 150)}
                className="flex items-center gap-2 rounded-xl bg-navy-50 px-3 py-2 text-sm font-semibold text-navy-800 transition-colors hover:bg-navy-100"
              >
                <UserAvatar
                  name={currentUser.name}
                  photo={currentUser.photo}
                  avatarPath={currentUser.avatarPath}
                  updatedAt={currentUser.updatedAt}
                  className="h-7 w-7"
                  fallbackClassName={currentUser.role === 'PRESIDENT' ? 'bg-gold-500 text-xs text-navy-950' : 'bg-navy-700 text-xs text-white'}
                />
                {(currentUser.name || '').split(' ')[0] || t('common.user')}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>
              {profileOpen && (
                <div className="absolute end-0 top-full mt-2 w-60 animate-scale-in rounded-2xl border border-gray-100 bg-white p-2 shadow-xl">
                  <div className="border-b border-gray-100 px-3 py-2.5">
                    <div className="text-sm font-bold text-navy-900">{currentUser.name}</div>
                    <div className="text-[11px] text-gray-400">{roleLabel(currentUser.role, currentUser.committee)}</div>
                  </div>
                  <div className="mt-1">
                    {adminUiAllowed && (
                      <button
                        onMouseDown={goAdmin}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-bold text-navy-900 transition-colors hover:bg-navy-50"
                      >
                        <Shield className="h-4 w-4 text-navy-600" />
                        {t('admin.adminDashboard')}
                      </button>
                    )}
                    {currentUser.role === 'STUDENT' && (
                      <button
                        onMouseDown={() => go({ kind: 'student-dashboard' })}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium text-gray-700 transition-colors hover:bg-navy-50 hover:text-navy-800"
                      >
                        <LayoutDashboard className="h-4 w-4 text-navy-600" />
                        {t('dashboard.studentPortal')}
                      </button>
                    )}
                    <button
                      onMouseDown={() => { logout(); setProfileOpen(false); }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" />
                      {t('auth.logout')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => go({ kind: 'login' })}
              className="flex items-center gap-1 sm:gap-1.5 rounded-xl bg-navy-800 px-2.5 py-2 sm:px-4 sm:py-2 text-[11px] sm:text-sm font-bold sm:font-semibold whitespace-nowrap text-white shadow-md shadow-navy-900/20 transition-all hover:bg-navy-700 sm:flex"
            >
              <LogIn className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              {t('auth.login')}
            </button>
          )}

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-navy-800 xl:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="animate-fade-in-fast max-h-[80vh] overflow-y-auto border-t border-gray-100 bg-white xl:hidden">
          <div className="container-app space-y-1 py-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.view);
              return (
                <button
                  key={item.label}
                  onClick={() => go(item.view)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                    active ? 'bg-navy-50 text-navy-800' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
            <div className="my-1 h-px bg-gray-100" />
            <button
              onClick={() => go({ kind: 'board' })}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${isBoardActive ? 'bg-navy-50 text-navy-800' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <Network className="h-5 w-5" />
              {t('navigation.executiveBoard')}
            </button>
            {committeeOrder.map((id) => {
              const Icon = committeeIcons[id];
              const c = committees.find((x) => x.id === id);
              return (
                <button
                  key={id}
                  onClick={() => go({ kind: 'committee', committeeId: id })}
                  className="flex w-full items-center gap-3 rounded-xl ps-10 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <Icon className="h-4 w-4 text-navy-500" />
                  {getExecutiveSectionLabel(id, t) || c?.name || committeeMeta[id].name}
                </button>
              );
            })}
            <div className="my-1 h-px bg-gray-100" />
            <button
              onClick={goStudentPortal}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <LayoutDashboard className="h-5 w-5" />
              {t('dashboard.studentPortal')}
            </button>
            {!currentUser && (
              <button
                onClick={() => go({ kind: 'login' })}
                className="flex w-full items-center gap-3 rounded-xl bg-navy-800 px-4 py-3 text-sm font-semibold text-white hover:bg-navy-700"
              >
                <LogIn className="h-5 w-5" />
                {t('auth.login')}
              </button>
            )}
            {currentUser && adminUiAllowed && (
              <button
                onClick={goAdmin}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-navy-800 hover:bg-navy-50"
              >
                <Shield className="h-5 w-5" />
                {t('admin.adminDashboard')}
              </button>
            )}

            {currentUser && (
              <button
                onClick={() => { logout(); setMobileOpen(false); }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600"
              >
                <LogOut className="h-4 w-4" />
                {t('auth.logout')}
              </button>
            )}

            <div className="my-2 h-px bg-gray-100" />
            <LanguageSwitcher variant="mobile" onSelect={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}
