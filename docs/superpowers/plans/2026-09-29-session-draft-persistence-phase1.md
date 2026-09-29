# Session Draft Persistence Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve unsaved Event, News, and Student Suggestion drafts across real component unmount/remount and internal navigation using user-scoped sessionStorage.

**Architecture:** Implement a JSON-safe `SessionDraftService`, reusable `useSessionDraft` hook, and in-modal `UnsavedDraftDecision` state. Phase 1 integrates those primitives into Admin Events, Admin News, and Student Suggestions without modifying Supabase or weakening existing submit/auth behavior.

**Tech Stack:** React, TypeScript, sessionStorage, existing i18n, existing Modal component, Node test suite.

**Spec:** `docs/superpowers/specs/2026-09-29-session-draft-persistence-design.md`

## Global Constraints

- **Storage:** Use `sessionStorage`, not `localStorage` or URL query params.
- **Serialization:** Only JSON-serializable types. Dropping `File`/`Blob` objects and DOM references is strictly enforced.
- **Security:** Do not persist passwords, auth tokens, or security data.
- **Isolation:** Each draft key must include a strict `userId` prefix.
- **Modal Modification:** Do not add `role="dialog"` or nested modals in Phase 1. The existing `<Modal>` serves as the outer container and `UnsavedDraftDecision` is an internal state overlay.
- **Database:** No database migrations or schema changes.
- **Scope:** Do not broadly convert all 27 forms; restrict Phase 1 strictly to Admin Events, Admin News, and Student Suggestions.

## Review Focus

The five highest-risk implementation failure classes mapped to concrete tests:
1. **Data Leakage (Cross-User Restoration):** A new user logging in could accidentally restore a draft belonging to a previous session.
   - *Test:* `tests/sessionDraftService.test.mjs` - `test_clearSessionDraftsForUser_deletes_only_matched_user_prefix`
2. **Stale Closure Bugs (Data Loss):** Navigating away fast might capture a stale React state closure, causing the last keystrokes to disappear.
   - *Test:* Manual Check - Verify `pagehide` always flush latest React state ref accurately.
3. **Escape/Focus Trapping Conflicts:** Adding a decision overlay could cause an Escape press to accidentally dismiss both the decision state and the outer editor entirely.
   - *Test:* Manual Check - Escape in Decision state keeps editor open and active.
4. **Stale Edit-Draft Validation Conflict:** A user might have a saved edit draft for an Event that gets deleted by another Admin. If not validated, opening it could crash or re-create an invalid state.
   - *Test:* `tests/sessionDraftState.test.mjs` - `test_validation_remains_unknown_if_missing_but_loading` and `test_validation_invalid_triggers_removal`
5. **SessionStorage Quota Exceeded/Disabled:** Incognito mode or a full disk might throw errors on `setItem`, breaking the entire page.
   - *Test:* `tests/sessionDraftService.test.mjs` - `test_save_fails_gracefully_when_sessionStorage_throws`

---

## Core API Interfaces

### Session Draft Service API
```typescript
type LocatedSessionDraft<T> = {
  key: string;
  mode: 'create' | 'edit';
  entityId?: string;
  envelope: SessionDraftEnvelope<T>;
};

// Core storage operations
export function buildSessionDraftKey(userId: string, feature: string, mode: 'create' | 'edit', entityId?: string): string;
export function saveSessionDraft<T>(key: string, data: SessionDraftEnvelope<T>): void;
export function loadSessionDraft<T>(key: string): SessionDraftEnvelope<T> | null;
export function removeSessionDraft(key: string): void;
export function clearSessionDraftsForUser(userId: string): void;

// Open Draft Discovery
export function findOpenSessionDraft<T>(userId: string, feature: string): LocatedSessionDraft<T> | null;
```
*Note on `findOpenSessionDraft`: Must return the newest by timestamp if multiple open drafts exist. Closed drafts are ignored.*

