import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const profileSettingsPath = path.join(__dirname, '../src/components/ProfileSettings.tsx');

test('test_profile_settings_session_draft', () => {
  const source = fs.readFileSync(profileSettingsPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("buildSessionDraftKey(userId, 'settings:profile', 'edit', 'form')"), 'Must build profile settings draft key');
  assert.ok(source.includes("JSON.stringify(d) !== JSON.stringify(buildForm())"), 'Must use deep compare for isDirty in profile');
  assert.ok(source.includes("if (!profileDraft.dirty) {"), 'Must conditionally sync with external profile if not dirty');
  assert.ok(source.includes("profileDraft.clearDraft()"), 'Profile submit success must clear draft');
});
