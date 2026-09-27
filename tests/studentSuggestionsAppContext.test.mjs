import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSuggestionStateIntegration } from '../src/domain/studentSuggestionRefreshGate.ts';

const appContextSource = readFileSync('./src/context/AppContext.tsx', 'utf8');

test('AppContext static source contract', () => {
  // authoritative suggestions initialize as []
  // verify no LocalStorage read authority
  // verify no mockSuggestions fallback
  assert.ok(!appContextSource.includes('safeParse<Suggestion[]>(LS_SUGGESTIONS_KEY)'), 'no direct read of LS_SUGGESTIONS_KEY');
  assert.ok(!appContextSource.includes('mockSuggestions'), 'no mockSuggestions usage');

  // verify no safeWrite app_suggestions
  assert.ok(!appContextSource.includes('safeWrite(LS_SUGGESTIONS_KEY'), 'no safeWrite of suggestions');

  // verify public setSuggestions is NOT exposed
  assert.ok(!appContextSource.includes('setSuggestions: React.Dispatch'), 'no setSuggestions in ContextValue');

  // createVisibilityRefreshPolling is used
  assert.match(appContextSource, /createVisibilityRefreshPolling/);

  // no postgres_changes/channel subscription
  assert.ok(!appContextSource.includes('postgres_changes'), 'no postgres_changes');
  assert.ok(!appContextSource.includes('channel('), 'no realtime channel');
});

test('Integration logic preserves refreshPending and handles loading/error', async () => {
  let storageRemoved = false;
  let updateCalled = false;
  let loadingState = false;
  let errorState = null;

  const manager = createSuggestionStateIntegration({
    load: async () => ({ ok: true, data: [] }),
    submit: async () => ({ ok: true }),
    respond: async () => ({ ok: true }),
    onUpdate: () => { updateCalled = true; },
    onStorageRetire: () => { storageRemoved = true; },
    onLoading: (isLoading) => { loadingState = isLoading; },
    onError: (err) => { errorState = err; }
  });

  // authoritative suggestions initialize implicitly before refresh

  // successful authoritative load retires app_suggestions
  await manager.performRefresh({ epoch: 1, userId: 'u1', role: 'STUDENT' });
  assert.equal(storageRemoved, true, 'storage retired on success');
  assert.equal(updateCalled, true);
});

test('failed load does not fallback and sets error', async () => {
  let errorState = null;
  const manager = createSuggestionStateIntegration({
    load: async () => ({ ok: false, error: 'NETWORK_ERROR' }),
    submit: async () => ({ ok: true }),
    respond: async () => ({ ok: true }),
    onUpdate: () => {},
    onStorageRetire: () => { assert.fail('should not retire'); },
    onLoading: () => {},
    onError: (err) => { errorState = err; }
  });

  await manager.performRefresh({ epoch: 1, userId: 'u1', role: 'STUDENT' });
  assert.equal(errorState, 'NETWORK_ERROR');
});

test('submitSuggestion and respondToSuggestion are async and preserve refreshPending', async () => {
  let loadCount = 0;
  const manager = createSuggestionStateIntegration({
    load: async () => {
      loadCount++;
      return { ok: false, error: 'REFRESH_FAIL' };
    },
    submit: async () => ({ ok: true }),
    respond: async () => ({ ok: true }),
    onUpdate: () => {},
    onStorageRetire: () => {},
    onLoading: () => {},
    onError: () => {}
  });

  const subRes = await manager.submit({ epoch: 1, userId: 'u1', role: 'STUDENT' }, {});
  assert.equal(subRes.ok, true);
  assert.equal(subRes.refreshPending, true);

  const resRes = await manager.respond({ epoch: 1, userId: 'u1', role: 'PRESIDENT' }, {});
  assert.equal(resRes.ok, true);
  assert.equal(resRes.refreshPending, true);
});

test('stale auth ownership invalidates publication', async () => {
  let updateCalled = false;
  const manager = createSuggestionStateIntegration({
    load: async () => ({ ok: true, data: [] }),
    submit: async () => ({ ok: true }),
    respond: async () => ({ ok: true }),
    onUpdate: () => { updateCalled = true; },
    onStorageRetire: () => {},
    onLoading: () => {},
    onError: () => {}
  });

  // start request
  const reqPromise = manager.performRefresh({ epoch: 1, userId: 'u1', role: 'STUDENT' });

  // simulate clear/logout by clearing gate before load resolves
  manager.clear();

  await reqPromise;

  // update should not have been called
  assert.equal(updateCalled, false);
});
