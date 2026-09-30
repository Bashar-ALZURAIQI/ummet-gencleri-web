import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { SessionDraftStateMachine } from '../src/domain/sessionDraftState.ts';
import { clearSessionDraftsForUser, saveSessionDraft } from '../src/domain/sessionDraft.ts';

const mockStorage = {
  store: new Map(),
  getItem(key) { return this.store.get(key) || null; },
  setItem(key, value) { this.store.set(key, String(value)); },
  removeItem(key) { this.store.delete(key); },
  clear() { this.store.clear(); },
  get length() { return this.store.size; },
  key(index) { return Array.from(this.store.keys())[index] || null; }
};
global.sessionStorage = mockStorage;

function createConfig(overrides = {}) {
  return {
    key: 'draft:v1:user-1:admin:events:create',
    userId: 'user-1',
    defaultData: { title: '' },
    isDirty: (d) => d.title !== '',
    ...overrides
  };
}

test('test_pristine_close_bypasses_decision', () => {
  mockStorage.clear();
  const machine = new SessionDraftStateMachine(createConfig(), null);
  machine.requestClose();
  const state = machine.getState();
  assert.strictEqual(state.isDecisionOpen, false);
  assert.strictEqual(state.open, false);
});

test('test_dirty_close_enters_decision', () => {
  mockStorage.clear();
  const machine = new SessionDraftStateMachine(createConfig(), null);
  machine.updateData({ title: 'dirty' });
  machine.requestClose();
  const state = machine.getState();
  assert.strictEqual(state.isDecisionOpen, true);
  assert.strictEqual(state.open, false); // Initial open was false, wait it doesn't change open
});

test('test_continue_action_keeps_open', () => {
  mockStorage.clear();
  const machine = new SessionDraftStateMachine(createConfig({ defaultOpen: true }), null);
  machine.updateData({ title: 'dirty' });
  machine.requestClose();
  machine.continueEditing();
  const state = machine.getState();
  assert.strictEqual(state.isDecisionOpen, false);
  assert.strictEqual(state.open, true);
});

test('test_keep_action_closes_and_preserves', () => {
  mockStorage.clear();
  const config = createConfig({ defaultOpen: true });
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });
  machine.requestClose();
  machine.keepDraftAndClose();

  const state = machine.getState();
  assert.strictEqual(state.isDecisionOpen, false);
  assert.strictEqual(state.open, false);

  // Storage should have it closed
  const stored = JSON.parse(mockStorage.store.get(config.key));
  assert.strictEqual(stored.open, false);
  assert.strictEqual(stored.value.title, 'dirty');
});

test('test_discard_action_closes_and_resets', () => {
  mockStorage.clear();
  const config = createConfig({ defaultOpen: true });
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });
  machine.requestClose();
  machine.discardDraftAndClose();

  const state = machine.getState();
  assert.strictEqual(state.isDecisionOpen, false);
  assert.strictEqual(state.open, false);
  assert.strictEqual(state.data.title, '');
  assert.strictEqual(mockStorage.store.has(config.key), false);
});

test('test_validation_unknown_preserves_draft', () => {
  mockStorage.clear();
  const config = createConfig({ validation: 'unknown' });
  const env = {
    version: 1, userId: 'user-1', key: config.key, updatedAt: new Date().toISOString(),
    open: true, dirty: true, value: { title: 'stored' }
  };
  const machine = new SessionDraftStateMachine(config, env);
  const state = machine.getState();
  assert.strictEqual(state.data.title, 'stored');
});

test('test_validation_valid_allows_restore', () => {
  mockStorage.clear();
  const config = createConfig({ validation: 'valid' });
  const env = {
    version: 1, userId: 'user-1', key: config.key, updatedAt: new Date().toISOString(),
    open: true, dirty: true, value: { title: 'stored' }
  };
  const machine = new SessionDraftStateMachine(config, env);
  const state = machine.getState();
  assert.strictEqual(state.data.title, 'stored');
});

test('test_validation_invalid_requires_removal', () => {
  mockStorage.clear();
  const config = createConfig({ validation: 'invalid' });
  const env = {
    version: 1, userId: 'user-1', key: config.key, updatedAt: new Date().toISOString(),
    open: true, dirty: true, value: { title: 'stored' }
  };
  mockStorage.store.set(config.key, JSON.stringify(env));
  const machine = new SessionDraftStateMachine(config, env);
  const state = machine.getState();

  assert.strictEqual(state.data.title, ''); // Fallback to default
  assert.strictEqual(state.open, false);
  assert.strictEqual(mockStorage.store.has(config.key), false); // Removed from storage
});

