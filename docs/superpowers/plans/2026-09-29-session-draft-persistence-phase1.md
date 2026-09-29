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
   - *Test:* `tests/sessionDraftService.test.mjs` - `test_clearAllForUser_deletes_only_matched_user_prefix`
2. **Stale Closure Bugs (Data Loss):** Navigating away fast might capture a stale React state closure, causing the last keystrokes to disappear.
   - *Test:* Manual Check - Verify `pagehide` always flush latest React state ref accurately.
3. **Escape/Focus Trapping Conflicts:** Adding a decision overlay could cause an Escape press to accidentally dismiss both the decision state and the outer editor entirely.
   - *Test:* Manual Check - Escape in Decision state keeps editor open and active.
4. **Stale Edit-Draft Validation Conflict:** A user might have a saved edit draft for an Event that gets deleted by another Admin. If not validated, opening it could crash or re-create an invalid state.
   - *Test:* `tests/sessionDraftState.test.mjs` - `test_validation_remains_unknown_if_missing_but_loading` and `test_validation_invalid_deletes_draft`
5. **SessionStorage Quota Exceeded/Disabled:** Incognito mode or a full disk might throw errors on `setItem`, breaking the entire page.
   - *Test:* `tests/sessionDraftService.test.mjs` - `test_save_fails_gracefully_when_sessionStorage_throws`

---

## Task 1 — SessionDraftService domain foundation

Create the storage abstraction that handles keys, envelopes, and safely falls back on failure without touching React.

**Files Created:**
- `src/domain/sessionDraft.ts`
- `tests/sessionDraftService.test.mjs`

**Responsibilities & API:**
- Implement `buildSessionDraftKey(userId, feature, mode, entityId?)`
- Implement `SessionDraftEnvelope<T>` type definition.
- Implement `saveSessionDraft(key, data)`, `loadSessionDraft(key)`, `removeSessionDraft(key)` with robust try/catch around `sessionStorage`.
- Implement `clearSessionDraftsForUser(userId)` string-prefix matching.
- Prevent serialization of `File`, `Blob`, and functions (enforce JSON safety).

**TDD Steps:**
- [ ] Write failing test `test_buildSessionDraftKey_outputs_exact_grammar` in `tests/sessionDraftService.test.mjs`
- [ ] Run `node --test tests/sessionDraftService.test.mjs`
- [ ] Expected: FAIL because `buildSessionDraftKey` is not implemented
- [ ] Implement `buildSessionDraftKey`
- [ ] Run same test -> Expected: PASS
- [ ] Write failing test `test_save_load_roundtrips_JSON_and_strips_invalid_data`
- [ ] Run command
- [ ] Expected: FAIL
- [ ] Implement `saveSessionDraft` / `loadSessionDraft`
- [ ] Run same test -> Expected: PASS
- [ ] Write failing test `test_clearSessionDraftsForUser_deletes_only_matched_user_prefix`
- [ ] Run command
- [ ] Expected: FAIL
- [ ] Implement `clearSessionDraftsForUser`
- [ ] Run same test -> Expected: PASS
- [ ] Write failing test `test_save_fails_gracefully_when_sessionStorage_throws`
- [ ] Run command
- [ ] Expected: FAIL
- [ ] Implement robust try-catch
- [ ] Run same test -> Expected: PASS
- [ ] Run related regression tests
- [ ] Commit `feat: add session draft storage foundation`

---

## Task 2 — SessionDraft State Machine & hook lifecycle

Extract the business logic into a pure module and create the reusable React hook wrapping the service.

**Files Created:**
- `src/domain/sessionDraftState.ts` (pure helpers for state machine / validation)
- `tests/sessionDraftState.test.mjs`
- `src/hooks/useSessionDraft.ts` (React glue)

**Responsibilities & API:**
- Define `DraftEntityValidation = 'unknown' | 'valid' | 'invalid';`
- Extract pure functions like `computeDraftValidationState(...)` into `sessionDraftState.ts`.
- Expose `[data, setData]` via `useState(() => loadSessionDraft(key))` for zero-flash lazy restoration.
- Maintain a stable `latestRef` of the envelope for reliable unmount flushing.
- Implement synchronous write-through (on `setData`, immediately invoke `saveSessionDraft`).
- Wire `visibilitychange` (only when `document.visibilityState === 'hidden'`) and `pagehide` to force a final flush.
- Manage the decision state (`isDecisionOpen`), ensuring it triggers only if `dirty`.

**TDD Steps:**
- [ ] Write failing test `test_validation_remains_unknown_if_missing_but_loading` in `tests/sessionDraftState.test.mjs`
- [ ] Run `node --test tests/sessionDraftState.test.mjs`
- [ ] Expected: FAIL
- [ ] Implement `computeDraftValidationState`
- [ ] Run same test -> Expected: PASS
- [ ] Write failing test `test_validation_invalid_triggers_removal`
- [ ] Run command
- [ ] Expected: FAIL
- [ ] Implement removal logic
- [ ] Run same test -> Expected: PASS
- [ ] Implement React glue (`useSessionDraft.ts`)
- [ ] Commit `feat: add persistent session draft hook and state logic`

