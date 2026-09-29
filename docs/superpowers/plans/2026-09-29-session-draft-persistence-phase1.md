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
   - *Test:* "User A cannot read, restore, or access User B's draft."
2. **Stale Closure Bugs (Data Loss):** Navigating away fast might capture a stale React state closure, causing the last keystrokes to disappear.
   - *Test:* "Visibility/pagehide flush always uses the latest value, escaping stale React closures."
3. **Escape/Focus Trapping Conflicts:** Adding a decision overlay could cause an Escape press to accidentally dismiss both the decision state and the outer editor entirely.
   - *Test:* "Escape key press while decision state is active safely returns to the editor."
4. **Stale Edit-Draft Validation Conflict:** A user might have a saved edit draft for an Event that gets deleted by another Admin. If not validated, opening it could crash or re-create an invalid state.
   - *Test:* "Stale deleted/unauthorized edit draft is removed strictly only after `invalid` is confirmed."
5. **SessionStorage Quota Exceeded/Disabled:** Incognito mode or a full disk might throw errors on `setItem`, breaking the entire page.
   - *Test:* "`sessionStorage` unavailable/throws degrades gracefully without breaking the forms."

---

## Task 1 — SessionDraftService domain foundation

Create the storage abstraction that handles keys, envelopes, and safely falls back on failure without touching React.

**Files Created:**
- `src/domain/sessionDraft.ts`
- `tests/sessionDraftService.test.mjs` (or similar targeted test file)

**Responsibilities:**
- [ ] Implement `draft:v1:<userId>:<feature>:<mode>[:entityId]` key builder.
- [ ] Implement `SessionDraftEnvelope<T>` type definition.
- [ ] Implement `save(key, data)`, `load(key)`, `remove(key)` with robust try/catch around `sessionStorage`.
- [ ] Implement `clearAllForUser(userId)` string-prefix matching.
- [ ] Handle malformed JSON safely during `load`.
- [ ] Prevent serialization of `File`, `Blob`, and functions (enforce JSON safety).

**Tests Required:**
- [ ] Key builder outputs exact grammar.
- [ ] Save/load handles malformed JSON without crashing.
- [ ] `clearAllForUser` deletes only matched prefixes.
- [ ] `sessionStorage` exceptions are caught and swallowed gracefully.
- [ ] `File` types throw or are explicitly excluded by design.

**Commit:**
`feat: add session draft storage foundation`

---

## Task 2 — useSessionDraft hook lifecycle

Create the reusable React hook wrapping the service, managing write-through updates, and the 3-state validation.

**Files Created:**
- `src/hooks/useSessionDraft.ts`

**Responsibilities:**
- [ ] Expose `[data, setData]` via `useState(() => load(key))` for zero-flash lazy restoration.
- [ ] Maintain a stable `latestRef` of the envelope for reliable unmount flushing.
- [ ] Implement synchronous write-through (on `setData`, immediately invoke `SessionDraftService.save`).
- [ ] Wire `visibilitychange` (only when `document.visibilityState === 'hidden'`) and `pagehide` to force a final flush using the stable ref.
- [ ] Compute `dirty` safely using `baselineFingerprint` for Edits, or `defaultData` for Creates.
- [ ] Manage the decision state (`isDecisionOpen`), ensuring it triggers only if `dirty` when explicitly closing.
- [ ] Implement stale validation logic (`unknown`, `valid`, `invalid`) preventing premature deletions.

**Tests Required:**
- [ ] No initial empty-state flash on mount.
- [ ] Synchronous write-through always uses the latest ref value.
- [ ] Pagehide accurately persists the very last change.
- [ ] Stale validation `unknown` does not delete draft.
- [ ] Stale validation `invalid` aggressively drops the draft.

**Commit:**
`feat: add persistent session draft hook`

---

## Task 3 — UnsavedDraftDecision UI & Localization

Add the internal decision overlay and the required AR/TR/EN translation keys.

**Files Created:**
- `src/components/UnsavedDraftDecision.tsx`

**Files Modified:**
- Translation JSONs (`en/translation.json`, `ar/translation.json`, `tr/translation.json`)

**Responsibilities:**
- [ ] Add the 8 required localization strings (`drafts.unsavedTitle`, `drafts.keepDraft`, etc.) to AR/TR/EN.
- [ ] Build the component inside a basic HTML container (not a nested `Modal`), accepting `onContinue`, `onKeep`, `onDiscard` props.
- [ ] Ensure buttons are fully localized.
- [ ] Implement initial focus to the safest action ("Continue Editing").

**Tests Required:**
- [ ] AR/TR/EN values render correctly.
- [ ] Clicking "Keep Draft" triggers the `onKeep` handler.

**Commit:**
`feat: add unsaved draft decision UI and locales`

---

## Task 4 — Event editor integration