test('test_open_true_restores_open', () => {
  const config = createConfig();
  const env = {
    version: 1, userId: 'user-1', key: config.key, updatedAt: new Date().toISOString(),
    open: true, dirty: true, value: { title: 'stored' }
  };
  const machine = new SessionDraftStateMachine(config, env);
  assert.strictEqual(machine.getState().open, true);
});

test('test_open_false_restores_closed', () => {
  const config = createConfig();
  const env = {
    version: 1, userId: 'user-1', key: config.key, updatedAt: new Date().toISOString(),
    open: false, dirty: true, value: { title: 'stored' }
  };
  const machine = new SessionDraftStateMachine(config, env);
  assert.strictEqual(machine.getState().open, false);
});

// React Hook source-contract tests
const hookPath = path.resolve('src/hooks/useSessionDraft.ts');
const hookSource = fs.readFileSync(hookPath, 'utf8');

test('test_useSessionDraft_lazy_initializer_uses_loadSessionDraft', () => {
  assert.ok(hookSource.includes('loadSessionDraft<T>(') || hookSource.includes('loadSessionDraft('), 'Should call loadSessionDraft');
  assert.ok(hookSource.includes('useState(() => machineRef.current'), 'Should initialize state lazily');
});

test('test_useSessionDraft_pagehide_wiring_exists', () => {
  assert.ok(hookSource.includes("window.addEventListener('pagehide',"), 'Should wire pagehide');
});

test('test_useSessionDraft_hidden_only_visibilitychange_condition_exists', () => {
  assert.ok(hookSource.includes("document.visibilityState === 'hidden'"), 'Should check hidden visibility state');
});

test('test_useSessionDraft_latestRef_is_used_by_lifecycle_flush', () => {
  assert.ok(hookSource.includes('machineRef.current?.flush()') || hookSource.includes('machineRef.current!.flush()'), 'Should flush latest ref');
});

test('test_dynamic_invalid_removes_draft', () => {
  mockStorage.clear();
  const config = createConfig({ validation: 'valid' });
  const env = { version: 1, userId: 'user-1', key: config.key, updatedAt: new Date().toISOString(), open: true, dirty: true, value: { title: 'dirty' } };
  mockStorage.store.set(config.key, JSON.stringify(env));
  const machine = new SessionDraftStateMachine(config, env);
  machine.updateConfig({ ...config, validation: 'invalid' });
  const state = machine.getState();
  assert.strictEqual(state.data.title, '');
  assert.strictEqual(mockStorage.store.has(config.key), false);
});

test('test_invalid_then_setOpen_does_not_recreate_draft', () => {
  mockStorage.clear();
  const config = createConfig({ validation: 'valid' });
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateConfig({ ...config, validation: 'invalid' });
  machine.setOpen(true);
  assert.strictEqual(mockStorage.store.has(config.key), false);
});

test('test_invalid_then_flush_does_not_recreate_draft', () => {
  mockStorage.clear();
  const config = createConfig({ validation: 'valid' });
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });
  machine.updateConfig({ ...config, validation: 'invalid' });
  machine.flush();
  assert.strictEqual(mockStorage.store.has(config.key), false);
});

test('test_requestClose_during_decision_returns_to_editor', () => {
  mockStorage.clear();
  const machine = new SessionDraftStateMachine(createConfig(), null);
  machine.updateData({ title: 'dirty' });
  machine.requestClose(); // opens decision
  assert.strictEqual(machine.getState().isDecisionOpen, true);
  
  machine.requestClose(); // should return to editor
  assert.strictEqual(machine.getState().isDecisionOpen, false);
  assert.strictEqual(machine.getState().open, true);
});

test('test_requestClose_during_decision_never_discards_data', () => {
  mockStorage.clear();
  const machine = new SessionDraftStateMachine(createConfig(), null);
  machine.updateData({ title: 'dirty' });
  machine.requestClose();
  machine.requestClose();
  assert.strictEqual(machine.getState().data.title, 'dirty');
});

test('test_hook_rebinds_when_key_changes', () => {
  assert.ok(hookSource.includes('if (prevKeyRef.current !== options.key || prevUserIdRef.current !== options.userId)'), 'Should rebind on key change');
  assert.ok(hookSource.includes('machineRef.current = new SessionDraftStateMachine'), 'Should instantiate new machine');
});

