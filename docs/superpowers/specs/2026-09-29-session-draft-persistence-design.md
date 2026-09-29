# Session Draft Persistence Architecture Design

## 1. Problem Statement
Currently, throughout the application, many forms and editor modals lose all their unsaved information if their React component unmounts. For example, if a user starts composing a long Arabic description in the "Create Event" modal and navigates to another page to copy a Turkish translation, all typed content is permanently lost upon returning. This is unacceptable UX. The application needs a robust, modern persistent-draft system so that forms and editors naturally preserve their state during internal navigation and browser interruptions.

## 2. Complete Inventory of Forms & Editors
Below is the exhaustive inventory of all identified long-form create/edit/compose surfaces targeted for this architecture, explicitly distinguishing Phase 1 selections.

| Surface | Component/File | Create/Edit/Compose | Current State Owner | Unmount Destroys State? | Should Persist? | Sensitive? | Has File Input? | Has Translations? | Priority | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **Admin Events** | `AdminDashboard.tsx` | Create/Edit | `modalOpen`, `form`, `editId` | Yes | Yes | No | Yes | Yes | **Phase 1** | Primary target for testing |
| **Admin News** | `AdminDashboard.tsx` | Create/Edit | `modalOpen`, `form`, `editId` | Yes | Yes | No | Yes | Yes | **Phase 1** | Primary target for testing |
| **Student Suggestion** | `StudentDashboard.tsx` | Compose | inline `form` state | Yes | Yes | No | No | No | **Phase 1** | Core student interaction |
| Gallery Album | `AdminDashboard.tsx` / `MediaGallery.tsx` | Create/Edit | `albumModalOpen`, `albumForm` | Yes | Yes | No | Yes | Yes | Phase 2 | |
| Gallery Media | `AdminDashboard.tsx` / `MediaGallery.tsx` | Create/Edit | `mediaModalOpen`, `mediaForm` | Yes | Yes | No | Yes | Yes | Phase 2 | |
| Gallery Category | `MediaGallery.tsx` | Create/Edit | `categoryModalOpen`, `categoryForm` | Yes | Yes | No | No | Yes | Phase 2 | |
| Board Member | `AdminDashboard.tsx` / `CommitteePage.tsx` | Create/Edit | `memberModal`, `memberForm` | Yes | Yes | No | Yes | Yes | Phase 2 | |
| Board Head | `AdminDashboard.tsx` / `CommitteePage.tsx` | Edit | `headModal`, `headForm` | Yes | Yes | No | Yes | Yes | Phase 2 | |
| Responsibility | `AdminDashboard.tsx` / `CommitteePage.tsx` | Create/Edit | `respModal`, `respForm` | Yes | Yes | No | No | Yes | Phase 2 | |
| Plans | `AdminDashboard.tsx` | Create/Edit | `planModal`, `planForm` | Yes | Yes | No | Yes | Yes | Phase 2 | |
| Reports | `AdminDashboard.tsx` | Create/Edit | `reportModal`, `reportForm` | Yes | Yes | No | Yes | Yes | Phase 2 | |
| FAQ Category | `FAQPage.tsx` | Create/Edit | `catModalOpen`, `catForm` | Yes | Yes | No | No | Yes | Phase 2 | |
| FAQ Question | `FAQPage.tsx` | Create/Edit | `qModalOpen`, `qForm` | Yes | Yes | No | No | Yes | Phase 2 | |
| Contact Card | `ContactPage.tsx` | Edit | `cardModalOpen`, `cardForm` | Yes | Yes | No | No | Yes | Phase 2 | |
| Contact Map | `ContactPage.tsx` | Edit | `mapModalOpen`, `mapForm` | Yes | Yes | No | No | Yes | Phase 2 | |
| Guide Section | `StudentGuide.tsx` | Create/Edit | `sectionModalOpen`, `sectionForm` | Yes | Yes | No | No | Yes | Phase 2 | |
| Guide Item | `StudentGuide.tsx` | Create/Edit | `itemModalOpen`, `itemForm` | Yes | Yes | No | Yes | Yes | Phase 2 | |
| Guide Contact | `StudentGuide.tsx` | Create/Edit | `contactModalOpen`, `contactForm` | Yes | Yes | No | No | Yes | Phase 2 | |
| Profile Editor | `StudentDashboard.tsx` | Edit | `editOpen`, `profileForm` | Yes | Yes | No | Yes | No | Phase 2 | |
| Programs Event | `ProgramsPage.tsx` | Create/Edit | `modalOpen`, `form` | Yes | Yes | No | Yes | Yes | Phase 2 | |
| Excuse Activity | `ProgramsPage.tsx` | Compose | `excuseActivity`, `excuseReason` | Yes | Yes | No | Yes | No | Phase 2 | |
| Suggestion Reply | `AdminDashboard.tsx` | Compose | `replyOpen`, `replyForm` | Yes | No | No | No | No | *Excluded* | Transient/Read-heavy |
| Internal Tasks | (various) | Create/Edit | `taskModalOpen` | Yes | Yes | No | No | No | Phase 2 | |
| Internal Activity | (various) | Create/Edit | `activityModalOpen` | Yes | Yes | No | No | No | Phase 2 | |
| **Delete Confirmations** | (various) | Action | (various) | Yes | **No** | No | No | No | *Excluded* | Transient state |
| **Role Transfers** | (various) | Action | (various) | Yes | **No** | No | No | No | *Excluded* | Transient state |
| **Auth/Password** | `Auth.tsx` / `ResetPassword.tsx` | Edit | - | Yes | **No** | **Yes**| No | No | *Excluded* | Security risk |

