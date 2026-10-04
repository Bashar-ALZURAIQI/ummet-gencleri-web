# Initial Page Load Performance Architecture

## 1. Purpose

The production site currently feels heavy during initial navigation and browser refresh.

The required user experience is:
- opening the site should load only the application shell and the current page
- visiting another page should load that page only when needed
- returning to a page already visited in the same session should reuse its already-loaded JavaScript module instead of downloading it again
- refreshing a route should not require downloading unrelated route modules
- public users must not download AdminDashboard or StudentDashboard code unless those routes are actually required
- the browser's loading indicator should settle substantially earlier
- navigation, authentication, deep links, inline editing, and current security behavior must remain unchanged

This work is performance architecture, not a visual redesign.

## 2. Confirmed Current Architecture

The application currently uses a custom view-based router inside `src/App.tsx`.

Route pages are statically imported at module load, including:
- HomePage
- AboutPage
- ProgramsPage
- ContactPage
- MediaGallery
- NewsPage
- StudentGuide
- FAQPage
- AuthPages
- StudentDashboard
- AdminDashboard
- BoardPage
- CommitteePage

Although only one page is rendered according to `view.kind`, static imports place those modules in the initial dependency graph.

The project uses React 18 + Vite.

`vite.config.ts` currently has no application-level chunking strategy beyond Vite's defaults.

The project does not currently use React Router or TanStack Query.

The existing custom routing/navigation architecture must be preserved unless measurement later proves a router replacement is necessary.

Router replacement is explicitly out of scope for this project.

## 3. Architectural Direction

Use route-level dynamic imports with `React.lazy`.

The application shell remains eager:
- React bootstrap
- AppProvider
- CmsLocalizationProvider
- Navbar
- Footer
- DynamicFavicon
- ErrorBoundary
- InlineEditProvider
- navigation/route guard logic

Route page modules become lazy-loaded.

All meaningful page routes should be evaluated for lazy loading, including the home page.

The desired model is:

application shell
→ determine current `view.kind`
→ request only the module required for that route
→ render route
→ browser/module cache retains the loaded chunk for later navigation

This avoids bundling unrelated route code into the first application payload.

Do not keep HomePage eager merely by assumption.

Measure both possibilities if necessary, but the preferred architecture is that HomePage also becomes a route chunk so that refreshing a non-home route does not implicitly download HomePage code.

Small tightly-coupled pages may share a chunk where natural.

For example, authentication pages exported from the same AuthPages module may remain one auth chunk.

Do not manually combine unrelated large routes into one chunk.

## 4. Route Loading Boundary

Introduce a small route-loading boundary inside the existing Router.

Do NOT wrap the whole application in one global loading screen.

Navbar and application shell must remain mounted while a route chunk is loading.

Suspense fallback appears only inside the `<main>` route content region.

Fallback requirements:
- lightweight
- no large assets
- no animation-heavy dependencies
- visually consistent with the site
- should not cause layout jumping
- must never expose a blank white page where avoidable

The fallback can use a small route skeleton or localized loading message.

Do not reintroduce the old full-dashboard spinner behavior.

## 5. Route Chunk Cache Behavior

No custom JavaScript module cache should be invented.

Vite's hashed production chunks and the browser/module loader should provide normal caching.

Within a running SPA session, an imported lazy module must remain available after first load.

Expected behavior:

Home → Guide:
Guide chunk downloads once.

Guide → Home:
Home module is already loaded if previously visited and should render without redownloading the same chunk.

Home → Guide again:
Guide code must not be fetched again as a new module request during the same application lifetime.

A normal browser reload may validate/use HTTP cache according to Vercel cache headers, but it must not intentionally import every route.

## 6. Refresh / Deep-Link Behavior

Direct and refreshed routes must continue working.

Examples:

/
→ shell + Home route

/guide
→ shell + Guide route

/student
→ shell + required auth/session code + StudentDashboard only when authorized

/admin
→ shell + required auth/session code + AdminDashboard only when authorized

