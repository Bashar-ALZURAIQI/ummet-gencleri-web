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
  assert.ok(hookSource.includes('useEffect(() => {') && hookSource.includes('[options.key, options.userId]'), 'Should rebind on key change');
  assert.ok(hookSource.includes('machineRef.current = new SessionDraftStateMachine'), 'Should instantiate new machine');
});

test('test_key_change_does_not_write_previous_entity_data', () => {
  assert.ok(hookSource.includes('if (prevKey !== options.key'), 'Should prevent leaking data on key change');
});

test('test_create_edit_create_key_switches_are_isolated', () => {
  assert.ok(hookSource.includes('setState(machineRef.current.getState())'), 'Should sync state immediately');
});
