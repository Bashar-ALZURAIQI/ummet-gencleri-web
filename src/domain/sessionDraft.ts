export interface SessionDraftEnvelope<T> {
  version: 1;
  userId: string;
  key: string;
  updatedAt: string;
  open: boolean;
  dirty: boolean;
  baselineFingerprint?: string;
  value: T;
  ui?: any;
}

export type LocatedSessionDraft<T> = {
  key: string;
  mode: 'create' | 'edit';
  entityId?: string;
  envelope: SessionDraftEnvelope<T>;
};

export function buildSessionDraftKey(
  userId: string,
  feature: string,
  mode: 'create' | 'edit',
  entityId?: string
): string {
  if (userId.includes(':')) {
    throw new Error('Delimiter not allowed in userId');
  }
  if (entityId && entityId.includes(':')) {
    throw new Error('Delimiter not allowed in entityId');
  }

  if (mode === 'edit' && !entityId) {
    throw new Error('entityId is required for edit mode');
  }
  if (mode === 'create' && entityId) {
    throw new Error('entityId must not be provided for create mode');
  }

  const base = `draft:v1:${userId}:${feature}:${mode}`;
  return mode === 'edit' ? `${base}:${entityId}` : base;
}

function safeStringify(value: any): string {
  return JSON.stringify(value, (key, val) => {
    if (val instanceof File || val instanceof Blob || val instanceof Promise) {
      return undefined;
    }
    return val;
  });
}

export function saveSessionDraft<T>(key: string, envelope: SessionDraftEnvelope<T>): boolean {
  try {
    const json = safeStringify(envelope);
    sessionStorage.setItem(key, json);
    return true;
  } catch (err) {
    return false;
  }
}

export function loadSessionDraft<T>(key: string): SessionDraftEnvelope<T> | null {
  try {
    const item = sessionStorage.getItem(key);
    if (!item) return null;
    const data = JSON.parse(item);
    
    // Envelope validation
    if (!data || typeof data !== 'object') return null;
    if (data.version !== 1) return null;
    if (!data.key || data.key !== key) return null;
    if (!data.userId) return null;
    if (typeof data.updatedAt !== 'string') return null;
    if (typeof data.open !== 'boolean') return null;
    if (typeof data.dirty !== 'boolean') return null;
    if (data.value === undefined) return null;

    return data as SessionDraftEnvelope<T>;
  } catch (err) {
    return null;
  }
}

export function removeSessionDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch (err) {
    // Ignore
  }
}

export function clearSessionDraftsForUser(userId: string): void {
  try {
    const prefix = `draft:v1:${userId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
  } catch (err) {
    // Ignore
  }
}
export function findOpenSessionDraft<T>(userId: string, feature: string): LocatedSessionDraft<T> | null {
  try {
    const prefix = `draft:v1:${userId}:${feature}:`;
    const openDrafts: LocatedSessionDraft<T>[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const envelope = loadSessionDraft<T>(key);
        if (envelope && envelope.open) {
          // Parse mode and entityId
          const remaining = key.substring(prefix.length);
          const parts = remaining.split(':');
          
          if (parts[0] === 'create' || parts[0] === 'edit') {
            const mode = parts[0] as 'create' | 'edit';
            const entityId = mode === 'edit' ? parts.slice(1).join(':') : undefined;

            openDrafts.push({
              key,
              mode,
              entityId,
              envelope
            });
          }
        }
      }
    }

    if (openDrafts.length === 0) return null;

    openDrafts.sort((a, b) => {
      const timeA = new Date(a.envelope.updatedAt).getTime();
      const timeB = new Date(b.envelope.updatedAt).getTime();
      if (timeA !== timeB) return timeB - timeA; // Descending
      return a.key.localeCompare(b.key);
    });

    const winner = openDrafts[0];

    // Normalize older drafts to open: false
    for (let i = 1; i < openDrafts.length; i++) {
      const older = openDrafts[i];
      older.envelope.open = false;
      saveSessionDraft(older.key, older.envelope);
    }

    return winner;
  } catch (err) {
    return null;
  }
}
