# Dashboard Draft Persistence Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve eligible unsaved authored dashboard state across real tab/component unmounts and internal navigation for every authorized executive role using the existing user-scoped sessionStorage draft architecture.

**Architecture:** Extend the existing Phase 1 SessionDraftService/useSessionDraft architecture to all eligible authenticated dashboard authoring surfaces while preserving current conditional dashboard mounting, role authorization, CMS translation behavior, and submit semantics.

**Tech Stack:** React, TypeScript, sessionStorage, existing i18n/CMS localization, existing Modal component, Node built-in test suite.

**Spec:** docs/superpowers/specs/2026-09-29-session-draft-persistence-design.md

## Global Constraints
- **Scope Isolation:** Strictly `sessionStorage` by user ID and entity ID.
- **Validation:** Asynchronous validation (VALID/INVALID/UNKNOWN) for edit modes.
- **Navigation:** Preserves open drafts silently, no prompt on navigation.
- **Form Submit:** Successful submit clears the exact draft; failure preserves it.
- **Sensitive Data:** Auth secrets, raw Files must not be serialized.

## Full Dashboard Surface Inventory

| Surface | Component/File | Role(s) | Editable authored state | Classification | Draft feature key | Entity identity | Async validation requirement | Translations | File handling | Success-clear rule | Reason |
|---------|----------------|---------|--------------------------|----------------|-------------------|-----------------|------------------------------|--------------|---------------|--------------------|--------|
| Events Edit | `AdminDashboard.tsx` | Executives | Title, Desc | ALREADY_COVERED_PHASE1 | `admin:events` | Event ID | Yes | Yes | Retain URLs | Clears Draft | Phase 1 |
| News Edit | `AdminDashboard.tsx` | Executives | Title, Desc | ALREADY_COVERED_PHASE1 | `admin:news` | News ID | Yes | Yes | Retain URLs | Clears Draft | Phase 1 |
| Suggestion Compose | `StudentDashboard.tsx` | Student | Title, Body | ALREADY_COVERED_PHASE1 | `student:suggestion` | Create only | No | No | N/A | Clears Draft | Phase 1 |
| Admin Reply (Stats/Suggestions) | `AdminDashboard.tsx` | Executives | `replyText` | PERSIST_DRAFT | `admin:suggestion-reply` | Suggestion ID | Yes (verify exist) | No | N/A | Clears Draft | Authored text loss |
| Admin Inbox Reply | `AdminDashboard.tsx` | Executives | `replyText` | PERSIST_DRAFT | `admin:inbox-reply` | Message ID | Yes | No | N/A | Clears Draft | Authored text loss |
| Board Member Add/Edit | `AdminDashboard.tsx` (BoardTab) | PRESIDENT | Member Details | PERSIST_DRAFT | `admin:board-member` | Member ID | Yes | Yes | Reselect | Clears Draft | Complex modal |
| Board Head Edit | `AdminDashboard.tsx` (BoardTab) | PRESIDENT | Head Role | PERSIST_DRAFT | `admin:board-head` | Member ID | Yes | Yes | Reselect | Clears Draft | Complex modal |
| Responsibility Edit | `AdminDashboard.tsx` (BoardTab) | PRESIDENT | Responsibility | PERSIST_DRAFT | `admin:board-resp` | Resp ID | Yes | Yes | N/A | Clears Draft | Complex modal |
| Gallery Album Edit | `AdminDashboard.tsx` (GalleryTab)| Executives | Title, Desc | PERSIST_DRAFT | `admin:gallery-album`| Album ID | Yes | Yes | Retain URLs | Clears Draft | Long form |
| Gallery Media Edit | `AdminDashboard.tsx` (GalleryTab)| Executives | Media Details | PERSIST_DRAFT | `admin:gallery-media`| Media ID | Yes | Yes | Retain URLs | Clears Draft | Long form |
| Plans Modal | `AdminDashboard.tsx` (PlansTab)| Executives | Plan Text | PERSIST_DRAFT | `admin:plan` | Plan ID | Yes | Yes | Retain URLs | Clears Draft | Long form |
| Reports Modal | `AdminDashboard.tsx` (PlansTab)| Executives | Report Text | PERSIST_DRAFT | `admin:report` | Report ID | Yes | Yes | Retain URLs | Clears Draft | Long form |
| App Interview | `AdminDashboard.tsx` (ApplicationsTab) | PRESIDENT | Interview Info | PERSIST_DRAFT | `admin:app-interview`| App ID | Yes | No | N/A | Clears Draft | Important date/text |
| Guide Suggestions Reply | `GuideSuggestionsPanel.tsx` | Executives | Response text | PERSIST_DRAFT | `admin:guide-reply` | Suggestion ID | Yes | No | N/A | Clears Draft | Authored text |
| Site Edits Admin Panel | `SiteEditsPanel.tsx` | PRESIDENT | `revised` text | PERSIST_DRAFT | `admin:site-edit` | Edit ID | Yes | Yes | N/A | Clears Draft | Authored text revisions |
| Internal Tasks | `InternalTaskCreationPanel.tsx` | Executives | Task Form | PERSIST_DRAFT | `admin:internal-task`| Create only | No | No | N/A | Clears Draft | Multi-step form |
| Member Points | `MemberPointsAdminPanel.tsx` | Executives | Amount, Reason | PERSIST_DRAFT | `admin:member-points`| Create only | No | No | N/A | Clears Draft | Authored text |
| Delete/Revoke Confs | multiple | multiple | N/A | NO_DRAFT_REQUIRED | N/A | N/A | N/A | N/A | N/A | N/A | Transient confirmation |
| Profile Settings | `ProfileSettings.tsx` | All | Passwords/Sec | NO_DRAFT_REQUIRED | N/A | N/A | N/A | N/A | N/A | N/A | Security rule |
| Translation Monitoring | `TranslationMonitoringTab.tsx`| Executives | N/A | NO_DRAFT_REQUIRED | N/A | N/A | N/A | N/A | N/A | N/A | Read-only |
| Site Branding | `SiteBrandingPanel.tsx`| PRESIDENT | N/A | NO_DRAFT_REQUIRED | N/A | N/A | N/A | N/A | N/A | N/A | Immediate upload / No modal form |
| Edits History | `EditsHistoryPanel.tsx`| Executives | N/A | NO_DRAFT_REQUIRED | N/A | N/A | N/A | N/A | N/A | N/A | Read-only |
| Excuse Review | `ExcuseReviewPanel.tsx`| Executives | N/A | NO_DRAFT_REQUIRED | N/A | N/A | N/A | N/A | N/A | N/A | Read-only/Approve |
| Task Dashboard | `TaskManagementDashboard.tsx`| Executives | N/A | NO_DRAFT_REQUIRED | N/A | N/A | N/A | N/A | N/A | N/A | Read-only |
| Profile Edits | `ProfileEditsPanel.tsx`| PRESIDENT | N/A | NO_DRAFT_REQUIRED | N/A | N/A | N/A | N/A | N/A | N/A | Read-only/Approve |
| Oversight Evaluation| `OversightEvaluationPanel.tsx`| Executives | N/A | NO_DRAFT_REQUIRED | N/A | N/A | N/A | N/A | N/A | N/A | Inline minimal actions |

