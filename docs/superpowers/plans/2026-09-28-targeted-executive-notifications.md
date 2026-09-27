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

## 3. Phase 2: Frontend Implementation (Pending)

- [ ] Connect `get_current_user_workload_counts()` to the main client architecture to render visible badges for pending items without requiring realtime.
- [ ] Render indicators inside the executive portal based on these counts.
- [ ] Connect any relevant notification permission request lifecycle appropriately.
