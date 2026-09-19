import test from 'node:test';
import assert from 'node:assert/strict';

const realtime = await import('../src/domain/realtimeIdentitySubscription.ts');

const userId = '11111111-1111-4111-8111-111111111111';

class FakeChannel {
  listeners = [];
  statusCallback = undefined;

  on(type, filter, callback) {
    this.listeners.push({ type, filter, callback });
    return this;
  }

  subscribe(callback) {
    this.statusCallback = callback;
    return this;
  }

  emitStatus(status, error) {
    this.statusCallback?.(status, error);
  }

  emitChange(index = 0, payload = {}) {
    this.listeners[index]?.callback(payload);
  }
}

function setup(removeStatus = 'ok') {
  const channel = new FakeChannel();
  const errors = [];
  let subscriptions = 0;
  const refreshes = [];
  const client = {
    channel: () => channel,
    removeChannel: async () => removeStatus,
  };
  const unsubscribe = realtime.createIdentitySubscription({
    client,
    userId,
    requestConfirmedRefresh: (kind) => { refreshes.push(kind); },
    onError: (error) => errors.push(error),
    onSubscribed: () => { subscriptions += 1; },
  });
  return {
    channel,
    errors,
    getRefreshes: () => [...refreshes],
    getSubscriptions: () => subscriptions,
    unsubscribe,
    client,
  };
}

test('registers filtered own inserts and updates plus an unfiltered assignment delete refresh', () => {
  const state = setup();
  assert.deepEqual(state.channel.listeners.map(({ type, filter }) => ({ type, filter })), [
    {
      type: 'postgres_changes',
      filter: { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
    },
    {
      type: 'postgres_changes',
      filter: { event: 'INSERT', schema: 'public', table: 'executive_assignments', filter: `user_id=eq.${userId}` },
    },
    {
      type: 'postgres_changes',
      filter: { event: 'UPDATE', schema: 'public', table: 'executive_assignments', filter: `user_id=eq.${userId}` },
    },
    {
      type: 'postgres_changes',
      filter: { event: 'DELETE', schema: 'public', table: 'executive_assignments' },
    },
  ]);

  state.channel.emitChange(0);
  const deleteListener = state.channel.listeners.at(-1);
  deleteListener.callback({ old: { user_id: 'unrelated-user-must-not-be-read' } });
  assert.deepEqual(state.getRefreshes(), ['profile', 'assignment']);
});

test('surfaces channel errors, timeouts, and unexpected closure as typed service errors', () => {
  const state = setup();
  state.channel.emitStatus('CHANNEL_ERROR', { message: 'socket error' });
  state.channel.emitStatus('TIMED_OUT', { message: 'join timeout' });
  state.channel.emitStatus('CLOSED');

  assert.deepEqual(state.errors, [
    { code: 'CHANNEL_ERROR', message: 'The account identity channel reported an error.', details: 'socket error' },
    { code: 'TIMED_OUT', message: 'The account identity channel timed out.', details: 'join timeout' },
    { code: 'CLOSED', message: 'The account identity channel closed unexpectedly.' },
  ]);
});

test('reports a healthy active subscription explicitly', () => {
  const state = setup();
  state.channel.emitStatus('SUBSCRIBED');
  assert.equal(state.getSubscriptions(), 1);
});

test('normal async unsubscribe suppresses the expected CLOSED callback and returns success', async () => {
  const state = setup();
  state.client.removeChannel = async () => {
    state.channel.emitStatus('CLOSED');
    return 'ok';
  };

  assert.deepEqual(await state.unsubscribe(), { ok: true, data: undefined });
  assert.deepEqual(state.errors, []);
});

test('async unsubscribe returns typed failures for remove timeout and error statuses', async () => {
  assert.deepEqual(await setup('timed out').unsubscribe(), {
    ok: false,
    error: {
      code: 'CHANNEL_REMOVE_TIMED_OUT',
      message: 'Removing the account identity channel timed out.',
    },
  });
  assert.deepEqual(await setup('error').unsubscribe(), {
    ok: false,
    error: {
      code: 'CHANNEL_REMOVE_ERROR',
      message: 'Unable to remove the account identity channel.',
    },
  });
});

test('disposed callbacks stay inert after remove timeout or error', async () => {
  for (const removeStatus of ['timed out', 'error']) {
    const state = setup(removeStatus);
    await state.unsubscribe();
    state.channel.emitChange();
    state.channel.emitStatus('CHANNEL_ERROR', new Error('late status'));
    state.channel.emitStatus('SUBSCRIBED');

    assert.deepEqual(state.getRefreshes(), []);
    assert.equal(state.getSubscriptions(), 0);
    assert.deepEqual(state.errors, []);
  }
});

test('disposed callbacks stay inert when removeChannel throws', async () => {
  const state = setup();
  state.client.removeChannel = async () => { throw new Error('remove failed'); };

  assert.equal((await state.unsubscribe()).ok, false);
  state.channel.emitChange();
  state.channel.emitStatus('CHANNEL_ERROR', new Error('late status'));
  assert.deepEqual(state.getRefreshes(), []);
  assert.deepEqual(state.errors, []);
});
