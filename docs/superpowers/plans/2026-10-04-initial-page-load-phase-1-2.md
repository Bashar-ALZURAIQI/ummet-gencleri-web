# Implementation Plan: Initial Page Load Performance (Phases 1 & 2)

## Context
This plan implements the architecture defined in `docs/superpowers/specs/2026-10-04-initial-page-load-performance-design.md`.

## Goal
Implement Phase 1 (Baseline + Route Code Splitting) and Phase 2 (Preview Runtime Network Audit) without altering any existing authentication, deep-link, or data loading behavior.

## Out of Scope (Deferred to Future Plans)
- Phase 3: Page-Scoped Data Loading
- Phase 4: Cache / Stale-While-Revalidate
- Phase 5: Asset Optimization + Bounded Prefetch
- React Router or TanStack Query
- Supabase RLS, Realtime, Edge Functions changes
- Changing application code not related to routing
- Production Merge

---

## Phase 1: Baseline + Route Code Splitting

### Step 1: Record Baseline
1. **Command**: Run `npm run build` locally.
2. **Action**: Record the size of the initial entry JS chunk, CSS, and any other generated chunks in a scratch file (or commit message).
3. **Goal**: Establish a before-measurement for the JavaScript payload.

### Step 2: Implement Code Splitting in `src/App.tsx`
1. **Target File**: `src/App.tsx`
2. **Action**: 
   - Replace static imports for page modules with `React.lazy`.
   - Retain the eager shell imports (AppProvider, Navbar, Footer, Route guard logic, InlineEditProvider, ErrorBoundary).
   - Wrap the routing switch/resolution block (where views are resolved) in a lightweight `<Suspense fallback={<RouteLoadingFallback />}>`.
   - Provide a visually consistent, lightweight fallback inside the `<main>` boundary. DO NOT wrap the whole app or Navbar/Footer.
   - Ensure the `AuthPages`, `AdminDashboard`, `StudentDashboard`, `HomePage`, `AboutPage`, `ProgramsPage`, `ContactPage`, `MediaGallery`, `NewsPage`, `StudentGuide`, `FAQPage`, `BoardPage`, and `CommitteePage` are converted to dynamic imports.
3. **Target File**: `src/components/RouteLoadingFallback.tsx` (Create a simple skeleton/localized loading message).

### Step 3: Add Architecture Verification Tests
1. **Target File**: `tests/routeCodeSplitting.test.mjs` (Create this file)
2. **Action**: 
   - Write static source tests checking `src/App.tsx` for `lazy(() => import(` patterns.
   - Assert `Suspense` wraps the view component.
   - Ensure AdminDashboard and StudentDashboard are NOT statically imported.
3. **Command**: Run `npm test` to verify the tests pass.

### Step 4: Verify Compilation & Baseline Comparison
1. **Command**: Run `npm run typecheck` and `npm run lint`.
2. **Command**: Run `npm run build`.
3. **Action**: Review the build output to ensure that individual chunk files are generated for each route, and the initial entry chunk size is materially reduced.

### Step 5: Commit Phase 1
1. **Command**: 
   ```bash
   git add src/App.tsx src/components/RouteLoadingFallback.tsx tests/routeCodeSplitting.test.mjs
   git commit -m "perf: split page routes using React.lazy and Suspense"
   ```

---

## Phase 2: Preview Runtime Network Audit

### Step 1: Push to Preview
1. **Action**: 
   - Push the branch to origin to trigger the Vercel Preview build.
2. **Command**:
   ```bash
   git push origin perf/initial-page-load
   ```

### Step 2: Runtime Measurement & Audit
1. **Action**:
   - Access the Vercel Preview URL.
   - Using browser DevTools (Network tab), measure the cold cache loads for:
     - Public Home
     - About
     - Guide
     - Student Dashboard
     - Admin Dashboard
   - Verify that deep-linking and authentication remain secure (no exposure before auth).
   - Record:
     - Total transferred bytes and JS requests.
     - DOMContentLoaded & LCP timings.
     - Major Supabase requests happening globally on first page load.
     - Images/fonts delaying the browser loading indicator.
2. **Target File**: `docs/superpowers/plans/2026-10-04-initial-page-load-phase-1-2-audit.md`
3. **Command**: 
   ```bash
   git add docs/superpowers/plans/2026-10-04-initial-page-load-phase-1-2-audit.md
   git commit -m "docs: record runtime network audit results from preview"
   git push origin perf/initial-page-load
   ```

### Step 3: Pause for Review
- Do not proceed to Phases 3-5.
- Do not merge to Production.
- Await independent review of the Preview deployment and audit results.