## Review Focus
1. **Security Isolation:** Ensuring `admin:board-member` drafts never bleed into `admin:board-head` or another member's draft.
2. **Translation Loss:** Guaranteeing `activeLocale` and intentionally empty CMS translation arrays are restored identically across unmounts.
3. **Async Race Conditions:** Keeping stale drafts alive via the `UNKNOWN` validation state until authoritative ownership loading resolves.
4. **File Pickers:** Confirming `draft.ui.fileReselectionRequired` successfully resets local input fields instead of attempting serialization.
5. **Inline Forms:** Managing persistence on inline components (like `InternalTaskCreationPanel`) which lack a strict `modalOpen` state wrapper.

## Implementation Tasks

### Task 1: Reusable Registry & Domain Helpers
**Files**
- Modify `src/domain/sessionDraft.ts`
- Modify `src/domain/sessionDraftState.ts`
- Test `tests/sessionDraftService.test.mjs`

**Interfaces**
- Define exhaustive `FeatureKey` types mapping all Stage B features.
- Provide a `createDraftContext` abstraction for inline vs modal handling.

**Steps**
- [ ] write failing test for exhaustive key union types
- [ ] implement key expansion in `sessionDraft.ts`
- [ ] run relevant regressions
- [ ] commit

### Task 2: Inbox & Suggestion Reply Modals
**Files**
- Modify `src/pages/AdminDashboard.tsx`
- Test `tests/adminRepliesIntegration.test.mjs` (create new)

