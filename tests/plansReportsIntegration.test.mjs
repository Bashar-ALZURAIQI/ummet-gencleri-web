import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminDashboardPath = path.join(__dirname, '../src/pages/AdminDashboard.tsx');

test('test_plans_use_session_draft', () => {
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("findOpenSessionDraft<{ planForm: any; planTranslations: any }>(currentUser.userId, 'admin:plan')"), 'Must restore plan draft on mount');
  assert.ok(source.includes("buildSessionDraftKey(currentUser.userId, 'admin:plan', editPlanId === 'create' ? 'create' : 'edit', editPlanId === 'create' ? undefined : editPlanId)"), 'Must build plan edit key');
  assert.ok(source.includes("planDraft.clearDraft()"), 'Plan submit success must clear draft');
  assert.ok(source.includes("<UnsavedDraftDecision onContinue={planDraft.continueEditing} onKeep={planDraft.keepDraftAndClose} onDiscard={planDraft.discardDraftAndClose} />"), 'Must render UnsavedDraftDecision for plan');
});

test('test_reports_use_session_draft', () => {
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("findOpenSessionDraft<{ reportForm: any; reportTranslations: any }>(currentUser.userId, 'admin:report')"), 'Must restore report draft on mount');
  assert.ok(source.includes("buildSessionDraftKey(currentUser.userId, 'admin:report', editReportId === 'create' ? 'create' : 'edit', editReportId === 'create' ? undefined : editReportId)"), 'Must build report edit key');
  assert.ok(source.includes("reportDraft.clearDraft()"), 'Report submit success must clear draft');
  assert.ok(source.includes("<UnsavedDraftDecision onContinue={reportDraft.continueEditing} onKeep={reportDraft.keepDraftAndClose} onDiscard={reportDraft.discardDraftAndClose} />"), 'Must render UnsavedDraftDecision for report');
});
