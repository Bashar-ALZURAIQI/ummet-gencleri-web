import { createHash, timingSafeEqual } from 'node:crypto';

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const KEYS = ['to', 'subject', 'text', 'html', 'notificationId'];

const sameSecret = (provided, actual) => {
  const left = createHash('sha256').update(String(provided ?? '')).digest();
  const right = createHash('sha256').update(String(actual ?? '')).digest();
  return timingSafeEqual(left, right);
};

const validMessage = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === KEYS.length
    && keys.every((key) => KEYS.includes(key))
    && typeof value.to === 'string' && value.to.length <= 254 && EMAIL.test(value.to)
    && typeof value.subject === 'string' && value.subject.length > 0 && value.subject.length <= 300
    && !/[\r\n]/.test(value.subject)
    && typeof value.text === 'string' && value.text.length > 0 && value.text.length <= 30000
    && typeof value.html === 'string' && value.html.length > 0 && value.html.length <= 60000
    && typeof value.notificationId === 'string' && ID.test(value.notificationId);
};

export function createMailRelayHandler({ sendMail, getConfig = () => process.env }) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const config = getConfig();
    if (!config.MAIL_RELAY_SECRET || !config.GMAIL_SMTP_APP_PASSWORD
        || !config.GMAIL_SMTP_USER) {
      return response.status(503).json({ error: 'MAIL_RELAY_NOT_CONFIGURED' });
    }

    const provided = request.headers?.['x-union-mail-secret'];
    if (typeof provided !== 'string' || !sameSecret(provided, config.MAIL_RELAY_SECRET)) {
      return response.status(401).json({ error: 'UNAUTHORIZED' });
    }
    if (!validMessage(request.body)) {
      return response.status(400).json({ error: 'INVALID_MAIL_REQUEST' });
    }

    try {
      const result = await sendMail(request.body, config);
      return response.status(200).json({
        ok: true,
        messageId: typeof result?.messageId === 'string'
          ? result.messageId.slice(0, 255) : null,
      });
    } catch (error) {
      // Do not log credentials, recipient addresses or email bodies.
      console.error('Union SMTP relay delivery failed', {
        code: typeof error?.code === 'string' ? error.code.slice(0, 60) : 'SMTP_ERROR',
      });
      return response.status(502).json({ error: 'SMTP_SEND_FAILED' });
    }
  };
}
