import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const functionUrl = new URL('../supabase/functions/send-application-notification/index.ts', import.meta.url);
const configUrl = new URL('../supabase/config.toml', import.meta.url);

test('configures only the application notification function for custom authorization', async () => {
  const config = await readFile(configUrl, 'utf8');
  assert.match(config, /\[functions\.send-application-notification\][\s\S]*verify_jwt\s*=\s*false/i);
  assert.doesNotMatch(config, /\[functions\.send-contact-reply\][\s\S]*verify_jwt\s*=\s*false/i);
});

test('accepts only application id and event type and handles CORS', async () => {
  const source = await readFile(functionUrl, 'utf8');
  assert.match(source, /request\.method === ['"]OPTIONS['"]/);
  assert.match(source, /applicationId/);
  assert.match(source, /eventType/);
  assert.match(source, /NEW_APPLICATION/);
  assert.match(source, /INTERVIEW_SCHEDULED/);
  assert.match(source, /ACCEPTED/);
  assert.match(source, /REJECTED/);
  assert.doesNotMatch(source, /body\.(recipient|to|subject|html|text|payload|email)/);
});

test('requires an active current president for interview and final events', async () => {
  const source = await readFile(functionUrl, 'utf8');
  assert.match(source, /auth\.getUser/);
  assert.match(source, /executive_assignments/);
  assert.match(source, /position_key/);
  assert.match(source, /PRESIDENT/);
  assert.match(source, /profiles/);
  assert.match(source, /status/);
  assert.match(source, /active/);
  assert.match(source, /PRESIDENT_REQUIRED/);
});

test('claims pending or failed work before sending and handles already-sent work', async () => {
  const source = await readFile(functionUrl, 'utf8');
  assert.match(source, /application_email_notifications/);
  assert.match(source, /delivery_status/);
  assert.match(source, /PENDING/);
  assert.match(source, /FAILED/);
  assert.match(source, /SENDING/);
  assert.match(source, /ALREADY_SENT/);
  assert.match(source, /delivery_attempts/);
  assert.match(source, /\.in\(['"]delivery_status['"],\s*\[['"]PENDING['"],\s*['"]FAILED['"]\]\)/);
});

test('uses authenticated Gmail SMTP relay and persists sent or failed audit state', async () => {
  const source = await readFile(functionUrl, 'utf8');
  assert.match(source, /APPLICATION_EMAIL_RELAY_SECRET/);
  assert.match(source, /x-union-mail-secret/);
  assert.match(source, /send-union-mail/);
  assert.match(source, /SITE_PUBLIC_URL/);
  assert.doesNotMatch(source, /api\.resend\.com/);
  assert.match(source, /notificationId: notification\.id/);
  assert.match(source, /email_provider_id/);
  assert.match(source, /sent_at/);
  assert.match(source, /delivery_last_error/);
});

test('derives recipients from authoritative president/profile/auth and outbox payload state', async () => {
  const source = await readFile(functionUrl, 'utf8');
  assert.match(source, /contact_email/);
  assert.match(source, /auth\.admin\.getUserById/);
  assert.match(source, /studentEmail/);
  assert.match(source, /notification\.payload/);
  assert.doesNotMatch(source, /body\.studentEmail/);
});