### Hook API
```typescript
type DraftEntityValidation = 'unknown' | 'valid' | 'invalid';

type SessionDraftUiState = {
  activeLocale?: 'ar' | 'tr' | 'en';
  activeTab?: string;
  fileReselectionRequired?: boolean;
};

type UseSessionDraftOptions<T> = {
  key: string | null; // null disables hook operations temporarily
  userId: string | null;
  defaultData: T;
  defaultOpen?: boolean;
  initialUi?: SessionDraftUiState;
  validation?: DraftEntityValidation;
  baselineFingerprint?: string;
  isDirty: (value: T) => boolean;
};

type UseSessionDraftResult<T> = {
  data: T;
  setData: (data: T | ((prev: T) => T)) => void;
  open: boolean;
  ui: SessionDraftUiState;
  setUi: (ui: SessionDraftUiState | ((prev: SessionDraftUiState) => SessionDraftUiState)) => void;
  dirty: boolean;
  isDecisionOpen: boolean;
  requestClose: () => void;
  continueEditing: () => void;
  keepDraftAndClose: () => void;
  discardDraftAndClose: () => void;
  clearDraft: () => void; // Used heavily after successful submission
};
```

---

## Task 1 — SessionDraftService domain foundation

Create the storage abstraction that handles keys, envelopes, discovery, and safely falls back on failure without touching React.

**Files Created:**
- `src/domain/sessionDraft.ts`
- `tests/sessionDraftService.test.mjs`

**Responsibilities:**
- Implement `buildSessionDraftKey`, `saveSessionDraft`, `loadSessionDraft`, `removeSessionDraft`, `clearSessionDraftsForUser`.
- Implement `findOpenSessionDraft` that parses the prefix, finds `open=true` drafts, and selects the newest timestamp if multiple collide. Normalizes older ones to `open=false`.
- Prevent serialization of `File`, `Blob`, and functions (enforce JSON safety).

**TDD Steps:**
- [ ] Write failing test `test_buildSessionDraftKey_outputs_exact_grammar` in `tests/sessionDraftService.test.mjs`
- [ ] Write failing test `test_buildSessionDraftKey_separates_create_edit`
- [ ] Write failing test `test_buildSessionDraftKey_separates_entities`
- [ ] Run `node --test tests/sessionDraftService.test.mjs` -> Expected FAIL
- [ ] Implement `buildSessionDraftKey`
- [ ] Run test -> Expected PASS
- [ ] Write failing test `test_save_load_roundtrips_JSON`
- [ ] Write failing test `test_load_handles_malformed_JSON`
- [ ] Write failing test `test_strips_invalid_data`
- [ ] Write failing test `test_clearSessionDraftsForUser_deletes_only_matched_user_prefix`
- [ ] Write failing test `test_save_fails_gracefully_when_sessionStorage_throws`
- [ ] Run test -> Expected FAIL
- [ ] Implement storage adapters
- [ ] Run test -> Expected PASS
- [ ] Write failing test `test_findOpenSessionDraft_discovers_open_create`
- [ ] Write failing test `test_findOpenSessionDraft_extracts_entityId`
- [ ] Write failing test `test_findOpenSessionDraft_isolates_users`
- [ ] Write failing test `test_findOpenSessionDraft_resolves_timestamp_conflicts`
- [ ] Run test -> Expected FAIL
- [ ] Implement `findOpenSessionDraft`
- [ ] Run test -> Expected PASS
- [ ] Commit `feat: add session draft storage foundation`

---

## Task 2 — SessionDraft State Machine & hook lifecycle

Extract the business logic into a pure module and create the reusable React hook wrapping the service.

**Files Created:**
- `src/domain/sessionDraftState.ts` (pure helpers for state machine / validation)
- `tests/sessionDraftState.test.mjs`
- `src/hooks/useSessionDraft.ts` (React glue)

**Responsibilities:**
- Define `DraftEntityValidation` and `SessionDraftUiState`.
- Extract pure functions (like validation checking and dirty state computation) into `sessionDraftState.ts`.
- Expose `useSessionDraft` hook matching the locked API interface.
- Implement synchronous write-through (on `setData`, immediately invoke `saveSessionDraft`).
- Wire `visibilitychange` (only when `document.visibilityState === 'hidden'`) and `pagehide` to force a final flush.

