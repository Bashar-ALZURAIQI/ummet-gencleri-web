-- Migration: 20260921130000_owned_gallery_localization_publish
-- Description: RPCs for executive-owned Gallery album/media localization publishing

BEGIN;

CREATE OR REPLACE FUNCTION public.publish_owned_gallery_album_localization(
  p_album_id text,
  p_locale text,
  p_translation jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_is_president boolean;
  v_album_id text := NULLIF(btrim(p_album_id), '');
  v_albums jsonb;
  v_canonical_album jsonb;
  v_current_payload jsonb;
  v_updated_payload jsonb;
  v_sanitized_translation jsonb;
  v_existing_row public.cms_localizations%ROWTYPE;
  v_matched boolean := false;
  v_manual_paths text[];
BEGIN
  -- 1. Authentication check
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may publish gallery localizations';
  END IF;

  v_is_president := (SELECT private.is_current_president());

  -- 2. Input validation
  IF v_album_id IS NULL OR char_length(v_album_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid album id is required';
  END IF;

  IF p_locale NOT IN ('tr', 'en') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid locale (tr or en) is required';
  END IF;

  IF p_translation IS NULL OR jsonb_typeof(p_translation) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid translation object is required';
  END IF;

  -- 3. Canonical album existence check in published_site_content
  SELECT CASE
    WHEN jsonb_typeof(published.content -> 'galleryAlbums') = 'array'
      THEN published.content -> 'galleryAlbums'
    ELSE '[]'::jsonb
  END
  INTO v_albums
  FROM public.published_site_content AS published
  WHERE published.id = 'main';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Published site content is not initialized';
  END IF;

  SELECT album_item
  INTO v_canonical_album
  FROM jsonb_array_elements(v_albums) AS album_item
  WHERE album_item ->> 'id' = v_album_id
  LIMIT 1;

  IF v_canonical_album IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Album not found in published galleryAlbums';
  END IF;

  -- 4. Authorization check for non-president
  IF NOT v_is_president THEN
    IF NOT EXISTS (
      SELECT 1
      FROM private.gallery_album_ownership ownership
      WHERE ownership.album_id = v_album_id
        AND ownership.owner_user_id = v_actor_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to localize albums created by another executive';
    END IF;
  END IF;

  -- 5. Sanitize translation fields (allow only title, description, location)
  v_sanitized_translation := jsonb_build_object('id', v_album_id);
  IF p_translation ? 'title' AND NULLIF(btrim(p_translation ->> 'title'), '') IS NOT NULL THEN
    v_sanitized_translation := v_sanitized_translation || jsonb_build_object('title', btrim(p_translation ->> 'title'));
  END IF;
  IF p_translation ? 'description' AND NULLIF(btrim(p_translation ->> 'description'), '') IS NOT NULL THEN
    v_sanitized_translation := v_sanitized_translation || jsonb_build_object('description', btrim(p_translation ->> 'description'));
  END IF;
  IF p_translation ? 'location' AND NULLIF(btrim(p_translation ->> 'location'), '') IS NOT NULL THEN
    v_sanitized_translation := v_sanitized_translation || jsonb_build_object('location', btrim(p_translation ->> 'location'));
  END IF;

  IF (v_sanitized_translation - 'id') = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Translation must contain at least one non-empty translated field (title, description, or location)';
  END IF;

  -- 6. Lock and merge into published cms_localizations
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cms_localizations_galleryAlbums_' || p_locale, 0)
  );

  SELECT *
  INTO v_existing_row
  FROM public.cms_localizations
  WHERE target = 'galleryAlbums'
    AND locale = p_locale
    AND partition = 'published'
  FOR UPDATE;

  IF FOUND THEN
    v_current_payload := CASE
      WHEN jsonb_typeof(v_existing_row.payload) = 'array' THEN v_existing_row.payload
      ELSE '[]'::jsonb
    END;

    -- Build updated payload: update the matching element or append if not present
    SELECT jsonb_agg(
      CASE
        WHEN item ->> 'id' = v_album_id THEN
          -- Merge existing album translation with the sanitized fields, but we only sanitize album level here.
          -- We must PRESERVE media translations inside the existing album translation!
          CASE
            WHEN jsonb_typeof(item) = 'object' THEN
              item || v_sanitized_translation
            ELSE
              v_sanitized_translation
          END
        ELSE item
      END
    )
    INTO v_updated_payload
    FROM jsonb_array_elements(v_current_payload) AS item;

    -- Check if element existed
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_current_payload) AS item
      WHERE item ->> 'id' = v_album_id
    ) INTO v_matched;

    IF NOT v_matched THEN
      v_updated_payload := COALESCE(v_updated_payload, '[]'::jsonb) || jsonb_build_array(v_sanitized_translation);
    END IF;

    -- Prepare manual_paths and remove from stale_paths for supplied fields
    v_manual_paths := v_existing_row.manual_paths;
    IF v_sanitized_translation ? 'title' AND NOT (v_album_id || '.title' = ANY(v_manual_paths)) THEN
      v_manual_paths := array_append(v_manual_paths, v_album_id || '.title');
    END IF;
    IF v_sanitized_translation ? 'description' AND NOT (v_album_id || '.description' = ANY(v_manual_paths)) THEN
      v_manual_paths := array_append(v_manual_paths, v_album_id || '.description');
    END IF;
    IF v_sanitized_translation ? 'location' AND NOT (v_album_id || '.location' = ANY(v_manual_paths)) THEN
      v_manual_paths := array_append(v_manual_paths, v_album_id || '.location');
    END IF;

    UPDATE public.cms_localizations
    SET payload = v_updated_payload,
        status = 'fresh',
        manual_paths = v_manual_paths,
        stale_paths = (
          SELECT array_agg(p)
          FROM unnest(stale_paths) p
          WHERE (NOT (v_sanitized_translation ? 'title') OR p <> v_album_id || '.title')
            AND (NOT (v_sanitized_translation ? 'description') OR p <> v_album_id || '.description')
            AND (NOT (v_sanitized_translation ? 'location') OR p <> v_album_id || '.location')
        ),
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_existing_row.id;

  ELSE
    v_updated_payload := jsonb_build_array(v_sanitized_translation);
    v_manual_paths := ARRAY[]::text[];
    IF v_sanitized_translation ? 'title' THEN v_manual_paths := array_append(v_manual_paths, v_album_id || '.title'); END IF;
    IF v_sanitized_translation ? 'description' THEN v_manual_paths := array_append(v_manual_paths, v_album_id || '.description'); END IF;
    IF v_sanitized_translation ? 'location' THEN v_manual_paths := array_append(v_manual_paths, v_album_id || '.location'); END IF;

    INSERT INTO public.cms_localizations (
      target, locale, partition, payload, status,
      manual_paths, stale_paths, updated_at, updated_by
    ) VALUES (
      'galleryAlbums', p_locale, 'published', v_updated_payload, 'fresh',
      v_manual_paths, '{}'::text[], now(), v_actor_id::text
    );
  END IF;

  -- 7. Post-execution sanity check
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Executive authority changed';
  END IF;

  RETURN jsonb_build_object(
    'target', 'galleryAlbums',
    'locale', p_locale,
    'partition', 'published',
    'albumId', v_album_id,
    'status', 'fresh'
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.publish_owned_gallery_media_localization(
  p_album_id text,
  p_media_id text,
  p_locale text,
  p_translation jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_is_president boolean;
  v_album_id text := NULLIF(btrim(p_album_id), '');
  v_media_id text := NULLIF(btrim(p_media_id), '');
  v_albums jsonb;
  v_canonical_album jsonb;
  v_canonical_media jsonb;
  v_current_payload jsonb;
  v_updated_payload jsonb;
  v_sanitized_media_translation jsonb;
  v_existing_row public.cms_localizations%ROWTYPE;
  v_matched_album boolean := false;
  v_matched_media boolean := false;
  v_manual_paths text[];
BEGIN
  -- 1. Authentication check
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may publish gallery media localizations';
  END IF;

  v_is_president := (SELECT private.is_current_president());

  -- 2. Input validation
  IF v_album_id IS NULL OR char_length(v_album_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid album id is required';
  END IF;

  IF v_media_id IS NULL OR char_length(v_media_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid media id is required';
  END IF;

  IF p_locale NOT IN ('tr', 'en') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid locale (tr or en) is required';
  END IF;

  IF p_translation IS NULL OR jsonb_typeof(p_translation) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid translation object is required';
  END IF;

  -- 3. Canonical album existence check in published_site_content
  SELECT CASE
    WHEN jsonb_typeof(published.content -> 'galleryAlbums') = 'array'
      THEN published.content -> 'galleryAlbums'
    ELSE '[]'::jsonb
  END
  INTO v_albums
  FROM public.published_site_content AS published
  WHERE published.id = 'main';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Published site content is not initialized';
  END IF;

  SELECT album_item
  INTO v_canonical_album
  FROM jsonb_array_elements(v_albums) AS album_item
  WHERE album_item ->> 'id' = v_album_id
  LIMIT 1;

  IF v_canonical_album IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Album not found in published galleryAlbums';
  END IF;

  SELECT media_item
  INTO v_canonical_media
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(v_canonical_album -> 'media') = 'array' THEN v_canonical_album -> 'media'
      ELSE '[]'::jsonb
    END
  ) AS media_item
  WHERE media_item ->> 'id' = v_media_id
  LIMIT 1;

  IF v_canonical_media IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Media not found in album';
  END IF;

  -- 4. Authorization check for non-president
  IF NOT v_is_president THEN
    IF NOT EXISTS (
      SELECT 1
      FROM private.gallery_album_ownership ownership
      WHERE ownership.album_id = v_album_id
        AND ownership.owner_user_id = v_actor_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to localize media for albums created by another executive';
    END IF;
  END IF;

  -- 5. Sanitize translation fields (allow only caption)
  v_sanitized_media_translation := jsonb_build_object('id', v_media_id);
  IF p_translation ? 'caption' AND NULLIF(btrim(p_translation ->> 'caption'), '') IS NOT NULL THEN
    v_sanitized_media_translation := v_sanitized_media_translation || jsonb_build_object('caption', btrim(p_translation ->> 'caption'));
  END IF;

  IF (v_sanitized_media_translation - 'id') = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Media translation must contain a non-empty caption';
  END IF;

  -- 6. Lock and merge into published cms_localizations
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cms_localizations_galleryAlbums_' || p_locale, 0)
  );

  SELECT *
  INTO v_existing_row
  FROM public.cms_localizations
  WHERE target = 'galleryAlbums'
    AND locale = p_locale
    AND partition = 'published'
  FOR UPDATE;

  IF FOUND THEN
    v_current_payload := CASE
      WHEN jsonb_typeof(v_existing_row.payload) = 'array' THEN v_existing_row.payload
      ELSE '[]'::jsonb
    END;

    -- Update the matching element or append if not present
    SELECT jsonb_agg(
      CASE
        WHEN item ->> 'id' = v_album_id THEN
          -- We have the album translation object. Let's update its 'media' array.
          jsonb_set(
            item,
            '{media}',
            (
              SELECT jsonb_agg(
                CASE
                  WHEN m_item ->> 'id' = v_media_id THEN
                    CASE
                      WHEN jsonb_typeof(m_item) = 'object' THEN m_item || v_sanitized_media_translation
                      ELSE v_sanitized_media_translation
                    END
                  ELSE m_item
                END
              )
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(item -> 'media') = 'array' THEN item -> 'media'
                  ELSE '[]'::jsonb
                END
              ) AS m_item
            )
          )
        ELSE item
      END
    )
    INTO v_updated_payload
    FROM jsonb_array_elements(v_current_payload) AS item;

    -- But wait, what if the album was found, but the media wasn't in its media array?
    -- And what if the album itself wasn't found in the localization payload at all?
    -- We need to check if the album existed.
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_current_payload) AS item WHERE item ->> 'id' = v_album_id
    ) INTO v_matched_album;

    IF NOT v_matched_album THEN
      -- The album isn't translated yet, so we append the album with ONLY the media translation
      v_updated_payload := COALESCE(v_updated_payload, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'id', v_album_id,
          'media', jsonb_build_array(v_sanitized_media_translation)
        )
      );
    ELSE
      -- Album existed. Did the media exist in its media array?
      -- The above jsonb_agg doesn't append if m_item wasn't found. We need to handle that.
      -- A safer way is to do it in two steps.
      -- Let's extract the album translation
      DECLARE
        v_existing_album_translation jsonb;
        v_existing_media_array jsonb;
        v_new_media_array jsonb;
      BEGIN
        SELECT item INTO v_existing_album_translation
        FROM jsonb_array_elements(v_current_payload) AS item
        WHERE item ->> 'id' = v_album_id;

        v_existing_media_array := CASE
          WHEN jsonb_typeof(v_existing_album_translation -> 'media') = 'array'
          THEN v_existing_album_translation -> 'media'
          ELSE '[]'::jsonb
        END;

        SELECT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_existing_media_array) AS m WHERE m ->> 'id' = v_media_id
        ) INTO v_matched_media;

        IF NOT v_matched_media THEN
          v_new_media_array := v_existing_media_array || jsonb_build_array(v_sanitized_media_translation);
        ELSE
          SELECT jsonb_agg(
            CASE WHEN m ->> 'id' = v_media_id THEN m || v_sanitized_media_translation ELSE m END
          ) INTO v_new_media_array
          FROM jsonb_array_elements(v_existing_media_array) AS m;
        END IF;

        -- Rebuild the whole payload
        SELECT jsonb_agg(
          CASE WHEN item ->> 'id' = v_album_id
          THEN jsonb_set(item, '{media}', v_new_media_array)
          ELSE item END
        ) INTO v_updated_payload
        FROM jsonb_array_elements(v_current_payload) AS item;
      END;
    END IF;

    -- Prepare manual_paths
    v_manual_paths := v_existing_row.manual_paths;
    IF NOT (v_album_id || '.media.' || v_media_id || '.caption' = ANY(v_manual_paths)) THEN
      v_manual_paths := array_append(v_manual_paths, v_album_id || '.media.' || v_media_id || '.caption');
    END IF;

    UPDATE public.cms_localizations
    SET payload = v_updated_payload,
        status = 'fresh',
        manual_paths = v_manual_paths,
        stale_paths = array_remove(stale_paths, v_album_id || '.media.' || v_media_id || '.caption'),
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_existing_row.id;

  ELSE
    v_updated_payload := jsonb_build_array(
      jsonb_build_object(
        'id', v_album_id,
        'media', jsonb_build_array(v_sanitized_media_translation)
      )
    );
    v_manual_paths := ARRAY[v_album_id || '.media.' || v_media_id || '.caption'];

    INSERT INTO public.cms_localizations (
      target, locale, partition, payload, status,
      manual_paths, stale_paths, updated_at, updated_by
    ) VALUES (
      'galleryAlbums', p_locale, 'published', v_updated_payload, 'fresh',
      v_manual_paths, '{}'::text[], now(), v_actor_id::text
    );
  END IF;

  -- 7. Post-execution sanity check
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Executive authority changed';
  END IF;

  RETURN jsonb_build_object(
    'target', 'galleryAlbums',
    'locale', p_locale,
    'partition', 'published',
    'albumId', v_album_id,
    'mediaId', v_media_id,
    'status', 'fresh'
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.publish_owned_gallery_album_localization(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_owned_gallery_album_localization(text, text, jsonb)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.publish_owned_gallery_media_localization(text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_owned_gallery_media_localization(text, text, text, jsonb)
  TO authenticated;

COMMIT;
