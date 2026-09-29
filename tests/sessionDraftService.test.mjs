import test from 'node:test';
import assert from 'node:assert';
import {
  buildSessionDraftKey,
  saveSessionDraft,
  loadSessionDraft,
  removeSessionDraft,
  clearSessionDraftsForUser,
  findOpenSessionDraft,
  parseSessionDraftKey
} from '../src/domain/sessionDraft.ts';

// Fake Storage
const mockStorage = {
  store: new Map(),
  getItem(key) {
    if (this.shouldThrowGetItem) throw new Error('getItem failed');
    return this.store.get(key) || null;
  },
  setItem(key, value) {
    if (this.shouldThrowSetItem) throw new Error('Quota exceeded');
    this.store.set(key, String(value));
  },
  removeItem(key) {
    if (this.shouldThrowRemoveItem) throw new Error('removeItem failed');
    this.store.delete(key);
  },
  clear() { this.store.clear(); },
  get length() {
    if (this.shouldThrowLength) throw new Error('length failed');
    return this.store.size;
  },
  key(index) {
    if (this.shouldThrowKey) throw new Error('key failed');
    return Array.from(this.store.keys())[index] || null;
  },
  resetThrows() {
    this.shouldThrowGetItem = false;
    this.shouldThrowSetItem = false;
    this.shouldThrowRemoveItem = false;
    this.shouldThrowLength = false;
    this.shouldThrowKey = false;
  }
};
global.sessionStorage = mockStorage;

function createValidEnvelope(overrides = {}) {
  return {
    version: 1,
    userId: 'user-1',
    key: 'draft:v1:user-1:admin:events:create',
    updatedAt: new Date().toISOString(),
    open: true,
    dirty: true,
    value: { },
    ...overrides
  };
}

// 1. Key Parsing Tests
test('test_key_builder_separates_users', () => {
  const k1 = buildSessionDraftKey('user1', 'feat', 'create');
  const k2 = buildSessionDraftKey('user2', 'feat', 'create');
  assert.notStrictEqual(k1, k2);
});

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
  assert.throws(() => buildSessionDraftKey('user1', 'feature', 'edit', 'entity:1'), /Delimiter not allowed/);
});

test('test_buildSessionDraftKey_requires_entityId_for_edit_mode', () => {
  assert.throws(() => buildSessionDraftKey('user-1', 'feature', 'edit'), /entityId is required/);
});

test('test_buildSessionDraftKey_prohibits_entityId_for_create_mode', () => {
  assert.throws(() => buildSessionDraftKey('user-1', 'feature', 'create', 'entity-1'), /entityId must not be provided/);
});

// 2. Parser tests
test('test_parseSessionDraftKey_rejects_edit_without_entityId', () => {
  assert.strictEqual(parseSessionDraftKey('draft:v1:user:feature:edit'), null);
});

test('test_parseSessionDraftKey_rejects_create_with_extra_suffix', () => {
  assert.strictEqual(parseSessionDraftKey('draft:v1:user:feature:create:extra'), null);
});

test('test_parseSessionDraftKey_rejects_unknown_mode', () => {
  assert.strictEqual(parseSessionDraftKey('draft:v1:user:feature:delete'), null);
});

// 3. Validation JSON Safety
test('test_save_rejects_function', () => {
  mockStorage.clear();
  const env = createValidEnvelope({ value: { fn: () => {} } });
  assert.strictEqual(saveSessionDraft(env.key, env), false);
});

test('test_save_rejects_symbol', () => {
  mockStorage.clear();
  const env = createValidEnvelope({ value: { sym: Symbol('a') } });
  assert.strictEqual(saveSessionDraft(env.key, env), false);
});

test('test_save_rejects_bigint', () => {
  mockStorage.clear();
  const env = createValidEnvelope({ value: { num: 1n } });
  assert.strictEqual(saveSessionDraft(env.key, env), false);
});

test('test_save_rejects_undefined_property', () => {
  mockStorage.clear();
  const env = createValidEnvelope({ value: { prop: undefined } });
  assert.strictEqual(saveSessionDraft(env.key, env), false);
});

test('test_save_rejects_cyclic_object', () => {
  mockStorage.clear();
  const obj = {};
  obj.self = obj;
  const env = createValidEnvelope({ value: obj });
  assert.strictEqual(saveSessionDraft(env.key, env), false);
});

test('test_save_rejects_non_finite_number', () => {
  mockStorage.clear();
  assert.strictEqual(saveSessionDraft('k', createValidEnvelope({ value: { num: NaN } })), false);
  assert.strictEqual(saveSessionDraft('k', createValidEnvelope({ value: { num: Infinity } })), false);
});

