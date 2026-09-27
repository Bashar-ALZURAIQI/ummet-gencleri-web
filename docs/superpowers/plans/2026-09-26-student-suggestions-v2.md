# Student Suggestions V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-local student suggestions with a durable Supabase-authoritative RPC + RLS workflow without Postgres Changes.

**Architecture:** Use two RLS-protected Supabase tables and three SECURITY DEFINER RPCs as the only authoritative mutation/read workflow. A typed gateway/service feeds AppContext, which protects against stale auth/session results and refreshes through the existing visibility/polling infrastructure.

**Tech Stack:** React 18, TypeScript, Vite, Supabase JS/PostgreSQL RLS/RPCs, node:test, i18next.

**Spec:** `docs/superpowers/specs/2026-09-25-student-suggestions-v2-design.md`

## Global Constraints

- Supabase is the only authority for Student Suggestions V2.
- No import or fallback from legacy `app_suggestions`.
- No `postgres_changes` or realtime publication changes.
- No optimistic authoritative suggestion/response/status mutation.
- Server derives identity from `auth.uid()`.
- Direct browser INSERT/UPDATE/DELETE is not an authority path.
- Preserve current visual design.
- New operational copy must support Arabic, English, and Turkish.
- Production migration requires explicit human approval after migration-readiness review.
- Never merge or cherry-pick `feature-real-dashboard-data`.

## Review Focus

1. Older slow same-session refresh must not overwrite newer authoritative data.
2. Account or role changes during an in-flight request must invalidate stale publication.
3. Successful authoritative empty `[]` is valid and retires the legacy LocalStorage key.
4. Mutation success followed by refresh failure must return `ok: true, refreshPending: true`.
5. Unauthorized direct RPC/table attempts must remain blocked even if UI controls are bypassed.

## Overview
This plan implements a Supabase-authoritative suggestion workflow replacing the previous browser-local architecture, aligned strictly with the design spec from 2026-09-25.

--------------------------------------------------
TASK 1 — Authoritative Database Contract
--------------------------------------------------

- [ ] **Step 1:** Write the failing migration tests in `tests/studentSuggestionsMigration.test.mjs` defining exact RLS, table schemas (student_user_id references profiles, target_role, etc.), and the 3 RPCs (submit_student_suggestion, respond_to_student_suggestion, list_visible_student_suggestions). Ensure tests cover Review Focus #5: unauthorized RPC/direct-table bypass.
- [ ] **Step 2:** Run exact focused test command and verify RED:
      `node --test tests/studentSuggestionsMigration.test.mjs`
      (Expected before migration exists: FAIL)
- [ ] **Step 3:** Implement the minimum production code required by creating `supabase/migrations/20260926015800_student_suggestions_v2.sql`. Define exactly the tables, types, roles, RPCs, validation (lengths), constraints, and RLS policies required by the spec. No postgres_changes.
- [ ] **Step 4:** Run exact focused test command and verify GREEN:
      `node --test tests/studentSuggestionsMigration.test.mjs`
- [ ] **Step 5:** Run relevant typecheck/build (if applicable):
      `npm run typecheck`
- [ ] **Step 6:** Commit with the already-approved commit message:
      `feat(db): define authoritative student suggestions`

--------------------------------------------------
TASK 2 — Typed Gateway and Service
--------------------------------------------------

- [ ] **Step 1:** Write failing tests in `tests/studentSuggestionGateway.test.mjs` verifying exact RPC names, parameters, payload trimming, error normalization (StudentSuggestionErrorCode), and no realtime APIs. Use fake RPC clients.
- [ ] **Step 2:** Run exact focused test command and verify RED:
      `node --test tests/studentSuggestionGateway.test.mjs`
      (Expected before gateway/service exists: FAIL)
- [ ] **Step 3:** Implement `src/domain/studentSuggestionGateway.ts` and `src/services/studentSuggestionService.ts`. Define `SubmitStudentSuggestionParams` and `RespondToStudentSuggestionParams`. Implement `loadVisibleStudentSuggestions()`, `submitStudentSuggestion(params)`, and `respondToStudentSuggestion(params)`.
- [ ] **Step 4:** Run exact focused test command and verify GREEN:
      `node --test tests/studentSuggestionGateway.test.mjs`
- [ ] **Step 5:** Run relevant typecheck/build:
      `npm run typecheck`
- [ ] **Step 6:** Commit with the already-approved commit message:
      `feat: add student suggestion service gateway`

--------------------------------------------------
TASK 3 — AppContext Server Authority
--------------------------------------------------

- [ ] **Step 1:** Write failing tests in `tests/studentSuggestionRefreshGate.test.mjs` and `tests/studentSuggestionsAppContext.test.mjs`. Ensure test coverage for Review Focus #1, #2, #3, and #4 (stale refresh, account/role changes in-flight, empty `[]` retiring legacy key, and mutation success + refresh failure returning `refreshPending: true`).
- [ ] **Step 2:** Run exact focused test command and verify RED:
      `node --test tests/studentSuggestionRefreshGate.test.mjs tests/studentSuggestionsAppContext.test.mjs`
