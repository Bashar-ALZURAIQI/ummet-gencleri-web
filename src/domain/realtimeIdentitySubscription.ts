import type { ServiceError, ServiceResult } from '../lib/supabase.ts';

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';
type RemoveChannelStatus = 'ok' | 'timed out' | 'error';
export type IdentityRealtimeChangeKind = 'profile' | 'assignment';

interface IdentityChannel {
  on(
    type: 'postgres_changes',
    filter: Record<string, string>,
    callback: (payload: unknown) => void,
  ): IdentityChannel;
  subscribe(callback: (status: RealtimeStatus, error?: unknown) => void): IdentityChannel;
}

export interface IdentityRealtimeClient {
  channel(topic: string): IdentityChannel;
  removeChannel(channel: IdentityChannel): Promise<RemoveChannelStatus>;
}

const errorDetails = (error: unknown): string | undefined => {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return typeof error === 'string' && error ? error : undefined;
};

const realtimeError = (status: Exclude<RealtimeStatus, 'SUBSCRIBED'>, error?: unknown): ServiceError => {
  const message = status === 'CHANNEL_ERROR'
    ? 'The account identity channel reported an error.'
    : status === 'TIMED_OUT'
      ? 'The account identity channel timed out.'
      : 'The account identity channel closed unexpectedly.';
  const details = errorDetails(error);
  return { code: status, message, ...(details ? { details } : {}) };
};

export function createIdentitySubscription(input: {
  client: IdentityRealtimeClient;
  userId: string;
  requestConfirmedRefresh: (kind: IdentityRealtimeChangeKind) => void;
  onError: (error: ServiceError) => void;
  onSubscribed: () => void;
}): () => Promise<ServiceResult<void>> {
  let disposed = false;
  const profileRefresh = () => {
    if (disposed) return;
    input.requestConfirmedRefresh('profile');
  };
  const assignmentRefresh = () => {
    if (disposed) return;
    input.requestConfirmedRefresh('assignment');
  };
  const channel = input.client
    .channel(`account-identity:${input.userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${input.userId}` },
      profileRefresh,
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'executive_assignments', filter: `user_id=eq.${input.userId}` },
      assignmentRefresh,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'executive_assignments', filter: `user_id=eq.${input.userId}` },
      assignmentRefresh,
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'executive_assignments' },
      assignmentRefresh,
    )
    .subscribe((status, error) => {
      if (disposed) return;
      if (status === 'SUBSCRIBED') {
        input.onSubscribed();
        return;
      }
      input.onError(realtimeError(status, error));
    });

  return async () => {
    disposed = true;
    try {
      const status = await input.client.removeChannel(channel);
      if (status === 'ok') return { ok: true, data: undefined };
      return status === 'timed out'
        ? {
            ok: false,
            error: {
              code: 'CHANNEL_REMOVE_TIMED_OUT',
              message: 'Removing the account identity channel timed out.',
            },
          }
        : {
            ok: false,
            error: {
              code: 'CHANNEL_REMOVE_ERROR',
              message: 'Unable to remove the account identity channel.',
            },
          };
    } catch (error) {
      const details = errorDetails(error);
      return {
        ok: false,
        error: {
          code: 'CHANNEL_REMOVE_FAILED',
          message: 'Unable to remove the account identity channel.',
          ...(details ? { details } : {}),
        },
      };
    }
  };
}
