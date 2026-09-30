import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminDashboardPath = path.join(__dirname, '../src/pages/AdminDashboard.tsx');

test('test_members_panel_session_draft', () => {
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("buildSessionDraftKey(currentUser.userId, 'admin:members-panel', 'edit', 'tab')"), 'Must build members panel draft key');
  assert.ok(source.includes("panelDraft.data.search"), 'Must map panel draft search');
});

test('test_applications_panel_session_draft', () => {
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("buildSessionDraftKey(currentUser.userId, 'admin:applications-panel', 'edit', 'tab')"), 'Must build applications panel draft key');
  assert.ok(source.includes("panelDraft.data.search"), 'Must map applications panel draft search');
  assert.ok(source.includes("panelDraft.data.statusFilter"), 'Must map applications panel draft statusFilter');
});
