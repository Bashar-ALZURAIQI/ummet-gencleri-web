import test from 'node:test';
import assert from 'node:assert/strict';

const recovery = await import('../src/domain/passwordRecovery.ts');

test('password reset request normalizes the email and sends the exact recovery callback', async () => {
  const calls = [];
  const gateway = recovery.createPasswordRecoveryGateway({
    auth: {
      async resetPasswordForEmail(email, options) {
        calls.push({ email, options });
        return { data: {}, error: null };
      },
      async updateUser() {
        throw new Error('not used');
      },
    },
  });

  const result = await gateway.requestReset(
    '  Student@Example.COM  ',
    'https://portal.example.org/?auth=recovery',
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{
    email: 'student@example.com',
    options: { redirectTo: 'https://portal.example.org/?auth=recovery' },
  }]);
});

test('password reset request returns a safe error when Supabase rejects delivery', async () => {
  const gateway = recovery.createPasswordRecoveryGateway({
    auth: {
      async resetPasswordForEmail() {
        return { data: {}, error: { code: 'over_email_send_rate_limit', message: 'internal detail' } };
      },
      async updateUser() {
        throw new Error('not used');
      },
    },
  });

  assert.deepEqual(
    await gateway.requestReset('student@example.com', 'https://portal.example.org/?auth=recovery'),
    {
      ok: false,
      error: 'تعذر إرسال رابط الاستعادة حالياً. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
    },
  );
});

test('password reset request converts a network exception into a safe result', async () => {
  const gateway = recovery.createPasswordRecoveryGateway({
    auth: {
      async resetPasswordForEmail() {
        throw new Error('network unavailable');
      },
      async updateUser() {
        throw new Error('not used');
      },
    },
  });

  assert.deepEqual(
    await gateway.requestReset('student@example.com', 'https://portal.example.org/?auth=recovery'),
    {
      ok: false,
      error: 'تعذر إرسال رابط الاستعادة حالياً. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
    },
  );
});

test('recovery callback URL keeps a deployed base path and replaces stale query or hash data', () => {
  assert.equal(
    recovery.buildPasswordRecoveryRedirectUrl({
      origin: 'https://portal.example.org',
      pathname: '/union/',
    }),
    'https://portal.example.org/union/?auth=recovery',
  );
});

test('only the Supabase PASSWORD_RECOVERY event opens the password update gate', () => {
  let state = recovery.reducePasswordRecoveryGate('IDLE', 'INITIAL_SESSION', true);
  assert.equal(state, 'IDLE');

  state = recovery.reducePasswordRecoveryGate(state, 'PASSWORD_RECOVERY', true);
  assert.equal(state, 'READY');

  state = recovery.reducePasswordRecoveryGate(state, 'TOKEN_REFRESHED', true);
  assert.equal(state, 'READY');

  state = recovery.reducePasswordRecoveryGate(state, 'SIGNED_OUT', false);
  assert.equal(state, 'IDLE');
});

test('PASSWORD_RECOVERY without a confirmed session never opens the update gate', () => {
  assert.equal(
    recovery.reducePasswordRecoveryGate('IDLE', 'PASSWORD_RECOVERY', false),
    'IDLE',
  );
});

test('new recovery password requires eight characters and matching confirmation', () => {
  assert.deepEqual(recovery.validateRecoveredPassword('short', 'short'), {
    ok: false,
    error: 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف.',
  });
  assert.deepEqual(recovery.validateRecoveredPassword('new-secret-123', 'different'), {
    ok: false,
    error: 'تأكيد كلمة المرور الجديدة غير مطابق.',
  });
  assert.deepEqual(
    recovery.validateRecoveredPassword('new-secret-123', 'new-secret-123'),
    { ok: true },
  );
});

test('password update is rejected locally unless the recovery event opened the gate', async () => {
  let updateCalls = 0;
  const gateway = recovery.createPasswordRecoveryGateway({
    auth: {
      async resetPasswordForEmail() {
        throw new Error('not used');
      },
      async updateUser() {
        updateCalls += 1;
        return { data: { user: { id: 'user-1' } }, error: null };
      },
    },
  });

  assert.deepEqual(await gateway.updatePassword('new-secret-123', false), {
    ok: false,
    error: 'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.',
  });
  assert.equal(updateCalls, 0);

  assert.deepEqual(await gateway.updatePassword('new-secret-123', true), { ok: true });
  assert.equal(updateCalls, 1);
});

test('password update converts a network exception into a safe result', async () => {
  const gateway = recovery.createPasswordRecoveryGateway({
    auth: {
      async resetPasswordForEmail() {
        throw new Error('not used');
      },
      async updateUser() {
        throw new Error('network unavailable');
      },
    },
  });

  assert.deepEqual(await gateway.updatePassword('new-secret-123', true), {
    ok: false,
    error: 'تعذر تغيير كلمة المرور. قد يكون الرابط منتهياً؛ اطلب رابط استعادة جديداً.',
  });
});

test('a recovery callback is recognized only with matching recovery type and both tokens', () => {
  const callback = 'https://portal.example.org/forgot-password?auth=recovery#access_token=validRecoveryToken&refresh_token=refreshValue&type=recovery';
  assert.equal(recovery.extractRecoveryCallbackAccessToken(callback), 'validRecoveryToken');
  assert.equal(recovery.extractRecoveryCallbackAccessToken(callback.replace('type=recovery','type=signup')), null);
  assert.equal(recovery.extractRecoveryCallbackAccessToken(callback.replace('refresh_token=refreshValue&','')), null);
  assert.equal(recovery.extractRecoveryCallbackAccessToken(callback.replace('auth=recovery','auth=other')), null);
  assert.equal(recovery.extractRecoveryCallbackAccessToken('invalid-url'), null);
});
