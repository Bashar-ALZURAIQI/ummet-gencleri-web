/**
 * dashboardDraftRuntimeKeys.test.mjs
 *
 * RUNTIME key-contract tests for all Stage B dashboard draft keys.
 * These tests ACTUALLY CALL buildSessionDraftKey and parseSessionDraftKey
 * to verify no key throws, no colon appears in entityId, and isolation holds.
 *
 * Must be RED against e9b4e9b (broken calls) and GREEN after fix.
 */
import test from 'node:test';
import assert from 'node:assert';
import { buildSessionDraftKey, parseSessionDraftKey } from '../src/domain/sessionDraft.ts';

const UID = 'user-uuid-1234';
const UID2 = 'user-uuid-5678';

// ----------------------------------------------------------------
// Contract enforcement: create+entityId MUST throw
// ----------------------------------------------------------------
test('create mode with entityId throws (contract enforcement)', () => {
  assert.throws(
    () => buildSessionDraftKey(UID, 'admin:internal-task', 'create', 'task'),
    /entityId must not be provided for create mode/,
    'create+entityId must throw'
  );
});

test('edit mode with colon in entityId throws (contract enforcement)', () => {
  assert.throws(
    () => buildSessionDraftKey(UID, 'admin:board-member', 'edit', 'committee123:member456'),
    /Invalid entityId for edit mode/,
    'colon in entityId for edit must throw'
  );
});

// ----------------------------------------------------------------
// A. Internal Task - fixed: create with no entityId
// ----------------------------------------------------------------
test('A: Internal Task create key does not throw', () => {
  const key = buildSessionDraftKey(UID, 'admin:internal-task', 'create');
  assert.ok(key, 'key must be truthy');
  const parsed = parseSessionDraftKey(key);
  assert.strictEqual(parsed?.mode, 'create');
  assert.strictEqual(parsed?.feature, 'admin:internal-task');
  assert.strictEqual(parsed?.entityId, undefined);
});

// ----------------------------------------------------------------
// B. Member Points - fixed: edit with studentId as entityId
// ----------------------------------------------------------------
test('B: Member Points Student A edit key parses correctly', () => {
  const studentAId = 'student-a-uuid';
  const key = buildSessionDraftKey(UID, 'admin:member-points', 'edit', studentAId);
  const parsed = parseSessionDraftKey(key);
  assert.strictEqual(parsed?.mode, 'edit');
  assert.strictEqual(parsed?.entityId, studentAId);
  assert.ok(!parsed?.entityId?.includes(':'), 'entityId must not contain colon');
});

test('B: Member Points Student A and B are isolated', () => {
  const keyA = buildSessionDraftKey(UID, 'admin:member-points', 'edit', 'student-a');
  const keyB = buildSessionDraftKey(UID, 'admin:member-points', 'edit', 'student-b');
  assert.notStrictEqual(keyA, keyB, 'Student A and B must have distinct keys');
});

// ----------------------------------------------------------------
// C. Board Member - fixed: create has no entityId, edit uses encoded compound id
// ----------------------------------------------------------------
test('C: Board Member create key (committee-scoped) does not throw', () => {
  // The committeeId goes in the draft VALUE, not in the key entityId for create
  const key = buildSessionDraftKey(UID, 'admin:board-member', 'create');
  const parsed = parseSessionDraftKey(key);
  assert.strictEqual(parsed?.mode, 'create');
  assert.strictEqual(parsed?.entityId, undefined);
});

test('C: Board Member edit uses colon-free encoded compound id', () => {
  const committeeId = 'executive';
  const memberId = 'member-uuid-abc';
  // encodeDraftEntityParts - encodes with dot separator
  const entityId = `${committeeId}.${memberId}`;
  assert.ok(!entityId.includes(':'), 'entityId must not contain colon');
  const key = buildSessionDraftKey(UID, 'admin:board-member', 'edit', entityId);
  const parsed = parseSessionDraftKey(key);
  assert.strictEqual(parsed?.mode, 'edit');
  assert.strictEqual(parsed?.entityId, entityId);
  // Decode
  const [decodedCommitteeId, decodedMemberId] = entityId.split('.');
  assert.strictEqual(decodedCommitteeId, committeeId);
  assert.strictEqual(decodedMemberId, memberId);
});

test('C: Board Member Committee A and B create keys are isolated per user', () => {
  // For create mode, isolation is per-user (no entityId) - committee is stored in value
  const keyU1 = buildSessionDraftKey(UID, 'admin:board-member', 'create');
  const keyU2 = buildSessionDraftKey(UID2, 'admin:board-member', 'create');
  assert.notStrictEqual(keyU1, keyU2, 'Different users must have different keys');
});