**Total Inventory Row Count: 27 components/surfaces mapped.**

## 3. UX Semantics
The persistence system must differentiate between **Internal Navigation** and **Explicit Close**:
- **Internal Navigation**: Navigating away without closing the editor automatically saves the draft, including the `open=true` state. Returning to the page automatically reopens the editor exactly as it was.
- **Explicit Close**: Clicking "X", Cancel, or the backdrop on a dirty editor triggers a 3-choice confirmation:
  1. **Continue editing**: Keeps the editor open and does nothing.
  2. **Keep draft**: Closes the editor (`open=false`) but retains the data in storage. Returning to the page does NOT auto-open it, but clicking "Add/Edit" again restores the saved data.
  3. **Discard draft**: Deletes the draft entirely and closes the editor.

## 4. Accessibility and Dialog Architecture
The existing `src/components/Modal.tsx` handles some basics (Escape listener, backdrop click, aria-label) but lacks robust accessible dialog compliance (e.g., `role="dialog"`, `aria-modal="true"`, focus trapping).

**Crucially, the dirty-close confirmation MUST NOT be implemented as a second stacked `<Modal>` overlay.** Two simultaneous modals create Escape-listener race conditions, focus-trap bugs, and close-order unpredictability.

**Architecture**: The editor remains the single outer modal context. When a dirty explicit-close is requested, the editor seamlessly swaps its internal body view into a "close decision" state (`UnsavedDraftDecision`). 
- There is only one Escape listener.
- Focus is cleanly moved into the decision controls.
- "Continue Editing" swaps the view back and restores focus to the editor inputs.
- Future enhancements to `<Modal>` should add `role="dialog"`, `aria-modal="true"`, and native focus trapping.

## 5. Storage Choice & Contract Semantics
The architecture will use **`sessionStorage`** as the underlying store.
- **Product Contract**: Drafts are intentionally session-scoped. There is no permanent database/`localStorage` draft retention. Closing the browser is NOT guaranteed to be a cross-browser deletion boundary (some browsers restore sessionStorage on reopening). Explicit user logout is the absolute boundary that clears owned drafts.
- No aggressive TTL is required for Phase 1. 

## 6. Draft Key Design
Drafts must be strictly isolated to prevent cross-user contamination and collisions between create and edit modes. 
`draft:v1:<userId>:<feature>:<mode>[:entityId]`

Examples:
- `draft:v1:usr_123:admin:events:create`
- `draft:v1:usr_123:admin:events:edit:evt_456`
- `draft:v1:usr_890:student:suggestion:create`

## 7. Draft Envelope and Serializable Payload
To ensure type safety and serialization bounds, drafts will be wrapped in a versioned envelope:
```typescript
interface SessionDraftEnvelope<T> {
  version: 1;
  userId: string;
  key: string;
  updatedAt: string;
  open: boolean;
  dirty: boolean;
  baselineFingerprint?: string; // For accurate edit-mode dirty diffing
  value: T; // MUST BE STRICTLY JSON-SERIALIZABLE
  ui?: {
    activeLocale?: string;
    fileReselectionRequired?: boolean;
  };
}
```

