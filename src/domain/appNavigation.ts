import type { CommitteeId, UserRole } from '../data/mockData.ts';
import type { PushDestination } from './webPushClient.ts';
import { canExposeAdminUi, routeAfterConfirmedIdentityRefresh } from './liveIdentityRouting.ts';
import { loadLastAdminTab, type StorageLike } from './adminTabMemory.ts';

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

export const COMMITTEE_IDS = [
  'presidency',
  'vice-presidency',
  'media',
  'academic',
  'supervisory',
  'activities',
  'finance',
] as const;

export function isValidCommitteeId(id: unknown): id is CommitteeId {
  return typeof id === 'string' && COMMITTEE_IDS.includes(id as CommitteeId);
}

export const ADMIN_TABS = [
  'stats',
  'board',
  'pending-edits',
  'site-pending',
  'branding',
  'history',
  'events',
  'gallery',
  'news',
  'members',
  'applications',
  'inbox',
  'plans',
  'suggestions',
  'guide-suggestions',
  'excuses',
  'oversight',
  'task-management',
  'member-points',
  'translation-monitoring',
  'profile',
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

export function isValidAdminTab(tab: unknown): tab is AdminTab {
  return typeof tab === 'string' && ADMIN_TABS.includes(tab as AdminTab);
}

export type AppView =
  | { kind: 'home' }
  | { kind: 'about' }
  | { kind: 'programs' }
  | { kind: 'contact' }
  | { kind: 'gallery' }
  | { kind: 'news' }
  | { kind: 'guide' }
  | { kind: 'faq' }
  | { kind: 'login'; returnTo?: string }
  | { kind: 'register' }
  | { kind: 'forgot-password' }
  | { kind: 'update-password' }
  | { kind: 'student-dashboard' }
  | { kind: 'admin'; tab?: AdminTab }
  | { kind: 'board' }
  | { kind: 'committee'; committeeId: CommitteeId };

export interface ParsedAppRoute {
  view: AppView;
  returnTo?: string;
  pushDestination?: PushDestination;
  isPasswordRecovery?: boolean;
}

// ---------------------------------------------------------------------------
// View <-> URL Serialization
// ---------------------------------------------------------------------------

/**
 * Serializes an AppView into a canonical URL string.
 * Machine identifiers and paths remain invariant across all locales.
 */
export function viewToUrl(view: AppView): string {
  switch (view.kind) {
    case 'home':
      return '/';
    case 'about':
      return '/about';
    case 'programs':
      return '/programs';
    case 'contact':
      return '/contact';
    case 'gallery':
      return '/gallery';
    case 'news':
      return '/news';
    case 'guide':
      return '/guide';
    case 'faq':
      return '/faq';
    case 'board':
      return '/board';
    case 'committee':
      return `/committee/${view.committeeId}`;
    case 'login': {
      if (view.returnTo) {
        const validated = validateReturnTo(view.returnTo);
        if (validated) return `/login?returnTo=${encodeURIComponent(validated)}`;
      }
      return '/login';
    }
    case 'register':
      return '/register';
    case 'forgot-password':
      return '/forgot-password';
    case 'update-password':
      return '/update-password';
    case 'student-dashboard':
      return '/student';
    case 'admin':
      return view.tab && isValidAdminTab(view.tab)
        ? `/admin?tab=${encodeURIComponent(view.tab)}`
        : '/admin';
    default:
      return '/';
  }
}

/**
 * Validates that a string is a safe, internal relative application destination.
 * Strictly blocks open-redirect vulnerabilities, external domains, protocol-relative
 * URLs, backslashes, and javascript/data injection.
 */
export function validateReturnTo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Must start with exactly one forward slash, not '//' or '/\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.includes('\\')) {
    return null;
  }

  // Reject anything containing an explicit protocol scheme (e.g. javascript:, https:, data:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, 'https://internal.app');
    if (parsed.origin !== 'https://internal.app') return null;

    const pathname = parsed.pathname;

    // Do not loop back to authentication forms
    if (
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/forgot-password' ||
      pathname === '/update-password'
    ) {
      return null;
    }

    // Verify that the internal path resolves to a valid view (not a 404/home fallback unless '/')
    const resolution = urlToView(trimmed);
    if (resolution.view.kind === 'home' && pathname !== '/') {
      return null;
    }

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

