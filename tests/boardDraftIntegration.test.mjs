import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminDashboardPath = path.join(__dirname, '../src/pages/AdminDashboard.tsx');

test('test_board_member_session_draft', () => {
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("buildSessionDraftKey("), 'Must build board member draft key');
  assert.ok(source.includes("`${editMemberId.committeeId}.${editMemberId.memberId}`"), 'Must serialize committee and member ids with dot separator (colon-free)');
  assert.ok(source.includes("memberDraft.clearDraft()"), 'Member save success must clear draft');
  assert.ok(source.includes("d.memberForm.photo.trim().length > 0"), 'Must use custom isDirty for photoUrl');
  // Regression test for fresh edit translations
  const openEditMemberRegex = /const openEditMember = [^{]+{.*?\.openTarget[^;]+;/s;
  const openEditMemberCode = source.match(openEditMemberRegex)?.[0] || '';
  assert.ok(openEditMemberCode.includes("translations: { tr: { position: '' }, en: { position: '' } }"), 'Board Member fresh TR/EN canonical-copy removed');
});