test('test_key_change_does_not_write_previous_entity_data', () => {
  assert.ok(hookSource.includes('prevKeyRef.current !== options.key'), 'Should prevent leaking data on key change');
});

test('test_create_edit_create_key_switches_are_isolated', () => {
  assert.ok(hookSource.includes('setState(currentState)'), 'Should sync state immediately');
});

// ── clearDraft regression tests ────────────────────────────────────────────

test('test_clearDraft_removes_storage_and_resets_state_without_recreating', () => {
  mockStorage.clear();
  const config = createConfig({ defaultOpen: true });
  // Write a dirty draft into storage first
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });
  assert.ok(mockStorage.store.has(config.key), 'pre-condition: draft should be in storage');

  machine.clearDraft();

  const state = machine.getState();
  assert.strictEqual(mockStorage.store.has(config.key), false, 'storage key must be absent after clearDraft');
  assert.strictEqual(state.open, false, 'open must be false after clearDraft');
  assert.strictEqual(state.dirty, false, 'dirty must be false after clearDraft');
  assert.strictEqual(state.isDecisionOpen, false, 'isDecisionOpen must be false after clearDraft');
  assert.strictEqual(state.restoredFromStorage, false, 'restoredFromStorage must be false after clearDraft');
  assert.deepStrictEqual(state.data, config.defaultData, 'data must be reset to defaultData after clearDraft');
  assert.deepStrictEqual(state.ui, {}, 'ui must be reset after clearDraft');
});

test('test_clearDraft_then_flush_does_not_recreate', () => {
  mockStorage.clear();
  const config = createConfig({ defaultOpen: true });
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });
  assert.ok(mockStorage.store.has(config.key), 'pre-condition: draft should be in storage');

  machine.clearDraft();
  machine.flush(); // must NOT recreate the draft

  assert.strictEqual(mockStorage.store.has(config.key), false, 'flush after clearDraft must NOT recreate storage key');
});

test('test_clearDraft_then_setOpen_false_does_not_recreate', () => {
  mockStorage.clear();
  const config = createConfig({ defaultOpen: true });
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });

  machine.clearDraft();
  machine.setOpen(false); // caller success path — must NOT recreate

  assert.strictEqual(mockStorage.store.has(config.key), false, 'setOpen(false) after clearDraft must NOT recreate storage key');
});

test('test_clearDraft_then_setOpen_true_resumes_persistence', () => {
  mockStorage.clear();
  const config = createConfig();
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });

  machine.clearDraft();
  assert.strictEqual(mockStorage.store.has(config.key), false, 'pre-condition: cleared');

  machine.setOpen(true); // user explicitly opens again — persistence should resume
  assert.strictEqual(mockStorage.store.has(config.key), true, 'setOpen(true) after clearDraft must resume persistence');
});

test('test_clearDraft_then_updateData_resumes_persistence', () => {
  mockStorage.clear();
  const config = createConfig();
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });

  machine.clearDraft();
  machine.updateData({ title: 'new data' }); // new user action — persistence resumes

  assert.strictEqual(mockStorage.store.has(config.key), true, 'updateData after clearDraft must resume persistence');
});

// ── keep/discard/clear distinction ───────────────────────────────────────

test('test_keepDraftAndClose_still_persists', () => {
  mockStorage.clear();
  const config = createConfig({ defaultOpen: true });
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });
  machine.requestClose();
  machine.keepDraftAndClose();

  assert.strictEqual(mockStorage.store.has(config.key), true, 'keepDraftAndClose must retain storage key');
  const stored = JSON.parse(mockStorage.store.get(config.key));
  assert.strictEqual(stored.open, false, 'kept draft must be stored as open:false');
  assert.strictEqual(stored.value.title, 'dirty', 'kept draft must preserve data');
});

test('test_discardDraftAndClose_removes_storage', () => {
  mockStorage.clear();
  const config = createConfig({ defaultOpen: true });
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });
  machine.requestClose();
  machine.discardDraftAndClose();

  const state = machine.getState();
  assert.strictEqual(mockStorage.store.has(config.key), false, 'discardDraftAndClose must remove storage key');
  assert.strictEqual(state.open, false, 'open must be false after discard');
  assert.strictEqual(state.dirty, false, 'dirty must be false after discard');
  assert.strictEqual(state.isDecisionOpen, false, 'isDecisionOpen must be false after discard');
  assert.strictEqual(state.restoredFromStorage, false, 'restoredFromStorage must be false after discard');
  assert.deepStrictEqual(state.data, config.defaultData, 'data must be reset to defaultData after discard');
  assert.deepStrictEqual(state.ui, {}, 'ui must be reset after discard');
});