/**
 * Creates a login URL that preserves a safe internal return destination.
 */
export function createSafeLoginUrl(returnTo?: string): string {
  if (returnTo) {
    const validated = validateReturnTo(returnTo);
    if (validated) return `/login?returnTo=${encodeURIComponent(validated)}`;
  }
  return '/login';
}

/**
 * Pure parser that maps a URL or path into a deterministic ParsedAppRoute.
 * Fails closed to `{ kind: 'home' }` for unknown paths.
 */
export function urlToView(urlOrPath: string): ParsedAppRoute {
  try {
    const url = new URL(urlOrPath, 'https://site.example');

    // 1. Password recovery takes precedence if auth=recovery parameter is present
    if (url.searchParams.get('auth') === 'recovery') {
      return {
        view: { kind: 'update-password' },
        isPasswordRecovery: true,
      };
    }

    // 2. Web push destination
    const pushParam = url.searchParams.get('push');
    let pushDestination: PushDestination | undefined;
    if (pushParam === 'news' || pushParam === 'programs' || pushParam === 'gallery' || pushParam === 'admin-applications') {
      pushDestination = pushParam;
    }

    // Normalize pathname
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // Route matching
    if (pushDestination) {
      if (pushDestination === 'admin-applications') {
        return {
          view: { kind: 'admin', tab: 'applications' },
          pushDestination,
        };
      }
      return {
        view: { kind: pushDestination },
        pushDestination,
      };
    }

    if (pathname === '/') {
      return { view: { kind: 'home' } };
    }
    if (pathname === '/about') {
      return { view: { kind: 'about' } };
    }
    if (pathname === '/programs') {
      return { view: { kind: 'programs' } };
    }
    if (pathname === '/contact') {
      return { view: { kind: 'contact' } };
    }
    if (pathname === '/gallery') {
      return { view: { kind: 'gallery' } };
    }
    if (pathname === '/news') {
      return { view: { kind: 'news' } };
    }
    if (pathname === '/guide') {
      return { view: { kind: 'guide' } };
    }
    if (pathname === '/faq') {
      return { view: { kind: 'faq' } };
    }
    if (pathname === '/board') {
      return { view: { kind: 'board' } };
    }
    if (pathname === '/register') {
      return { view: { kind: 'register' } };
    }
    if (pathname === '/forgot-password') {
      return { view: { kind: 'forgot-password' } };
    }
    if (pathname === '/update-password') {
      return { view: { kind: 'update-password' } };
    }
    if (pathname === '/student' || pathname === '/student-dashboard') {
      return { view: { kind: 'student-dashboard' } };
    }

    if (pathname === '/login') {
      const rawReturn = url.searchParams.get('returnTo');
      const validated = validateReturnTo(rawReturn);
      return {
        view: { kind: 'login', ...(validated ? { returnTo: validated } : {}) },
        ...(validated ? { returnTo: validated } : {}),
      };
    }

    if (pathname === '/admin') {
      const rawTab = url.searchParams.get('tab');
      if (isValidAdminTab(rawTab)) {
        return { view: { kind: 'admin', tab: rawTab } };
      }
      return { view: { kind: 'admin' } };
    }

    if (pathname.startsWith('/committee/')) {
      const cid = pathname.slice('/committee/'.length);
      if (isValidCommitteeId(cid)) {
        return { view: { kind: 'committee', committeeId: cid } };
      }
      return { view: { kind: 'home' } };
    }

    // Fail closed
    return { view: { kind: 'home' } };
  } catch {
    return { view: { kind: 'home' } };
  }
}

// ---------------------------------------------------------------------------
// Admin Tab Resolution & Precedence
// ---------------------------------------------------------------------------

export interface ResolveAdminTabInput {
  urlTab?: string;
  requestedTab?: string;
  userId?: string;
  storage?: StorageLike;
  permittedTabs: readonly string[];
}

/**
 * Resolves the effective Admin tab strictly enforcing precedence and authorization:
 * 1. Explicit valid URL `?tab=` (if permitted for current user).
 * 2. Last remembered permitted tab from sessionStorage.
 * 3. Default permitted tab ('stats' or first visible tab).
 *
 * Never renders an unauthorized tab.
 */
