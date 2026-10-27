import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sql=read('../supabase/migrations/20261027034336_safe_cancel_event_attendance.sql');
test('delete RPC restricts access and preserves finalized grades',()=>{
  assert.match(sql,/phase_three_has_role\(ARRAY\['PRESIDENT','AUDIT_HEAD'\]\)/);
  assert.match(sql,/evaluation_closed_at IS NOT NULL/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.cancel_activity_evaluation/);
});
test('ledger compensation is append-only before attendance delete',()=>{
  for(const k of ['activity-result:','paid-join:','paid-refund:','excuse:','activity-cancel:']) assert.ok(sql.includes(k));
  assert.match(sql,/-v_entry\.amount/);
  assert.match(sql,/DELETE FROM public\.activity_enrollments WHERE activity_id=p_activity_id/);
});
test('future events trigger cancellation, past events offer two choices',()=>{
  assert.match(sql,/cleanup_removed_upcoming_event_attendance_trigger/);
  assert.match(sql,/v_end>now\(\)/);
  const pg=read('../src/pages/ProgramsPage.tsx');
  assert.match(pg,/deleteEvent\(deleteCandidate\.id, false\)/);
  assert.match(pg,/deleteEvent\(deleteCandidate\.id, true\)/);
  const ov=read('../src/components/OversightEvaluationPanel.tsx');
  assert.match(ov,/discardActivity\(rows\)/);
  assert.match(ov,/closeActivity\(rows\)/);
});
