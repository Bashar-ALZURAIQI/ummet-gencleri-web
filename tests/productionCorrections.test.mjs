import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const read = async (relPath) =>
  (await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

test('MIGRATION CONTRACT: Corrective migration fixes eligibility join', async () => {
  const files = await readdir(new URL('../supabase/migrations', import.meta.url));
  const newMigrationFile = files.find(f => f.includes('fix_submit_student_suggestion'));
  assert.ok(newMigrationFile, 'New migration file must exist');

  const source = await read(`supabase/migrations/${newMigrationFile}`);
  
  assert.match(
    source,
    /sa\.student_user_id = p\.id/,
    'New migration must contain correct join on student_user_id'
  );
  assert.doesNotMatch(
    source,
    /sa\.user_id = p\.id/,
    'New migration must NOT contain broken join on user_id'
  );
});

test('STUDENT SUBMIT FAILURE AND SUCCESS CONTRACTS in StudentDashboard', async () => {
  const source = await read('src/pages/StudentDashboard.tsx');
  
  // Look for the submitSuggestion call and subsequent behavior
  const submitBlock = source.slice(
    source.indexOf('const submitSuggestionLocal ='),
    source.indexOf('};', source.indexOf('const submitSuggestionLocal ='))
  );

  // Failure state behavior
  assert.match(
    submitBlock,
    /const result = await submitSuggestion\(\{/,
    'Must use result object rather than assuming truthiness'
  );
  assert.match(
    submitBlock,
    /if \(!result\.ok\)/,
    'Must check result.ok explicitly'
  );
  assert.match(
    submitBlock,
    /setSubmitError\(/,
    'Must show failure state when result is not ok'
  );
  assert.match(
    submitBlock,
    /return;/,
    'Must return early on failure, preventing draft clear and success state'
  );

  // Success state behavior
  const afterErrorCheck = submitBlock.slice(submitBlock.indexOf('if (!result.ok)'));
  assert.match(
    afterErrorCheck,
    /draft\.clearDraft\(\)/,
    'Must clear draft only after confirming ok'
  );
  assert.match(
    afterErrorCheck,
    /setSent\(true\)/,
    'Must show success only after confirming ok'
  );
});

test('EXECUTIVE RESPONSE CONTRACT in AdminDashboard', async () => {
  const source = await read('src/pages/AdminDashboard.tsx');
  
  // Both stats tab and suggestions tab handlers
  const matches = [...source.matchAll(/const { ok, refreshPending(: wasRefreshPending)? } = await respondToSuggestion/g)];
  assert.equal(matches.length, 2, 'Must properly destructure respondToSuggestion return in both tabs');

  const submitReplyBlock = source.slice(
    source.indexOf('const submitReply ='),
    source.indexOf('};', source.indexOf('const submitReply ='))
  );

  assert.match(
    submitReplyBlock,
    /if \(!ok\)/,
    'Must check destructured ok boolean'
  );
  assert.match(
    submitReplyBlock,
    /setReplyError\(/,
    'Must show failure state'
  );
  assert.match(
    submitReplyBlock,
    /return;/,
    'Must return early on failure'
  );
});

test('REFRESH-PENDING is still treated as successful mutation', async () => {
  const source = await read('src/pages/AdminDashboard.tsx');
  
  const submitReplyBlock = source.slice(
    source.indexOf('const submitReply ='),
    source.indexOf('};', source.indexOf('const submitReply ='))
  );

  assert.match(
    submitReplyBlock,
    /setRefreshPending\(wasRefreshPending \|\| false\)/,
    'Must set refresh pending state from response'
  );
});
