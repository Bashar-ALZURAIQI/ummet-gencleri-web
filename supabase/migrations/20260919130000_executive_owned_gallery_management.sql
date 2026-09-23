-- Executive-Owned Gallery Management
-- Allows all current executives to create albums and manage their own albums.
-- Private ownership table keeps creator identity server-authoritative.
-- President may manage all albums.
-- Does NOT modify existing applied migrations.

-- ============================================================================
-- 1) Private ownership table for gallery albums
-- ============================================================================

CREATE TABLE IF NOT EXISTS private.gallery_album_ownership (
  album_id text PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.gallery_album_ownership FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- 2) Updated Storage policy: allow ALL executives to upload gallery images
--    (albums folder). Preserves existing event/guide/news/site permissions.
-- ============================================================================

DROP POLICY IF EXISTS "gallery_authorized_insert" ON storage.objects;

CREATE POLICY "gallery_authorized_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gallery'
  AND owner_id = (SELECT auth.uid())::text
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1
    FROM private.current_managed_asset_authorization AS authz
    WHERE
      authz.position_key = 'PRESIDENT'
      OR (
        authz.position_key = 'MEDIA_HEAD'
        AND (
          (upper((string_to_array(name, '/'))[3]) = 'GUIDE')
          OR (string_to_array(name, '/'))[3] IS NULL
          OR (storage.foldername(name))[1] IN ('news', 'albums', 'site', 'videos', 'events', 'documents')
        )
      )
      OR (
        authz.position_key IN (
          'VICE_PRESIDENT',
          'FINANCE_HEAD',
          'AUDIT_HEAD',
          'ACADEMIC_HEAD',
          'ACTIVITIES_HEAD'
        )
        AND (
          (storage.foldername(name))[1] IN ('events', 'albums')
          OR (
            (storage.foldername(name))[1] = 'documents'
            AND (string_to_array(name, '/'))[3] IS NULL
          )
        )
      )
  )
);

