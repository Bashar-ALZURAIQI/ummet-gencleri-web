import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');

const migrationPath = `${root}/supabase/migrations/20260920150000_allow_all_executives_gallery_images.sql`;

function getSqlFunctions(sql) {
  const fns = {};
  const matches = sql.matchAll(/create or replace function public\.([a-z0-9_]+)\([\s\S]*?\n\$function\$;/ig);
  for (const match of matches) {
    fns[match[1]] = match[0];
  }
  return fns;
}

test('GALLERY IMAGE: All executive roles can upload into their albums folder', () => {
  assert.ok(existsSync(migrationPath), 'Missing new migration file');
  const sql = readFileSync(migrationPath, 'utf8');
  
  const policyMatch = sql.match(/CREATE POLICY "gallery_authorized_insert"[\s\S]*?\);/i);
  assert.ok(policyMatch, 'missing gallery_authorized_insert policy');
  const policy = policyMatch[0];
  
  // 1-7: PRESIDENT, MEDIA_HEAD, VICE_PRESIDENT, FINANCE_HEAD, AUDIT_HEAD, ACADEMIC_HEAD, ACTIVITIES_HEAD allowed
  assert.match(policy, /authz\.position_key = 'PRESIDENT'/i);
  assert.match(policy, /authz\.position_key = 'MEDIA_HEAD'[\s\S]*?'albums'/i);
  assert.match(policy, /authz\.position_key IN \([\s\S]*?'VICE_PRESIDENT',[\s\S]*?'FINANCE_HEAD',[\s\S]*?'AUDIT_HEAD',[\s\S]*?'ACADEMIC_HEAD',[\s\S]*?'ACTIVITIES_HEAD'[\s\S]*?\)[\s\S]*?'albums'/i);
  
  // 8: STUDENT denied because it only lists executives.
  assert.doesNotMatch(policy, /STUDENT/i);
  
  // 9: OWNER-BOUND PATH
  assert.match(policy, /bucket_id = 'gallery'/i);
  assert.match(policy, /owner_id = \(SELECT auth\.uid\(\)\)::text/i);
  assert.match(policy, /\(storage\.foldername\(name\)\)\[2\] = \(SELECT auth\.uid\(\)\)::text/i);
});

test('REGISTER_MANAGED_ASSET: Accepts albums for all executives', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const fns = getSqlFunctions(sql);
  const registerAssetFn = fns['register_managed_asset'];
  
  assert.ok(registerAssetFn, 'missing register_managed_asset function');
  
  // 10: Albums allowed for all executives
  assert.match(registerAssetFn, /v_position = 'PRESIDENT'/i);
  assert.match(registerAssetFn, /v_position = 'MEDIA_HEAD' AND v_folder IN \([\s\S]*?'albums'[\s\S]*?\)/i);
  assert.match(registerAssetFn, /v_position IN \('ACADEMIC_HEAD', 'ACTIVITIES_HEAD'\) AND v_folder IN \([\s\S]*?'albums'[\s\S]*?\)/i);
  assert.match(registerAssetFn, /v_position IN \('VICE_PRESIDENT', 'FINANCE_HEAD', 'AUDIT_HEAD'\) AND v_folder IN \([\s\S]*?'albums'[\s\S]*?\)/i);
});

test('EVENT IMAGE REGRESSION: Event images remain allowed', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  
  // Policy allows events
  assert.match(sql, /'events'/i, 'must contain events');
  
  // Function allows events
  const fns = getSqlFunctions(sql);
  const registerAssetFn = fns['register_managed_asset'];
  assert.match(registerAssetFn, /v_folder IN \([\s\S]*?'events'[\s\S]*?\)/i);
});

test('STUDENT GUIDE REGRESSION: Guide permissions remain unchanged', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  
  const policyMatch = sql.match(/CREATE POLICY "gallery_authorized_insert"[\s\S]*?\);/i);
  const policy = policyMatch[0];
  assert.match(policy, /upper\(\(string_to_array\(name, '\/'\)\)\[3\]\) = 'GUIDE'/i);
  
  const fns = getSqlFunctions(sql);
  const registerAssetFn = fns['register_managed_asset'];
  assert.match(registerAssetFn, /v_is_guide_document :=[\s\S]*?v_folder = 'documents'[\s\S]*?'GUIDE'/i);
  assert.match(registerAssetFn, /v_position NOT IN \('PRESIDENT', 'MEDIA_HEAD'\) THEN[\s\S]*?Guide documents require/i);
});

test('Unrelated folders are not broadened', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const fns = getSqlFunctions(sql);
  const registerAssetFn = fns['register_managed_asset'];
  
  // Non-media executives shouldn't have site/news access
  assert.doesNotMatch(registerAssetFn, /v_position IN \('ACADEMIC_HEAD', 'ACTIVITIES_HEAD'\) AND v_folder IN \([\s\S]*?'news'[\s\S]*?\)/i);
  assert.doesNotMatch(registerAssetFn, /v_position IN \('VICE_PRESIDENT', 'FINANCE_HEAD', 'AUDIT_HEAD'\) AND v_folder IN \([\s\S]*?'news'[\s\S]*?\)/i);
});
