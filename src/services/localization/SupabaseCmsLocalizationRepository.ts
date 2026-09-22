import {
  type CmsLocalizationRepository,
  CmsLocalizationRepositoryError,
  type SaveLocalizationOptions,
} from '../../domain/cmsLocalizationRepository.ts';
import {
  type CmsTarget,
  type LocalizedCmsLocale,
  type CmsLocalizationRecord,
  type JsonValue,
  isLocalizedCmsLocale,
} from '../../domain/cmsLocalization.ts';
import {
  mapRowToRecord,
  mapRecordToRow,
  type CmsLocalizationRow,
} from '../../domain/cmsLocalizationMapping.ts';

// Minimal duck-typed query client interface for testing and dependency injection
export interface CmsLocalizationQueryClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc?(fn: string, args?: Record<string, unknown>): PromiseLike<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    error: {
      code?: string;
      message: string;
      details?: string;
      hint?: string;
    } | null;
  }>;
}

export class SupabaseCmsLocalizationRepository implements CmsLocalizationRepository {
  private client: CmsLocalizationQueryClient | null;

  constructor(client?: CmsLocalizationQueryClient) {
    this.client = client ?? null;
  }

  private async getClient(): Promise<CmsLocalizationQueryClient> {
    if (this.client) return this.client;
    const mod = await import('../../lib/supabase.ts');
    this.client = mod.supabase as unknown as CmsLocalizationQueryClient;
    return this.client;
  }

