/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
export type FeatureKey =
  | 'admin:events'
  | 'admin:news'
  | 'student:suggestion'
  | 'admin:suggestion-reply'
  | 'admin:inbox-reply'
  | 'admin:board-member'
  | 'admin:board-head'
  | 'admin:board-resp'
  | 'admin:gallery-album'
  | 'admin:gallery-media'
  | 'admin:plan'
  | 'admin:report'
  | 'admin:app-interview'
  | 'admin:guide-reply'
  | 'admin:site-edit'
  | 'admin:profile-edit'
  | 'admin:internal-task'
  | 'admin:member-points'
  | 'admin:profile-general';

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

function isValidUserId(userId: string): boolean {
  return userId.length > 0 && !userId.includes(':');
}

function isValidEntityId(entityId: string): boolean {
  return entityId.length > 0 && !entityId.includes(':') && entityId !== 'create' && entityId !== 'edit';
}

function isValidFeatureSegment(segment: string): boolean {
  return segment.length > 0 && segment !== 'create' && segment !== 'edit';
}

export function parseSessionDraftKey(key: string): ParsedSessionDraftKey | null {
  const parts = key.split(':');
  if (parts.length < 5) return null;
  if (parts[0] !== 'draft' || parts[1] !== 'v1') return null;

  const userId = parts[2];
  if (!isValidUserId(userId)) return null;

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
    if (!isValidEntityId(entityId)) return null;
    featureEndIndex = parts.length - 2;
  } else {
    return null;
  }

  const featureParts = parts.slice(3, featureEndIndex);
  if (featureParts.length === 0) return null;
  for (const seg of featureParts) {
    if (!isValidFeatureSegment(seg)) return null;
  }

  const feature = featureParts.join(':');
  return { userId, feature, mode, entityId };
}

export function buildSessionDraftKey(
  userId: string,
  feature: FeatureKey | (string & {}),
  mode: 'create' | 'edit',
  entityId?: string
): string {
  if (!isValidUserId(userId)) {
    throw new Error('Invalid userId: must not be empty and no colons allowed');
  }
  if (!feature) {
    throw new Error('Feature must not be empty');
  }
  const featureParts = feature.split(':');
  if (featureParts.length === 0) throw new Error('Feature must not be empty');
  for (const seg of featureParts) {
    if (!isValidFeatureSegment(seg)) throw new Error('Invalid feature segment');
  }

  if (mode === 'edit') {
    if (!entityId || !isValidEntityId(entityId)) {
      throw new Error('Invalid entityId for edit mode');
    }
  } else if (mode === 'create') {
    if (entityId) {
      throw new Error('entityId must not be provided for create mode');
    }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPlainObject(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const proto = Object.getPrototypeOf(obj);
  return proto === Object.prototype || proto === null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      if (!isPlainObject(value)) return false;
      for (const k of Object.keys(value)) {
        if (!ensureJsonSafe(value[k], seen)) return false;
      }
    }
    seen.delete(value);
    return true;
  }
  return false;
}

function validateSessionDraftEnvelopeForKey(key: string, data: any): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (data.version !== 1) return false;
  if (data.key !== key) return false;
  if (typeof data.userId !== 'string' || data.userId === '') return false;

  const parsedKey = parseSessionDraftKey(key);
  if (!parsedKey || parsedKey.userId !== data.userId) return false;

  if (typeof data.updatedAt !== 'string') return false;
  const time = Date.parse(data.updatedAt);
  if (!Number.isFinite(time)) return false;

  if (typeof data.open !== 'boolean') return false;
  if (typeof data.dirty !== 'boolean') return false;
  if (data.value === undefined) return false;
  if (!ensureJsonSafe(data.value, new Set())) return false;

  if (data.baselineFingerprint !== undefined && typeof data.baselineFingerprint !== 'string') {
    return false;
  }

  if (data.ui !== undefined) {
    if (typeof data.ui !== 'object' || Array.isArray(data.ui)) return false;
    if (data.ui.activeLocale !== undefined && !['ar', 'tr', 'en'].includes(data.ui.activeLocale)) return false;
    if (data.ui.activeTab !== undefined && typeof data.ui.activeTab !== 'string') return false;
    if (data.ui.fileReselectionRequired !== undefined && typeof data.ui.fileReselectionRequired !== 'boolean') return false;
  }

  return true;
}

export function saveSessionDraft<T>(key: string, envelope: SessionDraftEnvelope<T>): boolean {
  try {
    if (!validateSessionDraftEnvelopeForKey(key, envelope)) {
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
    if (!validateSessionDraftEnvelopeForKey(key, data)) return null;
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
    if (!isValidUserId(userId)) return;
    const prefix = `draft:v1:${userId}:`;
    let len: number;
    try {
      len = sessionStorage.length;
    } catch { return; }

    const keysToRemove: string[] = [];
    for (let i = 0; i < len; i++) {
      let key: string | null = null;
      try {
        key = sessionStorage.key(i);
      } catch {
        // enumeration failure policy: skip this but don't abort for clearing
        continue;
      }
      if (key && key.startsWith(prefix)) {
        const parsed = parseSessionDraftKey(key);
        // ensure it's exact user, not just string prefix match
        if (parsed && parsed.userId === userId) {
          keysToRemove.push(key);
        }
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

export function findOpenSessionDraft<T>(userId: string, feature: FeatureKey | (string & {})): LocatedSessionDraft<T> | null {
  try {
    if (!isValidUserId(userId)) return null;
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
      } catch {
        // enumeration failure policy: return null if enumeration itself cannot safely proceed
        return null;
      }

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