**TDD Steps:**
- [ ] Write failing test `test_validation_remains_unknown_if_missing_but_loading` in `tests/sessionDraftState.test.mjs`
- [ ] Write failing test `test_validation_invalid_triggers_removal`
- [ ] Write failing test `test_dirty_close_enters_decision`
- [ ] Write failing test `test_continue_action_keeps_open`
- [ ] Write failing test `test_keep_action_closes_and_saves`
- [ ] Write failing test `test_discard_action_clears_data`
- [ ] Write failing test `test_pristine_close_bypasses_decision`
- [ ] Run `node --test tests/sessionDraftState.test.mjs` -> Expected FAIL
- [ ] Implement `computeDraftValidationState` and transition logic in `sessionDraftState.ts`
- [ ] Run test -> Expected PASS
- [ ] Implement `useSessionDraft.ts` React bindings according to locked API
- [ ] Commit `feat: add persistent session draft hook and state logic`

---

## Task 3 — UnsavedDraftDecision UI & Localization

Add the internal decision overlay, update `CmsEntityTranslationTabs` to accept controlled properties, and add the required AR/TR/EN translation keys.

**Files Created:**
- `src/components/UnsavedDraftDecision.tsx`

**Files Modified:**
- `src/components/cmsLocalization/CmsEntityTranslationTabs.tsx`
- `src/i18n/locales/ar.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/tr.ts`

**Responsibilities:**
- Add the 8 required localization strings (`drafts.unsavedTitle`, `drafts.keepDraft`, etc.) to the 3 locale files.
- Build `UnsavedDraftDecision` inside a basic HTML container, accepting `onContinue`, `onKeep`, `onDiscard` props.
- Update `CmsEntityTranslationTabs` to support a controlled API: `activeTab?: 'ar' | LocalizedCmsLocale`, `onActiveTabChange?: (tab) => void`, and `preserveProvidedTranslations?: boolean`.
- Ensure restored translations explicitly win over async CMS loads when `preserveProvidedTranslations` is active.

**TDD Steps:**
- [ ] Write failing test `test_cms_translation_tabs_preserves_empty_string_over_async_load` in `tests/sessionDraftIntegration.test.mjs`
- [ ] Run `node --test tests/sessionDraftIntegration.test.mjs` -> Expected: FAIL
- [ ] Implement `CmsEntityTranslationTabs` controlled changes and precedence logic.
- [ ] Run test -> Expected: PASS
- [ ] Verify AR/TR/EN values render correctly in the browser manually.
- [ ] Commit `feat: add unsaved draft decision UI, locales, and controlled tabs`

---

## Task 4 — Event editor integration

Wire the Admin Events forms to the new draft architecture and implement open draft discovery. Note: `modalOpen` and `editId` are explicitly EXCLUDED from `EventDraftData` because they are intrinsic to `SessionDraftEnvelope` and the hook keys.

**Exact `EventDraftData` Shape:**
```typescript
{
  form: { title, category, date, time, location, description, capacity, status, image, eventUrl, activityType, pointsValue, registrationDeadline },
  translations: {
    tr: { title, description, location },
    en: { title, description, location }
  }
}
```

**Stale Validation Provider:**
- Relies on `contentLoading` from `AppContext` and `ownedEventIdsLoaded` (for non-presidents).
- **ALL ROLES**: If `contentLoading === true`, validation = `unknown`.
- **After `contentLoading === false`**:
  - *President*: Event ID exists in global `events` array => `valid`. If missing => `invalid`.
  - *Non-President*: If `ownedEventIdsLoaded` is false => `unknown`. If failed/unauthorized => remain `unknown` (do not delete). Only after **BOTH** `contentLoading === false` and `ownedEventIdsLoaded === true`: if event missing => `invalid`, if exists but not owned => `invalid`, if exists and owned => `valid`.

**Files Modified:**
- `src/pages/AdminDashboard.tsx`

**Responsibilities:**
- On mount, invoke `findOpenSessionDraft(currentUser.userId, 'admin:events')` to discover if a previous draft was left open. Rehydrate the runtime `editId` directly from the discovered key.
- Connect `useSessionDraft` with the appropriate key (create or edit).
- Pass `ui.activeLocale` to `CmsEntityTranslationTabs` using the new controlled API.
- Render `<UnsavedDraftDecision>` inside the Modal body if decision active.
- Escape/backdrop trigger "Continue Editing" when decision active.
- Successful submit clears the draft.

**TDD Steps:**
- [ ] Write integration test `test_event_editor_uses_correct_feature_keys_and_validation_with_contentLoading` in `tests/sessionDraftIntegration.test.mjs`
- [ ] Run `node --test tests/sessionDraftIntegration.test.mjs` -> Expected: FAIL
- [ ] Implement `findOpenSessionDraft` lookup and hook integration in `EventsManagement`.
- [ ] Run test -> Expected: PASS
- [ ] Manually verify focus trapping and DOM interaction (Escape/Backdrop).
- [ ] Commit `feat: persist event editor drafts`

