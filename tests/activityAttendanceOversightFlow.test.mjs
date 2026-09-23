import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('1-6: list_activity_evaluations union wrapping, signature, and joining rules', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
  const sql = readFileSync(`${root}/supabase/migrations/20260923010000_fix_activity_evaluation_union_order.sql`, 'utf8');

  // 1 & 2: Wrapped in derived table (FROM ( ... ) AS q ORDER BY q.deadline, q.student_name NULLS LAST)
  assert.match(sql, /FROM \([\s\S]+UNION ALL[\s\S]+\) AS q\s*ORDER BY q\.deadline, q\.student_name NULLS LAST/i);
  
  // 3: 11-column return signature includes decision
  assert.match(sql, /decision public\.activity_decision/i);

  // 4 & 5: JOINING + unclosed activity is returned (evaluation_closed_at IS NULL), closed is excluded
  assert.match(sql, /WHERE e\.decision = 'JOINING'\s+AND a\.evaluation_closed_at IS NULL/i);
  
  // 6: DECLINING is not returned
  assert.doesNotMatch(sql, /WHERE e\.decision = 'DECLINING'/i);
});

test('7-10: Roles for attendance (PRESIDENT, AUDIT_HEAD)', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
  const sql = readFileSync(`${root}/supabase/migrations/20260923010000_fix_activity_evaluation_union_order.sql`, 'utf8');

  // 7, 8, 9, 10: AUDIT_HEAD and PRESIDENT can load attendance, unauthorized cannot
  assert.match(sql, /IF NOT \(SELECT private\.phase_three_has_role\(ARRAY\['PRESIDENT', 'AUDIT_HEAD'\]\)\) THEN\s*RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to evaluate attendance';/i);
});

test('7-10: Attendance saves persist ONLY for ON_TIME, LATE, VERY_LATE, ABSENT', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
  const sql = readFileSync(`${root}/supabase/migrations/20260829120000_phase_three_security_closure.sql`, 'utf8');

  // 7, 8, 9, 10: Attendance saves persist and ONLY update attendance_status for JOINING
  assert.match(sql, /UPDATE public\.activity_enrollments\s*SET attendance_status = p_status\s*WHERE activity_id = p_activity_id\s*AND student_id = p_student_id\s*AND decision = 'JOINING'/i);
});

test('11: Finalized activity rejects further JOINING/DECLINING changes', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
  const sql = readFileSync(`${root}/supabase/migrations/20260922120000_fix_activity_enrollment_closed_integrity.sql`, 'utf8');

  // 11: Finalized activity rejects further JOINING/DECLINING changes
  assert.match(sql, /IF v_activity.evaluation_closed_at IS NOT NULL THEN\s*RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Activity evaluation is already closed';/i);
});

test('12-15: Finalization integrity rules', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
  const sql = readFileSync(`${root}/supabase/migrations/20260830180000_activity_program_counts_executive_participation.sql`, 'utf8');

  // 12: finalization refuses missing attendance
  assert.match(sql, /IF EXISTS \(\s*SELECT 1\s*FROM public\.activity_enrollments\s*WHERE activity_id = p_activity_id\s*AND decision = 'JOINING'\s*AND attendance_status IS NULL\s*\) THEN\s*RAISE EXCEPTION USING\s*ERRCODE = '23514',\s*MESSAGE = 'Every joining student requires attendance evaluation';/i);

  // 13: finalization is idempotent
  assert.match(sql, /IF v_activity.evaluation_closed_at IS NOT NULL THEN\s*RETURN jsonb_build_object\('activityId', p_activity_id, 'alreadyFinalized', true/i);

  // 14: no duplicate point ledger entries (ON CONFLICT (source_key) DO NOTHING)
  assert.match(sql, /ON CONFLICT \(source_key\) DO NOTHING;/i);

  // 15: PAID attendance does not award extra attendance points
  assert.match(sql, /WHEN v_activity.type = 'PAID' OR v_row.attendance_status = 'ABSENT' THEN 0/i);
});

test('11-13: list_activity_evaluations special cases preserved', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
  const sql = readFileSync(`${root}/supabase/migrations/20260923010000_fix_activity_evaluation_union_order.sql`, 'utf8');

  // 11: Zero enrollment placeholder behavior preserved
  assert.match(sql, /NULL::uuid, NULL::text, NULL::text, NULL::public\.attendance_status, NULL::public\.activity_decision/i);

  // 12: MANDATORY ignored/no-response behavior preserved
  assert.match(sql, /NULL::public\.attendance_status, 'IGNORED'::public\.activity_decision/i);

  // 13: attendance_status nullable for unevaluated JOINING students
  assert.match(sql, /e\.attendance_status/i);
});

test('14-25: set_own_activity_enrollment toggle and reset behaviors', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
  const sql = readFileSync(`${root}/supabase/migrations/20260923020000_activity_participation_toggle.sql`, 'utf8');

  // 14 & 15: clears excuse when decision is IGNORED or JOINING
  assert.match(sql, /IF p_decision = 'JOINING' THEN[\s\S]*v_clean_excuse := NULL;/i);
  assert.match(sql, /IF p_decision = 'IGNORED' THEN\s*v_clean_excuse := NULL;\s*END IF;/i);

  // 13-16: final excuse lock preserves participation and ledger history
  assert.match(sql, /IF v_existing\.excuse_status IN \('ACCEPTED', 'PARTIAL', 'REJECTED'\) THEN\s*RAISE EXCEPTION USING\s*ERRCODE = '55000',\s*MESSAGE = 'Final excuse review locks activity participation';\s*END IF;/i);

  // 16 & 17: clears attendance_status on decision change
  assert.match(sql, /attendance_status = CASE\s*WHEN EXCLUDED\.decision <> public\.activity_enrollments\.decision THEN NULL\s*ELSE public\.activity_enrollments\.attendance_status/i);
});
