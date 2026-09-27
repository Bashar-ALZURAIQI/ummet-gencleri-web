# Student Suggestions V2 — Supabase-Authoritative Design

**Date:** 2026-09-25

## 1. Goal

Replace the current browser-local student suggestion workflow with a durable, Supabase-authoritative workflow.

After V2:

- accepted active students can submit suggestions or complaints;
- data persists across browsers and devices;
- the student sees only their own suggestions;
- the current President sees all suggestions;
- each executive sees only suggestions addressed to their current executive role;
- only the President or the currently assigned matching executive may reply and update the suggestion status;
- replies and status changes persist in Supabase;
- LocalStorage is no longer an authority for suggestions;
- no PostgreSQL `postgres_changes` subscription is introduced.

The existing UI should remain visually familiar. This project changes data authority and workflow correctness, not the site's visual identity.

## 2. Current Problem

The current application keeps general student suggestions in browser state and `localStorage` under the legacy key:

`app_suggestions`

A student submission currently creates a client-side Suggestion object and prepends it to local state.

Administrative replies and status changes are also applied locally.

Consequences:

- suggestions are device/browser-local;
- another session cannot reliably see them;
- administrative replies are not durable server records;
- client state acts as the source of truth;
- authorization is primarily a UI/application concern instead of being enforced authoritatively by the database.

V2 removes this architecture.

## 3. Migration Policy for Existing Local Data

No legacy LocalStorage suggestion data will be imported.

This is an explicit product decision.

There will be:

- no one-time LocalStorage-to-Supabase importer;
- no dual-read migration period;
- no fallback from Supabase to `app_suggestions`.

The old LocalStorage key may be removed only after the application successfully establishes the V2 server-backed suggestion state for the current session.

Supabase becomes the sole authority.

## 4. Architecture Choice

Use an **RPC-centric + RLS** architecture.

The browser must not directly perform authoritative INSERT, UPDATE, or DELETE operations on suggestion records.

Authoritative mutations occur through narrowly scoped PostgreSQL RPCs.

RLS and grants remain as defense-in-depth.

Rejected alternatives:

### Direct CRUD + RLS

Not selected because it expands the browser write surface and requires more complex mutation policies.

### Edge Functions

Not selected because the workflow does not require an additional execution tier. PostgreSQL transactions, RLS, and RPCs are sufficient.

## 5. Data Model

### `public.student_suggestions`

Required fields:

- `id uuid`
- `student_user_id uuid`
- `target_role text`
- `category text`
- `title text`
- `content text`
- `status text`
- `created_at timestamptz`
- `updated_at timestamptz`

`student_user_id` references `public.profiles(id)`.

Allowed target roles must match the application's current executive role model:

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

### `public.suggestion_responses`

Required fields:

- `id uuid`
- `suggestion_id uuid`
- `responder_user_id uuid`
- `response_text text`
- `created_at timestamptz`

`suggestion_id` references `student_suggestions(id)`.

`responder_user_id` references `profiles(id)`.

Responses are append-only from the product workflow perspective.

## 6. Authoritative Identity

The server must derive the caller from:

`auth.uid()`

The browser must never supply an authoritative student ID, responder ID, or acting role for permission decisions.

Executive authority must be resolved against the application's current authoritative executive-assignment model.

A stale role in client state must not grant access.

## 7. RPC Contract

V2 exposes three authoritative operations.

### 7.1 `submit_student_suggestion`

Inputs:

- target role
- category
- title
- content

The function derives the student user ID from `auth.uid()`.

Required validation:

- authenticated caller;
- matching profile exists;
- profile has eligible active membership;
- membership/application rules match the current production membership model;
- currently suspended/banned accounts cannot submit;
- target role is valid;
- category is trimmed and 1–100 characters;
- title is trimmed and 3–200 characters;
- content is trimmed and 5–5000 characters.

The SQL implementation must be aligned with the CURRENT production schema before migration is finalized.

Do not blindly reuse eligibility SQL from the historical `feature-real-dashboard-data` branch.

Successful submission returns the authoritative created suggestion identifier.

### 7.2 `respond_to_student_suggestion`

Inputs:

- suggestion ID
- response text
- new status

Required validation:

- authenticated caller;
- target suggestion exists;
- response is trimmed and non-empty, maximum 5000 characters;
- new status is valid;
- caller is either:
  - the current President, or
  - the current holder of the executive role matching the suggestion's `target_role`.

The response insertion and suggestion status update must be one database transaction.

No partial success is allowed.

If response insertion fails, status must not change.

If status update fails, response must not remain committed.

### 7.3 `list_visible_student_suggestions`

The server derives visibility from current authoritative identity.

Expected visibility:

- Student: only rows where `student_user_id = auth.uid()`.
- President: all suggestions.
- Other current executive: only suggestions whose `target_role` equals the executive's current assignment.
- Unauthenticated caller: no suggestion data.

Returned records include ordered responses.

Responses must be ordered oldest-to-newest.

