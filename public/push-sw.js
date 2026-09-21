const DEFAULT_TITLE = 'اتحاد شباب الأمة';
const DEFAULT_BODY = 'لديك تحديث جديد من الاتحاد.';
const ALLOWED_DESTINATIONS = new Set(['news', 'programs', 'gallery', 'student-dashboard', 'admin-applications']);

const notificationPayload = (event) => {
  let value = {};
  try {
    value = event.data?.json?.() ?? {};
  } catch {
    value = {};
  }
  const destination = typeof value.url === 'string' ? value.url : '/';
  return {
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : DEFAULT_TITLE,
    options: {
      body: typeof value.body === 'string' && value.body.trim() ? value.body.trim() : DEFAULT_BODY,
      tag: typeof value.tag === 'string' && value.tag.trim() ? value.tag.trim() : 'ummet-update',
      icon: typeof value.icon === 'string' && value.icon.trim() ? value.icon : '/icons/union-push-icon.svg',
      badge: typeof value.badge === 'string' && value.badge.trim() ? value.badge : '/icons/union-push-badge.svg',
      data: { url: destination },
      dir: 'rtl',
      lang: 'ar',
    },
  };
};

const safeDestination = (candidate) => {
  try {
    const url = new URL(typeof candidate === 'string' ? candidate : '/', self.location.origin);
    if (url.origin !== self.location.origin) return `${self.location.origin}/`;
    const destination = url.searchParams.get('push');
    if (url.pathname !== '/' || (destination !== null && !ALLOWED_DESTINATIONS.has(destination))) {
      return `${self.location.origin}/`;
    }
    return url.href;
  } catch {
    return `${self.location.origin}/`;
  }
};

self.addEventListener('push', (event) => {
  const payload = notificationPayload(event);
  event.waitUntil(self.registration.showNotification(payload.title, payload.options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = safeDestination(event.notification?.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => {
      try { return new URL(client.url).origin === self.location.origin; } catch { return false; }
    });
    if (existing) {
      if (typeof existing.navigate === 'function') await existing.navigate(destination);
      if (typeof existing.focus === 'function') await existing.focus();
      return;
    }
    await self.clients.openWindow(destination);
  })());
});