-- ============================================================================
-- 3) Updated register_managed_asset: allow all executives to register
--    gallery/albums assets. Preserve all other authorization.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_managed_asset(
  asset_id uuid,
  asset_bucket text,
  asset_path text,
  asset_public_url text,
  asset_kind text,
  asset_area text,
  asset_mime_type text,
  asset_size_bytes bigint
)
RETURNS public.managed_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_row public.managed_assets;
  v_folder text := split_part(asset_path, '/', 1);
  v_is_guide_document boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF asset_id IS NULL OR asset_path IS NULL OR btrim(asset_path) = ''
     OR asset_public_url IS NULL OR btrim(asset_public_url) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Complete asset metadata is required';
  END IF;

  SELECT ea.position_key INTO v_position
  FROM public.executive_assignments AS ea
  WHERE ea.user_id = v_actor_id;

  IF asset_bucket = 'avatars' THEN
    IF asset_area <> 'avatar' OR asset_kind <> 'image' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Avatar metadata is invalid';
    END IF;
    IF split_part(asset_path, '/', 1) <> v_actor_id::text AND v_position <> 'PRESIDENT' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The avatar path is not authorized';
    END IF;
  ELSIF asset_bucket = 'gallery' THEN
    IF split_part(asset_path, '/', 2) <> v_actor_id::text THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The gallery path is not owned by the caller';
    END IF;
    v_is_guide_document :=
      v_folder = 'documents'
      AND upper(split_part(asset_path, '/', 3)) = 'GUIDE';
    IF v_is_guide_document THEN
      IF v_position NOT IN ('PRESIDENT', 'MEDIA_HEAD') THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Guide documents require the Student Guide editor roles';
      END IF;
      IF asset_area <> 'guide' OR asset_kind <> 'document' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Guide document metadata is invalid';
      END IF;
      IF coalesce(cardinality(string_to_array(asset_path, '/')), 0) <> 4
         OR split_part(asset_path, '/', 4) !~* (
           '^' || asset_id::text || '[.](pdf|doc|docx|xls|xlsx|ppt|pptx)$'
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Guide document path must use the marked asset filename';
      END IF;
    ELSE
      IF NOT (
        v_position = 'PRESIDENT'
        OR (v_position = 'MEDIA_HEAD' AND v_folder IN ('news', 'albums', 'site', 'documents', 'videos', 'events'))
        OR (v_position IN ('ACADEMIC_HEAD', 'ACTIVITIES_HEAD') AND v_folder IN ('events', 'documents', 'albums'))
        OR (v_position IN ('VICE_PRESIDENT', 'FINANCE_HEAD', 'AUDIT_HEAD') AND v_folder IN ('events', 'documents', 'albums'))
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The gallery folder is not authorized';
      END IF;
    END IF;
  ELSIF asset_bucket = 'site_assets' THEN
    IF v_position IS DISTINCT FROM 'PRESIDENT' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may register site assets';
    END IF;
    IF v_folder <> 'branding' OR split_part(asset_path, '/', 2) <> v_actor_id::text THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The site asset path is not owned by the caller';
    END IF;
    IF cardinality(string_to_array(asset_path, '/')) <> 3
       OR split_part(asset_path, '/', 3) !~* (
         '^' || asset_id::text || '[.](jpg|jpeg|png|webp)$'
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Site asset path must use the versioned branding filename';
    END IF;
    IF asset_area <> 'site' OR asset_kind <> 'image' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Site asset metadata is invalid';
    END IF;
    IF asset_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Site asset MIME type is invalid';
    END IF;
    IF NOT (
      (asset_mime_type = 'image/jpeg' AND split_part(asset_path, '/', 3) ~* '[.](jpg|jpeg)$')
      OR (asset_mime_type = 'image/png' AND split_part(asset_path, '/', 3) ~* '[.]png$')
      OR (asset_mime_type = 'image/webp' AND split_part(asset_path, '/', 3) ~* '[.]webp$')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Site asset filename extension does not match its MIME type';
    END IF;
    IF asset_size_bytes IS NULL OR asset_size_bytes <= 0 OR asset_size_bytes > 5242880 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Site asset size is invalid';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown asset bucket';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = asset_bucket AND object.name = asset_path
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The uploaded Storage object was not found';
  END IF;

  INSERT INTO public.managed_assets (
    id, bucket, object_path, public_url, kind, area, owner_id, mime_type, size_bytes
  ) VALUES (
    asset_id, asset_bucket, asset_path, asset_public_url, asset_kind, asset_area,
    v_actor_id, asset_mime_type, asset_size_bytes
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.register_managed_asset(uuid, text, text, text, text, text, text, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_managed_asset(uuid, text, text, text, text, text, text, bigint)
  TO authenticated;

-- ============================================================================
-- 4) list_own_album_ids: returns album IDs the caller owns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_own_album_ids()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_album_ids jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may list owned albums';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id;

  IF v_position = 'PRESIDENT' THEN
    -- President owns all albums
    SELECT COALESCE(jsonb_agg(album_row.value ->> 'id'), '[]'::jsonb)
    INTO v_album_ids
    FROM public.published_site_content AS psc,
         jsonb_array_elements(psc.content -> 'galleryAlbums') AS album_row(value)
    WHERE psc.id = 'main'
      AND jsonb_typeof(psc.content -> 'galleryAlbums') = 'array'
      AND jsonb_typeof(album_row.value) = 'object'
      AND NULLIF(btrim(album_row.value ->> 'id'), '') IS NOT NULL;
  ELSE
    SELECT COALESCE(jsonb_agg(ownership.album_id), '[]'::jsonb)
    INTO v_album_ids
    FROM private.gallery_album_ownership AS ownership
    WHERE ownership.owner_user_id = v_actor_id;
  END IF;

  RETURN COALESCE(v_album_ids, '[]'::jsonb);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.list_own_album_ids()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_own_album_ids()
  TO authenticated;

-- ============================================================================
-- 5) create_gallery_album: narrow RPC for album creation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_gallery_album(
  p_album jsonb,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_album_id text;
  v_albums jsonb;
  v_album jsonb;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may create albums';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id;

  IF p_expected_version < 1 OR p_album IS NULL OR jsonb_typeof(p_album) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid album creation input is required';
  END IF;

  v_album_id := NULLIF(btrim(p_album ->> 'id'), '');
  IF v_album_id IS NULL OR char_length(v_album_id) > 200
     OR NULLIF(btrim(p_album ->> 'title'), '') IS NULL
     OR NULLIF(btrim(p_album ->> 'categoryId'), '') IS NULL
     OR NULLIF(btrim(p_album ->> 'date'), '') IS NULL
     OR NULLIF(btrim(p_album ->> 'location'), '') IS NULL
     OR NULLIF(btrim(p_album ->> 'coverImage'), '') IS NULL
     OR NULLIF(btrim(p_album ->> 'description'), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid album fields are required';
  END IF;

  -- Read current albums array
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

  -- Check uniqueness
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_albums) AS album_row(value)
    WHERE album_row.value ->> 'id' = v_album_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Album id already exists';
  END IF;

  -- Build sanitized album (strip untrusted fields, set server-authoritative ones)
  v_album := (p_album - 'createdBy' - 'createdByRole')
    || jsonb_build_object(
      'createdByRole', v_position,
      'media', '[]'::jsonb,
      'photoCount', 0,
      'videoCount', 0
    );

  -- Publish using the locked CMS function
  v_result := private.publish_cms_target_locked(
    v_actor_id,
    'galleryAlbums',
    jsonb_build_array(v_album) || v_albums,
    p_expected_version
  );

  -- Record ownership server-side
  INSERT INTO private.gallery_album_ownership (album_id, owner_user_id)
  VALUES (v_album_id, v_actor_id)
  ON CONFLICT (album_id) DO NOTHING;

  -- Post-commit re-check
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Album creation authority changed';
  END IF;

  RETURN v_result;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.create_gallery_album(jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_gallery_album(jsonb, bigint)
  TO authenticated;

-- ============================================================================
-- 6) update_owned_gallery_album: record-scoped album update
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_owned_gallery_album(
  p_album_id text,
  p_album_patch jsonb,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_album_id text := NULLIF(btrim(p_album_id), '');
  v_site public.published_site_content;
  v_albums jsonb;
  v_idx integer;
  v_current_album jsonb;
  v_patched_album jsonb;
  v_new_albums jsonb;
  v_owner_id uuid;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may update albums';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id;

  IF v_album_id IS NULL OR char_length(v_album_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid album ID is required';
  END IF;

  IF p_album_patch IS NULL OR jsonb_typeof(p_album_patch) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid album patch is required';
  END IF;

  IF p_expected_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid expected version is required';
  END IF;

  -- Ownership check (non-President)
  IF v_position IS DISTINCT FROM 'PRESIDENT' THEN
    SELECT ownership.owner_user_id
    INTO v_owner_id
    FROM private.gallery_album_ownership AS ownership
    WHERE ownership.album_id = v_album_id;

    IF v_owner_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'This album has no ownership record; only the president may edit it';
    END IF;

    IF v_owner_id IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'You may only edit albums you created';
    END IF;
  END IF;

  -- Lock and read
  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;

  IF NOT FOUND OR v_site.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
  END IF;

  v_albums := CASE
    WHEN jsonb_typeof(v_site.content -> 'galleryAlbums') = 'array'
      THEN v_site.content -> 'galleryAlbums'
    ELSE '[]'::jsonb
  END;

  -- Find target album
  v_idx := NULL;
  FOR i IN 0 .. jsonb_array_length(v_albums) - 1 LOOP
    IF jsonb_typeof(v_albums -> i) = 'object'
       AND (v_albums -> i ->> 'id') = v_album_id THEN
      v_idx := i;
      v_current_album := v_albums -> i;
      EXIT;
    END IF;
  END LOOP;

  IF v_idx IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Album not found in published content';
  END IF;

  -- Apply patch — strip protected fields
  v_patched_album := v_current_album || (
    p_album_patch - 'id' - 'createdByRole' - 'createdBy' - 'media' - 'photoCount' - 'videoCount'
  );
  v_patched_album := jsonb_set(v_patched_album, '{id}', to_jsonb(v_album_id));

  -- Build new albums array
  v_new_albums := '[]'::jsonb;
  FOR i IN 0 .. jsonb_array_length(v_albums) - 1 LOOP
    IF i = v_idx THEN
      v_new_albums := v_new_albums || jsonb_build_array(v_patched_album);
    ELSE
      v_new_albums := v_new_albums || jsonb_build_array(v_albums -> i);
    END IF;
  END LOOP;

  UPDATE public.published_site_content
  SET content = jsonb_set(v_site.content, '{galleryAlbums}', v_new_albums, true),
      version = v_site.version + 1,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE id = 'main'
  RETURNING * INTO v_site;

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Album update authority changed';
  END IF;

  RETURN jsonb_build_object(
    'target', 'galleryAlbums',
    'payload', v_site.content -> 'galleryAlbums',
    'version', v_site.version,
    'updated_at', v_site.updated_at
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.update_owned_gallery_album(text, jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_owned_gallery_album(text, jsonb, bigint)
  TO authenticated;

-- ============================================================================
-- 7) append_owned_gallery_media: add media to an owned album
-- ============================================================================

CREATE OR REPLACE FUNCTION public.append_owned_gallery_media(
  p_album_id text,
  p_media jsonb,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_album_id text := NULLIF(btrim(p_album_id), '');
  v_site public.published_site_content;
  v_albums jsonb;
  v_idx integer;
  v_current_album jsonb;
  v_current_media jsonb;
  v_updated_album jsonb;
  v_new_albums jsonb;
  v_owner_id uuid;
  v_media_id text;
  v_media_type text;
  v_photo_count integer;
  v_video_count integer;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may add media';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id;

  IF v_album_id IS NULL OR char_length(v_album_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid album ID is required';
  END IF;

  IF p_media IS NULL OR jsonb_typeof(p_media) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid media item is required';
  END IF;

  IF p_expected_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid expected version is required';
  END IF;

  v_media_id := NULLIF(btrim(p_media ->> 'id'), '');
  v_media_type := NULLIF(btrim(p_media ->> 'type'), '');
  IF v_media_id IS NULL OR v_media_type NOT IN ('photo', 'video') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Media item requires valid id and type';
  END IF;

  IF v_media_type = 'video' AND NULLIF(btrim(p_media ->> 'url'), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Video media requires a url';
  END IF;

  -- Ownership check
  IF v_position IS DISTINCT FROM 'PRESIDENT' THEN
    SELECT ownership.owner_user_id
    INTO v_owner_id
    FROM private.gallery_album_ownership AS ownership
    WHERE ownership.album_id = v_album_id;

    IF v_owner_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'This album has no ownership record; only the president may add media';
    END IF;

    IF v_owner_id IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'You may only add media to albums you created';
    END IF;
  END IF;

  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;

  IF NOT FOUND OR v_site.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
  END IF;

  v_albums := CASE
    WHEN jsonb_typeof(v_site.content -> 'galleryAlbums') = 'array'
      THEN v_site.content -> 'galleryAlbums'
    ELSE '[]'::jsonb
  END;

  -- Find target album
  v_idx := NULL;
  FOR i IN 0 .. jsonb_array_length(v_albums) - 1 LOOP
    IF jsonb_typeof(v_albums -> i) = 'object'
       AND (v_albums -> i ->> 'id') = v_album_id THEN
      v_idx := i;
      v_current_album := v_albums -> i;
      EXIT;
    END IF;
  END LOOP;

  IF v_idx IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Album not found in published content';
  END IF;

  -- Append media; stamp createdByRole from server
  v_current_media := CASE
    WHEN jsonb_typeof(v_current_album -> 'media') = 'array'
      THEN v_current_album -> 'media'
    ELSE '[]'::jsonb
  END;

  v_current_media := v_current_media || jsonb_build_array(
    (p_media - 'createdByRole' - 'createdBy')
      || jsonb_build_object('createdByRole', v_position)
  );

  -- Recount
  SELECT count(*)::integer
  INTO v_photo_count
  FROM jsonb_array_elements(v_current_media) AS m(value)
  WHERE m.value ->> 'type' = 'photo';

  SELECT count(*)::integer
  INTO v_video_count
  FROM jsonb_array_elements(v_current_media) AS m(value)
  WHERE m.value ->> 'type' = 'video';

  v_updated_album := v_current_album
    || jsonb_build_object(
      'media', v_current_media,
      'photoCount', v_photo_count,
      'videoCount', v_video_count
    );

  -- Build new albums array
  v_new_albums := '[]'::jsonb;
  FOR i IN 0 .. jsonb_array_length(v_albums) - 1 LOOP
    IF i = v_idx THEN
      v_new_albums := v_new_albums || jsonb_build_array(v_updated_album);
    ELSE
      v_new_albums := v_new_albums || jsonb_build_array(v_albums -> i);
    END IF;
  END LOOP;

  UPDATE public.published_site_content
  SET content = jsonb_set(v_site.content, '{galleryAlbums}', v_new_albums, true),
      version = v_site.version + 1,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE id = 'main'
  RETURNING * INTO v_site;

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Media append authority changed';
  END IF;

  RETURN jsonb_build_object(
    'target', 'galleryAlbums',
    'payload', v_site.content -> 'galleryAlbums',
    'version', v_site.version,
    'updated_at', v_site.updated_at
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.append_owned_gallery_media(text, jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.append_owned_gallery_media(text, jsonb, bigint)
  TO authenticated;
