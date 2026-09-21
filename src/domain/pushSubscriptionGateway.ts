import type { SerializedPushSubscription } from './webPushClient.ts';

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  isActive: boolean;
  updatedAt: string;
}

export interface PushSubscriptionError {
  code: string;
  message: string;
  details?: string;
}

export type PushSubscriptionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PushSubscriptionError };

interface RpcErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

interface RpcResponse {
  data: unknown;
  error: RpcErrorLike | null;
}

export interface PushSubscriptionClient {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResponse>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

const failure = <T>(
  code: string,
  message: string,
  error?: RpcErrorLike | null,
): PushSubscriptionResult<T> => ({
  ok: false,
  error: {
    code: typeof error?.code === 'string' && error.code ? error.code : code,
    message,
    ...(typeof error?.details === 'string' && error.details ? { details: error.details } : {}),
  },
});

const recordValue = (value: unknown): Record<string, unknown> | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : null;
};

const mapRecord = (value: unknown): PushSubscriptionResult<PushSubscriptionRecord> => {
  const row = recordValue(value);
  if (!row
    || typeof row.id !== 'string'
    || !UUID_PATTERN.test(row.id)
    || typeof row.user_id !== 'string'
    || !UUID_PATTERN.test(row.user_id)
    || row.is_active !== true
    || typeof row.updated_at !== 'string'
    || !row.updated_at) {
    return failure(
      'PUSH_SUBSCRIPTION_RESPONSE_INVALID',
      'أعاد الخادم نتيجة غير صالحة لاشتراك الإشعارات.',
    );
  }
  return {
    ok: true,
    data: {
      id: row.id,
      userId: row.user_id,
      isActive: true,
      updatedAt: row.updated_at,
    },
  };
};

const validSubscription = (subscription: SerializedPushSubscription): boolean => (
  Boolean(subscription.endpoint.trim())
  && BASE64URL_PATTERN.test(subscription.keys.p256dh.trim())
  && BASE64URL_PATTERN.test(subscription.keys.auth.trim())
);

export function createPushSubscriptionGateway(client: PushSubscriptionClient) {
  return {
    async register(
      subscription: SerializedPushSubscription,
      userAgent: string,
    ): Promise<PushSubscriptionResult<PushSubscriptionRecord>> {
      if (!validSubscription(subscription)) {
        return failure('PUSH_SUBSCRIPTION_INVALID', 'بيانات اشتراك الإشعارات غير مكتملة.');
      }
      const response = await client.rpc('register_accepted_student_push_subscription', {
        p_endpoint: subscription.endpoint.trim(),
        p_p256dh: subscription.keys.p256dh.trim(),
        p_auth_key: subscription.keys.auth.trim(),
        p_user_agent: userAgent.trim(),
      });
      if (response.error) {
        return failure(
          'PUSH_SUBSCRIPTION_SAVE_FAILED',
          'تعذر حفظ اشتراك الإشعارات.',
          response.error,
        );
      }
      return mapRecord(response.data);
    },

    async registerPresident(
      subscription: SerializedPushSubscription,
      userAgent: string,
    ): Promise<PushSubscriptionResult<PushSubscriptionRecord>> {
      if (!validSubscription(subscription)) {
        return failure('PUSH_SUBSCRIPTION_INVALID', 'بيانات اشتراك الإشعارات غير مكتملة.');
      }
      const response = await client.rpc('register_current_president_push_subscription', {
        p_endpoint: subscription.endpoint.trim(),
        p_p256dh: subscription.keys.p256dh.trim(),
        p_auth_key: subscription.keys.auth.trim(),
        p_user_agent: userAgent.trim(),
      });
      if (response.error) {
        return failure(
          'PUSH_SUBSCRIPTION_SAVE_FAILED',
          'تعذر حفظ اشتراك إشعارات الإدارة.',
          response.error,
        );
      }
      return mapRecord(response.data);
    },

    async disable(endpointValue: string): Promise<PushSubscriptionResult<null>> {
      const endpoint = endpointValue.trim();
      if (!endpoint) {
        return failure('PUSH_SUBSCRIPTION_INVALID', 'بيانات اشتراك الإشعارات غير مكتملة.');
      }
      const response = await client.rpc('disable_own_push_subscription', { p_endpoint: endpoint });
      if (response.error) {
        return failure(
          'PUSH_SUBSCRIPTION_DISABLE_FAILED',
          'تعذر إيقاف اشتراك الإشعارات.',
          response.error,
        );
      }
      return response.data === true
        ? { ok: true, data: null }
        : failure(
            'PUSH_SUBSCRIPTION_RESPONSE_INVALID',
            'أعاد الخادم نتيجة غير صالحة عند إيقاف الإشعارات.',
          );
    },
  };
}
