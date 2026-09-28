# Targeted Executive Notifications & Workload Badges Plan (2026-09-28)

## 1. Context

Executives require actionable awareness of unresolved administrative work including new guide suggestions, contact form submissions, and student suggestions mapped accurately to their functional role. We are resolving this using a secured workload badge RPC and direct push notification triggers avoiding broader, unapproved scope expansions.

## 2. Phase 1: Database Migration & Backend (Completed)

- [x] Implement database migration `20260927230446_targeted_executive_notifications.sql`.
- [x] Extend `push_notifications` `destination` domain to include `/?push=contact-inbox`, `/?push=guide-suggestions`, and `/?push=student-suggestions` alongside existing values.
- [x] Create server-side triggers `enqueue_guide_suggestion_push_notification`, `enqueue_contact_message_push_notification`, and `enqueue_student_suggestion_push_notification`.
- [x] Ensure non-existent roles/vacant assignments do not fail data creation transactions (safely ignore push notification creation).
- [x] Build `get_current_user_workload_counts()` RPC locked via `SECURITY DEFINER` mapping active `auth.uid()` to targeted counts.
- [x] Extend Edge Function validation in `send-web-push/delivery.ts` for these destinations.
- [x] Verify routing capability via frontend tests.

## 3. Phase 2: Frontend Implementation (Completed)

- [x] Connect `get_current_user_workload_counts()` to the main client architecture to render visible badges for pending items without requiring realtime.
- [x] Render indicators inside the executive portal based on these counts.
- [x] Connect any relevant notification permission request lifecycle appropriately (manual permission request only via `ExecutivePushControl`).
- [x] Ensure `ExecutivePushControl` is accessible to all leadership roles (PRESIDENT, VICE_PRESIDENT, MEDIA_HEAD, FINANCE_HEAD, AUDIT_HEAD, ACADEMIC_HEAD, ACTIVITIES_HEAD) in the shared `AdminDashboard` shell.

## 4. Architecture & Routing Rules

### Push Notification Routing:
- **Contact Us**: Pushed only to `PRESIDENT` -> `/?push=contact-inbox`.
- **Guide Suggestion**: Pushed to `PRESIDENT` and `ACADEMIC_HEAD` -> `/?push=guide-suggestions`.
- **Student Suggestion**: Pushed to the specific executive assigned to `target_role` -> `/?push=student-suggestions`.

### Workload Badge Rules:
- **PRESIDENT**: Counts all unread Contact Us messages, pending Guide suggestions, and **all** new student suggestions.
- **ACADEMIC_HEAD**: Counts pending Guide suggestions and student suggestions targeted to `ACADEMIC_HEAD`.
- **Other Executives**: Counts only student suggestions targeted to their own `target_role`.
- Zero counts do not render badges.
- Existing Applications badge behavior remains unchanged.

### Data Fetching Constraints:
- **No Realtime**: No `postgres_changes` or Supabase Realtime for these tables.
- **No Independent Polling Loop**: Workload counts fetch integrates directly into the existing visibility-aware 5-minute refresh polling loop in `AppContext.tsx` (edit requests loop).
- **Mutation-Driven Refresh**: Workload counts automatically refresh when mutations like marking messages as read or responding to suggestions occur.
- **Role Staleness Check**: Workload updates strictly compare `userId`, `epoch`, and `role` to reject stale data after role changes.