**Interfaces**
- Hook `useSessionDraft` inside `ContactInboxTab` and `SuggestionsTab` components.
- Pass `activeSuggestion.id` or `activeMessage.id` as entity keys.

**Steps**
- [ ] write failing test for inbox draft retention on navigate
- [ ] run and confirm expected failure
- [ ] implement minimal behavior via `useSessionDraft`
- [ ] rerun expected pass
- [ ] write and run test for successful submit clearing draft
- [ ] commit

### Task 3: Plans & Reports Modals
**Files**
- Modify `src/pages/AdminDashboard.tsx`
- Test `tests/plansReportsIntegration.test.mjs` (create new)

**Interfaces**
- Hook `useSessionDraft` inside `PlansTab`.
- Persist `CmsEntityTranslationTabs` fields safely.

**Steps**
- [ ] write failing test for translation retention on unmount
- [ ] run and confirm expected failure
- [ ] implement minimal behavior and ensure CMS empty strings are preserved
- [ ] rerun expected pass
- [ ] commit

### Task 4: Gallery Modals (Album & Media)
**Files**
- Modify `src/pages/AdminDashboard.tsx`
- Test `tests/galleryDraftIntegration.test.mjs` (create new)

**Interfaces**
- Separate keys: `admin:gallery-album` and `admin:gallery-media`.
- Implement `fileReselectionRequired` UX for local unuploaded files.

**Steps**
- [ ] write failing test for separation of album vs media draft keys
- [ ] implement draft restoration logic and file reset
- [ ] run relevant regressions
- [ ] commit

### Task 5: Board Forms (Member, Head, Resp)
**Files**
- Modify `src/pages/AdminDashboard.tsx` (BoardTab)
- Test `tests/boardDraftIntegration.test.mjs` (create new)

**Interfaces**
- Drafts keyed strictly by Member/Role IDs.
- Handle translations for Members/Responsibilities.

**Steps**
- [ ] write failing test verifying `board-member` draft doesn't open in `board-head`
- [ ] implement isolated keys
- [ ] run relevant regressions
- [ ] commit

### Task 6: Applications Interview Modal
**Files**
- Modify `src/pages/AdminDashboard.tsx` (ApplicationsTab)
- Test `tests/applicationDraftIntegration.test.mjs` (create new)

**Interfaces**
- Map `interview` date/time inputs to draft state.

**Steps**
- [ ] write failing test for losing interview date on tab switch
- [ ] implement minimal behavior
- [ ] run relevant regressions
- [ ] commit

### Task 7: Remaining Standalone Panels
**Files**
- Modify `src/components/InternalTaskCreationPanel.tsx`
- Modify `src/components/MemberPointsAdminPanel.tsx`
- Modify `src/components/SiteEditsPanel.tsx`
- Modify `src/components/GuideSuggestionsPanel.tsx`
- Test `tests/standalonePanelsDraft.test.mjs` (create new)

**Interfaces**
- Hook `useSessionDraft` for inline forms.

**Steps**
- [ ] write failing tests for each inline form losing state
- [ ] implement state mapping without Modal abstraction
- [ ] run relevant regressions
- [ ] commit

### Task 8: Verification & Acceptance
**Files**
- Create `tests/acceptance/dashboardDraftAcceptance.md` for manual test tracking

**Steps**
- [ ] run full repository test suite
- [ ] perform manual acceptance scenario matrix checks
- [ ] finalize rollout branch for review