---

## Task 3 — UnsavedDraftDecision UI & Localization

Add the internal decision overlay and the required AR/TR/EN translation keys.

**Files Created:**
- `src/components/UnsavedDraftDecision.tsx`

**Files Modified:**
- `src/i18n/locales/ar.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/tr.ts`

**Responsibilities:**
- [ ] Add the 8 required localization strings (`drafts.unsavedTitle`, `drafts.keepDraft`, etc.) to `ar.ts`, `en.ts`, `tr.ts`.
- [ ] Build `UnsavedDraftDecision` inside a basic HTML container, accepting `onContinue`, `onKeep`, `onDiscard` props.
- [ ] Ensure buttons are fully localized.
- [ ] Implement initial focus to the safest action ("Continue Editing").

**Commit:**
`feat: add unsaved draft decision UI and locales`

---

## Task 4 — Event editor integration

Wire the Admin Events forms to the new draft architecture. Note: `modalOpen` and `editId` are explicitly EXCLUDED from `EventDraftData` because they are intrinsic to `SessionDraftEnvelope` and the hook keys.

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
- President: Event ID exists in global `events` array => `valid`.
- Non-President: Implement asynchronous loading state (`ownedEventIdsLoaded`). Before `listOwnEventIds()` resolves, validation = `unknown`. If loaded and event exists but not owned => `invalid`. If loaded and owned => `valid`.

**Files Modified:**
- `src/pages/AdminDashboard.tsx`

**Responsibilities:**
- [ ] Connect `useSessionDraft` using `draft:v1:<userId>:admin:events:create` and `draft:v1:<userId>:admin:events:edit:<eventId>`.
- [ ] Ensure `onClose` of the Event `<Modal>` is context-aware:
  - If `decisionState` active: `Escape` or `backdrop` -> triggers "Continue Editing" (does not close modal).
  - If `decisionState` inactive: `Escape` or `backdrop` -> triggers explicit close handler.
- [ ] Render `<UnsavedDraftDecision>` inside the Modal body if decision active.
- [ ] Successful submit clears the draft. Failed submit retains the draft.

**Commit:**
`feat: persist event editor drafts`

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
- Current user must still have access to `NewsTab`.
- Restored entity must still exist in authoritative `news` data for edit mode. While `news` data is not confirmed loaded, validation = `unknown`.

**Files Modified:**
- `src/pages/AdminDashboard.tsx`

**Responsibilities:**
- [ ] Connect `useSessionDraft`.
- [ ] Implement identical context-aware `onClose` behavior for the News `<Modal>`.
- [ ] Successful submit explicitly invokes `clearDraft()`.

**Commit:**
`feat: persist news editor drafts`

---

## Task 6 — Student Suggestion integration

Wire the Student Suggestion composer to the draft architecture.

**Exact `StudentSuggestionDraftData` Shape:**
```typescript
{
  title, body, category, targetRole
}
```
*Note: The selected tab is tracked via `ui: { activeTab: 'suggestions' }` in the envelope, NOT in the data.*

**Files Modified:**
- `src/pages/StudentDashboard.tsx`

**Responsibilities:**
- [ ] Connect `useSessionDraft` using `draft:v1:<userId>:student:suggestion:create`.
- [ ] Explicitly track `tab === 'suggestions'` as lightweight UI state inside the draft payload so returning to `StudentDashboard` forces the tab back.
- [ ] Navigating away seamlessly triggers the `unmount` flush, saving the data.
- [ ] Successful submit clears the suggestion draft.

**Commit:**
`feat: persist student suggestion drafts`

---

## Task 7 — logout ownership cleanup

Intercept the logout flow to defensively clear owned drafts.

**Files Modified:**
- `src/context/AppContext.tsx`

**Responsibilities:**
- [ ] Locate `const logout = async () => { ... }` in `AppContext.tsx`.
- [ ] Retrieve `const currentUserId = currentUser?.userId;`.
- [ ] If `currentUserId` is defined, strictly before/alongside `supabase.auth.signOut()`, invoke `SessionDraftService.clearSessionDraftsForUser(currentUserId)`.
- [ ] Ensure this is highly defensive and does not crash the logout process if it fails.

**TDD Steps:**
- [ ] Since `AppContext` involves React Context and Supabase integration, test manually by logging in, creating a draft, logging out, and checking `sessionStorage` in DevTools.
- [ ] Commit: `fix: clear owned session drafts on logout`

---

## Task 8 — Phase 1 integration/regression verification

Execute final verification against the 33-point testing matrix.