**Explicitly Serializable Constraint**: Arbitrary component state must NOT be blindly serialized. 
- The runtime state must pass through a strict adapter (e.g., `toDraftData(form)`).
- `File`, `Blob`, Object URLs, DOM objects, functions, and Promises are **strictly forbidden** from the persisted envelope.
- **File Uploads**: Unuploaded `File` objects are dropped, and `ui.fileReselectionRequired = true` is set if needed. Already-uploaded, stable `ManagedAssetReferences` (URLs or IDs) are safe to persist. The system must never automatically upload a file merely to satisfy draft persistence.

## 8. Save Frequency (Phase 1)
To avoid debounce complexity and last-keystroke data loss, Phase 1 will use **synchronous write-through persistence**.
Whenever the runtime editor state changes:
1. The React state is updated.
2. A stable React `ref` captures the latest serializable envelope.
3. `sessionStorage.setItem` is written synchronously.

`pagehide` and `visibilitychange` (only when `document.visibilityState === 'hidden'`) serve strictly as defensive flush mechanisms using the stable `ref`, entirely eliminating stale-closure risks.

## 9. Restore Initialization (No UI Flash)
To prevent the jarring UX of a clean editor appearing and jumping to populated state a frame later, `useSessionDraft` will utilize lazy initialization for its React state:
```typescript
const [data, setData] = useState(() => {
  const draft = SessionDraftService.load(key);
  return draft?.value ?? defaultData;
});
```
The storage is read synchronously during the initial render phase. Validation is performed immediately, and `open` state is accurately initialized, preventing any layout thrashing or empty form flashing.

## 10. Open/Closed Restore Semantics
The state machine strictly dictates:
- **`open: true`**: Returning to the owning surface auto-reopens the editor immediately upon component mount.
- **`open: false`**: Returning to the surface does NOT auto-open. The user must manually invoke the identical action (e.g., click "Add Event" or "Edit Event X") to resurrect the saved draft. 
- Editing Entity X restores strictly Entity X's draft. It must never bleed into Entity Y.

## 11. Stale Edit-Draft Validation
Entity validation must gracefully handle asynchronous server loads without immediately discarding a valid draft. A 3-state validation model is used:
1. **UNKNOWN (Loading)**: Retain draft. Do not auto-delete. Wait for authoritative data.
2. **VALID**: Restore and permit editing.
3. **INVALID**: The entity was deleted or permission was lost. Safely delete the stale draft from storage and optionally show a localized non-blocking notice. The editor remains closed.

## 12. Dirty Baselines
- **CREATE**: `baseline = canonical clean DraftData`.
- **EDIT**: `baseline = normalized server snapshot` captured when the editor was originally opened. 
To guarantee deterministic dirty comparisons across remounts, the hook will compute a `baselineFingerprint` (e.g., hash or serialized subset) of the initial entity snapshot and persist it inside the envelope. Continuous prop changes must not accidentally turn a dirty draft clean.

## 13. Auth Owner Change and Logout
Ownership lifecycle is strict:
- On explicit logout, `SessionDraftService.clearAllForUser(currentUserId)` is invoked before/with identity teardown.
- Defensive fallback: If auth ownership unexpectedly changes without a normal logout path, the strict `userId` property inside the draft envelope guarantees that the new user cannot deserialize the previous user's payload. The old keys remain dormant/inaccessible until safely garbage collected.

## 14. Localization Requirements
All persistence UI elements must be localized dynamically (AR/TR/EN):
- `drafts.unsavedTitle`: "Unsaved draft" (مسودة غير محفوظة)
- `drafts.unsavedDescription`: "You have unsaved changes. What would you like to do?" (لديك تعديلات غير محفوظة. ماذا تود أن تفعل؟)
- `drafts.continueEditing`: "Continue editing" (متابعة التعديل)
- `drafts.keepDraft`: "Keep draft" (الاحتفاظ بالمسودة)
- `drafts.discardDraft`: "Discard draft" (تجاهل المسودة)
- `drafts.restored`: "A saved draft was restored." (تم استعادة مسودة محفوظة.)
- `drafts.staleDiscarded`: "The record is no longer available. Draft discarded." (السجل لم يعد متاحاً. تم تجاهل المسودة.)
- `drafts.fileReselectionRequired`: "Please reselect your unuploaded file." (يرجى إعادة تحديد الملف غير المرفوع.)

