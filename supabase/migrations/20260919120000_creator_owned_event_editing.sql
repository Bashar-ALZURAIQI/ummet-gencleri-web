-- Creator-Owned Event Editing
-- Allows any current executive to edit events they created, verified through
-- the server-authoritative activities.created_by link. President may edit all.
-- Does NOT modify existing applied migrations.

-- ============================================================================
-- 1) list_own_event_ids: returns event IDs the caller owns via activities
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
    -- President owns all events: return all event IDs from published content
    SELECT COALESCE(jsonb_agg(event_row.value ->> 'id'), '[]'::jsonb)
    INTO v_event_ids
    FROM public.published_site_content AS psc,
         jsonb_array_elements(psc.content -> 'events') AS event_row(value)
    WHERE psc.id = 'main'
      AND jsonb_typeof(psc.content -> 'events') = 'array'
      AND jsonb_typeof(event_row.value) = 'object'
      AND NULLIF(btrim(event_row.value ->> 'id'), '') IS NOT NULL;
  ELSE
    -- Non-president: return only event IDs linked via activities.created_by
    SELECT COALESCE(jsonb_agg(activity.public_event_id), '[]'::jsonb)
    INTO v_event_ids
    FROM public.activities AS activity
    WHERE activity.created_by = v_actor_id
      AND activity.public_event_id IS NOT NULL;
  END IF;

  RETURN COALESCE(v_event_ids, '[]'::jsonb);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.list_own_event_ids()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_own_event_ids()
  TO authenticated;

-- ============================================================================
-- 2) update_owned_published_event: record-scoped event update with ownership
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
  -- 1. Auth check
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may update events';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id;

  -- 2. Input validation
  IF v_event_id IS NULL OR char_length(v_event_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event ID is required';
  END IF;

  IF p_event_patch IS NULL OR jsonb_typeof(p_event_patch) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event patch is required';
  END IF;

  IF p_expected_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid expected version is required';
  END IF;

  -- 3. Ownership check (non-President only)
  IF v_position IS DISTINCT FROM 'PRESIDENT' THEN
    SELECT activity.created_by
    INTO v_owner_id
    FROM public.activities AS activity
    WHERE activity.public_event_id = v_event_id;

    -- No activity row => fail closed (ownerless event)
    IF v_owner_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'This event has no ownership record; only the president may edit it';
    END IF;

    IF v_owner_id IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'You may only edit events you created';
    END IF;
  END IF;

  -- 4. Lock and read the published site content
  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;

  IF NOT FOUND OR v_site.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
  END IF;

  v_events := CASE
    WHEN jsonb_typeof(v_site.content -> 'events') = 'array'
      THEN v_site.content -> 'events'
    ELSE '[]'::jsonb
  END;

  -- 5. Find the target event in the array
  v_idx := NULL;
  FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
    IF jsonb_typeof(v_events -> i) = 'object'
       AND (v_events -> i ->> 'id') = v_event_id THEN
      v_idx := i;
      v_current_event := v_events -> i;
      EXIT;
    END IF;
  END LOOP;

  IF v_idx IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Event not found in published content';
  END IF;

  -- 6. Apply patch — strip protected fields (id, createdByRole, createdBy, registered)
  v_patched_event := v_current_event || (
    p_event_patch - 'id' - 'createdByRole' - 'createdBy' - 'registered'
  );

  -- Ensure the ID is preserved exactly
  v_patched_event := jsonb_set(v_patched_event, '{id}', to_jsonb(v_event_id));

  -- Validate required fields after patch
  IF NULLIF(btrim(v_patched_event ->> 'title'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'category'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'date'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'location'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'description'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'status'), '') IS NULL
     OR NULLIF(btrim(v_patched_event ->> 'image'), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Patched event has missing required fields';
  END IF;

  -- 7. Build new events array replacing only the target index
  v_new_events := '[]'::jsonb;
  FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
    IF i = v_idx THEN
      v_new_events := v_new_events || jsonb_build_array(v_patched_event);
    ELSE
      v_new_events := v_new_events || jsonb_build_array(v_events -> i);
    END IF;
  END LOOP;

  -- 8. Update published_site_content with only the events key changed
  UPDATE public.published_site_content
  SET content = jsonb_set(v_site.content, '{events}', v_new_events, true),
      version = v_site.version + 1,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE id = 'main'
  RETURNING * INTO v_site;

  -- 9. Post-commit authority re-check
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Event update authority changed';
  END IF;

  RETURN jsonb_build_object(
    'target', 'events',
    'payload', v_site.content -> 'events',
    'version', v_site.version,
    'updated_at', v_site.updated_at
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.update_owned_published_event(text, jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_owned_published_event(text, jsonb, bigint)
  TO authenticated;