| # | Requirement | Task | Automated Test File/Test Name | Manual? |
|---|---|---|---|---|
| 1 | Draft survives component unmount/remount. | T4/T6 | N/A | Yes (DOM unmount testing) |
| 2 | Draft survives internal page navigation. | T4/T6 | N/A | Yes (React Router testing) |
| 3 | `open=true` draft auto-reopens correctly upon returning. | T2 | `tests/sessionDraftState.test.mjs` - `test_open_true_restoration` | No |
| 4 | Exact form string/boolean values restore correctly. | T1 | `tests/sessionDraftService.test.mjs` - `test_save_load_roundtrips_JSON` | No |
| 5 | AR/TR/EN translation payloads restore accurately. | T1 | `tests/sessionDraftService.test.mjs` - `test_save_load_roundtrips_JSON` | No |
| 6 | Active translation locale tab restores seamlessly. | T4/T5 | N/A | Yes (UI check) |
| 7 | Create and Edit keys categorically cannot collide. | T1 | `tests/sessionDraftService.test.mjs` - `test_key_builder_separates_create_edit` | No |
| 8 | Edit Entity A and Edit Entity B keys cannot collide. | T1 | `tests/sessionDraftService.test.mjs` - `test_key_builder_separates_entities` | No |
| 9 | User A cannot read, restore, or access User B's draft. | T1 | `tests/sessionDraftService.test.mjs` - `test_key_builder_isolates_users` | No |
| 10 | Successful form submission automatically clears the draft. | T4/T6 | N/A | Yes (Submit flow integration) |
| 11 | Failed form submission safely keeps the draft. | T4/T6 | N/A | Yes (Submit flow integration) |
| 12 | Dirty explicit close transitions accurately to decision state. | T2 | `tests/sessionDraftState.test.mjs` - `test_dirty_close_enters_decision` | No |
| 13 | "Continue Editing" successfully keeps the editor open. | T2 | `tests/sessionDraftState.test.mjs` - `test_continue_action_keeps_open` | No |
| 14 | "Keep Draft" closes the editor + retains data + saves `open=false`. | T2 | `tests/sessionDraftState.test.mjs` - `test_keep_action_closes_and_saves` | No |
| 15 | Manually invoking Add/Edit for a saved closed draft rehydrates. | T4/T6 | N/A | Yes (Manual UI check) |
| 16 | "Discard Draft" clears the data and closes the editor. | T2 | `tests/sessionDraftState.test.mjs` - `test_discard_action_clears_data` | No |
| 17 | Pristine close bypasses the decision prompt entirely. | T2 | `tests/sessionDraftState.test.mjs` - `test_pristine_close_bypasses_decision` | No |
| 18 | Explicit logout successfully clears owned drafts. | T7 | N/A | Yes (Logout flow integration) |
| 19 | Malformed JSON handles safely and does not crash the UI. | T1 | `tests/sessionDraftService.test.mjs` - `test_load_handles_malformed_JSON` | No |
| 20 | `sessionStorage` unavailable/throws degrades gracefully. | T1 | `tests/sessionDraftService.test.mjs` - `test_save_fails_gracefully` | No |
| 21 | Confirmation/read-only modals are proven to bypass persistence. | N/A | N/A (Excluded by design) | Yes |
| 22 | Passwords/tokens/security data are proven to bypass persistence. | N/A | N/A (Excluded by design) | Yes |
| 23 | `File`, `Blob`, and runtime objects are never serialized. | T1 | `tests/sessionDraftService.test.mjs` - `test_strips_invalid_data` | No |
| 24 | Stale edit draft patiently waits while validation is `unknown`. | T2 | `tests/sessionDraftState.test.mjs` - `test_validation_remains_unknown` | No |
| 25 | Stale deleted/unauthorized edit draft is removed strictly only after `invalid` is confirmed. | T2 | `tests/sessionDraftState.test.mjs` - `test_validation_invalid_triggers_removal` | No |
| 26 | Visibility/pagehide flush always uses the latest value. | T2 | N/A | Yes (Browser event integration) |
| 27 | Restored modal does not flash an empty state before hydration. | T2 | N/A | Yes (Lazy init visual check) |
| 28 | Separate browser tabs naturally maintain isolated `sessionStorage`. | T1 | N/A (Native browser feature) | Yes |
| 29 | Current push/notification behavior remains entirely unaffected. | T8 | N/A | Yes (Regression check) |
| 30 | Current structural submit and validation behavior remains intact. | T8 | N/A | Yes (Regression check) |
| 31 | Escape key press while decision state is active safely returns to the editor. | T4/T5 | N/A | Yes (DOM Event check) |
| 32 | Backdrop click while decision state is active safely returns to the editor. | T4/T5 | N/A | Yes (DOM Event check) |
| 33 | Neither Escape nor backdrop actions while in decision state clear the draft. | T4/T5 | N/A | Yes (DOM Event check) |

*(Also explicitly test managed asset references vs. local File objects to guarantee integrity manually).*

Execute required scripts:
```bash
node --test tests/*.test.mjs
npm run typecheck
npm run lint
npm run build
git diff --check
```
