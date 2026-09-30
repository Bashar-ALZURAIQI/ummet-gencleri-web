# Dashboard Draft Persistence Rollout Design

**Status:** Approved
**Supersedes:** docs/superpowers/specs/2026-09-29-session-draft-persistence-design.md (in relation to the authenticated dashboard scope)

## Core Requirement
ALL eligible authored state inside authenticated executive/admin dashboards MUST persist across dashboard-tab unmounts and internal navigation, for every authorized role. 

This explicitly **includes** administrative authored replies when they contain unsent user-authored text (e.g., Suggestion replies, Inbox replies, Guide Suggestion replies).

## Inherited Phase 1 Architecture
This rollout must strictly inherit and reuse the architecture established in Phase 1:
- **Storage:** Persist using `sessionStorage` only.
- **Scoping:** Use strictly user-scoped and entity-scoped keys (e.g., `<user-uuid>:<feature-key>:<entity-id>`).
- **Isolation:** Maintain isolation between Create and Edit modes, and distinct entities (e.g., Album vs Media).
- **Validation:** Retain UNKNOWN/VALID/INVALID validation states to handle async loading races.
- **Translations:** Retain active translation tab (`activeLocale`) and empty CMS string restoration.
- **Submit Semantics:** Successful submit = clear draft. Failed submit = preserve draft.
- **Cleanup:** Logout must clear all session-scoped user data.
- **Exclusions:** Raw `File`, `Blob`, `URL.createObjectURL` object URLs, and passwords/security tokens MUST NEVER be serialized.
- **Mounting:** Dashboard conditional mounting and standard React unmounting logic remains unchanged.
- **Authorization:** Standard authorization logic is enforced. The draft system MUST NEVER restore or grant access to a surface merely because `sessionStorage` contains a key. 

## Authorization Enforcement
Draft restoration validation evaluates to `INVALID` (triggering automatic storage wipe) if the authoritative role/entity readiness checks fail. Access must always be guarded by exact policies (e.g., `currentUser.role === 'PRESIDENT'`, `canEditSection('board')`, `canManageTasks(currentUser?.role)`).

## Component Exclusions
Destructive confirmation-only dialogs and security/password updates (e.g., Profile Settings Password change) remain completely excluded from the draft persistence system.
