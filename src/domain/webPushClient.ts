export type PushCapability =
  | { kind: 'unsupported'; reason: string }
  | { kind: 'ios-install-required'; reason: string }
  | { kind: 'denied'; reason: string }
  | { kind: 'ready'; permission: 'default' | 'granted' };

export interface PushCapabilityInput {
  isSecureContext: boolean;
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  notificationPermission: NotificationPermission;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
}

export interface SerializedPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

interface PushSubscriptionLike {
  endpoint: string;
  expirationTime: number | null;
  getKey(name: 'p256dh' | 'auth'): ArrayBuffer | null;
}

const isIosDevice = (input: PushCapabilityInput): boolean => (
  /iPad|iPhone|iPod/i.test(input.userAgent)
  || (input.platform === 'MacIntel' && input.maxTouchPoints > 1)
);

export function detectPushCapability(input: PushCapabilityInput): PushCapability {
  if (!input.isSecureContext) {
    return { kind: 'unsupported', reason: 'تحتاج الإشعارات إلى اتصال آمن HTTPS.' };
  }
  if (isIosDevice(input) && !input.standalone) {
    return {
      kind: 'ios-install-required',
      reason: 'على iPhone وiPad أضف الموقع إلى الشاشة الرئيسية أولاً، ثم افتحه من الأيقونة لتفعيل الإشعارات.',
    };
  }
  if (!input.hasNotification || !input.hasServiceWorker || !input.hasPushManager) {
    return { kind: 'unsupported', reason: 'هذا المتصفح لا يدعم إشعارات الويب.' };
  }
  if (input.notificationPermission === 'denied') {
    return {
      kind: 'denied',
      reason: 'تم حظر الإشعارات من إعدادات المتصفح. فعّلها من إعدادات الموقع ثم أعد المحاولة.',
    };
  }
  return {
    kind: 'ready',
    permission: input.notificationPermission === 'granted' ? 'granted' : 'default',
  };
}

const normalizedBase64Url = (value: string): string => {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) throw new Error('VAPID_PUBLIC_KEY_INVALID');
  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4);
  return `${trimmed.replace(/-/g, '+').replace(/_/g, '/')}${padding}`;
};

export function urlBase64ToUint8Array(value: string): Uint8Array {
  let binary: string;
  try {
    binary = globalThis.atob(normalizedBase64Url(value));
  } catch {
    throw new Error('VAPID_PUBLIC_KEY_INVALID');
  }
  if (binary.length !== 65) throw new Error('VAPID_PUBLIC_KEY_INVALID');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const bufferToBase64Url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export function serializePushSubscription(
  subscription: PushSubscriptionLike,
): SerializedPushSubscription {
  const endpoint = subscription.endpoint.trim();
  const p256dh = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  if (!endpoint || !p256dh || !auth) throw new Error('PUSH_SUBSCRIPTION_INVALID');
  return {
    endpoint,
    expirationTime: subscription.expirationTime,
    keys: {
      p256dh: bufferToBase64Url(p256dh),
      auth: bufferToBase64Url(auth),
    },
  };
}

export type PushDestination = 'news' | 'programs' | 'gallery' | 'student-dashboard' | 'admin-applications';

export function pushDestinationFromUrl(value: string): PushDestination | null {
  try {
    const destination = new URL(value).searchParams.get('push');
    return destination === 'news' || destination === 'programs' || destination === 'gallery' || destination === 'student-dashboard' || destination === 'admin-applications'
      ? destination
      : null;
  } catch {
    return null;
  }
}