test('test_save_rejects_Promise', () => {
  mockStorage.clear();
  assert.strictEqual(saveSessionDraft('k', createValidEnvelope({ value: { p: Promise.resolve() } })), false);
});

test('test_save_allows_plain_managed_asset_reference', () => {
  mockStorage.clear();
  const env = createValidEnvelope({ value: { asset: { id: "123", path: "a.jpg", publicUrl: "http" } } });
  assert.strictEqual(saveSessionDraft(env.key, env), true);
});

test('test_save_preserves_empty_string_false_and_zero_exactly', () => {
  mockStorage.clear();
  const env = createValidEnvelope({ value: { str: "", bool: false, num: 0, arr: [], nil: null } });
  saveSessionDraft(env.key, env);
  const loaded = loadSessionDraft(env.key);
  assert.deepStrictEqual(loaded.value, { str: "", bool: false, num: 0, arr: [], nil: null });
});

// 4. Envelope load validation
test('test_load_rejects_wrong_version', () => {
  mockStorage.store.set('key', JSON.stringify(createValidEnvelope({ version: 2, key: 'key' })));
  assert.strictEqual(loadSessionDraft('key'), null);
});

test('test_load_rejects_non_object_root', () => {
  mockStorage.store.set('key', JSON.stringify("string"));
  assert.strictEqual(loadSessionDraft('key'), null);
});

test('test_load_rejects_arrays_as_root', () => {
  mockStorage.store.set('key', JSON.stringify([]));
  assert.strictEqual(loadSessionDraft('key'), null);
});

test('test_load_rejects_storage_key_mismatch', () => {
  mockStorage.store.set('storage-key', JSON.stringify(createValidEnvelope({ key: 'different-key' })));
  assert.strictEqual(loadSessionDraft('storage-key'), null);
});

test('test_load_rejects_envelope_userId_mismatching_key_owner', () => {
  const key = buildSessionDraftKey('user-A', 'admin:events', 'create');
  mockStorage.store.set(key, JSON.stringify(createValidEnvelope({ key, userId: 'user-B' })));
  assert.strictEqual(loadSessionDraft(key), null);
});

test('test_load_rejects_invalid_updatedAt', () => {
  const key = buildSessionDraftKey('user-1', 'admin:events', 'create');
  mockStorage.store.set(key, JSON.stringify(createValidEnvelope({ key, updatedAt: 'banana' })));
  assert.strictEqual(loadSessionDraft(key), null);
});

test('test_load_rejects_invalid_open', () => {
  const key = buildSessionDraftKey('user-1', 'admin:events', 'create');
  mockStorage.store.set(key, JSON.stringify(createValidEnvelope({ key, open: "true" })));
  assert.strictEqual(loadSessionDraft(key), null);
});

test('test_load_rejects_invalid_dirty', () => {
  const key = buildSessionDraftKey('user-1', 'admin:events', 'create');
  mockStorage.store.set(key, JSON.stringify(createValidEnvelope({ key, dirty: "true" })));
  assert.strictEqual(loadSessionDraft(key), null);
});

test('test_load_rejects_invalid_ui', () => {
  const key = buildSessionDraftKey('user-1', 'admin:events', 'create');
  const testUi = (ui) => {
    mockStorage.store.set(key, JSON.stringify(createValidEnvelope({ key, ui })));
    return loadSessionDraft(key);
  };
  assert.strictEqual(testUi({ activeLocale: 'de' }), null);
  assert.strictEqual(testUi({ activeTab: 7 }), null);
  assert.strictEqual(testUi({ fileReselectionRequired: 'yes' }), null);
});

// 5. Storage Failure Paths
test('test_load_handles_getItem_throw', () => {
  mockStorage.resetThrows(); mockStorage.shouldThrowGetItem = true;
  assert.strictEqual(loadSessionDraft('key'), null);
});

test('test_remove_handles_removeItem_throw', () => {
  mockStorage.resetThrows(); mockStorage.shouldThrowRemoveItem = true;
  assert.doesNotThrow(() => removeSessionDraft('key'));
});

test('test_clear_handles_length_throw', () => {
  mockStorage.resetThrows(); mockStorage.shouldThrowLength = true;
  assert.doesNotThrow(() => clearSessionDraftsForUser('user-1'));
});

test('test_findOpen_handles_key_throw', () => {
  mockStorage.resetThrows(); mockStorage.shouldThrowKey = true;
  assert.doesNotThrow(() => findOpenSessionDraft('user-1', 'feat'));
});

