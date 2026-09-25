CREATE OR REPLACE FUNCTION private.publish_cms_target_locked(p_actor_id uuid, p_target text, p_payload jsonb, p_expected_version bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_site public.published_site_content;
  v_guide public.student_guide;
  v_faq public.faq;
  v_content_key text;
BEGIN
  IF p_actor_id IS NULL OR p_expected_version < 1 OR p_payload IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid CMS publication input is required';
  END IF;

  IF p_target IN ('guideSections', 'guideQuickInfo') THEN
    SELECT * INTO v_guide
    FROM public.student_guide
    WHERE id = 'main'
    FOR UPDATE;
    IF NOT FOUND OR v_guide.version <> p_expected_version THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'CONTENT_VERSION_CONFLICT';
    END IF;
    IF p_target = 'guideSections' AND jsonb_typeof(p_payload) <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Guide sections must be an array';
    END IF;
    IF p_target = 'guideQuickInfo'
       AND (jsonb_typeof(p_payload) <> 'string' OR NULLIF(btrim(p_payload #>> '{}'), '') IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Guide quick info must be a non-empty string';
    END IF;
    UPDATE public.student_guide
    SET sections = CASE WHEN p_target = 'guideSections' THEN p_payload ELSE sections END,
        quick_info = CASE WHEN p_target = 'guideQuickInfo' THEN p_payload #>> '{}' ELSE quick_info END,
        version = v_guide.version + 1,
        updated_by = p_actor_id,
        updated_at = now()
    WHERE id = 'main'
    RETURNING * INTO v_guide;
    RETURN jsonb_build_object(
      'target', p_target,
      'payload', CASE WHEN p_target = 'guideSections' THEN v_guide.sections ELSE to_jsonb(v_guide.quick_info) END,
      'version', v_guide.version,
      'updated_at', v_guide.updated_at
    );
  END IF;

  IF p_target = 'faqCategories' THEN
    IF jsonb_typeof(p_payload) <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FAQ categories must be an array';
    END IF;
    SELECT * INTO v_faq
    FROM public.faq
    WHERE id = 'main'
    FOR UPDATE;
    IF NOT FOUND OR v_faq.version <> p_expected_version THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'CONTENT_VERSION_CONFLICT';
    END IF;
    UPDATE public.faq
    SET categories = p_payload,
        version = v_faq.version + 1,
        updated_by = p_actor_id,
        updated_at = now()
    WHERE id = 'main'
    RETURNING * INTO v_faq;
    RETURN jsonb_build_object(
      'target', p_target,
      'payload', v_faq.categories,
      'version', v_faq.version,
      'updated_at', v_faq.updated_at
    );
  END IF;

  IF p_target NOT IN (
    'site', 'about', 'programsContent', 'events', 'galleryAlbums',
    'galleryCategories', 'contactCards', 'contactMap', 'news', 'plans',
    'reports', 'committees'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown CMS target';
  END IF;

  v_content_key := CASE p_target
    WHEN 'site' THEN 'siteContent'
    WHEN 'about' THEN 'aboutContent'
    ELSE p_target
  END;

  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;
  IF NOT FOUND OR v_site.version <> p_expected_version THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'CONTENT_VERSION_CONFLICT';
  END IF;

  UPDATE public.published_site_content
  SET content = jsonb_set(v_site.content, ARRAY[v_content_key], p_payload, true),
      version = v_site.version + 1,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = 'main'
  RETURNING * INTO v_site;

  RETURN jsonb_build_object(
    'target', p_target,
    'payload', v_site.content -> v_content_key,
    'version', v_site.version,
    'updated_at', v_site.updated_at
  );
END
$function$;;
