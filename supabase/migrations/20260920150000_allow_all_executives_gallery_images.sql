-- Allow all executives to upload gallery/album images
-- Fixes an issue where non-President, non-Media executives were denied from albums.
-- Preserves existing events, documents, and site asset permissions.

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
