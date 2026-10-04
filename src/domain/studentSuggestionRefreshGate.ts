import type { StudentSuggestionErrorCode } from './studentSuggestionGateway.js';

export function shouldRefreshSuggestionsOnTabTransition(
  previousTab: string | null,
  nextTab: string
): boolean {
  if (nextTab !== 'suggestions') return false;
  return previousTab !== 'suggestions';
}

export interface AuthOwnership {
  epoch: number;
  userId: string | null;
  role: string | null;
}

export interface RefreshRequest {
  id: number;
  auth: AuthOwnership;
}

export function createSuggestionRefreshGate() {
  let latestRequestId = 0;
  let currentAuth: AuthOwnership | null = null;

  return {
    beginRequest(auth: AuthOwnership): RefreshRequest {
      latestRequestId++;
      currentAuth = { ...auth };
      return {
        id: latestRequestId,
        auth: { ...auth }
      };
    },

    isRequestValid(req: RefreshRequest): boolean {
      if (req.id !== latestRequestId) return false;
      if (!currentAuth) return false;

      return req.auth.epoch === currentAuth.epoch &&
             req.auth.userId === currentAuth.userId &&
             req.auth.role === currentAuth.role;
    },

    clear() {
      latestRequestId++;
      currentAuth = null;
    }
  };
}

export type SuggestionMutationResult =
  | { ok: true; refreshPending: boolean }
  | { ok: false; error: StudentSuggestionErrorCode | string };

export interface SuggestionStateIntegrationDeps<T> {
  load: () => Promise<{ ok: boolean; data?: T[]; error?: string }>;
  submit: (params: unknown) => Promise<{ ok: boolean; error?: string }>;
  respond: (params: unknown) => Promise<{ ok: boolean; error?: string }>;
  onUpdate: (data: T[]) => void;
  onStorageRetire: () => void;
  onLoading?: (isLoading: boolean) => void;
  onError?: (error: string | null) => void;
}

export function createSuggestionStateIntegration<T>(deps: SuggestionStateIntegrationDeps<T>) {
  const gate = createSuggestionRefreshGate();
  let hasRetired = false;

  const performRefresh = async (auth: AuthOwnership) => {
    deps.onLoading?.(true);
    const req = gate.beginRequest(auth);
    const result = await deps.load();

    if (gate.isRequestValid(req)) {
      deps.onLoading?.(false);
      if (result.ok && result.data) {
        deps.onError?.(null);
        deps.onUpdate(result.data);

        if (!hasRetired && result.data.length === 0) {
          deps.onStorageRetire();
          hasRetired = true;
        } else if (!hasRetired && result.data.length > 0) {
          deps.onStorageRetire();
          hasRetired = true;
        }
      } else if (!result.ok) {
        deps.onError?.(result.error ?? 'UNKNOWN_ERROR');
      }
    }
    return result;
  };

  const handleMutation = async (auth: AuthOwnership, mutationResult: { ok: boolean; error?: string }): Promise<SuggestionMutationResult> => {
    if (!mutationResult.ok) return { ok: false, error: mutationResult.error ?? 'UNKNOWN_ERROR' };

    const refreshRes = await performRefresh(auth);
    if (!refreshRes.ok) {
      return { ok: true, refreshPending: true };
    }
    return { ok: true, refreshPending: false };
  };

  return {
    performRefresh,
    submit: async (auth: AuthOwnership, params: unknown) => handleMutation(auth, await deps.submit(params)),
    respond: async (auth: AuthOwnership, params: unknown) => handleMutation(auth, await deps.respond(params)),
    clear: () => gate.clear()
  };
}
