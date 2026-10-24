import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  renderApplicationEmail,
  type ApplicationEmailEventType,
  type ApplicationEmailPayload,
} from './email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  },
);

const eventTypes: readonly ApplicationEmailEventType[] = [
  'NEW_APPLICATION',
  'INTERVIEW_SCHEDULED',
  'ACCEPTED',
  'REJECTED',
];

const protectedEvents: readonly ApplicationEmailEventType[] = [
  'INTERVIEW_SCHEDULED',
  'ACCEPTED',
  'REJECTED',
];

const applicationIdPattern = /^[A-Za-z0-9_:-]{1,200}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NotificationRow {
  id: string;
  application_id: string;
  event_type: ApplicationEmailEventType;
  payload: ApplicationEmailPayload;
  delivery_status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  delivery_attempts: number;
  created_at: string;
}

const notificationColumns = [
  'id',
  'application_id',
  'event_type',
  'payload',
  'delivery_status',
  'delivery_attempts',
  'created_at',
].join(',');

const isEventType = (value: unknown): value is ApplicationEmailEventType =>
  typeof value === 'string' && (eventTypes as readonly string[]).includes(value);

const sanitizeAuditError = (value: unknown): string => {
  const normalized = String(value ?? 'DELIVERY_FAILED')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(?:re_|sb_)[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .trim();
  return (normalized || 'DELIVERY_FAILED').slice(0, 800);
};

const validPayload = (value: unknown): value is ApplicationEmailPayload => {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.studentName === 'string'
    && typeof payload.studentEmail === 'string'
    && (payload.interviewDate === null || typeof payload.interviewDate === 'string')
    && (payload.interviewTime === null || typeof payload.interviewTime === 'string')
    && (payload.interviewLink === null || typeof payload.interviewLink === 'string')
    && (payload.rejectionReason === null || typeof payload.rejectionReason === 'string');
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const mailRelaySecret = Deno.env.get('APPLICATION_EMAIL_RELAY_SECRET');
  const sitePublicUrl = Deno.env.get('SITE_PUBLIC_URL');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: 'SUPABASE_FUNCTION_NOT_CONFIGURED' });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return json(400, { error: 'INVALID_JSON' });
  }

  const bodyKeys = Object.keys(body);
  if (
    bodyKeys.some((key) => !['applicationId', 'eventType'].includes(key))
    || typeof body.applicationId !== 'string'
    || !applicationIdPattern.test(body.applicationId)
    || !isEventType(body.eventType)
  ) {
    return json(400, { error: 'VALID_APPLICATION_EVENT_REQUIRED' });
  }

  const applicationId = body.applicationId;
  const eventType = body.eventType;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if ((protectedEvents as readonly string[]).includes(eventType)) {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) {
      return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    }
    const token = authorization.slice('Bearer '.length);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: 'INVALID_SESSION' });

    const [{ data: assignment }, { data: profile }] = await Promise.all([
      admin
        .from('executive_assignments')
        .select('position_key')
        .eq('user_id', authData.user.id)
        .eq('position_key', 'PRESIDENT')
        .maybeSingle(),
      admin
        .from('profiles')
        .select('status')
        .eq('id', authData.user.id)
        .maybeSingle(),
    ]);
    if (assignment?.position_key !== 'PRESIDENT' || profile?.status !== 'active') {
      return json(403, { error: 'PRESIDENT_REQUIRED' });
    }
  }

  const { data: notificationData, error: notificationError } = await admin
    .from('application_email_notifications')
    .select(notificationColumns)
    .eq('application_id', applicationId)
    .eq('event_type', eventType)
    .in('delivery_status', ['PENDING', 'FAILED', 'SENT', 'SENDING'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (notificationError) {
    return json(500, { error: 'NOTIFICATION_LOOKUP_FAILED', status: 'PENDING' });
  }
  if (!notificationData) {
    return eventType === 'NEW_APPLICATION'
      ? json(202, { ok: true, status: 'PENDING' })
      : json(404, { error: 'NOTIFICATION_NOT_FOUND', status: 'PENDING' });
  }

  let notification = notificationData as NotificationRow;
  if (notification.delivery_status === 'SENT') {
    return json(200, {
      ok: true,
      status: 'ALREADY_SENT',
      alreadySent: true,
      notificationId: notification.id,
    });
  }
  if (notification.delivery_status === 'SENDING') {
    return json(202, { ok: true, status: 'PENDING', notificationId: notification.id });
  }
  if (!validPayload(notification.payload)) {
    return json(500, { error: 'NOTIFICATION_PAYLOAD_INVALID', status: 'FAILED' });
  }

  const deliveryAttempts = Number(notification.delivery_attempts ?? 0) + 1;
  const { data: claimed, error: claimError } = await admin
    .from('application_email_notifications')
    .update({
      delivery_status: 'SENDING',
      delivery_attempts: deliveryAttempts,
      delivery_last_error: null,
    })
    .eq('id', notification.id)
    .in('delivery_status', ['PENDING', 'FAILED'])
    .select(notificationColumns)
    .maybeSingle();

  if (claimError) return json(500, { error: 'NOTIFICATION_CLAIM_FAILED', status: 'PENDING' });
  if (!claimed) return json(202, { ok: true, status: 'PENDING', notificationId: notification.id });
  notification = claimed as NotificationRow;

  const markFailed = async (reason: unknown) => {
    await admin
      .from('application_email_notifications')
      .update({
        delivery_status: 'FAILED',
        delivery_last_error: sanitizeAuditError(reason),
      })
      .eq('id', notification.id)
      .eq('delivery_status', 'SENDING');
  };

  let recipient: string | null = null;
  if (eventType === 'NEW_APPLICATION') {
    const { data: presidentAssignment } = await admin
      .from('executive_assignments')
      .select('user_id')
      .eq('position_key', 'PRESIDENT')
      .maybeSingle();
    if (presidentAssignment?.user_id) {
      const { data: presidentProfile } = await admin
        .from('profiles')
        .select('contact_email,status')
        .eq('id', presidentAssignment.user_id)
        .maybeSingle();
      if (presidentProfile?.status === 'active') {
        const contactEmail = String(presidentProfile.contact_email ?? '').trim();
        if (emailPattern.test(contactEmail)) {
          recipient = contactEmail;
        } else {
          const { data: authUserData } = await admin.auth.admin.getUserById(
            presidentAssignment.user_id,
          );
          const loginEmail = authUserData.user?.email?.trim() ?? '';
          if (emailPattern.test(loginEmail)) recipient = loginEmail;
        }
      }
    }
  } else {
    const studentEmail = notification.payload.studentEmail.trim();
    if (emailPattern.test(studentEmail)) recipient = studentEmail;
  }

  if (!recipient || !mailRelaySecret || !sitePublicUrl) {
    await markFailed('EMAIL_DELIVERY_CONFIGURATION_OR_RECIPIENT_INVALID');
    return json(500, { error: 'EMAIL_DELIVERY_NOT_CONFIGURED', status: 'FAILED' });
  }

  let renderedEmail;
  try {
    renderedEmail = renderApplicationEmail(eventType, notification.payload, sitePublicUrl);
  } catch (error) {
    await markFailed(error instanceof Error ? error.message : 'EMAIL_TEMPLATE_INVALID');
    return json(500, { error: 'EMAIL_TEMPLATE_INVALID', status: 'FAILED' });
  }

  // Protected Vercel Node runtime relay: only this server-side function has the shared key.
  // Authentication and recipient lookup remain exclusively here in Supabase.
  let response: Response;
  try {
    response = await fetch('https://ummet-genc.vercel.app/api/send-union-mail', {
      method: 'POST',
      headers: {
        'x-union-mail-secret': mailRelaySecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: recipient,
        subject: renderedEmail.subject,
        text: renderedEmail.text,
        html: renderedEmail.html,
        notificationId: notification.id,
      }),
      signal: AbortSignal.timeout(23000),
    });
  } catch (error) {
    await markFailed(error instanceof Error && error.name === 'TimeoutError'
      ? 'SMTP_RELAY_OUTCOME_UNKNOWN_REVIEW_BEFORE_RETRY'
      : 'SMTP_RELAY_NETWORK_FAILED');
    return json(502, { error: 'SMTP_RELAY_DELIVERY_FAILED', status: 'FAILED' });
  }

  const providerBody = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    await markFailed('SMTP_RELAY_' + response.status + ':' +
      String(providerBody.error ?? 'DELIVERY_FAILED'));
    return json(502, { error: 'SMTP_RELAY_DELIVERY_FAILED', status: 'FAILED' });
  }

  const providerId = typeof providerBody.messageId === 'string'
    ? providerBody.messageId : null;
  const { error: updateError } = await admin
    .from('application_email_notifications')
    .update({
      delivery_status: 'SENT',
      delivery_last_error: null,
      email_provider_id: providerId,
      sent_at: new Date().toISOString(),
    })
    .eq('id', notification.id)
    .eq('delivery_status', 'SENDING');
  if (updateError) return json(500, { error: 'DELIVERY_AUDIT_UPDATE_FAILED', status: 'SENDING' });

  return json(200, {
    ok: true,
    status: 'SENT',
    notificationId: notification.id,
  });
});
