/**
 * CMS Localization Repository Contract and In-Memory Adapter (Task 7B)
 *
 * Core architectural principles:
 * - Arabic ('ar') is the canonical source and is NEVER stored or managed in this repository.
 * - Only localized target overlays ('tr', 'en') may be stored or queried.
 * - Published and draft records are strictly isolated into distinct storage partitions.
 * - Public reads only access published records; drafts are never returned to public resolution.
 * - Stale translations remain preserved and readable by public callers.
 * - In-memory adapter deep-clones all inputs and outputs to prevent state mutation leaks.
 * - Read orchestration (resolveCmsTargetForLocale) guarantees zero repository calls for Arabic
 *   and gracefully falls back to canonical Arabic if repository reads fail.
 *
 * This module is completely database-independent and contains zero Supabase, React, or UI dependencies.
 */

import { type Locale, isSupportedLocale, DEFAULT_LOCALE } from './locale.ts';
import {
  type CmsTarget,
  type LocalizedCmsLocale,
  type CmsLocalizationRecord,
  type LocalizationResolution,
  type JsonValue,
  isLocalizedCmsLocale,
  resolveCmsLocalization,
  normalizeLocalizationPaths,
} from './cmsLocalization.ts';

// ---------------------------------------------------------------------------
// Error Model
// ---------------------------------------------------------------------------

export type CmsLocalizationRepositoryErrorCode =
  | 'INVALID_LOCALE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNKNOWN';

export class CmsLocalizationRepositoryError extends Error {
  public readonly code: CmsLocalizationRepositoryErrorCode;

  constructor(code: CmsLocalizationRepositoryErrorCode, message: string) {
    super(`[CMS_LOCALIZATION_REPOSITORY] ${code}: ${message}`);
    this.name = 'CmsLocalizationRepositoryError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Concurrency & Write Options
// ---------------------------------------------------------------------------

export interface SaveLocalizationOptions {
  /**
   * Expected existing sourceVersion for optimistic concurrency checking.
   * If provided and does not match existing record, a CONFLICT error is thrown.
   */
  expectedVersion?: string | number;

  /**
   * Expected existing sourceHash for optimistic concurrency checking.
   * If provided and does not match existing record, a CONFLICT error is thrown.
   */
  expectedSourceHash?: string;

  /**
   * Stable id of the committee that owns the localization write.
   *
   * Committee-targeted records are persisted exclusively through narrow,
   * server-enforced RPCs (publish/save/delete own-committee localization) so
   * each write is scoped and verified against the acting editor's current
   * executive assignment. REQUIRED whenever `target === 'committees'`; the
   * Supabase adapter fails closed with an error when it is missing.
   */
  committeeId?: string;
}

// ---------------------------------------------------------------------------
// Repository Contract
// ---------------------------------------------------------------------------

export interface CmsLocalizationRepository {
  /**
   * Retrieves the published localization record for the given target and locale.
   * Returns null if no published record exists.
   */
  getPublished<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null>;

  /**
   * Alias for getPublished, providing public read access.
   */
  getLocalization<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null>;

  /**
   * Persists a published localization record.
   * Arabic records are strictly rejected with an INVALID_LOCALE error.
   */
  savePublished<T = JsonValue>(
    record: CmsLocalizationRecord<T>,
    options?: SaveLocalizationOptions,
  ): Promise<CmsLocalizationRecord<T>>;

  /**
   * Deletes a published localization record.
   * Does NOT affect any existing draft record for the same target and locale.
   */
  deletePublished(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<boolean>;

  /**
   * Retrieves an editorial draft localization record for the given target and locale.
   * Returns null if no draft exists. Drafts are never returned to public resolution.
   */
  getDraft<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null>;

  /**
   * Persists an editorial draft localization record.
   * Arabic records are strictly rejected with an INVALID_LOCALE error.
   */
  saveDraft<T = JsonValue>(
    record: CmsLocalizationRecord<T>,
    options?: SaveLocalizationOptions,
  ): Promise<CmsLocalizationRecord<T>>;

  /**
   * Deletes an editorial draft localization record.
   * Does NOT affect any published record for the same target and locale.
   */
  deleteDraft(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
    options?: SaveLocalizationOptions,
  ): Promise<boolean>;

  /**
   * Scoped publication for a single event's localization.
   * Merges or appends the localized fields for the specified event into the published
   * events overlay without granting broad target-wide overwrite authority.
   */
  publishEventLocalization(
    eventId: string,
    locale: LocalizedCmsLocale,
    translation: { title?: string; description?: string; location?: string },
  ): Promise<void>;

  /**
   * Scoped mutation for an executive to safely overwrite localization of a specific album they own.
   */
  publishOwnedGalleryAlbumLocalization(
    albumId: string,
    locale: LocalizedCmsLocale,
    translation: { title?: string; description?: string; location?: string },
  ): Promise<void>;

  /**
   * Scoped mutation for an executive to safely overwrite localization of a specific event they own.
   */
  publishOwnedEventLocalization(
    eventId: string,
    locale: LocalizedCmsLocale,
    translation: { title?: string; description?: string; location?: string },
  ): Promise<void>;

  /**
   * Scoped mutation for an executive to safely overwrite localization of specific media inside an album they own.
   */
  publishOwnedGalleryMediaLocalization(
    albumId: string,
    mediaId: string,
    locale: LocalizedCmsLocale,
    translation: { caption?: string },
  ): Promise<void>;

  /**
   * Reads all published and draft localization records for 'tr' and 'en'
   * for monitoring and health inspection. Zero writes, read-only.
   */
  listMonitoringRecords(): Promise<CmsLocalizationRecord<JsonValue>[]>;
}

// ---------------------------------------------------------------------------
// Helper: Deep Clone
// ---------------------------------------------------------------------------

function safeClone<V>(val: V): V {
  if (val === null || typeof val !== 'object') return val;
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val));
}

// ---------------------------------------------------------------------------
// In-Memory Repository Implementation
// ---------------------------------------------------------------------------

/**
 * Pure in-memory adapter designed for unit testing and domain verification.
 * Holds published and draft records in separate internal maps, deeply clones
 * all inputs and outputs, and validates locale safety.
 */
export class InMemoryCmsLocalizationRepository implements CmsLocalizationRepository {
  private readonly publishedStore = new Map<string, CmsLocalizationRecord<unknown>>();
  private readonly draftStore = new Map<string, CmsLocalizationRecord<unknown>>();

