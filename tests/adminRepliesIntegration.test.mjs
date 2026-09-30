import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('test_contact_inbox_uses_session_draft', () => {
  const adminDashboardPath = path.resolve('src/pages/AdminDashboard.tsx');
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("buildSessionDraftKey(currentUser.userId, 'admin:inbox-reply', 'edit', active.id)"), 'ContactInboxTab must use admin:inbox-reply draft key');
  assert.ok(source.includes("draft.clearDraft()"), 'Inbox reply success must clear draft');
  assert.ok(source.includes("loading ? 'UNKNOWN' : (active && !active.reply && canAccessContactInbox(currentUser?.role)) ? 'VALID' : 'INVALID'"), 'Inbox draft validation should respect loading and reply status');
});

test('test_stats_and_suggestions_use_session_draft', () => {
  const adminDashboardPath = path.resolve('src/pages/AdminDashboard.tsx');
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("findOpenSessionDraft<{ replyText: string; status: SuggestionStatus }>(currentUser.userId, 'admin:suggestion-reply')"), 'Must restore suggestion replies on mount');
  assert.ok(source.includes("buildSessionDraftKey(currentUser.userId, 'admin:suggestion-reply', 'edit', activeSuggestion.id)"), 'Must build suggestion reply edit key');
  assert.ok(source.includes("draft.clearDraft()"), 'Suggestion reply success must clear draft');
  assert.ok(source.includes("isDecisionOpen={draft.isDecisionOpen}"), 'Must use draft decision state');
});
