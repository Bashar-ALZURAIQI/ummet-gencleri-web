# Dashboard Draft Persistence Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve eligible unsaved authored dashboard state across real tab/component unmounts and internal navigation for every authorized executive role using the existing user-scoped sessionStorage draft architecture.

**Spec:** docs/superpowers/specs/2026-09-30-dashboard-draft-persistence-rollout-design.md

## Full Dashboard Surface Inventory (Total: 26)

| Surface | Classification | Draft feature key | Entity identity | Exact Authorization Policy |
|---------|----------------|-------------------|-----------------|----------------------------|
| Events Edit | ALREADY_COVERED_PHASE1 | `admin:events` | Event ID | `isLeadershipRole(currentUser.role)` |
| News Edit | ALREADY_COVERED_PHASE1 | `admin:news` | News ID | `canEditSection('news')` |
| Suggestion Compose | ALREADY_COVERED_PHASE1 | `student:suggestion` | Create only | `!!currentUser` (Student) |
| Admin Reply (Stats/Suggestions) | PERSIST_DRAFT | `admin:suggestion-reply` | Suggestion ID | `isLeadershipRole(currentUser.role) && canRespondToSuggestion(activeSuggestion)` |
| Admin Inbox Reply | PERSIST_DRAFT | `admin:inbox-reply` | Message ID | `canAccessContactInbox(currentUser?.role)` |
| Board Member Add/Edit | PERSIST_DRAFT | `admin:board-member` | Member ID / `create:${committeeId}` | `canEditSection('board')` |
| Board Head Edit | PERSIST_DRAFT | `admin:board-head` | Member ID / `head:${committeeId}` | `canEditSection('board')` |
| Responsibility Edit | PERSIST_DRAFT | `admin:board-resp` | Resp ID / `create:${committeeId}` | `canEditSection('board')` |
| Gallery Album Edit | PERSIST_DRAFT | `admin:gallery-album`| Album ID | `isLeadershipRole(currentUser.role)` |
| Gallery Media Edit | PERSIST_DRAFT | `admin:gallery-media`| Media ID / `create:${albumId}` | `isLeadershipRole(currentUser.role)` |
| Plans Modal | PERSIST_DRAFT | `admin:plan` | Plan ID | `canEditSection('plans')` |
| Reports Modal | PERSIST_DRAFT | `admin:report` | Report ID | `canEditSection('plans')` |
| App Interview | PERSIST_DRAFT | `admin:app-interview`| App ID | `currentUser?.role === 'PRESIDENT'` |
| Guide Suggestions Reply | PERSIST_DRAFT | `admin:guide-reply` | Suggestion ID | `canManageGuideSuggestions(currentUser?.role)` |
| Site Edits Admin Panel | PERSIST_DRAFT | `admin:site-edit` | Edit ID | `currentUser?.role === 'PRESIDENT'` |
| Profile Edits Admin Panel | PERSIST_DRAFT | `admin:profile-edit` | Edit ID | `currentUser?.role === 'PRESIDENT'` |
| Internal Tasks | PERSIST_DRAFT | `admin:internal-task`| Create only | `canManageTasks(currentUser?.role)` |
| Member Points | PERSIST_DRAFT | `admin:member-points`| Student ID / `create` | `canManageMemberPoints(currentUser?.role)` |
| Profile General Form | PERSIST_DRAFT | `admin:profile-general`| User ID | `!!currentUser` |
| Profile Password Form | NO_DRAFT_REQUIRED | N/A | N/A | Security excluded. |
| Translation Monitoring | NO_DRAFT_REQUIRED | N/A | N/A | Read-only. |
| Site Branding | NO_DRAFT_REQUIRED | N/A | N/A | Direct upload without authored form text. |
| Edits History | NO_DRAFT_REQUIRED | N/A | N/A | Read-only. |
| Excuse Review | NO_DRAFT_REQUIRED | N/A | N/A | Direct approve/reject, no drafted text. |
| Task Dashboard | NO_DRAFT_REQUIRED | N/A | N/A | Direct select saves, no drafted text. |
| Delete/Revoke Confs | NO_DRAFT_REQUIRED | N/A | N/A | Transient destructive confirmations. |

## Implementation Tasks

### Task 1: Domain Key Extensions
**Files**
- Modify `src/domain/sessionDraft.ts`
- Test `tests/sessionDraftService.test.mjs`

**Interfaces**
- Define exhaustive `FeatureKey` types mapping all Stage B features (e.g. `admin:suggestion-reply`, `admin:profile-general`).

**Steps**
- [ ] write failing test for exhaustive key union types
- [ ] implement key expansion in `sessionDraft.ts`
- [ ] run relevant regressions
- [ ] commit

### Task 2: Admin Replies (Stats/Suggestions + Inbox)
**Files**
- Modify `src/pages/AdminDashboard.tsx`
- Create `tests/adminRepliesIntegration.test.mjs`

**Interfaces**
- Hook `useSessionDraft` inside `ContactInboxTab` and `SuggestionsTab`. Pass `activeSuggestion.id` or `activeMessage.id` as entity keys.

