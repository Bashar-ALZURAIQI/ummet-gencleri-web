import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminDashboardPath = path.join(__dirname, '../src/pages/AdminDashboard.tsx');

test('test_application_interview_session_draft', () => {
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("buildSessionDraftKey(currentUser.userId, 'admin:application-interview', 'edit', editInterviewId)"), 'Must build interview draft key');
  assert.ok(source.includes("interviewDraft.clearDraft()"), 'Interview submit success must clear draft');
});

test('test_application_decision_session_draft', () => {
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("buildSessionDraftKey(currentUser.userId, 'admin:application-decision', 'edit', editDecisionId)"), 'Must build decision draft key');
  assert.ok(source.includes("decisionDraft.clearDraft()"), 'Decision submit success must clear draft');
});
