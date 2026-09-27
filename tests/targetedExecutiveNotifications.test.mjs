import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260927230446_targeted_executive_notifications.sql', import.meta.url);

test('migration drops and recreates push_notifications destination constraint', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  // Verify constraint drop logic
  assert.match(sql, /ALTER TABLE public\.push_notifications DROP CONSTRAINT/i);
  assert.match(sql, /push_notifications_destination_check/i);

  // Verify new destinations
  assert.match(sql, /\/\?push=contact-inbox/i);
  assert.match(sql, /\/\?push=guide-suggestions/i);
  assert.match(sql, /\/\?push=student-suggestions/i);
});

test('migration creates secure trigger for guide suggestions', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.enqueue_guide_suggestion_push_notification\(\)/i);
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = ''/i);
  assert.match(sql, /SELECT user_id.+FROM public\.executive_assignments WHERE position_key = 'PRESIDENT'/i);
  assert.match(sql, /SELECT user_id.+FROM public\.executive_assignments WHERE position_key = 'ACADEMIC_HEAD'/i);
  assert.match(sql, /v_academic_id <> v_president_id/i);
  assert.match(sql, /'اقتراح جديد لدليل الطالب'/i);
});

test('migration creates secure trigger for contact messages', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.enqueue_contact_message_push_notification\(\)/i);
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = ''/i);
  assert.match(sql, /SELECT user_id.+FROM public\.executive_assignments WHERE position_key = 'PRESIDENT'/i);
  assert.match(sql, /'رسالة جديدة عبر تواصل معنا'/i);
});

test('migration creates secure trigger for student suggestions', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.enqueue_student_suggestion_push_notification\(\)/i);
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = ''/i);
  assert.match(sql, /SELECT user_id.+FROM public\.executive_assignments WHERE position_key = NEW\.target_role/i);
  assert.match(sql, /'اقتراح جديد'/i);
});

test('migration creates authorized get_current_user_workload_counts RPC', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_current_user_workload_counts\(\)/i);
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = ''/i);
  
  // Actor resolution and denial
  assert.match(sql, /auth\.uid\(\)/i);
  
  // Guide suggestions
  assert.match(sql, /SELECT count\(\*\).+FROM public\.guide_suggestions WHERE status = 'PENDING'/i);
  
  // Contact messages
  assert.match(sql, /SELECT count\(\*\).+FROM public\.contact_messages WHERE status = 'UNREAD'/i);
  
  // Student suggestions
  assert.match(sql, /SELECT count\(\*\).+FROM public\.student_suggestions WHERE target_role = v_role AND status = 'new'/i);

  // Grants
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.get_current_user_workload_counts\(\) FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_current_user_workload_counts\(\) TO authenticated/i);
});
