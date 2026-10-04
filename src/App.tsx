import { useEffect, Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { AppProvider, useApp } from './context/AppContext';
import { CmsLocalizationProvider } from './context/CmsLocalizationContext';
import Navbar from './components/Navbar';
import DynamicFavicon from './components/DynamicFavicon';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import RouteChunkErrorBoundary from './components/RouteChunkErrorBoundary';
import RouteLoadingFallback from './components/RouteLoadingFallback';
import { InlineEditProvider } from './components/InlineEditOverlay';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ProgramsPage = lazy(() => import('./pages/ProgramsPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const MediaGallery = lazy(() => import('./pages/MediaGallery'));
const NewsPage = lazy(() => import('./pages/NewsPage'));
const StudentGuide = lazy(() => import('./pages/StudentGuide'));
const FAQPage = lazy(() => import('./pages/FAQPage'));

const LoginPage = lazy(() =>
  import('./pages/AuthPages').then((module) => ({
    default: module.LoginPage,
  }))
);
const RegisterPage = lazy(() =>
  import('./pages/AuthPages').then((module) => ({
    default: module.RegisterPage,
  }))
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/AuthPages').then((module) => ({
    default: module.ForgotPasswordPage,
  }))
);
const UpdatePasswordPage = lazy(() =>
  import('./pages/AuthPages').then((module) => ({
    default: module.UpdatePasswordPage,
  }))
);

const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const BoardPage = lazy(() => import('./pages/BoardPage'));
const CommitteePage = lazy(() => import('./pages/CommitteePage'));
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
    } else if (destination === 'contact-inbox') {
      navigate({ kind: 'admin', tab: 'inbox' }, { replace: true });
    } else if (destination === 'guide-suggestions') {
      navigate({ kind: 'admin', tab: 'guide-suggestions' }, { replace: true });
    } else if (destination === 'student-suggestions') {
      navigate({ kind: 'admin', tab: 'suggestions' }, { replace: true });
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
          {(authInitializing || (!currentUser && identityRefreshing)) && isDashboard ? (
            <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">
              {t('auth.checkingSession')}
            </div>
          ) : (
          <RouteChunkErrorBoundary key={view.kind}>
            <Suspense fallback={<RouteLoadingFallback />}>
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
            </Suspense>
          </RouteChunkErrorBoundary>
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