---

## Task 5 — News editor integration

Wire the Admin News forms to the new draft architecture.

**Exact `NewsDraftData` Shape:**
```typescript
{
  form: { title, category, date, excerpt, fullContent, image, externalUrl, pinnedOnHomepage },
  translations: {
    tr: { title, excerpt, fullContent },
    en: { title, excerpt, fullContent }
  }
}
```

**Stale Validation Provider:**
- Relies on `!contentLoading` from `AppContext` as the true readiness signal.
- While `contentLoading === true`, validation = `unknown`.
- When `contentLoading === false`: if entity exists in authoritative `news` => `valid`, otherwise => `invalid`.

**Files Modified:**
- `src/pages/AdminDashboard.tsx`

**Responsibilities:**
- On mount, invoke `findOpenSessionDraft(currentUser.userId, 'admin:news')` to discover if a previous draft was left open.
- Connect `useSessionDraft` and pass `ui.activeLocale` to `CmsEntityTranslationTabs`.
- Successful submit explicitly invokes `clearDraft()`.

**TDD Steps:**
- [ ] Write integration test `test_news_editor_uses_correct_readiness_signal` in `tests/sessionDraftIntegration.test.mjs`
- [ ] Run `node --test tests/sessionDraftIntegration.test.mjs` -> Expected: FAIL
- [ ] Implement News integration in `NewsManagement`.
- [ ] Run test -> Expected: PASS
- [ ] Manually verify AR/TR/EN translation restoration logic in browser.
- [ ] Commit `feat: persist news editor drafts`

---

## Task 6 — Student Suggestion integration

Wire the Student Suggestion composer to the draft architecture without visible tab jumping.

**Exact `StudentSuggestionDraftData` Shape:**
```typescript
{
  title, body, category, targetRole
}
```

**Files Modified:**
- `src/pages/StudentDashboard.tsx`

**Responsibilities:**
- Define `useSessionDraft` *before* the `tab` state initializer.
- Read `ui.activeTab` from the hook synchronously on first render to initialize the React `tab` state cleanly:
  ```typescript
  const suggestionDraft = useSessionDraft<StudentSuggestionDraftData>(...);
  const [tab, setTab] = useState<StudentPortalTabId>(() => (suggestionDraft.ui.activeTab as StudentPortalTabId) || 'activities');
  ```
- Navigating away seamlessly triggers the `unmount` flush, saving the data.
- Successful submit clears the suggestion draft.

**TDD Steps:**
- [ ] Write integration test `test_student_suggestion_uses_correct_key` in `tests/sessionDraftIntegration.test.mjs`
- [ ] Run `node --test tests/sessionDraftIntegration.test.mjs` -> Expected: FAIL
- [ ] Implement Student Suggestion integration.
- [ ] Run test -> Expected: PASS
- [ ] Manually verify Student selected suggestions tab restoration after real dashboard unmount (navigate to Home and back).
- [ ] Commit `feat: persist student suggestion drafts`

---

## Task 7 — logout ownership cleanup

Intercept the logout flow to defensively clear owned drafts.

**Files Modified:**
- `src/context/AppContext.tsx`

**Responsibilities:**
- Locate `const logout = async () => { ... }` in `AppContext.tsx`.
- Retrieve `const currentUserId = currentUser?.userId;`.
- Strictly before/alongside `supabase.auth.signOut()`, invoke `clearSessionDraftsForUser(currentUserId)` safely.

**TDD Steps:**
- [ ] Write integration test `test_logout_calls_clearSessionDraftsForUser_with_currentUserId` in `tests/sessionDraftIntegration.test.mjs`
- [ ] Run `node --test tests/sessionDraftIntegration.test.mjs` -> Expected: FAIL
- [ ] Implement cleanup logic.
- [ ] Run test -> Expected: PASS
- [ ] Commit `fix: clear owned session drafts on logout`

---

## Task 8 — Phase 1 integration/regression verification

### Summary of Test Requirements
- **Approved behavioral requirements:** 33
- **Requirements covered by automation:** 17
- **Requirements covered by manual acceptance:** 16
- **Planned automated `test(...)` cases:** 24
- **Planned manual acceptance scenarios/checks:** 16

