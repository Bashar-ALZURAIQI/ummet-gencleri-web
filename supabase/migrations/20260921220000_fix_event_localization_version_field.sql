-- Fix event localization publish by removing nonexistent version column references

BEGIN;

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
    INSERT INTO public.cms_localizations (
      target, locale, partition, payload, manual_paths, stale_paths, status, updated_at, updated_by
    )
    VALUES (
      'events', v_locale, 'published', jsonb_build_array(v_new_translation),
      v_paths_to_update, ARRAY[]::text[], 'fresh', now(), v_actor_id::text
    )
    RETURNING * INTO v_loc;
  ELSE
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