- [ ] **Step 3:** Implement `src/domain/studentSuggestionRefreshGate.ts` and modify `src/context/AppContext.tsx`. Remove LocalStorage suggestion authority, public `setSuggestions`, and mock fallbacks. Expose state and `submitSuggestion`/`respondToSuggestion`. Wire up visibility/polling refresh without realtime paths.
- [ ] **Step 4:** Run exact focused test command and verify GREEN:
      `node --test tests/studentSuggestionRefreshGate.test.mjs tests/studentSuggestionsAppContext.test.mjs`
- [ ] **Step 5:** Run relevant typecheck/build:
      `npm run typecheck`
- [ ] **Step 6:** Commit with the already-approved commit message:
      `feat: make student suggestions server authoritative`

--------------------------------------------------
TASK 4 — Student/Admin UI + i18n
--------------------------------------------------

- [ ] **Step 1:** Write failing tests in `tests/studentSuggestionsUiIntegration.test.mjs` verifying duplicate-submit prevention, translated warnings (including mutation success + refresh failure handling for Review Focus #4), and correct form clearing behavior on success/failure.
- [ ] **Step 2:** Run exact focused test command and verify RED:
      `node --test tests/studentSuggestionsUiIntegration.test.mjs`
- [ ] **Step 3:** Modify `src/pages/StudentDashboard.tsx` and `src/pages/AdminDashboard.tsx` to use the async AppContext methods. Remove direct `setSuggestions` mutations. Add i18n copy (ar.ts, en.ts, tr.ts) for loading, failures, and `refreshPending` warning states.
- [ ] **Step 4:** Run exact focused test command and verify GREEN:
      `node --test tests/studentSuggestionsUiIntegration.test.mjs`
- [ ] **Step 5:** Run relevant typecheck/build:
      `npm run typecheck && npm run build`
- [ ] **Step 6:** Commit with the already-approved commit message:
      `feat: connect suggestion UI to server authority`

--------------------------------------------------
TASK 5 — Full Local Verification + Migration Readiness
--------------------------------------------------

- [ ] **Step 1:** Run focused suite:
      `node --test tests/studentSuggestionsMigration.test.mjs tests/studentSuggestionGateway.test.mjs tests/studentSuggestionRefreshGate.test.mjs tests/studentSuggestionsAppContext.test.mjs tests/studentSuggestionsUiIntegration.test.mjs`
- [ ] **Step 2:** Run typecheck:
      `npm run typecheck`
- [ ] **Step 3:** Run build:
      `npm run build`
- [ ] **Step 4:** Run full npm test:
      `npm test`
- [ ] **Step 5:** Diff check:
      `git diff --check main...HEAD`
- [ ] **Step 6:** Forbidden-pattern source checks (Verify via source search):
      - NO Student Suggestions `postgres_changes`
      - NO `app_suggestions` safeParse/safeWrite authority
      - NO direct UI `setSuggestions` mutation
      - NO direct client INSERT/UPDATE/DELETE on suggestion tables
- [ ] **Step 7:** READ-ONLY Production compatibility checks. Confirm final migration references objects that actually exist (`profiles`, `student_applications`, `executive_assignments`, `private.is_current_president()`). Check version uniqueness. DO NOT modify Production.
- [ ] **Step 8:** Produce migration-readiness report.
- [ ] **Step 9:** STOP at human approval gate. (DO NOT apply migration until human explicitly approves the exact final migration after this readiness report).

--------------------------------------------------
TASK 6 — Controlled Production Migration
--------------------------------------------------

REQUIRES EXPLICIT HUMAN APPROVAL

- [ ] **Step 1:** Reconfirm migration file did not change.
- [ ] **Step 2:** Apply exact local migration using linked Supabase migration workflow (migration history must record exact local version).
- [ ] **Step 3:** Verify read-only in Production: both tables, required constraints, RLS, 3 RPCs, EXECUTE grants, no authenticated direct table mutation, anon/PUBLIC cannot execute, migration version exactly once, no realtime publication added.
- [ ] **Step 4:** Smoke authorization (if safe test identities exist). If not, report that interactive DB smoke was not performed.

--------------------------------------------------
TASK 7 — Final Verification / Merge / Deployment
--------------------------------------------------

- [ ] **Step 1:** Fresh typecheck:
      `npm run typecheck`
- [ ] **Step 2:** Fresh build:
      `npm run build`
- [ ] **Step 3:** Fresh full test:
      `npm test`
- [ ] **Step 4:** Diff check:
      `git diff --check main...HEAD`
- [ ] **Step 5:** Main reconciliation (Before merge: fetch main. If main moved: reconcile and rerun full verification).
- [ ] **Step 6:** Merge only if safe and green.
- [ ] **Step 7:** Vercel verification (verify exact Vercel status for merged main SHA).
- [ ] **Step 8:** Production smoke scenarios (accepted student submits, survives reload/new session, targeted executive sees it, unrelated executive cannot see/respond, President sees/responds, student sees durable response/status, no runtime console errors, no legacy LocalStorage fallback).
- [ ] **Step 9:** Final report (must include: main SHA, deployment status, test pass/fail counts, migration version, smoke scenarios tested, unverified scenarios, confirmation feature-real-dashboard-data was NOT merged/cherry-picked).