Wire the Admin Events forms to the new draft architecture.

**Files Modified:**
- `src/pages/AdminDashboard.tsx` (Specifically the `EventsManagement` sections).

**Responsibilities:**
- [ ] Connect `useSessionDraft` using `draft:v1:<userId>:admin:events:create` and `draft:v1:<userId>:admin:events:edit:<eventId>`.
- [ ] The serializable payload must include: `form` (title, category, date, etc.), `translations`, `editId`, and `modalOpen`.
- [ ] Update `onClose` of the Event `<Modal>` to be context-aware:
  - If `decisionState` is active: `Escape` or `backdrop` -> triggers "Continue Editing" (does not close modal).
  - If `decisionState` is inactive: `Escape` or `backdrop` -> triggers the hook's explicit close handler.
- [ ] Render `<UnsavedDraftDecision>` inside the Modal body if the decision state is active, hiding the standard form.
- [ ] On successful submit, explicitly invoke `clearDraft()`.
- [ ] On failed submit, retain draft.
- [ ] When an Edit draft is restored, ensure the entity data validation confirms the event still exists.

**Tests Required:**
- [ ] Event Create vs Edit collision prevention.
- [ ] Escape during decision state -> Continue behavior (editor stays open).
- [ ] Successful submit accurately clears the event draft.

**Commit:**
`feat: persist event editor drafts`

---

## Task 5 — News editor integration

Wire the Admin News forms to the new draft architecture.

**Files Modified:**
- `src/pages/AdminDashboard.tsx` (Specifically the `NewsManagement` sections).

**Responsibilities:**
- [ ] Connect `useSessionDraft` using `draft:v1:<userId>:admin:news:create` and `draft:v1:<userId>:admin:news:edit:<newsId>`.
- [ ] The serializable payload must include: `form` (title, excerpt, fullContent, pinnedOnHomepage, etc.), `translations` (TR and EN), `editId`, and `modalOpen`.
- [ ] Implement the identical context-aware `onClose` behavior for the News `<Modal>`.
- [ ] Ensure any local unuploaded file references (e.g. `image` blobs if local) are excluded or replaced by string flags.
- [ ] On successful submit, explicitly invoke `clearDraft()`.

**Tests Required:**
- [ ] News Create vs Edit collision prevention.
- [ ] Exact AR/TR/EN translation restoration logic.

**Commit:**
`feat: persist news editor drafts`

---

## Task 6 — Student Suggestion integration

Wire the Student Suggestion composer to the draft architecture.

**Files Modified:**
- `src/pages/StudentDashboard.tsx`

**Responsibilities:**
- [ ] Connect `useSessionDraft` using `draft:v1:<userId>:student:suggestion:create`.
- [ ] Payload must include: `title`, `body`, `category`, `targetRole`.
- [ ] Explicitly track the selected `tab === 'suggestions'` as lightweight UI state inside the draft payload so returning to `StudentDashboard` forces the tab back to suggestions.
- [ ] Since it's inline (not a Modal), navigating away seamlessly triggers the `unmount` flush, saving the data.
- [ ] Successful submit clears the suggestion draft.

**Tests Required:**
- [ ] Student selected suggestions tab restoration after real dashboard unmount (e.g., navigating to Home).
- [ ] Student user ownership isolation (Student A cannot read Student B's draft).

**Commit:**
`feat: persist student suggestion drafts`

---

## Task 7 — logout ownership cleanup

Intercept the logout flow to defensively clear owned drafts.

**Files Modified:**
- `src/context/AppContext.tsx` (specifically the `logout` function)

**Responsibilities:**
- [ ] Locate `const logout = async () => { ... }` in `AppContext.tsx`.
- [ ] Before or precisely after `supabase.auth.signOut()`, invoke `SessionDraftService.clearAllForUser(currentUser.id)`.
- [ ] Ensure this is highly defensive and does not crash the logout process if it fails.

**Tests Required:**
- [ ] Logout cleanup cleanly deletes owned drafts.
- [ ] Unrelated session storage items remain intact after logout.

**Commit:**
`fix: clear owned session drafts on logout`

---

## Task 8 — Phase 1 integration/regression verification

Execute final verification against the 33-point testing matrix.

**Responsibilities:**
- [ ] Run full automated test suite to verify existing submit/validation rules remain intact.
- [ ] Manually verify Scenario 1 (Admin Events Workflow) through the UI.
- [ ] Manually verify Scenario 2 (Student Suggestion Workflow), explicitly unmounting the dashboard by navigating to the "Home" or "Guide" route, then returning.
- [ ] Execute required scripts:
  ```bash
  npm test
  npm run typecheck
  npm run lint
  npm run build
  git diff --check
  ```

**Commit:**
No commit needed if all passes, otherwise fold fixes into relevant task commits.
