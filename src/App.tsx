import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppProvider, useApp } from './context/AppContext';
import { CmsLocalizationProvider } from './context/CmsLocalizationContext';
import Navbar from './components/Navbar';
import DynamicFavicon from './components/DynamicFavicon';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import { InlineEditProvider } from './components/InlineEditOverlay';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import ProgramsPage from './pages/ProgramsPage';
import ContactPage from './pages/ContactPage';
import MediaGallery from './pages/MediaGallery';
import NewsPage from './pages/NewsPage';
import StudentGuide from './pages/StudentGuide';
import FAQPage from './pages/FAQPage';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  UpdatePasswordPage,
} from './pages/AuthPages';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import BoardPage from './pages/BoardPage';
import CommitteePage from './pages/CommitteePage';
import { canExposeAdminUi } from './domain/liveIdentityRouting';
import { pushDestinationFromUrl } from './domain/webPushClient';
import { loadLastAdminTab } from './domain/adminTabMemory';

function Router() {
  const { t } = useTranslation();
  const {
    view,
    currentUser,
    navigate,
    updateSiteField,
    updateSiteFields,
    updateAboutField,
    updateAboutFields,
    authInitializing,
    identityRefreshing,
    realtimeWarning,
  } = useApp();

  const isAuthPage = ['login', 'register', 'forgot-password', 'update-password'].includes(view.kind);
  const isDashboard = view.kind === 'admin' || view.kind === 'student-dashboard';

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get('auth') === 'recovery') {
      navigate({ kind: 'update-password' }, { replace: true });
      return;
    }

    const destination = pushDestinationFromUrl(window.location.href);
    if (!destination) return;
    if (destination === 'admin-applications') {
      navigate({ kind: 'admin', tab: 'applications' }, { replace: true });
    } else {
      navigate({ kind: destination }, { replace: true });
    }
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('push');
    window.history.replaceState(
      window.history.state,
      '',
      `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`,
    );
  }, [navigate]);

  // Guard protected routes (admin and student dashboard)
  useEffect(() => {
    if (authInitializing || identityRefreshing) return;

    if (view.kind === 'admin') {
      if (!currentUser) {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        navigate({ kind: 'login', returnTo }, { replace: true });
      } else if (!canExposeAdminUi(currentUser.role, false, false)) {
        navigate(currentUser.role === 'STUDENT' ? { kind: 'student-dashboard' } : { kind: 'home' }, { replace: true });
      }
    } else if (view.kind === 'student-dashboard') {
      if (!currentUser) {
        navigate({ kind: 'login', returnTo: '/student' }, { replace: true });
      } else if (currentUser.role !== 'STUDENT') {
        const lastTab = loadLastAdminTab(currentUser.userId);
        navigate(canExposeAdminUi(currentUser.role, false, false) ? { kind: 'admin', ...(lastTab ? { tab: lastTab } : {}) } : { kind: 'home' }, { replace: true });
      }
    }
  }, [view, currentUser, authInitializing, identityRefreshing, navigate]);

  const adminAllowed = canExposeAdminUi(
    currentUser?.role,
    authInitializing,
    identityRefreshing,
  );

  return (
    <InlineEditProvider value={{ updateSiteField, updateSiteFields, updateAboutField, updateAboutFields }}>
      <div className="flex min-h-screen flex-col">
        <Navbar />
        {realtimeWarning && (
          <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900">
            {realtimeWarning}
          </div>
        )}
        <main className="flex-1">
          <ErrorBoundary>
          {(authInitializing || identityRefreshing) && isDashboard ? (
            <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">
              {t('auth.checkingSession')}
            </div>
          ) : (
          <>
          {view.kind === 'home' && <HomePage />}
          {view.kind === 'about' && <AboutPage />}
          {view.kind === 'programs' && <ProgramsPage />}
          {view.kind === 'contact' && <ContactPage />}
          {view.kind === 'gallery' && <MediaGallery />}
          {view.kind === 'news' && <NewsPage />}
          {view.kind === 'guide' && <StudentGuide />}
          {view.kind === 'faq' && <FAQPage />}
          {view.kind === 'login' && <LoginPage />}
          {view.kind === 'register' && <RegisterPage />}
          {view.kind === 'forgot-password' && <ForgotPasswordPage />}
          {view.kind === 'update-password' && <UpdatePasswordPage />}
          {view.kind === 'student-dashboard' && <StudentDashboard />}
          {adminAllowed && view.kind === 'admin' && <AdminDashboard />}
          {view.kind === 'board' && <BoardPage />}
          {view.kind === 'committee' && <CommitteePage committeeId={view.committeeId} />}
          </>
          )}
        </ErrorBoundary>
      </main>
      {!isAuthPage && !isDashboard && <Footer />}
    </div>
    </InlineEditProvider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <CmsLocalizationProvider>
        <DynamicFavicon />
        <Router />
      </CmsLocalizationProvider>
    </AppProvider>
  );
}
