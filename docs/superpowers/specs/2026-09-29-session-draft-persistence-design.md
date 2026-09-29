# Session Draft Persistence Architecture Design

## 1. Problem Statement
Currently, throughout the application, many forms and editor modals lose all their unsaved information if their React component unmounts. For example, if a user starts composing a long Arabic description in the "Create Event" modal and navigates to another page to copy a Turkish translation, all typed content is permanently lost upon returning. This is unacceptable UX. The application needs a robust, modern persistent-draft system so that forms and editors naturally preserve their state during internal navigation and browser interruptions.

## 2. Current Architecture / Root Cause
Forms and modals across the application (e.g., in `AdminDashboard.tsx`, `StudentDashboard.tsx`, `ProgramsPage.tsx`, `MediaGallery.tsx`) manage their state exclusively using inline React `useState`. For example:
```tsx
const [modalOpen, setModalOpen] = useState(false);
const [form, setForm] = useState({ title: '', body: '' });
```
When a user navigates to a different page or section, the component unmounts. React naturally discards this component-local state. Upon returning to the page, the component remounts with the initial empty state, causing the permanent loss of the unsaved draft.

## 3. UX Semantics
The persistence system must differentiate between **Internal Navigation** and **Explicit Close**:
- **Internal Navigation**: Navigating away without closing the editor automatically saves the draft, including the `open=true` state. Returning to the page automatically reopens the editor exactly as it was.
- **Explicit Close**: Clicking "X", Cancel, or the backdrop on a dirty editor triggers a 3-choice confirmation:
  1. **Continue editing**: Keeps the editor open and does nothing.
  2. **Keep draft**: Closes the editor (`open=false`) but retains the data in storage. Returning to the page does NOT auto-open it, but clicking "Add/Edit" again restores the saved data.
  3. **Discard draft**: Deletes the draft entirely and closes the editor.

## 4. Storage Choice
The architecture will use **`sessionStorage`** as the underlying store.
- **Why**: It naturally survives component unmounts, internal router navigations, and page reloads within the same tab. It is isolated to the current tab session, naturally preventing drafts from leaking into permanent cross-session `localStorage` or cluttering the database unnecessarily. It avoids putting lengthy text in URL parameters.

## 5. Draft Key Design
Drafts must be strictly isolated to prevent cross-user contamination and collisions between create and edit modes. The standard key format will be:
`draft:v1:<userId>:<feature>:<mode>[:entityId]`

Examples:
- `draft:v1:usr_123:admin:events:create`
- `draft:v1:usr_123:admin:events:edit:evt_456`
- `draft:v1:usr_890:student:suggestion:create`

## 6. Draft Envelope Schema
To ensure type safety and schema validation, drafts will be wrapped in a versioned envelope:
```typescript
interface SessionDraftEnvelope<T> {
  version: 1;
  userId: string;
  key: string;
  updatedAt: string;
  open: boolean;
  dirty: boolean;
  value: T;
  ui?: {
    activeLocale?: string;
    activeStep?: string;
  };
}
```
The storage service will validate `version` and `userId` before restoring a draft. Malformed JSON or schema mismatches will fail gracefully (treating the draft as missing) rather than crashing the UI.

## 7. Hook / Service Architecture
The solution relies on a two-tier architecture:
1. **`SessionDraftService`**: A centralized utility that handles raw `sessionStorage` serialization/deserialization, key formatting, and schema validation.
2. **`useSessionDraft`**: A reusable React hook consumed by individual forms.
```typescript
function useSessionDraft<T>(options: {
  key: string | null; // null disables persistence
  defaultData: T;
  isDirty: (current: T, initial: T) => boolean;
}) {
  // Manages internal state, syncs to SessionDraftService on change, 
  // and handles unmount flush.
  return {
    isOpen,
    setIsOpen,
    data,
    setData,
    uiState,
    setUiState,
    handleExplicitClose,
    clearDraft,
  };
}
```

## 8. Dirty-State Model
A reliable `dirty` flag is crucial to prevent showing confirmation dialogs for completely untouched forms.
- For **Create Mode**: `isDirty` checks if the current `data` differs from the clean `defaultData`.
- For **Edit Mode**: `isDirty` checks if the current `data` differs from the initial database snapshot of the entity.

## 9. Restore Rules
When a component using `useSessionDraft` mounts:
1. Try to fetch the envelope from `SessionDraftService`.
2. Verify the envelope's `userId` matches the current authenticated user.
3. If it's an **Edit Draft**, optionally allow the component to verify the entity still exists. If the entity was deleted, the draft is deemed stale and is discarded.
4. If valid, initialize `data`, `isOpen`, `uiState` (like active locale), and `dirty` from the envelope.

## 10. Explicit Close Confirmation Flow
When `handleExplicitClose` is triggered:
- If `!dirty`: Close immediately (`isOpen=false`) without confirmation.
- If `dirty`: Render a fully accessible, localized three-choice modal overlay:
  - **Continue editing** -> No-op.
  - **Keep draft** -> Calls `setIsOpen(false)`, retains draft in `sessionStorage`.
  - **Discard draft** -> Calls `clearDraft()`, closes editor.

## 11. Navigation Behavior
Changes to the editor state trigger a lightweight save to `sessionStorage` (either immediately or via short debounce). To guarantee no data loss, a synchronous flush occurs on component `unmount`, `pagehide`, and `visibilitychange`. Returning to the route re-mounts the component, which sees `open=true` in the envelope and seamlessly restores the editor to the exact state the user left it.

