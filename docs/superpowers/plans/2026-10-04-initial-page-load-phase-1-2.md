# Initial Page Load Phase 1-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the initial JavaScript dependency graph by lazy-loading route modules, preserve all routing/auth behavior, and collect before/after runtime evidence from a Preview deployment.

**Architecture:** Preserve the existing custom View-based router and global auth/session boundary. Convert page modules to React.lazy route chunks behind a main-content Suspense boundary while leaving the shell eager, then measure bundle/network behavior before deciding any data-layer optimization.

**Tech Stack:** React 18, TypeScript, Vite 5, node:test, Vercel Preview, existing custom appNavigation routing.

**Spec:** docs/superpowers/specs/2026-10-04-initial-page-load-performance-design.md

## GLOBAL CONSTRAINTS
- Do not replace the custom router with React Router.
- Do not add TanStack Query.
- Do not add any new production dependency in Phase 1-2.
- Do not change Supabase schema.
- Do not change RLS.
- Do not enable Realtime.
- Do not modify Edge Functions.
- Do not change suggestion architecture.
- Do not change authentication semantics.
- Do not rewrite AppContext.
- Do not move global data fetching in Phase 1.
- Do not optimize images before runtime evidence proves they are a bottleneck.
- Do not prefetch all routes.
- Do not merge Production during Phase 1-2.
- Preview only.
- Existing protected route behavior must remain fail-closed.
- Existing deep-link, password recovery, returnTo, and push routing must remain unchanged.
- Current lint baseline is 9 errors / 0 warnings.
- Non-zero lint must never be reported as PASS.

## REVIEW FOCUS (Risks)
1. F5/direct load on /admin or /student must not expose protected UI before auth resolves.
2. AuthPages uses named exports; lazy wrappers must preserve all four auth pages without eager imports.
3. Suspense covers only route content; Navbar/shell remains visible.
4. Lazy chunk failure must show a finite reload path, not an infinite spinner.
5. Build/runtime evidence must prove AdminDashboard and StudentDashboard are absent from anonymous Home initial loading.

---

