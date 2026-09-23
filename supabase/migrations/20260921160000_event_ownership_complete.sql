-- Complete Event Ownership Migration
-- Self-contained: includes listing, creating, updating, deleting, and translating events
-- with strict ownership tracking in public.activities.

BEGIN;

-- ============================================================================
-- 1) list_own_event_ids
-- ============================================================================
CREATE OR REPLACE FUNCTION public.list_own_event_ids()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_event_ids jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may list owned events';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id;

  IF v_position = 'PRESIDENT' THEN
    SELECT COALESCE(jsonb_agg(event_row.value ->> 'id'), '[]'::jsonb)
    INTO v_event_ids
    FROM public.published_site_content AS psc,
         jsonb_array_elements(psc.content -> 'events') AS event_row(value)
    WHERE psc.id = 'main'
      AND jsonb_typeof(psc.content -> 'events') = 'array'
      AND jsonb_typeof(event_row.value) = 'object'
      AND NULLIF(btrim(event_row.value ->> 'id'), '') IS NOT NULL;
  ELSE
    SELECT COALESCE(jsonb_agg(activity.public_event_id), '[]'::jsonb)
    INTO v_event_ids
    FROM public.activities AS activity
    WHERE activity.created_by = v_actor_id
      AND activity.public_event_id IS NOT NULL;
  END IF;

  RETURN COALESCE(v_event_ids, '[]'::jsonb);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.list_own_event_ids() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_own_event_ids() TO authenticated;

