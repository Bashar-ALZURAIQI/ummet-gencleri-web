# Student Suggestions V2 Implementation Plan

## Overview
This plan implements a Supabase-authoritative suggestion workflow replacing the previous browser-local architecture, aligned strictly with the design spec from 2026-09-25.

--------------------------------------------------
TASK 1 — Authoritative Database Contract
--------------------------------------------------

Create:
- `supabase/migrations/20260926015800_student_suggestions_v2.sql`
- `tests/studentSuggestionsMigration.test.mjs`

Migration must define:

`public.student_suggestions`

Required fields:
- `id uuid` primary key
- `student_user_id uuid` -> `public.profiles(id)`
- `target_role text`
- `category text`
- `title text`
- `content text`
- `status text`
- `created_at timestamptz`
- `updated_at timestamptz`

`public.suggestion_responses`

Required fields:
- `id uuid` primary key
- `suggestion_id uuid` -> `student_suggestions(id)`
- `responder_user_id uuid` -> `profiles(id)`
- `response_text text`
- `created_at timestamptz`

Allowed target roles:
- `PRESIDENT`
- `VICE_PRESIDENT`
- `MEDIA_HEAD`
- `FINANCE_HEAD`
- `AUDIT_HEAD`
- `ACADEMIC_HEAD`
- `ACTIVITIES_HEAD`

Allowed statuses:
- `new`
- `reviewing`
- `implemented`
- `closed`

Validation:
- category trimmed 1–100
- title trimmed 3–200
- content trimmed 5–5000
- response trimmed 1–5000

Enable RLS.

Browser direct authoritative INSERT/UPDATE/DELETE is NOT allowed.

Define exactly these RPCs:
- `submit_student_suggestion(p_target_role text, p_category text, p_title text, p_content text)`
- `respond_to_student_suggestion(p_suggestion_id uuid, p_response_text text, p_new_status text)`
- `list_visible_student_suggestions()`

All RPCs:
- `SECURITY DEFINER`
- `SET search_path = ''`
- derive actor from `auth.uid()`
- explicit grants/revokes
- no client-supplied actor identity

Student eligibility MUST match current application semantics:
- `profiles.status = 'active'`
- AND accepted student application
- Also reject currently banned/suspended Auth users.

Visibility:
- Student -> own suggestions only
- President -> all
- Other current executive -> only matching `target_role`
- Unauthenticated -> no suggestion data

Responses oldest -> newest.
Suggestions newest -> oldest.

respond RPC must make:
response INSERT + status UPDATE atomic.

NO postgres_changes.
NO realtime publication changes.

Write RED migration tests first, then implementation, then GREEN.

DO NOT apply migration remotely in this task.

Suggested commit:
`feat(db): define authoritative student suggestions`

--------------------------------------------------
TASK 2 — Typed Gateway and Service
--------------------------------------------------

Create:
- `src/domain/studentSuggestionGateway.ts`
- `src/services/studentSuggestionService.ts`
- `tests/studentSuggestionGateway.test.mjs`

Define:

```typescript
type StudentSuggestionErrorCode =
  'UNAUTHENTICATED'
  | 'MEMBERSHIP_REQUIRED'
  | 'INVALID_TARGET_ROLE'
  | 'INVALID_INPUT'
  | 'SUGGESTION_NOT_FOUND'
  | 'FORBIDDEN'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';
```

Define typed `ServiceResult`.

Define:
- `SubmitStudentSuggestionParams = { targetRole, category, title, content }`
- `RespondToStudentSuggestionParams = { suggestionId, responseText, newStatus }`

Service functions:
- `loadVisibleStudentSuggestions()`
- `submitStudentSuggestion(params)`
- `respondToStudentSuggestion(params)`

Gateway tests must prove:
- exact RPC names
- exact RPC parameter names
- trimming
- safe server mapping
- malformed payload safety
- error normalization
- no realtime/channel API

Use fake RPC clients.

Suggested commit:
`feat: add student suggestion service gateway`

--------------------------------------------------
TASK 3 — AppContext Server Authority
--------------------------------------------------

Modify:
- `src/context/AppContext.tsx`

Create:
- `src/domain/studentSuggestionRefreshGate.ts`
- `tests/studentSuggestionRefreshGate.test.mjs`
- `tests/studentSuggestionsAppContext.test.mjs`

AppContext must expose:
- `suggestions`
- `suggestionsLoading`
- `suggestionsError`
- `submitSuggestion(params)`
- `respondToSuggestion(id, reply, status)`

Keep `getVisibleSuggestions` only as compatibility/view helper.
It must NOT implement authority filtering anymore.
The server already filters.

`canRespondToSuggestion` may remain ONLY as UI affordance.
Database remains authority.

REMOVE public `setSuggestions` access from UI consumers.

Remove LocalStorage suggestion authority:
- no `safeParse(app_suggestions)`
- no `safeWrite(app_suggestions)`
- no `mockSuggestions` fallback as authoritative state

Initial suggestion state = `[]`.

After a successful authoritative load, including a successful empty `[]` result:
- `localStorage.removeItem('app_suggestions')`

On failed authoritative load:
- do NOT fallback to legacy data.

Use existing confirmed auth ownership:
- epoch + userId + role.

Prevent:
- prior account response publishing into new account
- revoked-role response publishing
- same-session older slow refresh overwriting newer refresh

For this create a small request-generation / invalidation helper:
`studentSuggestionRefreshGate.ts`

Use existing:
- `createVisibilityRefreshPolling`

Do NOT create another realtime path.
Use existing five-minute default.
Avoid overlapping polling loops.