## TASK 1 — BASELINE
- [ ] Create `docs/performance/2026-10-04-initial-page-load-baseline.md`.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm run lint`.
- [ ] Record branch/SHA/status, exact lint errors/warnings, entry JS, CSS, generated chunk list, largest chunks, total JS bytes in the baseline doc.
- [ ] Record cold/warm runtime metrics where available (Home, F5 Home, Guide, F5 Guide, anonymous Admin, anonymous Student): request count, transferred bytes, DOMContentLoaded, load, FCP, LCP, last resource, visible Supabase requests, image/font requests. For unavailable metrics, write: NOT AVAILABLE.
- [ ] Commit with message: `docs: capture initial page load baseline`

## TASK 2 — FAILING ROUTE SPLITTING CONTRACT TEST
- [ ] Create `tests/routeCodeSplitting.test.mjs`.
- [ ] Write a test asserting no eager imports for: HomePage, AboutPage, ProgramsPage, ContactPage, MediaGallery, NewsPage, StudentGuide, FAQPage, AuthPages, StudentDashboard, AdminDashboard, BoardPage, CommitteePage.
- [ ] Assert dynamic imports exist in `src/App.tsx`.
- [ ] Assert `Suspense` exists in main route content in `src/App.tsx`.
- [ ] Assert `AdminDashboard` and `StudentDashboard` use dynamic import in `src/App.tsx`.
- [ ] Run expected failing test: `node --test tests/routeCodeSplitting.test.mjs`. Must FAIL before implementation.
- [ ] Commit with message: `test: define route code splitting contract`

## TASK 3 — ROUTE LOADING FALLBACK
- [ ] Create `src/components/RouteLoadingFallback.tsx`. Requirements: `role="status"`, lightweight, no images, no large animation dependency, no full-screen overlay, stable min-height.
- [ ] Modify `src/i18n/locales/ar.ts` to add `common.loadingPage`: `جارٍ تحميل الصفحة...`
- [ ] Modify `src/i18n/locales/tr.ts` to add `common.loadingPage`: `Sayfa yükleniyor...`
- [ ] Modify `src/i18n/locales/en.ts` to add `common.loadingPage`: `Loading page...`
- [ ] Add focused test for `RouteLoadingFallback`.
- [ ] Commit with message: `feat: add scoped route loading fallback`

## TASK 4 — ROUTE CHUNK ERROR RECOVERY
- [ ] Create `src/components/RouteChunkErrorBoundary.tsx` with interface `RouteChunkErrorBoundaryProps { children: React.ReactNode; }`. Requirements: catch lazy/route rendering errors, visible localized error, one recovery action (`window.location.reload()`), no automatic retry, no interval. Route navigation can mount a fresh boundary (used later in App.tsx with `key={view.kind}`).
- [ ] Modify `src/i18n/locales/ar.ts` to add `common.routeLoadError` (`تعذر تحميل هذه الصفحة. تحقق من اتصالك ثم أعد تحميل الصفحة.`) and `common.reloadPage` (`إعادة تحميل الصفحة`).
- [ ] Modify `src/i18n/locales/tr.ts` to add `common.routeLoadError` (`Bu sayfa yüklenemedi. Bağlantınızı kontrol edip sayfayı yeniden yükleyin.`) and `common.reloadPage` (`Sayfayı yeniden yükle`).
- [ ] Modify `src/i18n/locales/en.ts` to add `common.routeLoadError` (`This page could not be loaded. Check your connection and reload the page.`) and `common.reloadPage` (`Reload page`).
- [ ] Add focused test proving: reload action exists, no automatic retry loop, translations exist.
- [ ] Commit with message: `feat: add route chunk load recovery`

## TASK 5 — CONVERT ROUTES TO REACT.LAZY
- [ ] Modify `src/App.tsx` to use `lazy` and `Suspense`. Default exports use `const HomePage = lazy(() => import('./pages/HomePage'));` equivalent.
- [ ] Use named export wrapping for `AuthPages`:
  ```typescript
  const LoginPage = lazy(() =>
    import('./pages/AuthPages').then((module) => ({
      default: module.LoginPage,
    }))
  );
  ```
  Equivalent for `RegisterPage`, `ForgotPasswordPage`, `UpdatePasswordPage`.
- [ ] Ensure shell is kept eager.
- [ ] Implement required nesting inside main: `ErrorBoundary` → existing dashboard auth pending decision → `RouteChunkErrorBoundary key={view.kind}` → `Suspense fallback={<RouteLoadingFallback />}` → existing `view.kind` routing.
- [ ] Ensure no changes to route conditions, navigation effects, AppProvider.
- [ ] Ensure `AdminDashboard` condition remains: `adminAllowed && view.kind === 'admin'`.
- [ ] Run focused verification: `node --test tests/routeCodeSplitting.test.mjs`, `node --test tests/appNavigation.test.mjs`, `node --test tests/protectedDeepLinkRouting.test.mjs`.
- [ ] Run broader verification: `npm run typecheck`, `npm run build`, `npm test`.
- [ ] Commit with message: `perf: lazy load route modules`

## TASK 6 — PHASE 1 BUILD RESULTS
- [ ] Create `docs/performance/2026-10-04-initial-page-load-phase1-results.md`.
- [ ] Compare baseline vs after for: entry JS, total JS, route chunks, AdminDashboard chunk, StudentDashboard chunk, HomePage chunk, Guide chunk, AuthPages chunk (if grouped naturally).
- [ ] Verify: multiple route chunks, Admin and Student separate/on-demand, entry JS reduced OR exact reason documented.
- [ ] Run broader verification: `git diff --check`, `npm test`, `npm run typecheck`, `npm run build`, `npm run lint`.
- [ ] Record exact lint errors and warnings.
- [ ] Commit with message: `docs: record route splitting build results`

## TASK 7 — PREVIEW + RUNTIME NETWORK AUDIT
- [ ] Push branch: `perf/initial-page-load`.
- [ ] Wait for real Vercel Preview.
- [ ] Measure runtime networks for the following:
  - 1. cold anonymous Home
  - 2. F5 Home
  - 3. Home -> Guide first visit
  - 4. Guide -> Home
  - 5. Guide -> Home -> Guide again
  - 6. F5 Guide
  - 7. anonymous Home: AdminDashboard chunk requested YES/NO
  - 8. anonymous Home: StudentDashboard chunk requested YES/NO
  - 9. anonymous Home: Guide chunk requested before navigation YES/NO
  - 10. anonymous Home: Gallery chunk requested before navigation YES/NO
  - 11. direct anonymous /admin
  - 12. direct anonymous /student
- [ ] Measure safe authenticated accounts if exist (Student Dashboard, Admin Dashboard). Otherwise note NOT PERFORMED.
- [ ] Differentiate module/memory reuse, HTTP cache reuse, fresh transfer.
- [ ] Capture requests, transferred bytes, DOMContentLoaded, load, FCP, LCP, last resource holding loading indicator. No code modifications in this task.

## TASK 8 — WRITE NETWORK AUDIT AND STOP
- [ ] Create `docs/performance/2026-10-04-initial-page-load-network-audit.md`.
- [ ] Write the document including: baseline SHA/URL, optimized Preview SHA/URL, before/after table, route chunk request behavior, Home transferred JS difference, F5 behavior, browser tab spinner behavior, Supabase requests on Home, images/fonts on Home, last significant load resource, ranked remaining bottleneck.
- [ ] Classify next bottleneck as one of: A. GLOBAL DATA REQUESTS, B. IMAGE/STATIC ASSETS, C. FONT/THIRD-PARTY RESOURCE, D. AUTH/SESSION INITIALIZATION, E. ENTRY SHARED BUNDLE, F. NO MATERIAL REMAINING BOTTLENECK.
- [ ] Ensure Phase 3-5 is NOT implemented.
- [ ] Commit with message: `docs: audit preview initial load network`
- [ ] Push branch.