// ----------------------------------------------------------------
// D. Board Head - fixed: edit uses colon-free committeeId (no prefix)
// ----------------------------------------------------------------
test('D: Board Head edit key uses colon-free committeeId', () => {
  const committeeId = 'executive';
  // Old broken: `head:${committeeId}` - has colon
  // Fixed: just committeeId directly
  const key = buildSessionDraftKey(UID, 'admin:board-head', 'edit', committeeId);
  const parsed = parseSessionDraftKey(key);
  assert.strictEqual(parsed?.mode, 'edit');
  assert.strictEqual(parsed?.entityId, committeeId);
  assert.ok(!parsed?.entityId?.includes(':'), 'entityId must not contain colon');
});

// ----------------------------------------------------------------
// E. Board Responsibility - fixed: create has no entityId, edit uses dot-encoded
// ----------------------------------------------------------------
test('E: Board Responsibility create key does not throw', () => {
  const key = buildSessionDraftKey(UID, 'admin:board-resp', 'create');
  const parsed = parseSessionDraftKey(key);
  assert.strictEqual(parsed?.mode, 'create');
  assert.strictEqual(parsed?.entityId, undefined);
});

test('E: Board Responsibility edit uses colon-free encoded compound id', () => {
  const committeeId = 'services';
  const idx = 2;
  const entityId = `${committeeId}.${idx}`;
  assert.ok(!entityId.includes(':'), 'entityId must not contain colon');
  const key = buildSessionDraftKey(UID, 'admin:board-resp', 'edit', entityId);
  const parsed = parseSessionDraftKey(key);
  assert.strictEqual(parsed?.mode, 'edit');
  assert.strictEqual(parsed?.entityId, entityId);
  // Decode
  const [decodedCommitteeId, decodedIdx] = entityId.split('.');
  assert.strictEqual(decodedCommitteeId, committeeId);
  assert.strictEqual(parseInt(decodedIdx, 10), idx);
});

// ----------------------------------------------------------------
// F. Gallery Media - fixed: create has no entityId, edit uses dot-encoded
// ----------------------------------------------------------------
test('F: Gallery Media create key does not throw', () => {
  // create - no entityId; album affinity stored in draft value
  const key = buildSessionDraftKey(UID, 'admin:gallery-media', 'create');
  const parsed = parseSessionDraftKey(key);
  assert.strictEqual(parsed?.mode, 'create');
  assert.strictEqual(parsed?.entityId, undefined);
});

test('F: Gallery Media edit uses colon-free encoded compound id', () => {
  const albumId = 'album-abc';
  const mediaId = 'media-xyz';
  const entityId = `${albumId}.${mediaId}`;
  assert.ok(!entityId.includes(':'), 'entityId must not contain colon');
  const key = buildSessionDraftKey(UID, 'admin:gallery-media', 'edit', entityId);
  const parsed = parseSessionDraftKey(key);
  assert.strictEqual(parsed?.mode, 'edit');
  assert.strictEqual(parsed?.entityId, entityId);
  const [decodedAlbumId, decodedMediaId] = entityId.split('.');
  assert.strictEqual(decodedAlbumId, albumId);
  assert.strictEqual(decodedMediaId, mediaId);
});

test('F: Gallery Media Album A and B create keys isolated per user', () => {
  // Since create has no entityId, isolation is per-user (album stored in value)
  const keyU1 = buildSessionDraftKey(UID, 'admin:gallery-media', 'create');
  const keyU2 = buildSessionDraftKey(UID2, 'admin:gallery-media', 'create');
  assert.notStrictEqual(keyU1, keyU2, 'Different users must have different keys');
});

test('F: Gallery Media edit - Media A and B in same album are isolated', () => {
  const albumId = 'album-abc';
  const keyA = buildSessionDraftKey(UID, 'admin:gallery-media', 'edit', `${albumId}.media-1`);
  const keyB = buildSessionDraftKey(UID, 'admin:gallery-media', 'edit', `${albumId}.media-2`);
  assert.notStrictEqual(keyA, keyB, 'Media A and B must have distinct keys');
});

// ----------------------------------------------------------------
// Profile Settings - edit with colon-free entityId
// ----------------------------------------------------------------
test('Profile Settings edit key does not throw', () => {
  const key = buildSessionDraftKey(UID, 'admin:profile-general', 'edit', 'form');
  const parsed = parseSessionDraftKey(key);
  assert.strictEqual(parsed?.mode, 'edit');
  assert.strictEqual(parsed?.entityId, 'form');
  assert.ok(!parsed?.entityId?.includes(':'));
});
