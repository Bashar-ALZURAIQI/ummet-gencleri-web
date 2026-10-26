import { createClient } from '@supabase/supabase-js';
import { createIsolatedAuthClient } from '../domain/isolatedAuthClient.ts';
import { extractRecoveryCallbackAccessToken } from '../domain/passwordRecovery.ts';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Capture the initial recovery hash BEFORE createClient starts consuming it.
// The token stays in memory; it is never placed in logs or localStorage here.
const initialRecoveryToken = typeof window === 'undefined'
  ? null : extractRecoveryCallbackAccessToken(window.location.href);

export const isInitialRecoveryCallbackSession = (session: { access_token: string } | null): boolean => (
  initialRecoveryToken !== null && session?.access_token === initialRecoveryToken
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const createPasswordVerificationClient = () => createIsolatedAuthClient(
  (url, key, options) => createClient(url, key, options),
  supabaseUrl,
  supabaseAnonKey,
);

export interface ServiceError {
  code: string;
  message: string;
  details?: string;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

interface SupabaseErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

export const serviceSuccess = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

export function serviceFailure<T>(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): ServiceResult<T> {
  const candidate = error && typeof error === 'object' ? error as SupabaseErrorLike : undefined;
  return {
    ok: false,
    error: {
      code: typeof candidate?.code === 'string' && candidate.code ? candidate.code : fallbackCode,
      message: typeof candidate?.message === 'string' && candidate.message
        ? candidate.message
        : fallbackMessage,
      ...(typeof candidate?.details === 'string' && candidate.details
        ? { details: candidate.details }
        : {}),
    },
  };
}
