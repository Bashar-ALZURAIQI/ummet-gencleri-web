-- Fix double activity synchronization by keeping the sync_published_event_activities
-- trigger as the sole authority for syncing published events to activities.
--
-- 1. Updates sync_published_event_activities to strictly enforce President or Creator
--    ownership (preventing Non-Owner Executives from modifying activities).
-- 2. Removes the redundant INSERT INTO public.activities from create_published_event.
-- 3. Removes the redundant UPDATE public.activities from update_owned_published_event.

BEGIN;

-- ============================================================================
-- 1) sync_published_event_activities
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_published_event_activities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_position text;
  v_event jsonb;
  v_previous_events jsonb := '[]'::jsonb;
  v_public_event_id text;
  v_title text;
  v_description text;
  v_type public.activity_type;
  v_points_value integer;
  v_max_capacity integer;
  v_deadline timestamptz;
  v_deadline_text text;

  v_existing_activity_id uuid;
  v_existing_created_by uuid;
  v_existing_closed_at timestamptz;
  v_existing_type public.activity_type;
  v_existing_points integer;
  v_existing_capacity integer;
  v_existing_deadline timestamptz;
  v_joining_count integer;
BEGIN
  IF NEW.id <> 'main' OR jsonb_typeof(NEW.content -> 'events') <> 'array' THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may synchronize published events';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_user_id;

  IF TG_OP = 'UPDATE' THEN
    v_previous_events := CASE
      WHEN jsonb_typeof(OLD.content -> 'events') = 'array' THEN OLD.content -> 'events'
      ELSE '[]'::jsonb
    END;
  END IF;

  FOR v_event IN
    SELECT next_event.value
    FROM jsonb_array_elements(NEW.content -> 'events') AS next_event(value)
    LEFT JOIN LATERAL (
      SELECT previous_event.value
      FROM jsonb_array_elements(v_previous_events) AS previous_event(value)
      WHERE jsonb_typeof(previous_event.value) = 'object'
        AND previous_event.value ->> 'id' = next_event.value ->> 'id'
      LIMIT 1
    ) AS previous_event ON true
    WHERE jsonb_typeof(next_event.value) = 'object'
      AND (
        TG_OP = 'INSERT'
        OR previous_event.value IS NULL
        OR previous_event.value IS DISTINCT FROM next_event.value
      )
  LOOP
    v_public_event_id := NULLIF(btrim(v_event ->> 'id'), '');
    v_title := NULLIF(btrim(v_event ->> 'title'), '');
    IF v_public_event_id IS NULL OR v_title IS NULL THEN
      CONTINUE;
    END IF;

    v_description := COALESCE(NULLIF(btrim(v_event ->> 'description'), ''), 'فعالية اتحاد شباب الأمة');
    v_type := CASE upper(COALESCE(v_event ->> 'activityType', 'OPTIONAL'))
      WHEN 'MANDATORY' THEN 'MANDATORY'::public.activity_type
      WHEN 'PAID' THEN 'PAID'::public.activity_type
      ELSE 'OPTIONAL'::public.activity_type
    END;
    v_points_value := CASE
      WHEN COALESCE(v_event ->> 'pointsValue', '') ~ '^[0-9]{1,6}$'
        THEN (v_event ->> 'pointsValue')::integer
      ELSE 0
    END;
    v_max_capacity := CASE
      WHEN COALESCE(v_event ->> 'capacity', '') ~ '^[1-9][0-9]{0,8}$'
        THEN (v_event ->> 'capacity')::integer
      ELSE 1
    END;
    v_deadline_text := COALESCE(
      NULLIF(btrim(v_event ->> 'registrationDeadline'), ''),
      NULLIF(btrim(v_event ->> 'date'), '')
    );
    BEGIN
      v_deadline := v_deadline_text::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_deadline := now();
    END;

    IF v_type = 'PAID'::public.activity_type AND v_points_value <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Paid published events require a positive points value';
    END IF;

    -- Inline activity upsert with strictly PRESIDENT or CREATOR authority
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_public_event_id, 0));

    SELECT activity.id, activity.created_by, activity.evaluation_closed_at,
           activity.type, activity.points_value, activity.max_capacity, activity.deadline
    INTO v_existing_activity_id, v_existing_created_by, v_existing_closed_at,
         v_existing_type, v_existing_points, v_existing_capacity, v_existing_deadline
    FROM public.activities AS activity
    WHERE activity.public_event_id = v_public_event_id
    FOR UPDATE;

    IF v_existing_activity_id IS NOT NULL THEN
      IF v_position IS DISTINCT FROM 'PRESIDENT' AND v_existing_created_by <> v_user_id THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the President or original creator can synchronize this event';
      END IF;

      IF v_existing_closed_at IS NOT NULL THEN
        IF v_type <> v_existing_type
           OR v_points_value <> v_existing_points
           OR v_max_capacity <> v_existing_capacity
           OR v_deadline <> v_existing_deadline THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cannot alter economic settings of an already finalized activity';
        END IF;
      END IF;
    END IF;

    IF v_existing_activity_id IS NULL THEN
      v_joining_count := 0;
    ELSE
      SELECT count(*)::integer
      INTO v_joining_count
      FROM public.activity_enrollments AS enrollment
      WHERE enrollment.activity_id = v_existing_activity_id
        AND enrollment.decision = 'JOINING'::public.activity_decision;
    END IF;

    IF v_max_capacity < v_joining_count THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Activity capacity cannot be lower than confirmed joining count';
    END IF;

    INSERT INTO public.activities (
      public_event_id, title, description, created_by, type,
      points_value, max_capacity, deadline
    ) VALUES (
      v_public_event_id, left(v_title, 200), left(v_description, 8000), v_user_id, v_type,
      v_points_value, v_max_capacity, v_deadline
    )
    ON CONFLICT (public_event_id) DO UPDATE
    SET title = EXCLUDED.title,
        description = EXCLUDED.description,
        type = EXCLUDED.type,
        points_value = EXCLUDED.points_value,
        max_capacity = EXCLUDED.max_capacity,
        deadline = EXCLUDED.deadline;
  END LOOP;

  RETURN NEW;
END
$function$;

-- ============================================================================
-- 2) create_published_event (Remove duplicate insert)
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

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid()) OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Event creation authority changed';
  END IF;

  RETURN v_result;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.create_published_event(jsonb, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_published_event(jsonb, bigint) TO authenticated;


-- ============================================================================
-- 3) update_owned_published_event (Remove duplicate update)
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
    ELSIF v_owner_id IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the event owner or president may update this event';
    END IF;
  END IF;

  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Published site content is not initialized';
  END IF;

  IF v_site.version <> p_expected_version THEN
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

  RETURN jsonb_build_object('newVersion', v_site.version);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.update_owned_published_event(text, jsonb, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_owned_published_event(text, jsonb, bigint) TO authenticated;

COMMIT;
