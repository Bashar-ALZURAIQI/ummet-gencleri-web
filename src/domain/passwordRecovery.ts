export type PasswordRecoveryGate = 'IDLE' | 'READY';

// Capture a callback token only when GoTrue explicitly marks the redirect as
// a recovery flow. Never treat the public ?auth=recovery parameter as proof.
export function extractRecoveryCallbackAccessToken(callbackUrl: string): string | null {
  try {
    const url = new URL(callbackUrl);
    if (url.searchParams.get('auth') !== 'recovery') return null;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    if (hash.get('type') !== 'recovery' || !hash.get('refresh_token')) return null;
    return hash.get('access_token') || null;
  } catch {
    return null;
  }
}

export interface PasswordRecoveryAuthClient {
  auth: {
    resetPasswordForEmail(
      email: string,
      options: { redirectTo: string },
    ): Promise<{ data: unknown; error: unknown | null }>;
    updateUser(attributes: { password: string }): Promise<{
      data: unknown;
      error: unknown | null;
    }>;
  };
}

export type PasswordRecoveryResult =
  | { ok: true }
  | { ok: false; error: string };

export function buildPasswordRecoveryRedirectUrl(location: {
  origin: string;
  pathname: string;
}): string {
  const url = new URL(location.pathname || '/', location.origin);
  url.search = '';
  url.hash = '';
  url.searchParams.set('auth', 'recovery');
  return url.toString();
}

export function reducePasswordRecoveryGate(
  current: PasswordRecoveryGate,
  event: string,
  hasSession: boolean,
): PasswordRecoveryGate {
  if (event === 'SIGNED_OUT') return 'IDLE';
  if (event === 'PASSWORD_RECOVERY') return hasSession ? 'READY' : 'IDLE';
  return current;
}

export function validateRecoveredPassword(
  password: string,
  confirmation: string,
): PasswordRecoveryResult {
  if (password.length < 8) {
    return { ok: false, error: 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف.' };
  }
  if (password !== confirmation) {
    return { ok: false, error: 'تأكيد كلمة المرور الجديدة غير مطابق.' };
  }
  return { ok: true };
}

export function createPasswordRecoveryGateway(client: PasswordRecoveryAuthClient) {
  return {
    async requestReset(email: string, redirectTo: string): Promise<PasswordRecoveryResult> {
      try {
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim().toLowerCase(),
          { redirectTo },
        );
        if (!error) return { ok: true };
      } catch {
        // Network failures intentionally share the same user-safe result.
      }
      return {
        ok: false,
        error: 'تعذر إرسال رابط الاستعادة حالياً. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
      };
    },

    async updatePassword(
      password: string,
      recoveryAuthorized: boolean,
    ): Promise<PasswordRecoveryResult> {
      if (!recoveryAuthorized) {
        return {
          ok: false,
          error: 'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.',
        };
      }
      try {
        const { error } = await client.auth.updateUser({ password });
        if (!error) return { ok: true };
      } catch {
        // Network failures intentionally share the same user-safe result.
      }
      return {
        ok: false,
        error: 'تعذر تغيير كلمة المرور. قد يكون الرابط منتهياً؛ اطلب رابط استعادة جديداً.',
      };
    },
  };
}