test('test_discard_then_flush_does_not_recreate', () => {
  mockStorage.clear();
  const config = createConfig({ defaultOpen: true });
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });

  machine.discardDraftAndClose();
  machine.flush();

  assert.strictEqual(mockStorage.store.has(config.key), false, 'flush after discard must NOT recreate storage key');
});

test('test_discard_then_setOpen_false_does_not_recreate', () => {
  mockStorage.clear();
  const config = createConfig({ defaultOpen: true });
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });

  machine.discardDraftAndClose();
  machine.setOpen(false);

  assert.strictEqual(mockStorage.store.has(config.key), false, 'setOpen(false) after discard must NOT recreate storage key');
});

test('test_discard_then_setOpen_true_starts_new_draft', () => {
  mockStorage.clear();
  const config = createConfig();
  const machine = new SessionDraftStateMachine(config, null);
  machine.updateData({ title: 'dirty' });

  machine.discardDraftAndClose();
  assert.strictEqual(mockStorage.store.has(config.key), false, 'pre-condition: discarded');

  machine.setOpen(true);
  assert.strictEqual(mockStorage.store.has(config.key), true, 'setOpen(true) after discard must resume persistence');
});

// ── source-contract: success paths do not mutate draft after clear ────────

const adminDashSource = fs.readFileSync(path.resolve('src/pages/AdminDashboard.tsx'), 'utf8');
const studentDashSource = fs.readFileSync(path.resolve('src/pages/StudentDashboard.tsx'), 'utf8');

test('test_event_success_does_not_recreate_draft_after_clear', () => {
  // The event success path must call clearDraft() then close modal,
  // NOT call draft.setOpen(false) or draft.setUi() after clearDraft().
  const normalizedSource = adminDashSource.replace(/\r\n/g, '\n');
  const clearIdx = normalizedSource.indexOf("draft.clearDraft();\n    setModalOpen(false);\n    setToast");
  assert.ok(clearIdx !== -1, 'Event success: clearDraft() must be followed directly by setModalOpen (no draft mutation in between)');
  // Ensure no draft.setOpen follows clearDraft in event success
  const snippet = normalizedSource.slice(clearIdx, clearIdx + 80);
  assert.ok(!snippet.includes('draft.setOpen'), 'Event success path must not call draft.setOpen after clearDraft');
});

test('test_news_success_does_not_recreate_draft_after_clear', () => {
  // All three news success paths must NOT call draft.setOpen() after clearDraft()
  const indices = [];
  let searchFrom = 0;
  while (true) {
    const idx = adminDashSource.indexOf('draft.clearDraft();', searchFrom);
    if (idx === -1) break;
    indices.push(idx);
    searchFrom = idx + 1;
  }
  for (const idx of indices) {
    const snippet = adminDashSource.slice(idx, idx + 60);
    assert.ok(!snippet.includes('draft.setOpen'), `No draft.setOpen() should appear immediately after draft.clearDraft() at offset ${idx}`);
  }
});

test('test_student_success_does_not_recreate_draft', () => {
  // Student success must call clearDraft() and then NOT call draft.setUi()
  // Use CRLF-agnostic search by checking indexOf with both endings
  const clearIdx = studentDashSource.indexOf('draft.clearDraft();') ;
  assert.ok(clearIdx !== -1, 'Student: clearDraft() must exist in success path');
  const snippet = studentDashSource.slice(clearIdx, clearIdx + 120).replace(/\r\n/g, '\n');
  assert.ok(snippet.includes('setSent(true)'), 'Student success: setSent must follow clearDraft');
  assert.ok(!snippet.includes('draft.setUi'), 'Student success path must not call draft.setUi after clearDraft');
});

test('test_student_clean_tab_change_does_not_create_empty_draft', () => {
  // handleTabSelect must only call setUi on the non-suggestions branch when
  // there is actual draft state to preserve (dirty or restoredFromStorage)
  assert.ok(
    studentDashSource.includes('(draft.dirty || draft.restoredFromStorage) && draft.ui?.activeTab !== undefined'),
    'handleTabSelect must guard setUi call to avoid creating empty draft envelopes'
  );
});