**Steps**
- [ ] write failing test for inbox draft retention on navigate
- [ ] run and confirm RED
- [ ] implement minimal behavior via `useSessionDraft`
- [ ] rerun and confirm GREEN
- [ ] write and run test for successful submit clearing draft
- [ ] run relevant regression suite
- [ ] commit

### Task 3: Plans & Reports
**Files**
- Modify `src/pages/AdminDashboard.tsx`
- Create `tests/plansReportsIntegration.test.mjs`

**Interfaces**
- Hook `useSessionDraft` inside `PlansTab`. Persist `CmsEntityTranslationTabs` fields safely.

**Steps**
- [ ] write failing test for translation retention on unmount
- [ ] run and confirm RED
- [ ] implement minimal behavior and ensure CMS empty strings are preserved
- [ ] rerun and confirm GREEN
- [ ] run relevant regression suite
- [ ] commit

### Task 4: Gallery Album & Media
**Files**
- Modify `src/pages/AdminDashboard.tsx`
- Create `tests/galleryDraftIntegration.test.mjs`

**Interfaces**
- Separate keys: `admin:gallery-album` and `admin:gallery-media`.
- Implement `fileReselectionRequired` UX for local unuploaded files.

**Steps**
- [ ] write failing test for separation of album vs media draft keys
- [ ] run and confirm RED
- [ ] implement draft restoration logic and file reset
- [ ] rerun and confirm GREEN
- [ ] run relevant regression suite
- [ ] commit

### Task 5: Board Forms
**Files**
- Modify `src/pages/AdminDashboard.tsx`
- Create `tests/boardDraftIntegration.test.mjs`

**Interfaces**
- Handle drafts for Member, Head, and Responsibility modals.
- Drafts keyed strictly by Member/Role IDs and target committee ID.

**Steps**
- [ ] write failing test verifying `board-member` draft doesn't open in `board-head`
- [ ] run and confirm RED
- [ ] implement isolated keys
- [ ] rerun and confirm GREEN
- [ ] run relevant regression suite
- [ ] commit

### Task 6: Application Interview
**Files**
- Modify `src/pages/AdminDashboard.tsx`
- Create `tests/applicationDraftIntegration.test.mjs`

**Interfaces**
- Map `interview` date/time inputs to draft state inside `ApplicationsTab`.

**Steps**
- [ ] write failing test for losing interview date on tab switch
- [ ] run and confirm RED
- [ ] implement minimal behavior
- [ ] rerun and confirm GREEN
- [ ] run relevant regression suite
- [ ] commit

### Task 7: Standalone Authored Panels
**Files**
- Modify `src/components/InternalTaskCreationPanel.tsx`
- Modify `src/components/MemberPointsAdminPanel.tsx`
- Modify `src/components/SiteEditsPanel.tsx`
- Modify `src/components/ProfileEditsPanel.tsx`
- Modify `src/components/GuideSuggestionsPanel.tsx`
- Create `tests/standalonePanelsDraft.test.mjs`

**Interfaces**
- Hook `useSessionDraft` for inline forms. No abstraction (`createDraftContext`) is needed; use existing hook directly and allow implicit persistence on pagehide/unmount.

**Steps**
- [ ] write failing tests for each inline form losing state
- [ ] run and confirm RED
- [ ] implement state mapping directly with `useSessionDraft`
- [ ] rerun and confirm GREEN
- [ ] run relevant regression suite
- [ ] commit

### Task 8: Profile Settings General Form
**Files**
- Modify `src/components/ProfileSettings.tsx`
- Create `tests/profileSettingsDraftIntegration.test.mjs`

**Interfaces**
- Extract ONLY name, contactEmail, phone, university, major, year, bio into `admin:profile-general` draft. 
- Ensure raw File, passwords, and object URLs are never serialized.
- Submit success clears draft, failure preserves it.
- Authoritative refreshed profile must not overwrite a restored dirty draft.

**Steps**
- [ ] write failing test for saving profile general fields across remounts
- [ ] run and confirm RED
- [ ] implement draft isolation for general form fields
- [ ] rerun and confirm GREEN
- [ ] run relevant regression suite
- [ ] commit

### Task 9: Cross-Role & Acceptance Coverage
**Files**
- Modify existing test suites or `tests/sessionDraftIntegration.test.mjs` as required.
- Execute Manual Acceptance Matrix.

**Steps**
- [ ] execute manual acceptance matrix
- [ ] finalize rollout branch for review

## Manual Acceptance Matrix

For each scenario, verify expected restoration, open/closed state, and storage behavior across unmount/navigation.

1. President - Event create
2. President - News create
3. President - Gallery Album create
4. Authorized executive - Gallery Album Edit
5. President - Gallery Media
6. Authorized executive - Plan
7. Authorized executive - Report
8. President - Board Head/Member/Responsibility
9. President - Application interview
10. Authorized inbox role - unsent Inbox reply
11. Authorized suggestions role - administrative reply
12. Guide Suggestions reply
13. Internal Task inline form
14. Member Points form including target isolation
15. Profile General form
16. Translation AR/TR/EN + active locale
17. Keep Draft
18. Discard Draft
19. Failed submit
20. Successful submit
21. Logout same user
22. Cross-user isolation
23. Role/access revoked while draft exists
24. Chrome -> another app -> Chrome in same browser session
