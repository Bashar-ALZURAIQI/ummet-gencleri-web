import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPushPayload,
  classifyPushFailure,
  safeSecretEqual,
  sanitizePushError,
  selectRetryableDeliveries,
} from '../supabase/functions/send-web-push/delivery.ts';

const notification = {
  id: 'notification-1',
  kind: 'NEWS',
  source_event_key: 'cms:news:n1',
  title: 'جديد اتحاد شباب الأمة: عنوان',
  body: 'تم نشر خبر جديد في موقع الاتحاد.',
  destination: '/?push=news',
};

test('builds the exact small visible payload with local icons', () => {
  assert.deepEqual(buildPushPayload(notification), {
    title: 'جديد اتحاد شباب الأمة: عنوان',
    body: 'تم نشر خبر جديد في موقع الاتحاد.',
    tag: 'cms:news:n1',
    url: '/?push=news',
    icon: '/icons/union-push-icon.svg',
    badge: '/icons/union-push-badge.svg',
  });
});

test('builds a safe personal economy notification for the accepted student portal', () => {
  assert.deepEqual(buildPushPayload({
    ...notification,
    kind: 'PERSONAL',
    source_event_key: 'economy:manual:request-1',
    title: 'تم تحديث رصيد نقاطك',
    body: 'تمت إضافة 10 نقاط.',
    destination: '/?push=student-dashboard',
  }), {
    title: 'تم تحديث رصيد نقاطك',
    body: 'تمت إضافة 10 نقاط.',
    tag: 'economy:manual:request-1',
    url: '/?push=student-dashboard',
    icon: '/icons/union-push-icon.svg',
    badge: '/icons/union-push-badge.svg',
  });
});

test('builds a safe notification for NEW_APPLICATION', () => {
  assert.deepEqual(buildPushPayload({
    ...notification,
    kind: 'NEW_APPLICATION',
    source_event_key: 'app:new:1',
    title: 'New application',
    body: 'Someone applied',
    destination: '/?push=admin-applications',
  }), {
    title: 'New application',
    body: 'Someone applied',
    tag: 'app:new:1',
    url: '/?push=admin-applications',
    icon: '/icons/union-push-icon.svg',
    badge: '/icons/union-push-badge.svg',
  });
});

test('refuses invalid destinations and oversized notification text', () => {
  assert.throws(() => buildPushPayload({ ...notification, destination: 'https://evil.test' }), /PUSH_NOTIFICATION_INVALID/);
  assert.throws(() => buildPushPayload({ ...notification, title: 'x'.repeat(241) }), /PUSH_NOTIFICATION_INVALID/);
  assert.throws(() => buildPushPayload({ ...notification, kind: 'UNKNOWN_KIND' }), /PUSH_NOTIFICATION_INVALID/);
});

test('compares webhook secrets without accepting prefix or length variants', () => {
  assert.equal(safeSecretEqual('secret-123', 'secret-123'), true);
  assert.equal(safeSecretEqual('secret-123', 'secret-12'), false);
  assert.equal(safeSecretEqual('secret-123', 'secret-1234'), false);
  assert.equal(safeSecretEqual('', ''), false);
});

test('sanitizes credentials and control characters before audit storage', () => {
  assert.equal(
    sanitizePushError('Bearer abc.def.ghi\nVAPID_PRIVATE_KEY=secret-value'),
    'Bearer [redacted] VAPID_PRIVATE_KEY=[redacted]',
  );
  assert.equal(sanitizePushError('x'.repeat(900)).length, 800);
});

test('classifies expired, permanent, and retryable push failures', () => {
  assert.deepEqual(classifyPushFailure({ statusCode: 404, message: 'gone' }), { kind: 'expired', statusCode: 404 });
  assert.deepEqual(classifyPushFailure({ statusCode: 410, message: 'gone' }), { kind: 'expired', statusCode: 410 });
  assert.deepEqual(classifyPushFailure({ statusCode: 400, message: 'bad' }), { kind: 'permanent', statusCode: 400 });
  assert.deepEqual(classifyPushFailure({ statusCode: 503, message: 'later' }), { kind: 'retryable', statusCode: 503 });
  assert.deepEqual(classifyPushFailure(new Error('network')), { kind: 'retryable', statusCode: null });
});

test('selects only pending and failed deliveries up to the batch limit', () => {
  const rows = [
    { id: '1', status: 'SENT' },
    { id: '2', status: 'PENDING' },
    { id: '3', status: 'FAILED' },
    { id: '4', status: 'SENDING' },
  ];
  assert.deepEqual(selectRetryableDeliveries(rows, 1).map((row) => row.id), ['2']);
  assert.deepEqual(selectRetryableDeliveries(rows, 10).map((row) => row.id), ['2', '3']);
});