Mutation behavior:
RPC failure:
- do not mutate suggestion list
RPC success:
- refresh from server

IMPORTANT EDGE CASE:
If RPC mutation succeeds but the immediate refresh fails:
- mutation is still considered saved
- preserve last server-confirmed rendered list
- return: `{ ok: true, refreshPending: true }`
- do not report a hard submission failure that encourages duplicate submission

Tests must cover:
- latest request wins
- stale session ignored
- logout clears state
- empty server list retires old key
- failed load does not retire key
- no optimistic mutations
- polling cleanup
- one polling loop only

Suggested commit:
`feat: make student suggestions server authoritative`

--------------------------------------------------
TASK 4 — Student/Admin UI + i18n
--------------------------------------------------

Modify:
- `src/pages/StudentDashboard.tsx`
- `src/pages/AdminDashboard.tsx`
- `src/i18n/locales/ar.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/tr.ts`

Create:
- `tests/studentSuggestionsUiIntegration.test.mjs`

StudentDashboard:
REMOVE direct `setSuggestions` use.
Do not generate authoritative suggestion IDs in browser.
Use async:
`submitSuggestion({ targetRole, category, title, content })`

Add:
- submitting busy state
- duplicate-submit prevention
- translated failure
- translated `refreshPending` warning

Mutation failure:
- keep form contents.

Mutation success:
- clear form.

AdminDashboard:
Make respond flow async.
Prevent duplicate response submit.

Failure:
- do not append fake response
- do not change status locally
- preserve entered response if useful

Success:
- refresh comes from AppContext/server authority.

`refreshPending`:
- show translated saved-but-refresh-delayed warning.

Add matching operational i18n copy in Arabic, English, Turkish.
At minimum:
- loading suggestions
- load failure
- submit failure
- response failure
- saved success
- saved but refresh delayed
- submitting
- responding

NO visual redesign.

Suggested commit:
`feat: connect suggestion UI to server authority`

--------------------------------------------------
TASK 5 — Full Local Verification + Migration Readiness
--------------------------------------------------

Run focused tests:
`node --test tests/studentSuggestionsMigration.test.mjs tests/studentSuggestionGateway.test.mjs tests/studentSuggestionRefreshGate.test.mjs tests/studentSuggestionsAppContext.test.mjs tests/studentSuggestionsUiIntegration.test.mjs`

Then:
`npm run typecheck`
`npm run build`
`npm test`
`git diff --check main...HEAD`

Also verify via source search:
- NO Student Suggestions `postgres_changes`
- NO `app_suggestions` safeParse authority
- NO `app_suggestions` safeWrite authority
- NO direct UI `setSuggestions` mutation
- NO direct client INSERT/UPDATE/DELETE on suggestion tables

Then perform READ-ONLY Production compatibility checks.
Confirm the final migration references objects that actually exist:
- `profiles`
- `student_applications`
- `executive_assignments`
- `private.is_current_president()`

Check migration version uniqueness.

DO NOT modify Production.

Then produce migration-readiness report and STOP.

HARD GATE:
DO NOT apply migration until human explicitly approves the exact final migration after this readiness report.

--------------------------------------------------
TASK 6 — Controlled Production Migration
--------------------------------------------------

This task MUST be marked:
REQUIRES EXPLICIT HUMAN APPROVAL.

Only after approval:
- reconfirm migration file did not change
- apply exact local migration using linked Supabase migration workflow
- migration history must record exact local version
- do not run ad-hoc equivalent SQL

After apply, verify read-only:
- both tables
- required constraints
- RLS
- 3 RPCs
- EXECUTE grants
- no authenticated direct table mutation
- anon/PUBLIC cannot execute
- migration version exactly once
- no realtime publication was added

If safe test identities exist:
- smoke authorization.

If not:
- report that interactive DB smoke was not performed.

--------------------------------------------------
TASK 7 — Final Verification / Merge / Deployment
--------------------------------------------------

After Production DB is verified:
`npm run typecheck`
`npm run build`
`npm test`
`git diff --check main...HEAD`

Push feature branch.

Before merge: fetch main.
If main moved: reconcile and rerun full verification.

Merge only if safe and green.
Verify exact Vercel status for merged main SHA.

Production smoke if safe accounts are available:
- accepted student submits
- survives reload/new session
- targeted executive sees it
- unrelated executive cannot see/respond
- President sees/responds
- student sees durable response/status
- no runtime console errors
- no legacy LocalStorage fallback

Never claim a smoke scenario passed if it was not actually tested.

Final report must include:
- main SHA
- deployment status
- test pass/fail counts
- migration version
- smoke scenarios tested
- unverified scenarios
- confirmation feature-real-dashboard-data was NOT merged/cherry-picked

==================================================
REVIEW FOCUS SECTION
==================================================

1. Older slow same-session refresh overwriting newer data.
   -> Checked in Task 3 (`tests/studentSuggestionRefreshGate.test.mjs`)
2. Account/role changing during an in-flight request.
   -> Checked in Task 3 (`tests/studentSuggestionsAppContext.test.mjs`)
3. Successful authoritative empty `[]` result.
   -> Checked in Task 3 (`tests/studentSuggestionsAppContext.test.mjs` / LocalStorage retirement)
4. Mutation succeeds but refresh fails afterward.
   -> Checked in Task 3 & 4 (`refreshPending` edge case handling)
5. Manual unauthorized RPC/direct-table attempts bypassing UI.
   -> Checked in Task 1 (`tests/studentSuggestionsMigration.test.mjs`)