## 12. Translation Handling
Multilingual CMS editors (e.g., `CmsEntityTranslationTabs`) will serialize their translation payloads (AR, TR, EN) within the `T` value of the envelope. The active translation tab is saved in `ui.activeLocale` so the user is immediately returned to the exact language tab they were editing.

## 13. File Upload Handling
`File`, `Blob`, and object URLs are unserializable and must **never** be stored in `sessionStorage`. 
- Unuploaded local files will be dropped from the draft payload (the user will need to re-select them).
- Stable managed-asset references (e.g., uploaded Supabase URLs or Asset IDs) will be safely persisted. Background uploads should not be forced just to satisfy draft state.

## 14. Security / Privacy
- **Strict Exclusions**: Forms handling passwords, password confirmations, tokens, or security credentials will intentionally **not** use draft persistence.
- **Tab Isolation**: `sessionStorage` naturally prevents drafts from persisting indefinitely or bleeding into other tabs.

## 15. Logout / User Isolation
On successful logout, an explicit cleanup function `SessionDraftService.clearAllForUser(userId)` will be invoked to delete all draft keys belonging to the logging-out user. Additionally, the envelope's `userId` check mathematically guarantees a new user signing in on the same browser cannot restore the previous user's drafts.

## 16. Stale Draft Handling
If an edit draft points to an entity ID that has been deleted or is no longer authorized for the current user, the system will discard it. The component using the hook will provide validation logic (e.g., checking if the `editId` exists in the loaded list of events).

## 17. Failure / Graceful Degradation
If `sessionStorage` is unavailable (due to privacy settings or quota limits) or throws an exception, `SessionDraftService` will catch the error safely. `useSessionDraft` will degrade gracefully to behave exactly like standard volatile React state, ensuring the website remains fully functional.

## 18. Accessibility
The 3-choice confirmation dialog will not rely on `window.confirm`. Instead, it will use the application's existing accessible `<Modal>` system, ensuring proper focus trapping, ARIA labels, and logical Tab/Escape behaviors.

## 19. Localization
All new UI elements will be fully localized:
- `drafts.unsavedTitle`: "Unsaved draft" (مسودة غير محفوظة)
- `drafts.continueEditing`: "Continue editing" (متابعة التعديل)
- `drafts.keepDraft`: "Keep draft" (الاحتفاظ بالمسودة)
- `drafts.discardDraft`: "Discard draft" (تجاهل المسودة)

## 20. Phase 1 Scope
Phase 1 implementation will focus strictly on establishing the architecture and proving it in three key areas:
1. **Admin Event Editor**: Create/Edit modes (modal open state, content, translations, edit ID).
2. **Admin News Editor**: Create/Edit modes (modal open state, content, translations, edit ID, active locale).
3. **Student Suggestion Composer**: Compose mode (title, body, category, target role).

## 21. Phase 2 Inventory
Forms designated for future onboarding to draft persistence (Inventory Count: > 20):
- Media Gallery: Album & Media Editors
- Board Management: Member, Head, and Responsibility Editors
- Committee Page Editors
- Internal Economy: Tasks & Activities Editors
- Strategic Plans & Reports Editors
- Profile Editors
- FAQ Editors
- Contact Card & Map Editors
- Student Guide Editors

## 22. Explicit Exclusions
The following components will intentionally **not** use draft persistence:
- **Destructive Confirmations**: Delete Member, Delete Event, Transfer Role. (These are transient confirmations that should not randomly reopen).
- **Security Contexts**: Password change, forgot password, login forms.
- **Transient UI**: Loading states, success banners, network errors.
- **Read-Only Modals**: Suggestion review/reply panels that don't involve long-form data entry from the viewer.

## 23. Testing Strategy
Future implementation requires tests verifying:
1. Draft survives unmount/remount and navigation.
2. Form values, translations, and `ui.activeLocale` restore perfectly.
3. User A cannot read User B's draft.
4. Successful submission automatically deletes the draft.
5. Failed submission preserves the draft securely.
6. The explicit close 3-choice modal triggers correctly for dirty forms.
7. Unedited pristine forms close immediately without confirmation.
8. Logout sweeps and destroys user drafts.
9. Malformed `sessionStorage` triggers safe fallback without crashing.

## 24. Manual Acceptance Scenarios

**Scenario 1: President Events Workflow**
1. President opens Events tab.
2. Clicks Add Event.
3. Writes Arabic title and long description.
4. Navigates to Admin News tab.
5. Returns to Events tab.
- **Expected**: Event modal auto-opens. All fields are restored. No confirmation prompted during navigation.
6. President clicks X to explicitly close.
- **Expected**: 3-choice confirmation appears.
7. Selects "Keep draft".
- **Expected**: Modal closes.
8. Clicks Add Event again.
- **Expected**: Modal opens with the preserved Arabic title and description.
9. Submits form successfully.
- **Expected**: Draft is deleted. Reopening Add Event yields a clean form.

**Scenario 2: Student Suggestion Workflow**
1. Student starts writing a suggestion on Dashboard.
2. Navigates to Profile.
3. Returns to Dashboard.
- **Expected**: Suggestion composer retains title, text, category, and target role seamlessly.

## 25. Risks / Trade-offs
- **Complexity**: Synchronizing modal `isOpen` state with storage introduces lifecycle complexity (e.g., ensuring flush before unmount).
- **File Uploads**: Users might be confused if text fields are restored but an unuploaded File picker is cleared. UX must clearly communicate if files need re-selection.
- **Debounce Delay**: If a user navigates away using a raw browser back button extremely quickly, a non-flushed keystroke might theoretically be lost. Explicit unmount flushing mitigates this heavily.