  private makeKey(target: string, locale: string): string {
    return `${target.trim()}::${locale.trim()}`;
  }

  private assertSupportedLocalizedLocale(locale: unknown): asserts locale is LocalizedCmsLocale {
    if (locale === 'ar') {
      throw new CmsLocalizationRepositoryError(
        'INVALID_LOCALE',
        'Arabic ("ar") is canonical source content and cannot be stored or queried in the localization overlay repository.',
      );
    }
    if (!isLocalizedCmsLocale(locale)) {
      throw new CmsLocalizationRepositoryError(
        'INVALID_LOCALE',
        `Locale "${String(locale)}" is not a supported target locale. Only "tr" and "en" are supported.`,
      );
    }
  }

  private verifyConcurrency(
    existing: CmsLocalizationRecord<unknown> | undefined,
    options?: SaveLocalizationOptions,
  ): void {
    if (!options || !existing) return;

    if (
      options.expectedSourceHash !== undefined &&
      existing.sourceHash !== options.expectedSourceHash
    ) {
      throw new CmsLocalizationRepositoryError(
        'CONFLICT',
        `Optimistic concurrency failure: expected sourceHash "${options.expectedSourceHash}", found "${existing.sourceHash}".`,
      );
    }

    if (
      options.expectedVersion !== undefined &&
      existing.sourceVersion !== options.expectedVersion
    ) {
      throw new CmsLocalizationRepositoryError(
        'CONFLICT',
        `Optimistic concurrency failure: expected sourceVersion "${options.expectedVersion}", found "${existing.sourceVersion}".`,
      );
    }
  }

  // --- Published Operations ---

  public async getPublished<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null> {
    this.assertSupportedLocalizedLocale(locale);
    const key = this.makeKey(target, locale);
    const item = this.publishedStore.get(key);
    if (!item) return null;
    return safeClone(item) as CmsLocalizationRecord<T>;
  }

  public async getLocalization<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null> {
    return this.getPublished<T>(target, locale);
  }