  private assertSupportedLocalizedLocale(
    locale: unknown,
  ): asserts locale is LocalizedCmsLocale {
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
    existing: CmsLocalizationRecord<unknown> | null,
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
      String(existing.sourceVersion) !== String(options.expectedVersion)
    ) {
      throw new CmsLocalizationRepositoryError(
        'CONFLICT',
        `Optimistic concurrency failure: expected sourceVersion "${options.expectedVersion}", found "${existing.sourceVersion}".`,
      );
    }
  }

  private assertCommitteeWriteContext(
    options?: SaveLocalizationOptions,
  ): asserts options is Required<Pick<SaveLocalizationOptions, 'committeeId'>> {
    if (!options?.committeeId) {
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        'Committee localization writes require a committeeId (options.committeeId) to scope the server-enforced RPC.',
      );
    }
  }

  // --- Published Operations ---

  public async getPublished<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null> {
    this.assertSupportedLocalizedLocale(locale);
    const targetKey = target.trim();
    const client = await this.getClient();

    try {
      const { data, error } = await client
        .from('cms_localizations')
        .select('*')
        .eq('target', targetKey)
        .eq('locale', locale)
        .eq('partition', 'published')
        .maybeSingle();

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to get published localization: ${error.message}`,
        );
      }

      if (!data) return null;
      return mapRowToRecord<T>(data as CmsLocalizationRow);
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
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
    const client = await this.getClient();

    try {
      const targetKey = record.target.trim();
      const isCommittees = targetKey === 'committees';

      if (options) {
        const existing = await this.getPublished<T>(record.target, record.locale);
        this.verifyConcurrency(existing, options);
      }

      // Committee localization publishes go exclusively through the narrow,
      // server-enforced RPC so every write is scoped to the acting editor's
      // current executive assignment (never the broad table upsert).
      if (isCommittees) {
        this.assertCommitteeWriteContext(options);
        if (typeof client.rpc !== 'function') {
          throw new CmsLocalizationRepositoryError(
            'UNKNOWN',
            'Committee localization saves require an RPC-capable query client.',
          );
        }
        const { error } = await client.rpc('publish_own_committee_localization', {
          p_committee_id: options.committeeId,
          p_locale: record.locale,
          p_localized_committees: record.payload,
          p_source_hash: record.sourceHash ?? null,
        });
        if (error) {
          if (import.meta.env?.DEV) {
            console.error('[VISION_GOALS_TRANSLATION_ERROR]', {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint,
            });
          }
          throw new CmsLocalizationRepositoryError(
            'UNKNOWN',
            `Failed to save published committee localization: ${error.message}`,
          );
        }
        return record;
      }

      const row = mapRecordToRow(record, 'published');
      const { data, error } = await client
        .from('cms_localizations')
        .upsert(row, { onConflict: 'target,locale,partition' })
        .select()
        .single();

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to save published localization: ${error.message}`,
        );
      }

      return mapRowToRecord<T>(data as CmsLocalizationRow);
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  public async deletePublished(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<boolean> {
    this.assertSupportedLocalizedLocale(locale);
    const client = await this.getClient();

    try {
      const { error } = await client
        .from('cms_localizations')
        .delete()
        .eq('target', target.trim())
        .eq('locale', locale)
        .eq('partition', 'published');

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to delete published localization: ${error.message}`,
        );
      }

      return true;
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // --- Draft Operations ---

  public async getDraft<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null> {
    this.assertSupportedLocalizedLocale(locale);
    const targetKey = target.trim();
    const client = await this.getClient();

    try {
      const { data, error } = await client
        .from('cms_localizations')
        .select('*')
        .eq('target', targetKey)
        .eq('locale', locale)
        .eq('partition', 'draft')
        .maybeSingle();

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to get draft localization: ${error.message}`,
        );
      }

      if (!data) return null;
      return mapRowToRecord<T>(data as CmsLocalizationRow);
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  public async saveDraft<T = JsonValue>(
    record: CmsLocalizationRecord<T>,
    options?: SaveLocalizationOptions,
  ): Promise<CmsLocalizationRecord<T>> {
    this.assertSupportedLocalizedLocale(record.locale);
    const client = await this.getClient();

    try {
      const targetKey = record.target.trim();
      const isCommittees = targetKey === 'committees';

      if (options) {
        const existing = await this.getDraft<T>(record.target, record.locale);
        this.verifyConcurrency(existing, options);
      }

      // Committee localization drafts go exclusively through the narrow,
      // server-enforced RPC so every write is scoped to the acting editor's
      // current executive assignment (never the broad table upsert).
      if (isCommittees) {
        this.assertCommitteeWriteContext(options);
        if (typeof client.rpc !== 'function') {
          throw new CmsLocalizationRepositoryError(
            'UNKNOWN',
            'Committee localization saves require an RPC-capable query client.',
          );
        }
        const { error } = await client.rpc('save_own_committee_draft_localization', {
          p_committee_id: options.committeeId,
          p_locale: record.locale,
          p_localized_committees: record.payload,
          p_source_hash: record.sourceHash ?? null,
        });
        if (error) {
          throw new CmsLocalizationRepositoryError(
            'UNKNOWN',
            `Failed to save committee localization draft: ${error.message}`,
          );
        }
        return record;
      }

      const row = mapRecordToRow(record, 'draft');
      const { data, error } = await client
        .from('cms_localizations')
        .upsert(row, { onConflict: 'target,locale,partition' })
        .select()
        .single();

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to save draft localization: ${error.message}`,
        );
      }

      return mapRowToRecord<T>(data as CmsLocalizationRow);
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  public async deleteDraft(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
    options?: SaveLocalizationOptions,
  ): Promise<boolean> {
    this.assertSupportedLocalizedLocale(locale);
    const client = await this.getClient();

    try {
      const targetKey = target.trim();
      const isCommittees = targetKey === 'committees';

      // Committee localization draft removal goes exclusively through the
      // narrow, server-enforced RPC for the owning committee partition.
      if (isCommittees) {
        this.assertCommitteeWriteContext(options);
        if (typeof client.rpc !== 'function') {
          throw new CmsLocalizationRepositoryError(
            'UNKNOWN',
            'Committee localization writes require an RPC-capable query client.',
          );
        }
        const { error } = await client.rpc('delete_own_committee_draft_localization', {
          p_committee_id: options.committeeId,
          p_locale: locale,
        });
        if (error) {
          throw new CmsLocalizationRepositoryError(
            'UNKNOWN',
            `Failed to delete committee localization draft: ${error.message}`,
          );
        }
        return true;
      }

      const { error } = await client
        .from('cms_localizations')
        .delete()
        .eq('target', targetKey)
        .eq('locale', locale)
        .eq('partition', 'draft');

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to delete draft localization: ${error.message}`,
        );
      }

      return true;
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
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

    const client = await this.getClient();

    try {
      // Use the secure server-enforced RPC when available on Supabase client
      if (typeof client.rpc === 'function') {
        const { error } = await client.rpc('publish_event_localization', {
          p_event_id: trimmedId,
          p_locale: locale,
          p_translation: translation,
        });

        if (error) {
          throw new CmsLocalizationRepositoryError(
            'UNKNOWN',
            `Failed to publish event localization: ${error.message}`,
          );
        }
        return;
      }

      // Fallback for mock/test query clients lacking .rpc
      const existing = await this.getPublished<Record<string, unknown>[]>('events', locale);
      const pubList = Array.isArray(existing?.payload)
        ? JSON.parse(JSON.stringify(existing.payload))
        : [];
      const sanitized: Record<string, unknown> = { id: trimmedId };
      if (translation.title?.trim()) sanitized.title = translation.title.trim();
      if (translation.description?.trim()) sanitized.description = translation.description.trim();
      if (translation.location?.trim()) sanitized.location = translation.location.trim();

      const idx = pubList.findIndex((item: Record<string, unknown>) => item && typeof item === 'object' && item.id === trimmedId);
      if (idx >= 0) {
        pubList[idx] = { ...pubList[idx], ...sanitized };
      } else {
        pubList.push(sanitized);
      }

      const manualPaths = existing?.manualPaths ? [...existing.manualPaths] : [];
      const pathToAdd = `${trimmedId}.title`;
      if (!manualPaths.includes(pathToAdd)) {
        manualPaths.push(pathToAdd);
      }

      await this.savePublished({
        target: 'events',
        locale,
        payload: pubList as unknown as JsonValue,
        status: 'fresh',
        manualPaths,
        stalePaths: existing?.stalePaths ? existing.stalePaths.filter((p) => p !== pathToAdd) : [],
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
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

    try {
      const client = await this.getClient();

      if (typeof client.rpc === 'function') {
        const { error } = await client.rpc('publish_owned_gallery_album_localization', {
          p_album_id: trimmedId,
          p_locale: locale,
          p_translation: translation,
        });

        if (error) {
          throw new CmsLocalizationRepositoryError(
            'UNKNOWN',
            `Failed to publish album localization: ${error.message}`,
          );
        }
        return;
      }

      // Fallback for mock/test query clients lacking .rpc
      const existing = await this.getPublished<Record<string, unknown>[]>('galleryAlbums', locale);
      const pubList = Array.isArray(existing?.payload)
        ? JSON.parse(JSON.stringify(existing.payload))
        : [];
      const sanitized: Record<string, unknown> = { id: trimmedId };
      if (translation.title?.trim()) sanitized.title = translation.title.trim();
      if (translation.description?.trim()) sanitized.description = translation.description.trim();
      if (translation.location?.trim()) sanitized.location = translation.location.trim();

      const idx = pubList.findIndex((item: Record<string, unknown>) => item && typeof item === 'object' && item.id === trimmedId);
      if (idx >= 0) {
        pubList[idx] = { ...pubList[idx], ...sanitized };
      } else {
        pubList.push(sanitized);
      }

      const manualPaths = existing?.manualPaths ? [...existing.manualPaths] : [];
      const pathToAdd = `${trimmedId}.title`;
      if (!manualPaths.includes(pathToAdd)) {
        manualPaths.push(pathToAdd);
      }

      await this.savePublished({
        target: 'galleryAlbums',
        locale,
        payload: pubList as unknown as JsonValue,
        status: 'fresh',
        manualPaths,
        stalePaths: existing?.stalePaths ? existing.stalePaths.filter((p) => p !== pathToAdd) : [],
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        `Failed to save album localization fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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

    try {
      const client = await this.getClient();

      if (typeof client.rpc === 'function') {
        const { error } = await client.rpc('publish_owned_gallery_media_localization', {
          p_album_id: trimmedAlbumId,
          p_media_id: trimmedMediaId,
          p_locale: locale,
          p_translation: translation,
        });

        if (error) {
          throw new CmsLocalizationRepositoryError(
            'UNKNOWN',
            `Failed to publish media localization: ${error.message}`,
          );
        }
        return;
      }

      // Fallback for mock/test query clients lacking .rpc
      const existing = await this.getPublished<Record<string, unknown>[]>('galleryAlbums', locale);
      const pubList = Array.isArray(existing?.payload)
        ? JSON.parse(JSON.stringify(existing.payload))
        : [];
      const sanitized: Record<string, unknown> = { id: trimmedMediaId };
      if (translation.caption?.trim()) sanitized.caption = translation.caption.trim();

      const albumIdx = pubList.findIndex((item: Record<string, unknown>) => item && typeof item === 'object' && item.id === trimmedAlbumId);
      if (albumIdx >= 0) {
        const album = pubList[albumIdx] as { media?: Record<string, unknown>[] };
        const mediaArray = Array.isArray(album.media) ? album.media : [];
        const mediaIdx = mediaArray.findIndex((m) => m && typeof m === 'object' && m.id === trimmedMediaId);
        if (mediaIdx >= 0) {
          mediaArray[mediaIdx] = { ...mediaArray[mediaIdx], ...sanitized };
        } else {
          mediaArray.push(sanitized);
        }
        album.media = mediaArray;
      } else {
        pubList.push({
          id: trimmedAlbumId,
          media: [sanitized],
        });
      }

      const manualPaths = existing?.manualPaths ? [...existing.manualPaths] : [];
      const pathToAdd = `${trimmedAlbumId}.media.${trimmedMediaId}.caption`;
      if (!manualPaths.includes(pathToAdd)) {
        manualPaths.push(pathToAdd);
      }

      await this.savePublished({
        target: 'galleryAlbums',
        locale,
        payload: pubList as unknown as JsonValue,
        status: 'fresh',
        manualPaths,
        stalePaths: existing?.stalePaths ? existing.stalePaths.filter((p) => p !== pathToAdd) : [],
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        `Failed to save media localization fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public async listMonitoringRecords(): Promise<CmsLocalizationRecord<JsonValue>[]> {
    const client = await this.getClient();
    try {
      const { data, error } = await client
        .from('cms_localizations')
        .select('*')
        .in('locale', ['tr', 'en']);

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to list monitoring localizations: ${error.message}`,
        );
      }

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map((row: CmsLocalizationRow) => mapRowToRecord(row));
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
