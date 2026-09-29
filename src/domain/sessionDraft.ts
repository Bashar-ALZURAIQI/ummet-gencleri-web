export type SessionDraftUiState = {
  activeLocale?: 'ar' | 'tr' | 'en';
  activeTab?: string;
  fileReselectionRequired?: boolean;
};

export interface SessionDraftEnvelope<T> {
  version: 1;
  userId: string;
  key: string;
  updatedAt: string;
  open: boolean;
  dirty: boolean;
  baselineFingerprint?: string;
  value: T;
  ui?: SessionDraftUiState;
}

export type LocatedSessionDraft<T> = {
  key: string;
  mode: 'create' | 'edit';
  entityId?: string;
  envelope: SessionDraftEnvelope<T>;
};

export type ParsedSessionDraftKey = {
  userId: string;
  feature: string;
  mode: 'create' | 'edit';
  entityId?: string;
};

export function parseSessionDraftKey(key: string): ParsedSessionDraftKey | null {
  // grammar: draft:v1:<userId>:<feature>:<mode>[:entityId]
  const parts = key.split(':');
  if (parts.length < 5) return null;
  if (parts[0] !== 'draft' || parts[1] !== 'v1') return null;

  const userId = parts[2];
  if (!userId) return null;

  // mode is always the last part if create, or second to last if edit.
  // wait, feature can contain colons.
  // let's scan from the end.
  const last = parts[parts.length - 1];
  const secondToLast = parts[parts.length - 2];

  let mode: 'create' | 'edit';
  let entityId: string | undefined;
  let featureEndIndex: number;

  if (last === 'create') {
    mode = 'create';
    featureEndIndex = parts.length - 1;
  } else if (secondToLast === 'edit') {
    mode = 'edit';
    entityId = last;
    if (!entityId) return null;
    featureEndIndex = parts.length - 2;
  } else {
    return null; // Unknown mode or malformed
  }

  const featureParts = parts.slice(3, featureEndIndex);
  if (featureParts.length === 0) return null;

  const feature = featureParts.join(':');

  return { userId, feature, mode, entityId };
}

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

function isUnsupportedRuntimeValue(val: any): boolean {
  if (val === undefined) return true;
  if (typeof val === 'function') return true;
  if (typeof val === 'symbol') return true;
  if (typeof val === 'bigint') return true;
  if (typeof val === 'number' && !Number.isFinite(val)) return true;
  if (typeof Promise !== 'undefined' && val instanceof Promise) return true;
  if (typeof File !== 'undefined' && val instanceof File) return true;
  if (typeof Blob !== 'undefined' && val instanceof Blob) return true;
  if (typeof AbortController !== 'undefined' && val instanceof AbortController) return true;
  if (typeof Node !== 'undefined' && val instanceof Node) return true;
  return false;
}

function ensureJsonSafe(value: any, seen: Set<any>): boolean {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
    return true;
  }
  if (isUnsupportedRuntimeValue(value)) return false;

  if (typeof value === 'object') {
    if (seen.has(value)) return false; // Cyclic
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!ensureJsonSafe(item, seen)) return false;
      }
    } else {
      for (const k of Object.keys(value)) {
        if (!ensureJsonSafe(value[k], seen)) return false;
      }
    }
    seen.delete(value);
    return true;
  }
  return false;
}

export function saveSessionDraft<T>(key: string, envelope: SessionDraftEnvelope<T>): boolean {
  try {
    if (!ensureJsonSafe(envelope, new Set())) {
      return false;
    }
    const json = JSON.stringify(envelope);
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

    // Validate Envelope Shape
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.version !== 1) return null;
    if (data.key !== key) return null;
    if (typeof data.userId !== 'string' || data.userId === '') return null;

    const parsedKey = parseSessionDraftKey(key);
    if (!parsedKey || parsedKey.userId !== data.userId) return null;

    if (typeof data.updatedAt !== 'string') return null;
    const time = Date.parse(data.updatedAt);
    if (!Number.isFinite(time)) return null;

    if (typeof data.open !== 'boolean') return null;
    if (typeof data.dirty !== 'boolean') return null;
    if (data.value === undefined) return null;
    if (!ensureJsonSafe(data.value, new Set())) return null;

    if (data.baselineFingerprint !== undefined && typeof data.baselineFingerprint !== 'string') {
      return null;
    }

    if (data.ui !== undefined) {
      if (typeof data.ui !== 'object' || Array.isArray(data.ui)) return null;
      if (data.ui.activeLocale !== undefined && !['ar', 'tr', 'en'].includes(data.ui.activeLocale)) return null;
      if (data.ui.activeTab !== undefined && typeof data.ui.activeTab !== 'string') return null;
      if (data.ui.fileReselectionRequired !== undefined && typeof data.ui.fileReselectionRequired !== 'boolean') return null;
    }

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
    if (userId.includes(':')) return; // delimiter safety
    const prefix = `draft:v1:${userId}:`;
    let len: number;
    try {
      len = sessionStorage.length;
    } catch { return; }

    const keysToRemove: string[] = [];
    for (let i = 0; i < len; i++) {
      try {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const parsed = parseSessionDraftKey(key);
          // ensure it's exact user, not just string prefix match
          if (parsed && parsed.userId === userId) {
            keysToRemove.push(key);
          }
        }
      } catch {
        continue;
      }
    }
    for (const k of keysToRemove) {
      try {
        sessionStorage.removeItem(k);
      } catch {
        // Ignore individual failures
      }
    }
  } catch (err) {
    // Ignore
  }
}

export function findOpenSessionDraft<T>(userId: string, feature: string): LocatedSessionDraft<T> | null {
  try {
    if (userId.includes(':')) return null;
    const prefix = `draft:v1:${userId}:${feature}:`;
    let len: number;
    try {
      len = sessionStorage.length;
    } catch { return null; }

    const openDrafts: LocatedSessionDraft<T>[] = [];

    for (let i = 0; i < len; i++) {
      let key: string | null = null;
      try {
        key = sessionStorage.key(i);
      } catch { continue; }

      if (key && key.startsWith(prefix)) {
        const parsedKey = parseSessionDraftKey(key);
        if (parsedKey && parsedKey.userId === userId && parsedKey.feature === feature) {
          const envelope = loadSessionDraft<T>(key);
          if (envelope && envelope.open) {
            openDrafts.push({
              key,
              mode: parsedKey.mode,
              entityId: parsedKey.entityId,
              envelope
            });
          }
        }
      }
    }

    if (openDrafts.length === 0) return null;

    openDrafts.sort((a, b) => {
      const timeA = Date.parse(a.envelope.updatedAt);
      const timeB = Date.parse(b.envelope.updatedAt);
      if (timeA !== timeB) return timeB - timeA; // Descending
      return a.key.localeCompare(b.key);
    });

    const winner = openDrafts[0];

    // Normalize older drafts to open: false
    for (let i = 1; i < openDrafts.length; i++) {
      const older = openDrafts[i];
      // Do not mutate older.envelope before saving
      const closedEnvelope = { ...older.envelope, open: false };
      saveSessionDraft(older.key, closedEnvelope);
    }

    return winner;
  } catch (err) {
    return null;
  }
}