  public async savePublished<T = JsonValue>(
    record: CmsLocalizationRecord<T>,
    options?: SaveLocalizationOptions,
  ): Promise<CmsLocalizationRecord<T>> {
    this.assertSupportedLocalizedLocale(record.locale);
    const key = this.makeKey(record.target, record.locale);

    const existing = this.publishedStore.get(key);
    this.verifyConcurrency(existing, options);

    const clonedRecord: CmsLocalizationRecord<T> = {
      target: record.target,
      locale: record.locale,
      payload: safeClone(record.payload),
      sourceVersion: record.sourceVersion,
      sourceHash: record.sourceHash,
      status: record.status ?? 'fresh',
      stalePaths: normalizeLocalizationPaths(record.stalePaths),
      manualPaths: normalizeLocalizationPaths(record.manualPaths),
      updatedAt: record.updatedAt ?? new Date().toISOString(),
      updatedBy: record.updatedBy,
    };

    this.publishedStore.set(key, clonedRecord as CmsLocalizationRecord<unknown>);
    return safeClone(clonedRecord);
  }

  public async deletePublished(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<boolean> {
    this.assertSupportedLocalizedLocale(locale);
    const key = this.makeKey(target, locale);
    return this.publishedStore.delete(key);
  }

  // --- Draft Operations ---

  public async getDraft<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null> {
    this.assertSupportedLocalizedLocale(locale);
    const key = this.makeKey(target, locale);
    const item = this.draftStore.get(key);
    if (!item) return null;
    return safeClone(item) as CmsLocalizationRecord<T>;
  }

  public async saveDraft<T = JsonValue>(
    record: CmsLocalizationRecord<T>,
    options?: SaveLocalizationOptions,
  ): Promise<CmsLocalizationRecord<T>> {
    this.assertSupportedLocalizedLocale(record.locale);
    const key = this.makeKey(record.target, record.locale);

    const existing = this.draftStore.get(key);
    this.verifyConcurrency(existing, options);

    const clonedDraft: CmsLocalizationRecord<T> = {
      target: record.target,
      locale: record.locale,
      payload: safeClone(record.payload),
      sourceVersion: record.sourceVersion,
      sourceHash: record.sourceHash,
      status: record.status ?? 'draft',
      stalePaths: normalizeLocalizationPaths(record.stalePaths),
      manualPaths: normalizeLocalizationPaths(record.manualPaths),
      updatedAt: record.updatedAt ?? new Date().toISOString(),
      updatedBy: record.updatedBy,
    };

    this.draftStore.set(key, clonedDraft as CmsLocalizationRecord<unknown>);
    return safeClone(clonedDraft);
  }

  public async deleteDraft(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: SaveLocalizationOptions,
  ): Promise<boolean> {
    this.assertSupportedLocalizedLocale(locale);
    const key = this.makeKey(target, locale);
    return this.draftStore.delete(key);
  }

  public async publishEventLocalization(
    eventId: string,
    locale: LocalizedCmsLocale,
    translation: { title?: string; description?: string; location?: string },
  ): Promise<void> {
    this.assertSupportedLocalizedLocale(locale);
    const trimmedId = eventId.trim();
    if (!trimmedId) {
      throw new CmsLocalizationRepositoryError('UNKNOWN', 'Valid eventId is required');
    }

    const key = this.makeKey('events', locale);
    const existing = this.publishedStore.get(key);
    const currentPayload = Array.isArray(existing?.payload)
      ? safeClone(existing.payload as Record<string, unknown>[])
      : [];

    const sanitized: Record<string, unknown> = { id: trimmedId };
    if (translation.title?.trim()) sanitized.title = translation.title.trim();
    if (translation.description?.trim()) sanitized.description = translation.description.trim();
    if (translation.location?.trim()) sanitized.location = translation.location.trim();

    const idx = currentPayload.findIndex((item) => item && typeof item === 'object' && item.id === trimmedId);
    if (idx >= 0) {
      currentPayload[idx] = { ...currentPayload[idx], ...sanitized };
    } else {
      currentPayload.push(sanitized);
    }

    const manualPaths = existing?.manualPaths ? [...existing.manualPaths] : [];
    const pathToAdd = `${trimmedId}.title`;
    if (!manualPaths.includes(pathToAdd)) {
      manualPaths.push(pathToAdd);
    }

    const updatedRecord: CmsLocalizationRecord<unknown> = {
      target: 'events',
      locale,
      payload: currentPayload,
      status: 'fresh',
      manualPaths,
      stalePaths: existing?.stalePaths ? existing.stalePaths.filter((p) => p !== pathToAdd) : [],
      updatedAt: new Date().toISOString(),
    };

    this.publishedStore.set(key, updatedRecord);
  }

  public async publishOwnedEventLocalization(
    eventId: string,
    locale: LocalizedCmsLocale,
    translation: { title?: string; description?: string; location?: string },
  ): Promise<void> {
    // In-memory implementation delegates to the standard publish
    // since there's no real DB owner check anyway.
    return this.publishEventLocalization(eventId, locale, translation);
  }

  public async publishOwnedGalleryAlbumLocalization(
    albumId: string,
    locale: LocalizedCmsLocale,
    translation: { title?: string; description?: string; location?: string },
  ): Promise<void> {
    this.assertSupportedLocalizedLocale(locale);
    const trimmedId = albumId.trim();
    if (!trimmedId) {
      throw new CmsLocalizationRepositoryError('UNKNOWN', 'Valid albumId is required');
    }

    const key = this.makeKey('galleryAlbums', locale);
    const existing = this.publishedStore.get(key);
    const currentPayload = Array.isArray(existing?.payload)
      ? safeClone(existing.payload as Record<string, unknown>[])
      : [];

    const sanitized: Record<string, unknown> = { id: trimmedId };
    if (translation.title?.trim()) sanitized.title = translation.title.trim();
    if (translation.description?.trim()) sanitized.description = translation.description.trim();
    if (translation.location?.trim()) sanitized.location = translation.location.trim();

    const idx = currentPayload.findIndex((item) => item && typeof item === 'object' && item.id === trimmedId);
    if (idx >= 0) {
      currentPayload[idx] = { ...currentPayload[idx], ...sanitized };
    } else {
      currentPayload.push(sanitized);
    }

    const manualPaths = existing?.manualPaths ? [...existing.manualPaths] : [];
    const pathToAdd = `${trimmedId}.title`;
    if (!manualPaths.includes(pathToAdd)) {
      manualPaths.push(pathToAdd);
    }

    const updatedRecord: CmsLocalizationRecord<unknown> = {
      target: 'galleryAlbums',
      locale,
      payload: currentPayload,
      status: 'fresh',
      manualPaths,
      stalePaths: existing?.stalePaths ? existing.stalePaths.filter((p) => p !== pathToAdd) : [],
      updatedAt: new Date().toISOString(),
    };

    this.publishedStore.set(key, updatedRecord);
  }

  public async publishOwnedGalleryMediaLocalization(
    albumId: string,
    mediaId: string,
    locale: LocalizedCmsLocale,
    translation: { caption?: string },
  ): Promise<void> {
    this.assertSupportedLocalizedLocale(locale);
    const trimmedAlbumId = albumId.trim();
    const trimmedMediaId = mediaId.trim();
    if (!trimmedAlbumId || !trimmedMediaId) {
      throw new CmsLocalizationRepositoryError('UNKNOWN', 'Valid albumId and mediaId are required');
    }

    const key = this.makeKey('galleryAlbums', locale);
    const existing = this.publishedStore.get(key);
    const currentPayload = Array.isArray(existing?.payload)
      ? safeClone(existing.payload as Record<string, unknown>[])
      : [];

    const sanitized: Record<string, unknown> = { id: trimmedMediaId };
    if (translation.caption?.trim()) sanitized.caption = translation.caption.trim();

    const albumIdx = currentPayload.findIndex((item) => item && typeof item === 'object' && item.id === trimmedAlbumId);
    if (albumIdx >= 0) {
      const album = currentPayload[albumIdx] as { media?: Record<string, unknown>[] };
      const mediaArray = Array.isArray(album.media) ? album.media : [];
      const mediaIdx = mediaArray.findIndex((m) => m && typeof m === 'object' && m.id === trimmedMediaId);
      if (mediaIdx >= 0) {
        mediaArray[mediaIdx] = { ...mediaArray[mediaIdx], ...sanitized };
      } else {
        mediaArray.push(sanitized);
      }
      album.media = mediaArray;
    } else {
      currentPayload.push({
        id: trimmedAlbumId,
        media: [sanitized],
      });
    }

    const manualPaths = existing?.manualPaths ? [...existing.manualPaths] : [];
    const pathToAdd = `${trimmedAlbumId}.media.${trimmedMediaId}.caption`;
    if (!manualPaths.includes(pathToAdd)) {
      manualPaths.push(pathToAdd);
    }

    const updatedRecord: CmsLocalizationRecord<unknown> = {
      target: 'galleryAlbums',
      locale,
      payload: currentPayload,
      status: 'fresh',
      manualPaths,
      stalePaths: existing?.stalePaths ? existing.stalePaths.filter((p) => p !== pathToAdd) : [],
      updatedAt: new Date().toISOString(),
    };

    this.publishedStore.set(key, updatedRecord);
  }

  public async listMonitoringRecords(): Promise<CmsLocalizationRecord<JsonValue>[]> {
    const records: CmsLocalizationRecord<unknown>[] = [];
    for (const rec of this.publishedStore.values()) {
      const cloned = safeClone(rec);
      cloned.partition = 'published';
      records.push(cloned);
    }
    for (const rec of this.draftStore.values()) {
      const cloned = safeClone(rec);
      cloned.partition = 'draft';
      records.push(cloned);
    }
    return records as CmsLocalizationRecord<JsonValue>[];
  }
}

// ---------------------------------------------------------------------------
// Read Orchestration
// ---------------------------------------------------------------------------

export interface ResolveCmsTargetForLocaleParams<T = JsonValue> {
  repository: Pick<CmsLocalizationRepository, 'getPublished'>;
  target: CmsTarget | string;
  requestedLocale: Locale | string;
  canonicalPayload: T;
}

export interface ResolvedCmsTargetResult<T = JsonValue> extends LocalizationResolution<T> {
  /**
   * Reference to the inner LocalizationResolution for callers that prefer destructuring { resolution }.
   */
  resolution: LocalizationResolution<T>;

