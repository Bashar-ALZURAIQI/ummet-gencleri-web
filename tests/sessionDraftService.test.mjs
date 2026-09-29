import test from 'node:test';
import assert from 'node:assert';
import { 
  buildSessionDraftKey, 
  saveSessionDraft, 
  loadSessionDraft, 
  removeSessionDraft, 
  clearSessionDraftsForUser,
  findOpenSessionDraft
} from '../src/domain/sessionDraft.ts';

// Storage Mocks
const mockStorage = {
  store: new Map(),
  getItem(key) { return this.store.get(key) || null; },
  setItem(key, value) { 
    if (this.shouldThrow) throw new Error('Quota exceeded');
    this.store.set(key, String(value)); 
  },
  removeItem(key) { this.store.delete(key); },
  clear() { this.store.clear(); },
  get length() { return this.store.size; },
  key(index) { return Array.from(this.store.keys())[index] || null; },
  shouldThrow: false
};
global.sessionStorage = mockStorage;

test('test_buildSessionDraftKey_outputs_exact_grammar', () => {
  const key = buildSessionDraftKey('user-123', 'admin:events', 'create');
  assert.strictEqual(key, 'draft:v1:user-123:admin:events:create');
});

test('test_buildSessionDraftKey_separates_create_edit', () => {
  const createKey = buildSessionDraftKey('user-123', 'admin:events', 'create');
  const editKey = buildSessionDraftKey('user-123', 'admin:events', 'edit', 'event-456');
  assert.notStrictEqual(createKey, editKey);
  assert.strictEqual(editKey, 'draft:v1:user-123:admin:events:edit:event-456');
});

test('test_buildSessionDraftKey_separates_entities', () => {
  const editA = buildSessionDraftKey('user-1', 'feature', 'edit', 'A');
  const editB = buildSessionDraftKey('user-1', 'feature', 'edit', 'B');
  assert.notStrictEqual(editA, editB);
});

test('test_buildSessionDraftKey_rejects_unsafe_delimiters', () => {
  assert.throws(() => buildSessionDraftKey('user:1', 'feature', 'create'), /Delimiter not allowed/);
});

test('test_buildSessionDraftKey_requires_entityId_for_edit_mode', () => {
  assert.throws(() => buildSessionDraftKey('user-1', 'feature', 'edit'), /entityId is required/);
});

test('test_buildSessionDraftKey_prohibits_entityId_for_create_mode', () => {
  assert.throws(() => buildSessionDraftKey('user-1', 'feature', 'create', 'entity-1'), /entityId must not be provided/);
});

test('test_save_load_roundtrips_JSON', () => {
  mockStorage.clear();
  const key = buildSessionDraftKey('user-1', 'feature', 'create');
  const envelope = {
    version: 1,
    userId: 'user-1',
    key,
    updatedAt: new Date().toISOString(),
    open: true,
    dirty: true,
    value: { title: "Title", content: "" }
  };
  
  const saved = saveSessionDraft(key, envelope);
  assert.strictEqual(saved, true);
  
  const loaded = loadSessionDraft(key);
  assert.deepStrictEqual(loaded, envelope);
});

test('test_load_handles_malformed_JSON', () => {
  mockStorage.clear();
  mockStorage.store.set('some-key', '{ malformed json');
  assert.strictEqual(loadSessionDraft('some-key'), null);
});

test('test_strips_invalid_data', () => {
  mockStorage.clear();
  const key = 'draft:v1:user-1:feat:create';
  const envelope = {
    version: 1,
    userId: 'user-1',
    key,
    updatedAt: new Date().toISOString(),
    open: true,
    dirty: true,
    value: {
      validStr: "ok",
      fn: () => {},
      // blob: new Blob(['test']),  // Mock Blob might not exist in node test scope, so we use function as an invalid type.
      // the stringify will strip function.
    }
  };
  // To strictly follow the plan, "File, Blob, and functions" are not serialized.
  // JSON.stringify naturally strips functions. For Blob/File, they serialize to `{}`.
  saveSessionDraft(key, envelope);
  const loaded = loadSessionDraft(key);
  assert.strictEqual(loaded.value.fn, undefined);
  assert.strictEqual(loaded.value.validStr, "ok");
});