// 6. User / Feature Isolation
test('test_clearSessionDraftsForUser_does_not_remove_similar_user_prefix', () => {
  mockStorage.clear(); mockStorage.resetThrows();
  mockStorage.store.set('draft:v1:abc:feat:create', 'data1');
  mockStorage.store.set('draft:v1:abc2:feat:create', 'data2');
  clearSessionDraftsForUser('abc');
  assert.strictEqual(mockStorage.store.has('draft:v1:abc:feat:create'), false);
  assert.strictEqual(mockStorage.store.has('draft:v1:abc2:feat:create'), true);
});

test('test_findOpenSessionDraft_isolates_features', () => {
  mockStorage.clear();
  const k1 = buildSessionDraftKey('u1', 'f1', 'create');
  const k2 = buildSessionDraftKey('u1', 'f2', 'create');
  saveSessionDraft(k1, createValidEnvelope({ key: k1, userId: 'u1' }));
  saveSessionDraft(k2, createValidEnvelope({ key: k2, userId: 'u1' }));
  const res = findOpenSessionDraft('u1', 'f1');
  assert.strictEqual(res.key, k1);
});

// 7. Multiple Open Draft Behavior
test('test_findOpenSessionDraft_newest_timestamp_wins', () => {
  mockStorage.clear(); mockStorage.resetThrows();
  const k1 = buildSessionDraftKey('u1', 'feat', 'edit', '1');
  const k2 = buildSessionDraftKey('u1', 'feat', 'edit', '2');
  saveSessionDraft(k1, createValidEnvelope({ key: k1, userId: 'u1', updatedAt: '2026-09-30T00:00:00Z' }));
  saveSessionDraft(k2, createValidEnvelope({ key: k2, userId: 'u1', updatedAt: '2026-09-30T01:00:00Z' }));
  const win = findOpenSessionDraft('u1', 'feat');
  assert.strictEqual(win.key, k2);
});

test('test_findOpenSessionDraft_normalizes_older_open_drafts_to_closed', () => {
  mockStorage.clear(); mockStorage.resetThrows();
  const k1 = buildSessionDraftKey('u1', 'feat', 'edit', '1');
  const k2 = buildSessionDraftKey('u1', 'feat', 'edit', '2');
  saveSessionDraft(k1, createValidEnvelope({ key: k1, userId: 'u1', updatedAt: '2026-09-30T00:00:00Z' }));
  saveSessionDraft(k2, createValidEnvelope({ key: k2, userId: 'u1', updatedAt: '2026-09-30T01:00:00Z' }));
  findOpenSessionDraft('u1', 'feat');
  const older = JSON.parse(mockStorage.store.get(k1));
  assert.strictEqual(older.open, false);
});

test('test_findOpenSessionDraft_returns_winner_even_if_normalization_write_fails', () => {
  mockStorage.clear(); mockStorage.resetThrows();
  const k1 = buildSessionDraftKey('u1', 'feat', 'edit', '1');
  const k2 = buildSessionDraftKey('u1', 'feat', 'edit', '2');
  saveSessionDraft(k1, createValidEnvelope({ key: k1, userId: 'u1', updatedAt: '2026-09-30T00:00:00Z' }));
  saveSessionDraft(k2, createValidEnvelope({ key: k2, userId: 'u1', updatedAt: '2026-09-30T01:00:00Z' }));
  mockStorage.shouldThrowSetItem = true;
  const win = findOpenSessionDraft('u1', 'feat');
  assert.strictEqual(win.key, k2);
  mockStorage.shouldThrowSetItem = false;
});

test('test_findOpenSessionDraft_timestamp_tie_uses_deterministic_key_order', () => {
  mockStorage.clear(); mockStorage.resetThrows();
  const k1 = buildSessionDraftKey('u1', 'feat', 'edit', 'B');
  const k2 = buildSessionDraftKey('u1', 'feat', 'edit', 'A');
  // Same time
  saveSessionDraft(k1, createValidEnvelope({ key: k1, userId: 'u1', updatedAt: '2026-09-30T00:00:00Z' }));
  saveSessionDraft(k2, createValidEnvelope({ key: k2, userId: 'u1', updatedAt: '2026-09-30T00:00:00Z' }));
  const win = findOpenSessionDraft('u1', 'feat');
  // Expected fallback order: k2 ('A' comes before 'B' if ascending, but string localeCompare is used.
  // Wait, my impl does `timeB - timeA || a.key.localeCompare(b.key)`. So 'A' comes before 'B'.
  assert.strictEqual(win.key, k2);
});