export function resolveEffectiveAdminTab(input: ResolveAdminTabInput): AdminTab {
  const { userId, storage, permittedTabs } = input;
  const urlTab = input.urlTab ?? input.requestedTab;

  // 1. Explicit URL tab has highest priority (if valid and permitted)
  if (urlTab && isValidAdminTab(urlTab) && permittedTabs.includes(urlTab)) {
    return urlTab;
  }

  // 2. Remembered permitted tab from sessionStorage
  if (userId) {
    const remembered = loadLastAdminTab(userId, storage);
    if (remembered && permittedTabs.includes(remembered)) {
      return remembered;
    }
  }

  // 3. Fallback to stats if permitted
  if (permittedTabs.includes('stats')) {
    return 'stats';
  }

  // 4. First permitted tab
  if (permittedTabs[0] && isValidAdminTab(permittedTabs[0])) {
    return permittedTabs[0] as AdminTab;
  }

  return 'stats';
}

// ---------------------------------------------------------------------------
// Protected Destination Guard
// ---------------------------------------------------------------------------

export interface ProtectedDestinationInput {
  requestedView: AppView;
  currentUser: { userId: string; role: string } | null;
  authInitializing: boolean;
  identityRefreshing: boolean;
  permittedTabs: readonly string[];
}

export interface ProtectedDestinationDecision {
  isPendingAuth: boolean;
  shouldRenderProtected: boolean;
  effectiveView?: AppView;
  redirectView?: AppView;
}

/**
 * Decides whether a requested view can render or must be redirected.
 * Handles auth initialization races without protected content flash.
 */
export function resolveProtectedDestination(
  input: ProtectedDestinationInput,
): ProtectedDestinationDecision {
  const { requestedView, currentUser, authInitializing, identityRefreshing, permittedTabs } = input;

  // 1. If auth is unresolved, wait (do not render protected content or prematurely redirect)
  if (authInitializing || identityRefreshing) {
    return {
      isPendingAuth: true,
      shouldRenderProtected: false,
    };
  }

  // 2. Admin view check
  if (requestedView.kind === 'admin') {
    if (!currentUser) {
      const returnTo = viewToUrl(requestedView);
      return {
        isPendingAuth: false,
        shouldRenderProtected: false,
        redirectView: { kind: 'login', returnTo },
      };
    }

    if (!canExposeAdminUi(currentUser.role as UserRole, false, false)) {
      return {
        isPendingAuth: false,
        shouldRenderProtected: false,
        redirectView: currentUser.role === 'STUDENT'
          ? { kind: 'student-dashboard' }
          : { kind: 'home' },
      };
    }

    // User is authorized for Admin: resolve effective authorized tab
    const effectiveTab = resolveEffectiveAdminTab({
      urlTab: requestedView.tab,
      userId: currentUser.userId,
      permittedTabs,
    });

    return {
      isPendingAuth: false,
      shouldRenderProtected: true,
      effectiveView: { kind: 'admin', tab: effectiveTab },
    };
  }

  // 3. Student Dashboard check
  if (requestedView.kind === 'student-dashboard') {
    if (!currentUser) {
      return {
        isPendingAuth: false,
        shouldRenderProtected: false,
        redirectView: { kind: 'login', returnTo: '/student' },
      };
    }

    return {
      isPendingAuth: false,
      shouldRenderProtected: true,
      effectiveView: { kind: 'student-dashboard' },
    };
  }

  // 4. Public views
  return {
    isPendingAuth: false,
    shouldRenderProtected: true,
    effectiveView: requestedView,
  };
}

// ---------------------------------------------------------------------------
// Browser History Navigator Controller
// ---------------------------------------------------------------------------

export interface HistoryNavigatorOptions {
  window?: {
    location: { href: string; pathname: string; search: string; origin: string };
    history: {
      length: number;
      state: unknown;
      pushState(state: unknown, title: string, url: string): void;
      replaceState(state: unknown, title: string, url: string): void;
    };
    addEventListener(event: string, listener: () => void): void;
    removeEventListener(event: string, listener: () => void): void;
  };
  onViewChange: (view: AppView) => void;
  onUrlChange?: (url: string) => void;
}

