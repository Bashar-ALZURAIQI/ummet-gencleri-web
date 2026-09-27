export type PushContentKind = 'NEWS' | 'EVENT' | 'GALLERY_ALBUM' | 'PERSONAL' | 'NEW_APPLICATION';

export interface PushNotificationLike {
  id: string;
  kind: PushContentKind | string;
  source_event_key: string;
  title: string;
  body: string;
  destination: string;
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  icon: string;
  badge: string;
}

export type PushFailure =
  | { kind: 'expired'; statusCode: number }
  | { kind: 'permanent'; statusCode: number }
  | { kind: 'retryable'; statusCode: number | null };

const VALID_KINDS = new Set(['NEWS', 'EVENT', 'GALLERY_ALBUM', 'PERSONAL', 'NEW_APPLICATION']);
const VALID_DESTINATIONS = new Set(['/?push=news', '/?push=programs', '/?push=gallery', '/?push=student-dashboard', '/?push=admin-applications']);

export function buildPushPayload(notification: PushNotificationLike): PushPayload {
  if (!notification.id
    || !VALID_KINDS.has(notification.kind)
    || !notification.source_event_key
    || notification.source_event_key.length > 500
    || !notification.title
    || notification.title.length > 240
    || !notification.body
    || notification.body.length > 500
    || !VALID_DESTINATIONS.has(notification.destination)) {
    throw new Error('PUSH_NOTIFICATION_INVALID');
  }
  return {
    title: notification.title,
    body: notification.body,
    tag: notification.source_event_key,
    url: notification.destination,
    icon: '/icons/union-push-icon.svg',
    badge: '/icons/union-push-badge.svg',
  };
}

export function safeSecretEqual(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  const maxLength = Math.max(actual.length, expected.length);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function sanitizePushError(value: unknown): string {
  const normalized = String(value instanceof Error ? value.message : value ?? 'PUSH_DELIVERY_FAILED')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(VAPID_PRIVATE_KEY\s*=\s*)\S+/gi, '$1[redacted]')
    .replace(/(PUSH_WEBHOOK_SECRET\s*=\s*)\S+/gi, '$1[redacted]')
    .trim();
  return (normalized || 'PUSH_DELIVERY_FAILED').slice(0, 800);
}

export function classifyPushFailure(error: unknown): PushFailure {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const statusCode = typeof candidate?.statusCode === 'number'
    ? candidate.statusCode
    : typeof candidate?.status === 'number'
      ? candidate.status
      : null;
  if (statusCode === 404 || statusCode === 410) return { kind: 'expired', statusCode };
  if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
    return { kind: 'permanent', statusCode };
  }
  return { kind: 'retryable', statusCode };
}

export function selectRetryableDeliveries<TRow extends { status: string }>(
  rows: TRow[],
  limit: number,
): TRow[] {
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 0;
  return rows
    .filter((row) => row.status === 'PENDING' || row.status === 'FAILED')
    .slice(0, safeLimit);
}