Suggestions should be ordered newest-to-oldest.

## 8. RLS and Database Privileges

Enable RLS on both tables.

Authenticated browser clients must not have unrestricted direct mutation authority.

Direct browser INSERT, UPDATE, and DELETE are not part of the product contract.

RPCs are the supported mutation surface.

Security requirements for mutation RPCs:

- `SECURITY DEFINER`
- `SET search_path = ''`
- explicit authentication checks;
- server-side authorization checks;
- server-side validation;
- explicit EXECUTE grants;
- unnecessary PUBLIC/anon privileges revoked.

Reading must not expose rows beyond the visibility rules.

The migration implementation must use the current repository's existing authorization helpers where safe and appropriate rather than introducing redundant authority models.

## 9. Application Layers

Keep clear boundaries:

### Domain Gateway

A focused suggestion gateway maps RPC payloads and server errors into typed application results.

It must not contain UI state management.

### Service Layer

Thin wrapper around the configured Supabase client and gateway.

Expected conceptual operations:

- load visible suggestions;
- submit suggestion;
- respond to suggestion.

No realtime subscription API is needed.

### AppContext

`AppContext` owns current in-memory suggestion state for rendering, but it is NOT the source of truth.

It coordinates:

- loading visible authoritative suggestions;
- submitting;
- responding;
- refreshing;
- session ownership/stale-result guards;
- clearing state when identity changes.

### UI

StudentDashboard and AdminDashboard consume AppContext operations.

They must not write authoritative suggestion state directly.

## 10. Student Flow

On an eligible student's authenticated session:

1. load visible suggestions from the server;
2. display server-confirmed rows;
3. student fills target role, category, title, and content;
4. client performs basic UX validation;
5. submit through the authoritative service/RPC;
6. while submitting, prevent duplicate submission;
7. on RPC failure:
   - do not fabricate a local suggestion;
   - preserve a useful error state;
8. on success:
   - refresh from the server;
   - publish only server-confirmed suggestion state;
9. clear the form only after successful authoritative submission.

The client must not generate an authoritative suggestion ID.

## 11. Executive Flow

When a President or eligible executive views suggestions:

1. load only server-authorized rows;
2. display server-confirmed responses and status;
3. responder selects status and enters response;
4. prevent duplicate submission while the mutation is in flight;
5. call the response RPC;
6. on failure:
   - do not append a fake response;
   - do not mutate status locally;
7. on success:
   - refresh from the server;
   - publish only authoritative returned state.

An executive who loses or changes assignment must not retain access because of stale browser state.

## 12. Session Ownership and Stale Request Protection

Every async suggestion refresh/mutation publication must respect the application's existing confirmed-auth ownership model.

Capture enough session ownership state before async work, including:

- auth/session epoch;
- user ID;
- current role/identity information where relevant.

Before publishing a completed async result, confirm that the same authenticated ownership is still current.

If the user signs out, changes account, or their role changes while a request is in flight:

- the old result must not be published into the new session;
- suggestion state from the previous identity must be cleared.

This is required to prevent cross-account stale data leakage.

## 13. Refresh Strategy

Do NOT use Supabase PostgreSQL `postgres_changes`.

This is a hard design constraint.

The project previously disabled application Postgres Changes because of production resource concerns.

Refresh strategy:

- immediate refresh after successful submission;
- immediate refresh after successful administrative response;
- refresh when relevant authenticated suggestion state is initialized;
- refresh when the page becomes visible again;
- lightweight polling while the application is visible using the existing visibility refresh infrastructure.

Use the repository's existing `createVisibilityRefreshPolling` pattern.

Default interval should remain aligned with the current project default (currently five minutes) unless implementation evidence justifies a scoped change.

Avoid creating overlapping polling loops.

## 14. LocalStorage Retirement

`app_suggestions` must cease to be a read or write source of truth.

Remove:

- suggestion initialization from LocalStorage;
- periodic/local effect persistence of suggestions to `app_suggestions`;
- local fallback to mock suggestions for authenticated authoritative state.

Legacy cleanup:

- after V2 successfully establishes authoritative suggestion state for the current session, remove the old `app_suggestions` key;
- failure to reach the server must not cause fallback to legacy suggestion data;
- legacy data is intentionally not migrated.

The application may show a loading or error state instead of old local data.

## 15. Error Model

Do not expose raw PostgreSQL/Supabase errors directly to end users.

The gateway/service layer should normalize failures into stable application error categories, conceptually including:

- `UNAUTHENTICATED`
- `MEMBERSHIP_REQUIRED`
- `INVALID_TARGET_ROLE`
- `INVALID_INPUT`
- `SUGGESTION_NOT_FOUND`
- `FORBIDDEN`
- `NETWORK_ERROR`
- safe fallback `UNKNOWN_ERROR`

UI copy must use the project's translation system.

Diagnostic logging must avoid leaking unnecessary PII or raw confidential payloads.

## 16. Internationalization