## 15. Testing Matrix
The future implementation MUST satisfy all 30 of the following behavioral tests:
1. Draft survives component unmount/remount.
2. Draft survives internal page navigation.
3. `open=true` draft auto-reopens correctly upon returning.
4. Exact form string/boolean values restore correctly.
5. AR/TR/EN translation payloads restore accurately.
6. Active translation locale tab restores seamlessly.
7. Create and Edit keys categorically cannot collide.
8. Edit Entity A and Edit Entity B keys cannot collide.
9. User A cannot read, restore, or access User B's draft.
10. Successful form submission automatically clears the draft.
11. Failed form submission safely keeps the draft.
12. Dirty explicit close transitions accurately to the decision state overlay.
13. "Continue Editing" successfully keeps the editor open.
14. "Keep Draft" closes the editor + retains data + saves `open=false`.
15. Manually invoking Add/Edit for a saved closed draft rehydrates the data perfectly.
16. "Discard Draft" clears the data and closes the editor.
17. Pristine close bypasses the decision prompt entirely.
18. Explicit logout successfully clears owned drafts.
19. Malformed JSON handles safely and does not crash the UI.
20. `sessionStorage` unavailable/throws degrades gracefully without breaking the forms.
21. Confirmation/read-only modals are proven to bypass persistence entirely.
22. Passwords/tokens/security data are proven to bypass persistence entirely.
23. `File`, `Blob`, and runtime objects are never serialized.
24. Stale edit draft patiently waits while validation is `unknown`.
25. Stale deleted/unauthorized edit draft is removed strictly only after `invalid` is confirmed.
26. Visibility/pagehide flush always uses the latest value, escaping stale React closures.
27. Restored modal does not flash an empty state before hydration.
28. Separate browser tabs naturally maintain isolated `sessionStorage` drafts.
29. Current push/notification behavior remains entirely unaffected.
30. Current structural submit and validation behavior remains perfectly intact.
*(Also explicitly test managed asset references vs. local File objects to guarantee integrity).*

## 16. Manual Acceptance Scenarios

**Scenario 1: President Events Workflow**
1. President opens Admin Events tab.
2. Clicks Add Event.
3. Writes Arabic title and long description.
4. Navigates to Admin News tab.
5. Returns to Events tab.
- **Expected**: Event modal auto-opens. All fields are restored. No confirmation prompted during navigation.
6. President clicks X to explicitly close.
- **Expected**: Close-decision UI overlay appears within the modal.
7. Selects "Keep draft".
- **Expected**: Modal closes.
8. Clicks Add Event again.
- **Expected**: Modal opens with the preserved Arabic title and description.
9. Submits form successfully.
- **Expected**: Draft is deleted. Reopening Add Event yields a clean form.

**Scenario 2: Student Suggestion Workflow**
1. Student begins writing a suggestion on the `suggestions` tab of the Student Dashboard.
2. Clicks on the `activities` tab within the dashboard to review a past activity.
3. Clicks back to the `suggestions` tab.
- **Expected**: The suggestion composer seamlessly retains the title, body, category, and targetRole without any data loss or prompts.

## 17. Implementation Boundaries
The Phase 1 code implementation will be localized to the following proposed architecture:
- **`src/domain/sessionDraft.ts`**: Contains `SessionDraftService` (storage I/O, envelope serialization, prefix isolation).
- **`src/hooks/useSessionDraft.ts`**: The reusable React abstraction bridging local state, initialization, and write-through sync.
- **`src/components/UnsavedDraftDecision.tsx`**: The decision state UI component rendered inside the existing modal bounds.
- **Existing Files Modified**:
  - `src/pages/AdminDashboard.tsx` (Events/News editors bound to the new hook).
  - `src/pages/StudentDashboard.tsx` (Suggestion composer bound to the new hook).
  - `src/services/authService.ts` (or equivalent context) to inject logout cleanup.
  - Translation files (AR/TR/EN JSON dictionaries).

## 18. Explicit Exclusions
The following components will intentionally **not** use draft persistence:
- **Destructive Confirmations**: Delete Member, Delete Event, Transfer Role. (These are transient confirmations that should not randomly reopen).
- **Security Contexts**: Password change, forgot password, login forms.
- **Transient UI**: Loading states, success banners, network errors.
- **Read-Only Modals**: Suggestion review/reply panels that don't involve long-form data entry from the viewer.

## 19. Risks / Trade-offs
- **File Uploads UX**: Users might be briefly confused if text fields are restored but an unuploaded File picker is cleared. The localized `drafts.fileReselectionRequired` notice mitigates this.
- **Entity Deletions**: In the extremely rare case an entity is deleted while an edit draft is open in another tab, the `invalid` stale cleanup rule cleanly intercepts the conflict.