Authentication and authorization checks remain fail-closed.

Lazy loading must never expose a protected page before authorization is known.

Current returnTo/deep-link/push destination behavior must remain intact.

## 7. Authentication Boundary

Authentication/session initialization remains global because routing decisions for protected views depend on authenticated identity.

Do NOT defer security-critical authentication solely for performance.

Code splitting must not alter:
- auth session initialization
- currentUser ownership
- identity refresh
- protected-route guards
- president/executive/student authorization
- password recovery flow
- logout behavior

The goal is to defer route presentation code, not weaken authentication.

## 8. Data Loading Architecture

Code splitting and data fetching are separate concerns.

Phase 1 changes JavaScript route loading only.

Before changing global data loading, collect a Network baseline.

Then inspect which Supabase/network requests are made during:
- cold public Home load
- About
- Gallery
- Guide
- Student Dashboard
- Admin Dashboard
- browser refresh on each representative route

Any request used exclusively by a page should eventually be moved toward a page-scoped or feature-scoped loading boundary where safe.

Do not move requests merely based on assumptions.

Authentication/session requests may remain global.

Small public shared data required by Navbar, global branding, or site shell may remain global.

Large page-specific collections should not load globally if the active route does not need them.

## 9. Data Cache Strategy

Do not add TanStack Query or another large state-management dependency in this performance project unless later measurements demonstrate a concrete need.

Prefer the existing architecture plus small explicit caches.

For page data that already has valid data from an earlier visit:
- render the existing cached data immediately
- refresh in the background when appropriate
- preserve stale data if a transient refresh fails
- do not replace valid content with an empty screen during a background refresh

Use stale-while-revalidate behavior selectively.

Do not cache sensitive data across users.

Any authenticated cache must remain bound to the current confirmed user/session.

Logout must continue clearing user-specific state where required.

## 10. Prefetch Policy

Do NOT prefetch every route after Home loads.

That would recreate the same bandwidth problem with a delayed start.

Optional prefetch is allowed only when evidence shows a benefit.

Safe candidates include:
- route module prefetch on deliberate hover/focus
- one likely next public route during browser idle time

AdminDashboard and StudentDashboard must never be blindly prefetched for public anonymous visitors.

Prefetch must remain bounded and measurable.

## 11. Images and Static Assets

Route splitting does not solve assets that keep the browser's loading indicator active.

After route splitting, inspect the production network waterfall.

Optimize assets only where measurement identifies cost.

Potential actions:
- lazy-load below-the-fold images
- avoid loading Gallery originals before Gallery is opened
- use appropriately sized thumbnails
- serve WebP/AVIF where practical
- add explicit image dimensions to reduce layout shifts
- give the actual LCP/Hero asset appropriate loading priority
- avoid `loading="lazy"` on the true initial LCP image
- remove unnecessary external/font requests when identified

Do not reduce visible image quality without approval.

## 12. Measurement

Before application code changes, record a baseline build and runtime profile.

Build baseline should include:
- initial entry JS size
- generated chunk list
- largest JS chunks
- CSS size

Runtime baseline should include where tooling permits:
- request count
- transferred bytes
- DOMContentLoaded
- window load event
- First Contentful Paint
- Largest Contentful Paint
- last resource completing before browser loading indicator settles
- major Supabase requests during first page load
- major image/font requests

Measure with a cold-cache profile and an already-cached profile separately.

Representative flows:
1. cold Home load
2. F5 on Home
3. Home → Guide first visit
4. Guide → Home return
5. Guide second visit
6. F5 while on Guide
7. anonymous Home load proving AdminDashboard code is absent
8. authenticated Student Dashboard load
9. authenticated Admin Dashboard load where safe

Do not claim performance improvement without before/after evidence.

## 13. Structural Acceptance Criteria