### Mapping Matrix

| # | Requirement | Task | Automated Test File/Test Name | Manual? |
|---|---|---|---|---|
| 1 | Draft survives component unmount/remount. | T4/T6 | N/A | Yes |
| 2 | Draft survives internal page navigation. | T4/T6 | N/A | Yes |
| 3 | `open=true` draft auto-reopens correctly upon returning. | T1 | `test_findOpenSessionDraft_discovers_open_create` | No |
| 4 | Exact form string/boolean values restore correctly. | T1 | `test_save_load_roundtrips_JSON` | No |
| 5 | AR/TR/EN translation payloads restore accurately. | T1 | `test_save_load_roundtrips_JSON` | No |
| 6 | Active translation locale tab restores seamlessly. | T4/T5 | N/A | Yes |
| 7 | Create and Edit keys categorically cannot collide. | T1 | `test_buildSessionDraftKey_separates_create_edit` | No |
| 8 | Edit Entity A and Edit Entity B keys cannot collide. | T1 | `test_buildSessionDraftKey_separates_entities` | No |
| 9 | User A cannot read, restore, or access User B's draft. | T1 | `test_findOpenSessionDraft_isolates_users` | No |
| 10 | Successful form submission automatically clears the draft. | T4/T6 | N/A | Yes |
| 11 | Failed form submission safely keeps the draft. | T4/T6 | N/A | Yes |
| 12 | Dirty explicit close transitions accurately to decision state. | T2 | `test_dirty_close_enters_decision` | No |
| 13 | "Continue Editing" successfully keeps the editor open. | T2 | `test_continue_action_keeps_open` | No |
| 14 | "Keep Draft" closes the editor + retains data + saves `open=false`. | T2 | `test_keep_action_closes_and_saves` | No |
| 15 | Manually invoking Add/Edit for a saved closed draft rehydrates. | T4/T6 | N/A | Yes |
| 16 | "Discard Draft" clears the data and closes the editor. | T2 | `test_discard_action_clears_data` | No |
| 17 | Pristine close bypasses the decision prompt entirely. | T2 | `test_pristine_close_bypasses_decision` | No |
| 18 | Explicit logout successfully clears owned drafts. | T7 | `test_logout_calls_clearSessionDraftsForUser_with_currentUserId` | No |
| 19 | Malformed JSON handles safely and does not crash the UI. | T1 | `test_load_handles_malformed_JSON` | No |
| 20 | `sessionStorage` unavailable/throws degrades gracefully. | T1 | `test_save_fails_gracefully_when_sessionStorage_throws` | No |
| 21 | Confirmation/read-only modals are proven to bypass persistence. | N/A | N/A (Excluded by design) | Yes |
| 22 | Passwords/tokens/security data are proven to bypass persistence. | N/A | N/A (Excluded by design) | Yes |
| 23 | `File`, `Blob`, and runtime objects are never serialized. | T1 | `test_strips_invalid_data` | No |
| 24 | Stale edit draft patiently waits while validation is `unknown`. | T2 | `test_validation_remains_unknown_if_missing_but_loading` | No |
| 25 | Stale deleted/unauthorized edit draft is removed strictly only after `invalid` is confirmed. | T2 | `test_validation_invalid_triggers_removal` | No |
| 26 | Visibility/pagehide flush always uses the latest value. | T2 | N/A | Yes |
| 27 | Restored modal does not flash an empty state before hydration. | T2 | N/A | Yes |
| 28 | Separate browser tabs naturally maintain isolated `sessionStorage`. | T1 | N/A (Native browser feature) | Yes |
| 29 | Current push/notification behavior remains entirely unaffected. | T8 | N/A | Yes |
| 30 | Current structural submit and validation behavior remains intact. | T8 | N/A | Yes |
| 31 | Escape key press while decision state is active safely returns to the editor. | T4/T5 | N/A | Yes |
| 32 | Backdrop click while decision state is active safely returns to the editor. | T4/T5 | N/A | Yes |
| 33 | Neither Escape nor backdrop actions while in decision state clear the draft. | T4/T5 | N/A | Yes |

Execute required scripts:
```bash
node --test tests/*.test.mjs
npm run typecheck
npm run lint
npm run build
git diff --check
```
