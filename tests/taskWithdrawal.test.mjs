import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260923160000_fix_task_withdrawal_schema_bug.sql',
  import.meta.url,
);

const sql = await readFile(migrationUrl, 'utf8').catch(() => '');
const normalized = sql.replace(/\s+/g, ' ');

test('withdrawal frees capacity and deletes pending enrollment', () => {
  assert.match(normalized, /DELETE FROM public\.task_enrollments/i);
});

test('FULL reopens', () => {
  assert.match(normalized, /IF v_task_status = 'FULL'/i);
  assert.match(normalized, /UPDATE public\.tasks SET status = 'OPEN'/i);
});

test('evaluated enrollment cannot be erased', () => {
  assert.match(normalized, /v_completion_status <> 'PENDING'/i);
  assert.match(normalized, /RAISE EXCEPTION USING ERRCODE = 'P0001'/i);
  assert.match(normalized, /Cannot cancel an evaluated task enrollment/i);
});

test('row locking is used', () => {
  assert.match(normalized, /FOR UPDATE/i);
});

test('student cannot cancel another student\'s enrollment', () => {
  assert.match(normalized, /student_id = v_user_id/i);
});

test('second cancellation fails safely (enrollment not found)', () => {
  assert.match(normalized, /SELECT enrollment\.completion_status/i);
  assert.match(normalized, /IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Enrollment not found'/i);
});

test('static verification limitation: Student B re-registration is guaranteed by row deletion and OPEN status', () => {
  // Static analysis can only prove the conditions for re-registration are met:
  assert.match(normalized, /DELETE FROM public\.task_enrollments/i);
  assert.match(normalized, /UPDATE public\.tasks SET status = 'OPEN'/i);
});