The implementation is acceptable only when all of these are true:
- non-active route page modules are split out of the initial route payload
- anonymous Home load does not request AdminDashboard chunk
- anonymous Home load does not request StudentDashboard chunk
- opening a lazy route loads its chunk on demand
- returning to an already visited route in the same SPA session does not create another fresh download of that module
- refreshing a non-home route does not intentionally request all route chunks
- protected deep links still fail closed
- auth recovery routes still work
- push destination routing still works
- Navbar/Footer behavior remains correct
- no blank full-screen white transition is introduced
- test, typecheck, and build still pass
- lint does not regress from the existing baseline
- before/after bundle and network evidence is documented

## 14. Performance Acceptance Criteria

No arbitrary millisecond target is imposed before baseline measurement.

Acceptance requires:
- measurable reduction in JavaScript transferred on cold public Home load
- measurable reduction in unrelated route modules on cold Home load
- materially fewer unrelated requests during route refresh
- no performance regression in protected-route security
- browser loading completion improves or the remaining blocker is identified precisely from the network waterfall

If code splitting produces little improvement, the project proceeds to the measured next bottleneck instead of declaring success prematurely.

## 15. Error Handling

A lazy-route import can fail because of:
- temporary network failure
- stale deployment/chunk reference
- browser connectivity interruption

The route loading architecture must fail visibly rather than leaving an infinite spinner.

Use the existing ErrorBoundary where suitable.

A route chunk failure should provide a lightweight retry/reload path.

Do not implement automatic infinite retry loops.

Data refresh failures should preserve previously valid cached page data where possible.

## 16. Testing Strategy

Add focused tests for architectural contracts.

Tests should verify, where practical:
- App route pages use lazy/dynamic imports
- protected-route behavior is unchanged
- route fallback exists inside the main content boundary
- route switching still resolves the correct components
- direct/deep-link parsing is unchanged
- no accidental eager imports remain for large page modules
- build output contains separate route chunks

Do not add a heavy browser testing framework solely for this work.

Existing:
npm test
npm run typecheck
npm run build
git diff --check
npm run lint

remain required.

For runtime performance, use build output plus browser/Preview network evidence.

## 17. Rollout Phases

### Phase 1 — Baseline + Route Code Splitting
Measure current build.
Convert page imports to route-level lazy imports.
Add scoped Suspense fallback.
Verify build chunk output.
Do not change Supabase data architecture in this phase.

### Phase 2 — Runtime Network Audit
Deploy Preview only.
Measure cold Home and representative routes.
Identify:
- JavaScript bottlenecks
- page-specific Supabase requests happening globally
- images/fonts holding the browser load event open
No Production merge yet.

### Phase 3 — Page-Scoped Data Loading
Only for requests proven unnecessary on the current route.
Move page-exclusive loading behind appropriate page/feature boundaries.
Preserve shell/auth/global branding data.

### Phase 4 — Cache / Stale-While-Revalidate
For high-value repeated routes, preserve already-loaded page data and background refresh it safely.
User-specific caches remain identity-bound.

### Phase 5 — Asset Optimization + Bounded Prefetch
Optimize measured expensive images/fonts.
Add only evidence-backed bounded prefetch.

### Phase 6 — Final Before/After Verification
Repeat all baseline measurements.
Produce a compact report showing:
before
after
difference
remaining bottleneck if any
Only after Preview/manual validation may the branch be considered for Production.

## 18. Explicit Non-Goals

This project does NOT include:
- replacing the custom router with React Router
- introducing TanStack Query by default
- changing Supabase RLS
- changing database schema
- enabling Realtime
- changing suggestion architecture
- redesigning the website
- rewriting AppContext wholesale
- changing authentication semantics
- blindly compressing or degrading image quality
- preloading the whole site after first paint

## 19. Safety / Regression Constraints

Production currently contains recently stabilized suggestion and auth behavior.

Performance work must not change their semantics.

Do not modify:
- student suggestion RPCs
- suggestion polling logic unless performance measurements prove it is a direct initial-load blocker and a separate approved task is created
- RLS
- authentication authorization rules
- Realtime configuration
- Edge Functions

Every meaningful phase should be separately reviewable.

No Production merge should occur until Preview behavior and performance evidence are reviewed.
