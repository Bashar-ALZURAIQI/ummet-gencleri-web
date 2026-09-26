import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260926015800_student_suggestions_v2.sql', import.meta.url);

test('student suggestions v2 migration creates authoritative schema', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  // Check tables
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.student_suggestions/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.suggestion_responses/i);

  // Check fields and relations for student_suggestions
  assert.match(sql, /id\s+uuid\s+primary key/i);
  assert.match(sql, /student_user_id\s+uuid\s+(NOT NULL\s+)?REFERENCES\s+public\.profiles\s*\(id\)/i);
  assert.match(sql, /target_role\s+text/i);
  assert.match(sql, /category\s+text/i);
  assert.match(sql, /title\s+text/i);
  assert.match(sql, /content\s+text/i);
  assert.match(sql, /status\s+text/i);
  assert.match(sql, /created_at\s+timestamptz/i);
  assert.match(sql, /updated_at\s+timestamptz/i);

  // Check validation rules
  assert.match(sql, /char_length\(btrim\(category\)\)\s+BETWEEN\s+1\s+AND\s+100/i);
  assert.match(sql, /char_length\(btrim\(title\)\)\s+BETWEEN\s+3\s+AND\s+200/i);
  assert.match(sql, /char_length\(btrim\(content\)\)\s+BETWEEN\s+5\s+AND\s+5000/i);
  
  // Check fields and relations for suggestion_responses
  assert.match(sql, /suggestion_id\s+uuid\s+(NOT NULL\s+)?REFERENCES\s+public\.student_suggestions\s*\(id\)/i);
  assert.match(sql, /responder_user_id\s+uuid\s+(NOT NULL\s+)?REFERENCES\s+public\.profiles\s*\(id\)/i);
  assert.match(sql, /response_text\s+text/i);
  assert.match(sql, /char_length\(btrim\(response_text\)\)\s+BETWEEN\s+1\s+AND\s+5000/i);

  // Check roles constraints
  for (const role of ['PRESIDENT', 'VICE_PRESIDENT', 'MEDIA_HEAD', 'FINANCE_HEAD', 'AUDIT_HEAD', 'ACADEMIC_HEAD', 'ACTIVITIES_HEAD']) {
    assert.match(sql, new RegExp(`'${role}'`));
  }

  // Check statuses constraints
  for (const status of ['new', 'reviewing', 'implemented', 'closed']) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
});

test('student suggestions v2 secures the tables with RLS and no direct mutation', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /ALTER TABLE public\.student_suggestions ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /ALTER TABLE public\.suggestion_responses ENABLE ROW LEVEL SECURITY/i);

  // RLS for reads
  assert.match(sql, /CREATE POLICY/i);
  assert.match(sql, /student_user_id\s*=\s*auth\.uid\(\)/i);
  
  // Block manual unauthorized RPC/direct-table attempts
  // There should be NO policy granting INSERT/UPDATE/DELETE to authenticated directly
  assert.doesNotMatch(sql, /GRANT\s+INSERT[\s\S]{0,100}\bTO\s+(authenticated|public|anon)\b/i);
  assert.doesNotMatch(sql, /GRANT\s+UPDATE[\s\S]{0,100}\bTO\s+(authenticated|public|anon)\b/i);
  assert.doesNotMatch(sql, /GRANT\s+DELETE[\s\S]{0,100}\bTO\s+(authenticated|public|anon)\b/i);
  
  assert.match(sql, /REVOKE ALL ON TABLE public\.student_suggestions FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.suggestion_responses FROM PUBLIC, anon, authenticated/i);
  
  // They only get SELECT via grant
  assert.match(sql, /GRANT SELECT ON TABLE public\.student_suggestions TO authenticated/i);
  assert.match(sql, /GRANT SELECT ON TABLE public\.suggestion_responses TO authenticated/i);
});

test('student suggestions v2 exposes strictly secured RPCs', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  // RPC creation
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.submit_student_suggestion\s*\(\s*p_target_role\s+text,\s*p_category\s+text,\s*p_title\s+text,\s*p_content\s+text\s*\)/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.respond_to_student_suggestion\s*\(\s*p_suggestion_id\s+uuid,\s*p_response_text\s+text,\s*p_new_status\s+text\s*\)/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.list_visible_student_suggestions\s*\(\s*\)/i);

  // Security Definer & Set search_path
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = ''/i);

  // explicit grants/revokes for RPCs
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.submit_student_suggestion[\s\S]*FROM PUBLIC, anon/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.respond_to_student_suggestion[\s\S]*FROM PUBLIC, anon/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.list_visible_student_suggestions[\s\S]*FROM PUBLIC, anon/i);

  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.submit_student_suggestion[\s\S]*TO authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.respond_to_student_suggestion[\s\S]*TO authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.list_visible_student_suggestions[\s\S]*TO authenticated/i);
  
  // derive actor from auth.uid()
  assert.match(sql, /auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /p_student_user_id/i);
  assert.doesNotMatch(sql, /p_responder_user_id/i);

  // Student eligibility check
  assert.match(sql, /public\.profiles/i);
  assert.match(sql, /status\s*=\s*'active'/i);
  assert.match(sql, /student_applications/i);
  assert.match(sql, /status\s*=\s*'accepted'/i);
  assert.match(sql, /auth\.users/i);
  assert.match(sql, /banned_until/i);
});