  /**
   * Captured repository error if an unexpected failure occurred while reading published localization.
   * Null during normal execution (including ordinary missing translations).
   */
  repositoryError: CmsLocalizationRepositoryError | Error | null;
}

/**
 * Orchestrates CMS content resolution for public viewing:
 *
 * 1. AR request:
 *    - Never accesses the repository.
 *    - Immediately resolves directly from the canonical Arabic payload.
 *
 * 2. TR / EN request:
 *    - Loads only the published localization record from the repository (drafts are never queried).
 *    - Executes resolveCmsLocalization(...) to enforce fallback, stale, and fresh rules.
 *
 * 3. Unexpected repository failure:
 *    - Never crashes the public page.
 *    - Gracefully falls back to canonical Arabic.
 *    - Attaches the repositoryError for logging and operational observability.
 */
export async function resolveCmsTargetForLocale<T = JsonValue>(
  params: ResolveCmsTargetForLocaleParams<T>,
): Promise<ResolvedCmsTargetResult<T>> {
  const { repository, target, requestedLocale, canonicalPayload } = params;

  // Rule 1: Arabic requests always resolve directly from canonical payload without touching repository
  if (requestedLocale === 'ar') {
    const resolution: LocalizationResolution<T> = {
      payload: safeClone(canonicalPayload),
      requestedLocale: 'ar',
      actualLocale: 'ar',
      didFallback: false,
      status: 'fresh',
      stalePaths: [],
      manualPaths: [],
    };

    return {
      ...resolution,
      resolution,
      repositoryError: null,
    };
  }

  // Handle unsupported/unknown locale
  if (!isSupportedLocale(requestedLocale)) {
    const resolution: LocalizationResolution<T> = {
      payload: safeClone(canonicalPayload),
      requestedLocale: DEFAULT_LOCALE,
      actualLocale: 'ar',
      didFallback: true,
      status: 'missing',
      stalePaths: [],
      manualPaths: [],
    };

    return {
      ...resolution,
      resolution,
      repositoryError: null,
    };
  }

  // Rule 2: For TR / EN, query ONLY published localization record from repository
  let publishedRecord: CmsLocalizationRecord<T> | null = null;
  let repositoryError: CmsLocalizationRepositoryError | Error | null = null;

  try {
    publishedRecord = await repository.getPublished<T>(
      target,
      requestedLocale as LocalizedCmsLocale,
    );
  } catch (err) {
    repositoryError = err instanceof Error ? err : new Error(String(err));
  }

  // Rule 3: If repository failed unexpectedly, fall back to canonical Arabic safely with error metadata
  if (repositoryError) {
    const fallbackResolution: LocalizationResolution<T> = {
      payload: safeClone(canonicalPayload),
      requestedLocale: requestedLocale as Locale,
      actualLocale: 'ar',
      didFallback: true,
      status: 'missing',
      stalePaths: [],
      manualPaths: [],
    };

    return {
      ...fallbackResolution,
      resolution: fallbackResolution,
      repositoryError,
    };
  }

  // Rule 4: Run pure domain resolver using published record (or null for missing)
  const resolution = resolveCmsLocalization<T>({
    requestedLocale,
    canonicalPayload,
    localization: publishedRecord,
  });

  return {
    ...resolution,
    resolution,
    repositoryError: null,
  };
}