test('test_clearSessionDraftsForUser_deletes_only_matched_user_prefix', () => {
  mockStorage.clear();
  mockStorage.store.set('draft:v1:user-1:feature:create', 'data1');
  mockStorage.store.set('draft:v1:user-1:feature2:create', 'data2');
  mockStorage.store.set('draft:v1:user-12:feature:create', 'data12');
  mockStorage.store.set('draft:v1:user-2:feature:create', 'data2');
  mockStorage.store.set('other-key', 'data3');

  clearSessionDraftsForUser('user-1');

  assert.strictEqual(mockStorage.store.has('draft:v1:user-1:feature:create'), false);
  assert.strictEqual(mockStorage.store.has('draft:v1:user-1:feature2:create'), false);
  
  // Must NOT delete user-12 or user-2 or other keys
  assert.strictEqual(mockStorage.store.has('draft:v1:user-12:feature:create'), true);
  assert.strictEqual(mockStorage.store.has('draft:v1:user-2:feature:create'), true);
  assert.strictEqual(mockStorage.store.has('other-key'), true);
});

test('test_save_fails_gracefully_when_sessionStorage_throws', () => {
  mockStorage.shouldThrow = true;
  const result = saveSessionDraft('key', { version: 1, key: 'key' });
  assert.strictEqual(result, false);
  mockStorage.shouldThrow = false;
});

test('test_findOpenSessionDraft_discovers_open_create', () => {
  mockStorage.clear();
  const key = buildSessionDraftKey('user-1', 'admin:events', 'create');
  saveSessionDraft(key, {
    version: 1, userId: 'user-1', key,
    updatedAt: new Date().toISOString(),
    open: true, dirty: true, value: {}
  });

  const result = findOpenSessionDraft('user-1', 'admin:events');
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.mode, 'create');
  assert.strictEqual(result.entityId, undefined);
  assert.strictEqual(result.key, key);
});

test('test_findOpenSessionDraft_extracts_entityId', () => {
  mockStorage.clear();
  const key = buildSessionDraftKey('user-1', 'admin:events', 'edit', 'event-abc');
  saveSessionDraft(key, {
    version: 1, userId: 'user-1', key,
    updatedAt: new Date().toISOString(),
    open: true, dirty: true, value: {}
  });

  const result = findOpenSessionDraft('user-1', 'admin:events');
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.mode, 'edit');
  assert.strictEqual(result.entityId, 'event-abc');
  assert.strictEqual(result.key, key);
});

test('test_findOpenSessionDraft_isolates_users', () => {
  mockStorage.clear();
  const key2 = buildSessionDraftKey('user-2', 'admin:events', 'create');
  saveSessionDraft(key2, {
    version: 1, userId: 'user-2', key: key2,
    updatedAt: new Date().toISOString(),
    open: true, dirty: true, value: {}
  });

  const result = findOpenSessionDraft('user-1', 'admin:events');
  assert.strictEqual(result, null);
});

test('test_findOpenSessionDraft_resolves_timestamp_conflicts', () => {
  mockStorage.clear();
  const key1 = buildSessionDraftKey('user-1', 'admin:events', 'edit', '1');
  const key2 = buildSessionDraftKey('user-1', 'admin:events', 'edit', '2');
  
  saveSessionDraft(key1, {
    version: 1, userId: 'user-1', key: key1,
    updatedAt: '2026-09-30T00:00:00.000Z',
    open: true, dirty: true, value: {}
  });
  saveSessionDraft(key2, {
    version: 1, userId: 'user-1', key: key2,
    updatedAt: '2026-09-30T01:00:00.000Z',
    open: true, dirty: true, value: {}
  });

  const result = findOpenSessionDraft('user-1', 'admin:events');
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.entityId, '2');

  // Also verify older draft was closed
  const older = loadSessionDraft(key1);
  assert.strictEqual(older.open, false);
});

test('test_findOpenSessionDraft_ignores_closed_drafts', () => {
  mockStorage.clear();
  const key = buildSessionDraftKey('user-1', 'admin:events', 'create');
  saveSessionDraft(key, {
    version: 1, userId: 'user-1', key,
    updatedAt: new Date().toISOString(),
    open: false, dirty: true, value: {}
  });

  const result = findOpenSessionDraft('user-1', 'admin:events');
  assert.strictEqual(result, null);
});

test('test_findOpenSessionDraft_ignores_malformed_storage_records', () => {
  mockStorage.clear();
  // Valid draft
  const key1 = buildSessionDraftKey('user-1', 'admin:events', 'create');
  saveSessionDraft(key1, {
    version: 1, userId: 'user-1', key: key1,
    updatedAt: new Date().toISOString(),
    open: true, dirty: true, value: {}
  });
  // Malformed draft in same feature prefix
  mockStorage.store.set('draft:v1:user-1:admin:events:edit:malformed', 'not json');

  const result = findOpenSessionDraft('user-1', 'admin:events');
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.key, key1); // Discovers valid one, skips malformed
});
