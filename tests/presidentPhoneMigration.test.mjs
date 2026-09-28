import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260929000000_expose_member_phone_for_president.sql', import.meta.url);

test('migration exposes phone correctly without using CASCADE', async () => {
  const sqlContent = await readFile(migrationUrl, 'utf8');
  const sql = sqlContent.replace(/\r\n/g, '\n');

  // DROP FUNCTION appears before recreation
  const dropIndex = sql.indexOf('DROP FUNCTION public.list_president_assignable_members();');
  const createIndex = sql.indexOf('CREATE OR REPLACE FUNCTION public.list_president_assignable_members()');
  assert.ok(dropIndex !== -1, 'Must DROP FUNCTION before recreate');
  assert.ok(createIndex !== -1, 'Must CREATE OR REPLACE FUNCTION');
  assert.ok(dropIndex < createIndex, 'DROP FUNCTION must appear before CREATE OR REPLACE FUNCTION');

  // phone text exists in RETURNS TABLE
  assert.match(sql, /phone\s+text,/i, 'RETURNS TABLE must include phone text');

  // p.phone is selected
  assert.match(sql, /p\.phone,/i, 'SELECT must include p.phone');

  // private.is_current_president() remains present
  assert.match(sql, /private\.is_current_president\(\)/i, 'Must authorize via is_current_president');

  // authenticated EXECUTE grant remains
  assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.list_president_assignable_members\(\)\s+TO\s+authenticated;/i, 'Must GRANT EXECUTE to authenticated');

  // no CASCADE
  assert.doesNotMatch(sql, /CASCADE/i, 'Must NOT use CASCADE when dropping the function');
});
