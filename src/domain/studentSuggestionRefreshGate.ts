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

export interface SuggestionStateIntegrationDeps<T> {
  load: () => Promise<{ ok: boolean; data?: T[]; error?: string }>;
  submit: (params: any) => Promise<{ ok: boolean; error?: string }>;
  respond: (params: any) => Promise<{ ok: boolean; error?: string }>;
  onUpdate: (data: T[]) => void;
  onStorageRetire: () => void;
}

export function createSuggestionStateIntegration<T>(deps: SuggestionStateIntegrationDeps<T>) {
  const gate = createSuggestionRefreshGate();
  let hasRetired = false;

  const performRefresh = async (auth: AuthOwnership) => {
    const req = gate.beginRequest(auth);
    const result = await deps.load();
    
    if (gate.isRequestValid(req)) {
      if (result.ok && result.data) {
        deps.onUpdate(result.data);
        
        if (!hasRetired && result.data.length === 0) {
          deps.onStorageRetire();
          hasRetired = true;
        } else if (!hasRetired && result.data.length > 0) {
          deps.onStorageRetire();
          hasRetired = true;
        }
      }
    }
    return result;
  };

  const handleMutation = async (auth: AuthOwnership, mutationResult: { ok: boolean; error?: string }) => {
    if (!mutationResult.ok) return mutationResult;
    
    const refreshRes = await performRefresh(auth);
    if (!refreshRes.ok) {
      return { ok: true, refreshPending: true };
    }
    return { ok: true };
  };

  return {
    performRefresh,
    submit: async (auth: AuthOwnership, params: any) => handleMutation(auth, await deps.submit(params)),
    respond: async (auth: AuthOwnership, params: any) => handleMutation(auth, await deps.respond(params)),
    clear: () => gate.clear()
  };
}