export function createHistoryNavigator(options: HistoryNavigatorOptions) {
  const win = options.window ?? (typeof window !== 'undefined' ? window : null);
  if (!win) {
    return {
      navigate: () => {},
      cleanPushQuery: () => {},
      destroy: () => {},
    };
  }

  let isHandlingPopstate = false;

  const onPopstate = () => {
    isHandlingPopstate = true;
    try {
      const parsed = urlToView(win.location.href);
      options.onViewChange(parsed.view);
      options.onUrlChange?.(win.location.href);
    } finally {
      isHandlingPopstate = false;
    }
  };

  win.addEventListener('popstate', onPopstate);

  const navigate = (targetView: AppView, navOptions?: { replace?: boolean }) => {
    const targetUrl = viewToUrl(targetView);
    const currentPathAndSearch = `${win.location.pathname}${win.location.search}`;

    // If we're already handling popstate, just update view without pushing history
    if (isHandlingPopstate) {
      options.onViewChange(targetView);
      return;
    }

    if (navOptions?.replace) {
      win.history.replaceState(null, '', targetUrl);
    } else if (targetUrl !== currentPathAndSearch) {
      win.history.pushState(null, '', targetUrl);
    }

    options.onViewChange(targetView);
    options.onUrlChange?.(targetUrl);
  };

  const cleanPushQuery = () => {
    try {
      const currentUrl = new URL(win.location.href);
      if (currentUrl.searchParams.has('push')) {
        currentUrl.searchParams.delete('push');
        const cleanPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
        win.history.replaceState(null, '', cleanPath);
        options.onUrlChange?.(cleanPath);
      }
    } catch {
      // safe fallback
    }
  };

  const destroy = () => {
    win.removeEventListener('popstate', onPopstate);
  };

  return {
    navigate,
    cleanPushQuery,
    destroy,
  };
}

// ---------------------------------------------------------------------------
// Session Auth Navigation Controller
// ---------------------------------------------------------------------------

export type SessionNavigationIntent =
  | 'explicit-login'
  | 'initial'
  | 'passive'
  | { previousRole: string };

export interface SessionAuthNavigationInput {
  currentUrl: string;
  confirmedUser: { userId: string; role: string } | null;
  navigationIntent: SessionNavigationIntent | boolean;
  lastAdminTab?: string | null;
}

export interface SessionAuthNavigationDecision {
  shouldNavigate: boolean;
  targetView?: AppView;
  replace?: boolean;
}

/**
 * Resolves whether an authentication event should trigger navigation.
 * Core Contract: AUTHENTICATION EVENT != NAVIGATION INTENT.
 * Passive background auth events (token refresh, tab refocus, replayed SIGNED_IN)
 * MUST NEVER hijack an authenticated user's current public route.
 */