New user-facing loading, success, and error text must follow the current i18n architecture.

Do not introduce new hard-coded Arabic-only operational error messages where the active UI already supports Arabic, Turkish, and English translation.

Existing visual labels may be preserved where already part of the current translation structure.

## 17. No Optimistic Authoritative Mutation

For this subsystem:

- no optimistic suggestion insertion;
- no optimistic response append;
- no optimistic status transition.

A mutation is visible as authoritative only after the server confirms it and the application refreshes/publishes server-backed state.

This deliberately favors correctness over perceived instant mutation.

## 18. Testing Strategy

### Migration and Security Tests

Verify:

- tables and required columns;
- foreign keys;
- status and role constraints;
- indexes;
- RLS enabled;
- intended policies;
- direct browser mutations are not an exposed authority path;
- RPC authentication and authorization;
- correct RPC grants/revokes;
- `SECURITY DEFINER`;
- `SET search_path = ''`;
- atomic response + status behavior;
- input validation.

### Gateway and Service Tests

Verify:

- correct RPC names;
- correct parameters;
- whitespace trimming;
- server-result mapping;
- response ordering mapping;
- safe error normalization;
- malformed payload handling.

### AppContext Tests

Verify:

- suggestions begin from server state, not LocalStorage/mock authority;
- successful refresh publishes server-confirmed state;
- failed refresh does not restore legacy LocalStorage state;
- successful submission refreshes from server;
- failed submission does not mutate local suggestion state;
- successful response refreshes from server;
- failed response does not append or change status;
- logout/account switch clears suggestion state;
- stale async results from prior auth ownership are ignored;
- legacy `app_suggestions` key is retired only according to the approved cleanup policy;
- polling/visibility refresh does not create duplicate loops.

### UI and Regression Tests

Verify:

- submit loading state;
- response loading state;
- duplicate-submit prevention;
- useful failure display;
- student visibility;
- targeted executive visibility;
- President visibility;
- unauthorized executive behavior;
- translated operational text;
- existing layout is not unintentionally redesigned.

## 19. Verification Gate

Before considering the feature implementation ready for merge:

- focused suggestion tests pass;
- migration/security contract tests pass;
- `npm run typecheck` exits 0;
- `npm run build` exits 0;
- full `npm test` exits 0;
- `git diff --check` is clean;
- no unrelated regressions;
- no Postgres Changes subscription is added.

The current green main baseline must remain green.

## 20. Production Migration Safety

Authoring and testing the migration does not automatically authorize applying it to Production.

Before production application:

1. inspect the final SQL against the current production schema;
2. verify referenced helpers/tables/functions actually exist;
3. inspect migration history/version uniqueness;
4. run repository/local migration checks;
5. review the final diff;
6. explicitly approve the production migration step.

Do not blindly copy the historical migration from `feature-real-dashboard-data`.

The historical branch is reference material only.

## 21. Rollout Sequence

Implementation should be sequenced so that server capability exists before the UI depends on it.

Conceptual order:

1. migration/security contracts;
2. gateway/service;
3. AppContext authoritative flow;
4. StudentDashboard integration;
5. AdminDashboard integration;
6. legacy LocalStorage retirement;
7. visibility/polling integration;
8. full verification;
9. migration review;
10. controlled production migration;
11. production schema/RPC verification;
12. application rollout and final smoke verification.

Exact migration/application timing must be refined in the implementation plan so the deployed frontend never depends on RPCs that do not exist yet.

## 22. Non-Goals

Student Suggestions V2 does NOT include:

- importing legacy `app_suggestions`;
- Postgres realtime subscriptions;
- email notifications for suggestions;
- push notifications for suggestions;
- attachments;
- anonymous suggestions;
- editing submitted suggestions;
- deleting suggestions;
- analytics/dashboard integration;
- Event Registration V2;
- Authoritative Dashboard V2;
- broad visual redesign.

These may be separate future work.

## 23. Success Criteria

Student Suggestions V2 is successful when all of the following are true:

1. An accepted eligible student can submit a suggestion on device A.
2. The record is stored authoritatively in Supabase.
3. The same student can see it on another browser/device after authentication.
4. The current targeted executive can see it.
5. The President can see it.
6. An unrelated executive cannot see or respond to it.
7. An authorized responder can add a response and transition its status atomically.
8. The student later sees the durable response and updated status.
9. Account or role changes cannot publish stale suggestions from a previous identity.
10. `app_suggestions` is no longer an authority or fallback.
11. No `postgres_changes` subscription exists for the feature.
12. Existing project tests remain green.

## 24. Historical Branch Policy

Do not merge or cherry-pick `feature-real-dashboard-data` wholesale.

It is a historical reference for:

- prior domain ideas;
- prior gateway shapes;
- prior SQL concepts;
- prior test cases.

Every reused concept must be revalidated against current:

- main branch architecture;
- production schema;
- current authorization model;
- current polling strategy;
- current i18n system;
- current tests.
