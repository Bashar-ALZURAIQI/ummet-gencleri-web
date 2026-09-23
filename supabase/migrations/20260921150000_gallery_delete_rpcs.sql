-- Migration: 20260921150000_gallery_delete_rpcs
-- Description: RPCs for safe deletion of gallery albums and media with localization cleanup

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_owned_gallery_album(
  p_album_id text
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
  v_albums jsonb;
  v_canonical_album jsonb;
  v_updated_albums jsonb;
  v_loc public.cms_localizations%ROWTYPE;
  v_updated_payload jsonb;
BEGIN
  -- 1. Authentication check
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may delete gallery albums';
  END IF;

  v_is_president := (SELECT private.is_current_president());

  -- 2. Input validation
  IF v_album_id IS NULL OR char_length(v_album_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid album id is required';
  END IF;

  -- 3. Canonical album existence
  SELECT CASE
    WHEN jsonb_typeof(published.content -> 'galleryAlbums') = 'array'
      THEN published.content -> 'galleryAlbums'
    ELSE '[]'::jsonb
  END
  INTO v_albums
  FROM public.published_site_content AS published
  WHERE published.id = 'main'
  FOR UPDATE;

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
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to delete albums created by another executive';
    END IF;
  END IF;

  -- 5. Delete from public.published_site_content
  SELECT COALESCE(jsonb_agg(album_item), '[]'::jsonb)
  INTO v_updated_albums
  FROM jsonb_array_elements(v_albums) AS album_item
  WHERE album_item ->> 'id' <> v_album_id;

  UPDATE public.published_site_content
  SET content = jsonb_set(content, '{galleryAlbums}', v_updated_albums),
      updated_at = now()
  WHERE id = 'main';

  -- 6. Delete from private.gallery_album_ownership
  DELETE FROM private.gallery_album_ownership
  WHERE album_id = v_album_id;

  -- 7. Cleanup public.cms_localizations for all locales/partitions
  FOR v_loc IN
    SELECT * FROM public.cms_localizations
    WHERE target = 'galleryAlbums'
  LOOP
    -- Remove the album from the payload array
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO v_updated_payload
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_loc.payload) = 'array' THEN v_loc.payload ELSE '[]'::jsonb END
    ) AS item
    WHERE item ->> 'id' <> v_album_id;

    UPDATE public.cms_localizations
    SET payload = v_updated_payload,
        manual_paths = ARRAY(
          SELECT p FROM unnest(v_loc.manual_paths) p WHERE p NOT LIKE v_album_id || '.%' AND p <> v_album_id
        ),
        stale_paths = ARRAY(
          SELECT p FROM unnest(v_loc.stale_paths) p WHERE p NOT LIKE v_album_id || '.%' AND p <> v_album_id
        ),
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_loc.id;
  END LOOP;

  -- 8. Post-execution sanity check
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Executive authority changed';
  END IF;

  -- Return the deleted album so the caller can clean up Storage files
  RETURN jsonb_build_object(
    'deletedAlbumId', v_album_id,
    'albumData', v_canonical_album
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.delete_owned_gallery_media(
  p_album_id text,
  p_media_id text
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
  v_updated_albums jsonb;
  v_loc public.cms_localizations%ROWTYPE;
  v_updated_payload jsonb;
BEGIN
  -- 1. Authentication check
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may delete gallery media';
  END IF;

  v_is_president := (SELECT private.is_current_president());

  -- 2. Input validation
  IF v_album_id IS NULL OR char_length(v_album_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid album id is required';
  END IF;

  IF v_media_id IS NULL OR char_length(v_media_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid media id is required';
  END IF;

  -- 3. Canonical album existence
  SELECT CASE
    WHEN jsonb_typeof(published.content -> 'galleryAlbums') = 'array'
      THEN published.content -> 'galleryAlbums'
    ELSE '[]'::jsonb
  END
  INTO v_albums
  FROM public.published_site_content AS published
  WHERE published.id = 'main'
  FOR UPDATE;

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
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to delete media from albums created by another executive';
    END IF;
  END IF;

  -- 5. Delete media from public.published_site_content
  SELECT jsonb_agg(
    CASE WHEN album_item ->> 'id' = v_album_id THEN
      jsonb_set(
        album_item,
        '{media}',
        (
          SELECT COALESCE(jsonb_agg(m_item), '[]'::jsonb)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(album_item -> 'media') = 'array' THEN album_item -> 'media' ELSE '[]'::jsonb END
          ) AS m_item
          WHERE m_item ->> 'id' <> v_media_id
        )
      )
    ELSE album_item END
  )
  INTO v_updated_albums
  FROM jsonb_array_elements(v_albums) AS album_item;

  UPDATE public.published_site_content
  SET content = jsonb_set(content, '{galleryAlbums}', v_updated_albums),
      updated_at = now()
  WHERE id = 'main';

  -- 6. Cleanup public.cms_localizations for all locales/partitions
  FOR v_loc IN
    SELECT * FROM public.cms_localizations
    WHERE target = 'galleryAlbums'
  LOOP
    SELECT COALESCE(jsonb_agg(
      CASE WHEN item ->> 'id' = v_album_id THEN
        jsonb_set(
          item,
          '{media}',
          (
            SELECT COALESCE(jsonb_agg(m_item), '[]'::jsonb)
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(item -> 'media') = 'array' THEN item -> 'media' ELSE '[]'::jsonb END
            ) AS m_item
            WHERE m_item ->> 'id' <> v_media_id
          )
        )
      ELSE item END
    ), '[]'::jsonb)
    INTO v_updated_payload
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_loc.payload) = 'array' THEN v_loc.payload ELSE '[]'::jsonb END
    ) AS item;

    UPDATE public.cms_localizations
    SET payload = v_updated_payload,
        manual_paths = ARRAY(
          SELECT p FROM unnest(v_loc.manual_paths) p WHERE p NOT LIKE v_album_id || '.media.' || v_media_id || '.%'
        ),
        stale_paths = ARRAY(
          SELECT p FROM unnest(v_loc.stale_paths) p WHERE p NOT LIKE v_album_id || '.media.' || v_media_id || '.%'
        ),
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_loc.id;
  END LOOP;

  -- 7. Post-execution sanity check
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Executive authority changed';
  END IF;

  RETURN jsonb_build_object(
    'deletedMediaId', v_media_id,
    'mediaData', v_canonical_media
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_owned_gallery_album(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_owned_gallery_album(text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_owned_gallery_media(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_owned_gallery_media(text, text)
  TO authenticated;

COMMIT;
