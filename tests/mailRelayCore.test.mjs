import assert from 'node:assert/strict';
import test from 'node:test';
import { createMailRelayHandler } from '../src/server/mailRelayCore.mjs';

const config = {
  MAIL_RELAY_SECRET: 'test-long-secret-not-for-production',
  GMAIL_SMTP_APP_PASSWORD: 'test-app-password',
  GMAIL_SMTP_USER: 'test@example.com',
};
const valid = {
  to: 'recipient@example.com',
  subject: 'Union interview',
  text: 'Your interview is scheduled.',
  html: '<p>Your interview is scheduled.</p>',
  notificationId: 'notification-123',
};

function invoke(handler, body = valid, secret = config.MAIL_RELAY_SECRET, method = 'POST') {
  const result = { statusCode: 200, body: null, headers: {} };
  const response = {
    setHeader(key, value) { result.headers[key] = value; },
    status(value) { result.statusCode = value; return this; },
    json(value) { result.body = value; return result; },
  };
  return handler({
    method,
    headers: secret === null ? {} : { 'x-union-mail-secret': secret },
    body,
  }, response);
}

test('does not allow unauthenticated or malformed mail requests', async () => {
  let sent = 0;
  const handler = createMailRelayHandler({
    getConfig: () => config,
    sendMail: async () => { sent++; },
  });
  assert.equal((await invoke(handler, valid, null)).statusCode, 401);
  assert.equal((await invoke(handler, valid, 'wrong')).statusCode, 401);
  assert.equal((await invoke(handler, valid, config.MAIL_RELAY_SECRET, 'GET')).statusCode, 405);
  assert.equal((await invoke(handler, { ...valid, to: ['someone@example.com'] })).statusCode, 400);
  assert.equal((await invoke(handler, { ...valid, from: 'someone@example.com' })).statusCode, 400);
  assert.equal((await invoke(handler, { ...valid, subject: 'a\nBcc:someone@example.com' })).statusCode, 400);
  assert.equal((await invoke(handler, { ...valid, notificationId: '../../bad' })).statusCode, 400);
  assert.equal(sent, 0);
});

test('sends exactly one mail with proper authorization and returns its id', async () => {
  let count = 0;
  const handler = createMailRelayHandler({
    getConfig: () => config,
    sendMail: async (message) => {
      assert.deepEqual(message, valid);
      count++;
      return { messageId: '<mail-id@gmail.com>' };
    },
  });
  const response = await invoke(handler);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.messageId, '<mail-id@gmail.com>');
  assert.equal(count, 1);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('does not send without configuration or leak provider errors', async () => {
  const unconfigured = createMailRelayHandler({
    getConfig: () => ({ ...config, GMAIL_SMTP_APP_PASSWORD: '' }),
    sendMail: async () => { throw new Error('should not call'); },
  });
  assert.equal((await invoke(unconfigured)).statusCode, 503);
  const failing = createMailRelayHandler({
    getConfig: () => config,
    sendMail: async () => { throw Object.assign(new Error('SECRET PASSWORD'), { code: 'EAUTH' }); },
  });
  const result = await invoke(failing);
  assert.equal(result.statusCode, 502);
  assert.equal(result.body.error, 'SMTP_SEND_FAILED');
  assert.ok(!JSON.stringify(result).includes('SECRET PASSWORD'));
});
