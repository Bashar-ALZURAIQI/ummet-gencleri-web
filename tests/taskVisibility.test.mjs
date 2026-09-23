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
    // Simple regex to extract function definition
    const regex = new RegExp(`CREATE OR REPLACE FUNCTION ${functionName}[\\s\\S]*?\\$function\\$;`, 'i');
    const match = content.match(regex);
    if (match) {
      latestDef = match[0];
    }
  }
  
  return latestDef;
}

test('list_student_task_board hides expired and closed tasks from nonparticipants', async () => {
  const sql = await getLatestFunctionDefinition('public\\.list_student_task_board');
  assert.ok(sql.length > 0, 'Could not find function definition');
  
  const normalized = sql.replace(/\s+/g, ' ');
  
  // 1. expired + never enrolled = hidden
  // 2. CLOSED + never enrolled = hidden
  // 3. expired + enrolled = visible
  // 4. CLOSED + enrolled = visible
  // 5. active OPEN + never enrolled = visible
  
  // The visibility rule MUST exist in the SQL
  assert.match(normalized, /WHERE \(\s*\(\s*task\.deadline > now\(\)\s*AND\s*task\.status <> 'CLOSED'::public\.task_status\s*\)\s*OR\s*own_enrollment\.student_id IS NOT NULL\s*\)/i, 'Missing visibility filter for nonparticipants');
});

test('list_student_task_board maintains original ORDER BY contract', async () => {
  const sql = await getLatestFunctionDefinition('public\\.list_student_task_board');
  const normalized = sql.replace(/\s+/g, ' ');
  
  // Ordering must be exactly preserved
  assert.match(normalized, /ORDER BY task\.deadline ASC, task\.created_at DESC/i, 'ORDER BY contract was modified');
});
