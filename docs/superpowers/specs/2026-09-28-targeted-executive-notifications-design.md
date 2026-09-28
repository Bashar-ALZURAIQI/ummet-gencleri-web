# Targeted Executive Notifications & Workload Badges Design (2026-09-28)

## 1. Goal
Implement backend/server-side Targeted Executive Notifications and Workload Badges for:
- Guide Suggestions
- Contact Us
- Student Suggestions

This is built safely reusing the existing `push_notifications` (`PERSONAL` kind) architecture without deploying Supabase Realtime or any untested system.

## 2. Push Notification Triggers

Three new PostgreSQL triggers dynamically resolve their specific executive assignees:
- **Guide Suggestions**: Routes `PERSONAL` push notifications (`/?push=guide-suggestions`) to the `PRESIDENT` and `ACADEMIC_HEAD` safely derived from `executive_assignments`.
- **Contact Messages**: Routes `PERSONAL` push notifications (`/?push=contact-inbox`) to the `PRESIDENT`.
- **Student Suggestions**: Routes `PERSONAL` push notifications (`/?push=student-suggestions`) directly to the assignee defined by `target_role` on the suggestion itself.

Safety invariants:
- Handled via `ON CONFLICT DO NOTHING` idempotency utilizing uniquely identifiable `source_event_key` formats (`guide:new:ID:role`, `contact:new:ID`, `suggestion:new:ID`).
- If an assigned executive doesn't exist, the push notification resolves silently without breaking the originating database transaction.

## 3. Workload Badge RPC

A single secured Remote Procedure Call (RPC) (`get_current_user_workload_counts()`) exposes exact notification unread states efficiently in one roundtrip:
- Uses `SECURITY DEFINER` logic and `auth.uid()` pinning.
- Scoped dynamically per active role:
  - `PRESIDENT`: All pending guide suggestions, all unread contact messages, ALL student suggestions where `status = 'new'`, regardless of `target_role`.
  - `ACADEMIC_HEAD`: All pending guide suggestions, zero contact-message workload, only new student suggestions targeted to `ACADEMIC_HEAD`.
  - `OTHER EXECUTIVES`: Zero guide workload, zero contact workload, only new student suggestions targeted to their own executive role.

## 4. Out of Scope

To limit regression risk, the following are explicitly out of scope:
- Unread badges for generic news, events, or gallery elements.
- Granular per-student "seen" states for public entities.
- Enabling or configuring Supabase Realtime `postgres_changes`.
- Notification center redesign.