export function resolveSessionAuthNavigation(
  input: SessionAuthNavigationInput,
): SessionAuthNavigationDecision {
  const { currentUrl, confirmedUser, lastAdminTab } = input;
  const intent = input.navigationIntent === true
    ? 'explicit-login'
    : input.navigationIntent === false
    ? 'passive'
    : input.navigationIntent;

  const currentParsed = urlToView(currentUrl);

  if (!confirmedUser) {
    return { shouldNavigate: false };
  }

  const role = confirmedUser.role as UserRole;
  const isExecutive = canExposeAdminUi(role, false, false);
  const isStudent = role === 'STUDENT';

  // 1. Explicit Login Intent:
  // Fired strictly when a user submits credentials in the login form or completes registration.
  if (intent === 'explicit-login') {
    let returnTo: string | undefined;
    if (currentParsed.view.kind === 'login' && currentParsed.returnTo) {
      returnTo = currentParsed.returnTo;
    }

    if (returnTo) {
      const validated = validateReturnTo(returnTo);
      if (validated) {
        const target = urlToView(validated);
        if (target.view.kind === 'admin') {
          if (isExecutive) {
            return {
              shouldNavigate: true,
              targetView: target.view,
              replace: true,
            };
          } else {
            return {
              shouldNavigate: true,
              targetView: isStudent ? { kind: 'student-dashboard' } : { kind: 'home' },
              replace: true,
            };
          }
        } else if (target.view.kind === 'student-dashboard') {
          if (isStudent) {
            return {
              shouldNavigate: true,
              targetView: { kind: 'student-dashboard' },
              replace: true,
            };
          } else {
            return {
              shouldNavigate: true,
              targetView: isExecutive
                ? { kind: 'admin', ...(lastAdminTab && isValidAdminTab(lastAdminTab) ? { tab: lastAdminTab as AdminTab } : {}) }
                : { kind: 'home' },
              replace: true,
            };
          }
        } else {
          return {
            shouldNavigate: true,
            targetView: target.view,
            replace: true,
          };
        }
      }
    }

    // Default post-login routing without returnTo
    if (isStudent) {
      return {
        shouldNavigate: true,
        targetView: { kind: 'student-dashboard' },
      };
    }

    if (isExecutive) {
      return {
        shouldNavigate: true,
        targetView: {
          kind: 'admin',
          ...(lastAdminTab && isValidAdminTab(lastAdminTab) ? { tab: lastAdminTab as AdminTab } : {}),
        },
      };
    }

    return {
      shouldNavigate: true,
      targetView: { kind: 'home' },
    };
  }

  // 2. Initial Session or Passive Background Auth:
  // Public pages must NEVER be hijacked by passive auth events or initial restore!
  if (intent === 'initial' || intent === 'passive') {
    if (currentParsed.view.kind === 'admin') {
      if (isExecutive) {
        if (intent === 'initial') {
          const currentTab = currentParsed.view.tab;
          return {
            shouldNavigate: true,
            targetView: { kind: 'admin', ...(currentTab ? { tab: currentTab } : {}) },
            replace: true,
          };
        }
        return { shouldNavigate: false };
      } else {
        return {
          shouldNavigate: true,
          targetView: isStudent ? { kind: 'student-dashboard' } : { kind: 'home' },
          replace: true,
        };
      }
    }

    if (currentParsed.view.kind === 'student-dashboard') {
      if (!isStudent) {
        return {
          shouldNavigate: true,
          targetView: isExecutive
            ? { kind: 'admin', ...(lastAdminTab && isValidAdminTab(lastAdminTab) ? { tab: lastAdminTab as AdminTab } : {}) }
            : { kind: 'home' },
          replace: true,
        };
      }
      return { shouldNavigate: false };
    }

    if (intent === 'initial' && currentParsed.view.kind === 'login' && currentParsed.returnTo) {
      const validated = validateReturnTo(currentParsed.returnTo);
      if (validated) {
        const target = urlToView(validated);
        if (target.view.kind === 'admin') {
          if (isExecutive) {
            return {
              shouldNavigate: true,
              targetView: target.view,
              replace: true,
            };
          } else {
            return {
              shouldNavigate: true,
              targetView: isStudent ? { kind: 'student-dashboard' } : { kind: 'home' },
              replace: true,
            };
          }
        } else {
          return {
            shouldNavigate: true,
            targetView: target.view,
            replace: true,
          };
        }
      }
    }

    // Public routes (/news, /about, /programs, /contact, /gallery, /guide, /faq, /board, etc.) remain intact
    return { shouldNavigate: false };
  }

  // 3. Role refresh intent ({ previousRole })
  if (typeof intent === 'object' && 'previousRole' in intent) {
    const nextKind = routeAfterConfirmedIdentityRefresh(
      intent.previousRole as UserRole,
      role,
      currentParsed.view.kind,
    );
    if (nextKind !== currentParsed.view.kind) {
      if (nextKind === 'admin') {
        return {
          shouldNavigate: true,
          targetView: {
            kind: 'admin',
            ...(lastAdminTab && isValidAdminTab(lastAdminTab) ? { tab: lastAdminTab as AdminTab } : {}),
          },
          replace: true,
        };
      }
      if (nextKind === 'student-dashboard') {
        return {
          shouldNavigate: true,
          targetView: { kind: 'student-dashboard' },
          replace: true,
        };
      }
    }
  }

  return { shouldNavigate: false };
}
