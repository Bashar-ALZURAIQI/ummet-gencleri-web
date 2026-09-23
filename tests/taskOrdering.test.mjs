import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDir = new URL('../supabase/migrations', import.meta.url);

async function getLatestFunctionDefinition(functionName) {
  const files = await readdir(migrationsDir);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

  let latestDef = '';

  for (const file of sqlFiles) {
    const filePath = new URL(file, migrationsDir + '/');
    const content = await readFile(filePath, 'utf8');
    const regex = new RegExp(`CREATE OR REPLACE FUNCTION ${functionName}[\\s\\S]*?\\$function\\$;`, 'i');
    const match = content.match(regex);
    if (match) {
      latestDef = match[0];
    }
  }

  return latestDef;
}

test('list_student_task_board sorts by newest created task first', async () => {
  const sql = await getLatestFunctionDefinition('public\\.list_student_task_board');
  assert.ok(sql.length > 0, 'Could not find function definition');

  const normalized = sql.replace(/\s+/g, ' ');

  // The test must prove:
  // 1. primary ordering is task.created_at DESC
  // 2. task.deadline ASC is no longer the primary ordering
  assert.match(normalized, /ORDER BY task\.created_at DESC, task\.id DESC/i, 'New ordering contract is missing');
  assert.doesNotMatch(normalized, /ORDER BY task\.deadline ASC/i, 'Old deadline ASC ordering should be removed');

  // 3. the existing visibility WHERE clause remains intact
  assert.match(normalized, /WHERE \(\s*\(\s*task\.deadline > now\(\)\s*AND\s*task\.status <> 'CLOSED'::public\.task_status\s*\)\s*OR\s*own_enrollment\.student_id IS NOT NULL\s*\)/i, 'Visibility filter was modified or removed');
});