-- ============================================================================
-- 2) create_published_event
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_published_event(
  p_event jsonb,
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
  v_events jsonb;
  v_event jsonb;
  v_event_id text;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may create events';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id;

  IF p_expected_version < 1 OR p_event IS NULL OR jsonb_typeof(p_event) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event publication input is required';
  END IF;

  v_event_id := NULLIF(btrim(p_event ->> 'id'), '');
  IF v_event_id IS NULL OR char_length(v_event_id) > 200
     OR NULLIF(btrim(p_event ->> 'title'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'category'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'date'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'location'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'description'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'status'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'image'), '') IS NULL
     OR COALESCE(p_event ->> 'capacity', '') !~ '^[1-9][0-9]{0,8}$'
     OR COALESCE(p_event ->> 'activityType', '') NOT IN ('MANDATORY', 'OPTIONAL', 'PAID')
     OR COALESCE(p_event ->> 'pointsValue', '') !~ '^[0-9]{1,6}$'
     OR NULLIF(btrim(p_event ->> 'registrationDeadline'), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event fields are required';
  END IF;

  SELECT CASE
    WHEN jsonb_typeof(published.content -> 'events') = 'array' THEN published.content -> 'events'
    ELSE '[]'::jsonb
  END
  INTO v_events
  FROM public.published_site_content AS published
  WHERE published.id = 'main';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Published site content is not initialized';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_events) AS event_row(value)
    WHERE event_row.value ->> 'id' = v_event_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Event id already exists';
  END IF;

  v_event := (p_event - 'createdBy' - 'createdByRole' - 'registered')
    || jsonb_build_object(
      'createdByRole', v_position,
      'registered', 0
    );

  v_result := private.publish_cms_target_locked(
    v_actor_id,
    'events',
    jsonb_build_array(v_event) || v_events,
    p_expected_version
  );

  INSERT INTO public.activities (
    public_event_id, title, description, type, points_value, max_capacity, deadline, created_by
  ) VALUES (
    v_event_id,
    v_event ->> 'title',
    v_event ->> 'description',
    (v_event ->> 'activityType')::public.activity_type,
    (v_event ->> 'pointsValue')::integer,
    (v_event ->> 'capacity')::integer,
    (v_event ->> 'registrationDeadline')::timestamptz,
    v_actor_id
  );

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid()) OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Event creation authority changed';
  END IF;

  RETURN v_result;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.create_published_event(jsonb, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_published_event(jsonb, bigint) TO authenticated;

-- ============================================================================
-- 3) update_owned_published_event
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_owned_published_event(
  p_event_id text,
  p_event_patch jsonb,
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
  v_event_id text := NULLIF(btrim(p_event_id), '');
  v_site public.published_site_content;
  v_events jsonb;
  v_idx integer;
  v_current_event jsonb;
  v_patched_event jsonb;
  v_new_events jsonb;
  v_owner_id uuid;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may update events';
  END IF;

  SELECT assignment.position_key INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id;

  IF v_event_id IS NULL OR char_length(v_event_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event ID is required';
  END IF;

  IF p_event_patch IS NULL OR jsonb_typeof(p_event_patch) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event patch is required';
  END IF;

  IF p_expected_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid expected version is required';
  END IF;

  IF v_position IS DISTINCT FROM 'PRESIDENT' THEN
    SELECT activity.created_by INTO v_owner_id
    FROM public.activities AS activity
    WHERE activity.public_event_id = v_event_id;

    IF v_owner_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This event has no ownership record; only the president may edit it';
    END IF;

    IF v_owner_id IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You may only edit events you created';
    END IF;
  END IF;

  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main' FOR UPDATE;

  IF NOT FOUND OR v_site.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
  END IF;

  v_events := CASE
    WHEN jsonb_typeof(v_site.content -> 'events') = 'array' THEN v_site.content -> 'events'
    ELSE '[]'::jsonb
  END;

  v_idx := NULL;
  FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
    IF jsonb_typeof(v_events -> i) = 'object' AND (v_events -> i ->> 'id') = v_event_id THEN
      v_idx := i;
      v_current_event := v_events -> i;
      EXIT;
    END IF;
  END LOOP;

  IF v_idx IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Event not found in published content';
  END IF;

  v_patched_event := v_current_event || (p_event_patch - 'id' - 'createdByRole' - 'createdBy' - 'registered');
  v_patched_event := jsonb_set(v_patched_event, '{id}', to_jsonb(v_event_id));

  IF NULLIF(btrim(v_patched_event ->> 'title'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'category'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'date'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'location'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'description'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'status'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'image'), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Patched event has missing required fields';
  END IF;

  v_new_events := '[]'::jsonb;
  FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
    IF i = v_idx THEN
      v_new_events := v_new_events || jsonb_build_array(v_patched_event);
    ELSE
      v_new_events := v_new_events || jsonb_build_array(v_events -> i);
    END IF;
  END LOOP;

  UPDATE public.published_site_content
  SET content = jsonb_set(v_site.content, '{events}', v_new_events, true),
      version = v_site.version + 1,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE id = 'main'
  RETURNING * INTO v_site;

  UPDATE public.activities
  SET title = v_patched_event ->> 'title',
      description = v_patched_event ->> 'description',
      type = (v_patched_event ->> 'activityType')::public.activity_type,
      points_value = (v_patched_event ->> 'pointsValue')::integer,
      max_capacity = (v_patched_event ->> 'capacity')::integer,
      deadline = (v_patched_event ->> 'registrationDeadline')::timestamptz
  WHERE public_event_id = v_event_id;

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid()) OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Event update authority changed';
  END IF;

  RETURN jsonb_build_object('target', 'events', 'payload', v_site.content -> 'events', 'version', v_site.version, 'updated_at', v_site.updated_at);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.update_owned_published_event(text, jsonb, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_owned_published_event(text, jsonb, bigint) TO authenticated;

-- ============================================================================
-- 4) delete_owned_published_event
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_owned_published_event(
  p_event_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_is_president boolean;
  v_event_id text := NULLIF(btrim(p_event_id), '');
  v_events jsonb;
  v_canonical_event jsonb;
  v_updated_events jsonb;
  v_loc public.cms_localizations%ROWTYPE;
  v_updated_payload jsonb;
  v_new_version bigint;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may delete events';
  END IF;

  v_is_president := (SELECT private.is_current_president());

  IF v_event_id IS NULL OR char_length(v_event_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event id is required';
  END IF;

  SELECT CASE
    WHEN jsonb_typeof(published.content -> 'events') = 'array' THEN published.content -> 'events'
    ELSE '[]'::jsonb
  END
  INTO v_events
  FROM public.published_site_content AS published
  WHERE published.id = 'main'
  FOR UPDATE;

  SELECT event_item INTO v_canonical_event
  FROM jsonb_array_elements(v_events) AS event_item
  WHERE event_item ->> 'id' = v_event_id
  LIMIT 1;

  IF v_canonical_event IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Event not found in published events';
  END IF;

  IF NOT v_is_president THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.activities activity
      WHERE activity.public_event_id = v_event_id AND activity.created_by = v_actor_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to delete events created by another executive';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(event_item), '[]'::jsonb) INTO v_updated_events
  FROM jsonb_array_elements(v_events) AS event_item
  WHERE event_item ->> 'id' <> v_event_id;

  UPDATE public.published_site_content
  SET content = jsonb_set(content, '{events}', v_updated_events),
      version = version + 1,
      updated_at = now()
  WHERE id = 'main'
  RETURNING version INTO v_new_version;

  DELETE FROM public.activities WHERE public_event_id = v_event_id;

  FOR v_loc IN SELECT * FROM public.cms_localizations WHERE target = 'events' LOOP
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_updated_payload
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_loc.payload) = 'array' THEN v_loc.payload ELSE '[]'::jsonb END) AS item
    WHERE item ->> 'id' <> v_event_id;

    UPDATE public.cms_localizations
    SET payload = v_updated_payload,
        manual_paths = ARRAY(SELECT p FROM unnest(v_loc.manual_paths) p WHERE p NOT LIKE v_event_id || '.%' AND p <> v_event_id),
        stale_paths = ARRAY(SELECT p FROM unnest(v_loc.stale_paths) p WHERE p NOT LIKE v_event_id || '.%' AND p <> v_event_id),
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_loc.id;
  END LOOP;

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid()) OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Executive authority changed';
  END IF;

  RETURN jsonb_build_object('deletedEventId', v_event_id, 'eventData', v_canonical_event, 'newVersion', v_new_version);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_owned_published_event(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_owned_published_event(text) TO authenticated;

-- ============================================================================
-- 5) publish_owned_event_translation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.publish_owned_event_translation(
  p_event_id text,
  p_locale text,
  p_title text,
  p_description text,
  p_location text,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_is_president boolean;
  v_event_id text := NULLIF(btrim(p_event_id), '');
  v_locale text := NULLIF(btrim(p_locale), '');
  v_loc public.cms_localizations%ROWTYPE;
  v_events jsonb;
  v_current_payload jsonb;
  v_updated_payload jsonb;
  v_new_translation jsonb;
  v_current_item jsonb;
  v_found boolean := false;
  v_paths_to_update text[] := ARRAY[]::text[];
  v_new_manual_paths text[];
  v_new_stale_paths text[];
  v_path text;
  v_loc_exists boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may translate events';
  END IF;

  v_is_president := (SELECT private.is_current_president());

  IF v_event_id IS NULL OR char_length(v_event_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event id is required';
  END IF;

  IF v_locale NOT IN ('tr', 'en') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Translations must be tr or en';
  END IF;

  IF NOT v_is_president THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.activities activity
      WHERE activity.public_event_id = v_event_id AND activity.created_by = v_actor_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to translate events created by another executive';
    END IF;
  END IF;

  SELECT CASE
    WHEN jsonb_typeof(published.content -> 'events') = 'array' THEN published.content -> 'events'
    ELSE '[]'::jsonb
  END
  INTO v_events
  FROM public.published_site_content AS published
  WHERE published.id = 'main';

  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_events) AS event_item WHERE event_item ->> 'id' = v_event_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Event not found in published events';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cms_localizations_events_' || v_locale, 0)
  );

  SELECT * INTO v_loc
  FROM public.cms_localizations
  WHERE target = 'events' AND locale = v_locale AND partition = 'published'
  FOR UPDATE;

  v_loc_exists := FOUND;

  v_current_item := NULL;
  IF v_loc_exists THEN
    v_current_payload := CASE WHEN jsonb_typeof(v_loc.payload) = 'array' THEN v_loc.payload ELSE '[]'::jsonb END;
    FOR i IN 0 .. jsonb_array_length(v_current_payload) - 1 LOOP
      IF (v_current_payload -> i ->> 'id') = v_event_id THEN
        v_current_item := v_current_payload -> i;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  v_new_translation := COALESCE(v_current_item, jsonb_build_object('id', v_event_id));

  IF NULLIF(btrim(p_title), '') IS NOT NULL THEN
    v_new_translation := jsonb_set(v_new_translation, '{title}', to_jsonb(p_title));
    v_paths_to_update := array_append(v_paths_to_update, v_event_id || '.title');
  END IF;
  IF NULLIF(btrim(p_description), '') IS NOT NULL THEN
    v_new_translation := jsonb_set(v_new_translation, '{description}', to_jsonb(p_description));
    v_paths_to_update := array_append(v_paths_to_update, v_event_id || '.description');
  END IF;
  IF NULLIF(btrim(p_location), '') IS NOT NULL THEN
    v_new_translation := jsonb_set(v_new_translation, '{location}', to_jsonb(p_location));
    v_paths_to_update := array_append(v_paths_to_update, v_event_id || '.location');
  END IF;

  IF array_length(v_paths_to_update, 1) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Translation must include at least one localized field';
  END IF;

  IF NOT v_loc_exists THEN
    IF p_expected_version <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
    END IF;

    INSERT INTO public.cms_localizations (target, locale, partition, payload, version, manual_paths, stale_paths, status, updated_by)
    VALUES ('events', v_locale, 'published', jsonb_build_array(v_new_translation), 1, v_paths_to_update, '{}', 'fresh', v_actor_id::text)
    RETURNING * INTO v_loc;
  ELSE
    IF v_loc.version <> p_expected_version THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
    END IF;

    v_updated_payload := '[]'::jsonb;
    FOR i IN 0 .. jsonb_array_length(v_current_payload) - 1 LOOP
      IF (v_current_payload -> i ->> 'id') = v_event_id THEN
        v_updated_payload := v_updated_payload || jsonb_build_array(v_new_translation);
        v_found := true;
      ELSE
        v_updated_payload := v_updated_payload || jsonb_build_array(v_current_payload -> i);
      END IF;
    END LOOP;

    IF NOT v_found THEN
      v_updated_payload := v_updated_payload || jsonb_build_array(v_new_translation);
    END IF;

    v_new_manual_paths := v_loc.manual_paths;
    v_new_stale_paths := v_loc.stale_paths;
    IF v_new_manual_paths IS NULL THEN v_new_manual_paths := ARRAY[]::text[]; END IF;
    IF v_new_stale_paths IS NULL THEN v_new_stale_paths := ARRAY[]::text[]; END IF;

    FOREACH v_path IN ARRAY v_paths_to_update LOOP
      IF NOT (v_path = ANY(v_new_manual_paths)) THEN
        v_new_manual_paths := array_append(v_new_manual_paths, v_path);
      END IF;
      v_new_stale_paths := array_remove(v_new_stale_paths, v_path);
    END LOOP;

    UPDATE public.cms_localizations
    SET payload = v_updated_payload,
        version = v_loc.version + 1,
        manual_paths = v_new_manual_paths,
        stale_paths = v_new_stale_paths,
        status = 'fresh',
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_loc.id
    RETURNING * INTO v_loc;
  END IF;

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid()) OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Executive authority changed';
  END IF;

  RETURN jsonb_build_object(
    'id', v_loc.id,
    'target', v_loc.target,
    'locale', v_loc.locale,
    'partition', v_loc.partition,
    'payload', v_loc.payload,
    'version', v_loc.version,
    'manual_paths', v_loc.manual_paths,
    'stale_paths', v_loc.stale_paths,
    'status', v_loc.status,
    'updated_at', v_loc.updated_at
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.publish_owned_event_translation(text, text, text, text, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_owned_event_translation(text, text, text, text, text, bigint) TO authenticated;

COMMIT;
