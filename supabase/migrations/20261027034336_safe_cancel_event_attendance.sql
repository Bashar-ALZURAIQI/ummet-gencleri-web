
-- Reversal entries are ledger additions, never destructive updates to points.
CREATE OR REPLACE FUNCTION private.cancel_activity_evaluation_records(
  p_activity_id uuid, p_actor uuid, p_remove_activity boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $cancel$
DECLARE
  v_activity public.activities%ROWTYPE;
  v_entry public.points_ledger%ROWTYPE;
  v_count integer := 0;
  v_enrollments integer := 0;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Authenticated actor required';
  END IF;
  SELECT * INTO v_activity FROM public.activities
  WHERE id=p_activity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Activity not found';
  END IF;
  IF v_activity.evaluation_closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Graded attendance must be preserved';
  END IF;

  PERFORM 1 FROM public.activity_enrollments
  WHERE activity_id=p_activity_id ORDER BY student_id FOR UPDATE;

  FOR v_entry IN
    SELECT ledger.* FROM public.points_ledger AS ledger
    WHERE ledger.source_key LIKE 'activity-result:'||p_activity_id::text||':%'
       OR ledger.source_key LIKE 'paid-join:'||p_activity_id::text||':%'
       OR ledger.source_key LIKE 'paid-refund:'||p_activity_id::text||':%'
       OR EXISTS (
         SELECT 1 FROM public.activity_enrollments AS e
         WHERE e.activity_id=p_activity_id AND ledger.source_key='excuse:'||e.id::text
       )
    ORDER BY ledger.id FOR UPDATE
  LOOP
    INSERT INTO public.points_ledger(student_id,amount,reason,created_by,source_key)
    VALUES(v_entry.student_id,-v_entry.amount,
      'إلغاء تحضير النشاط: '||left(v_activity.title,200),p_actor,
      'activity-cancel:'||v_entry.id::text)
    ON CONFLICT(source_key) DO NOTHING;
    IF FOUND THEN v_count:=v_count+1; END IF;
  END LOOP;

  DELETE FROM public.activity_enrollments WHERE activity_id=p_activity_id;
  GET DIAGNOSTICS v_enrollments=ROW_COUNT;
  IF p_remove_activity THEN
    DELETE FROM public.activities WHERE id=p_activity_id;
  ELSE
    UPDATE public.activities SET evaluation_closed_at=now(),
      evaluation_closed_by=p_actor WHERE id=p_activity_id;
  END IF;
  IF v_count>0 THEN PERFORM private.refresh_top_ten_state(true); END IF;
  RETURN jsonb_build_object('activityId',p_activity_id,
    'attendanceDeleted',true,'enrollmentsDeleted',v_enrollments,
    'compensationEntries',v_count,'activityDeleted',p_remove_activity);
END
$cancel$;

REVOKE ALL ON FUNCTION private.cancel_activity_evaluation_records(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cancel_activity_evaluation(
  p_activity_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $public_cancel$
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Only president or audit head may cancel attendance';
  END IF;
  RETURN private.cancel_activity_evaluation_records(p_activity_id,(SELECT auth.uid()),false);
END
$public_cancel$;

REVOKE ALL ON FUNCTION public.cancel_activity_evaluation(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_activity_evaluation(uuid) TO authenticated;

-- Handle removal from any authorized CMS publication route, including approval
-- requests. Only UPCOMING ungraded attendance is automatically deleted.
CREATE OR REPLACE FUNCTION private.cleanup_removed_upcoming_event_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $event_cleanup$
DECLARE
  v_removed jsonb;
  v_end timestamptz;
  v_activity_id uuid;
BEGIN
  IF NEW.id <> 'main' THEN RETURN NEW; END IF;
  FOR v_removed IN
    SELECT previous.value
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(OLD.content->'events')='array'
      THEN OLD.content->'events' ELSE '[]'::jsonb END) AS previous(value)
    WHERE jsonb_typeof(previous.value)='object'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.content->'events')='array'
          THEN NEW.content->'events' ELSE '[]'::jsonb END) current(value)
        WHERE current.value->>'id'=previous.value->>'id'
      )
  LOOP
    BEGIN v_end:=NULLIF(v_removed->>'date','')::timestamptz;
    EXCEPTION WHEN OTHERS THEN v_end:=NULL; END;
    IF v_end IS NOT NULL AND v_end>now() THEN
      SELECT id INTO v_activity_id FROM public.activities
      WHERE public_event_id=v_removed->>'id'
        AND evaluation_closed_at IS NULL FOR UPDATE;
      IF FOUND THEN
        PERFORM private.cancel_activity_evaluation_records(v_activity_id,(SELECT auth.uid()),true);
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END
$event_cleanup$;

REVOKE ALL ON FUNCTION private.cleanup_removed_upcoming_event_attendance() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS cleanup_removed_upcoming_event_attendance_trigger ON public.published_site_content;
CREATE TRIGGER cleanup_removed_upcoming_event_attendance_trigger
AFTER UPDATE OF content ON public.published_site_content
FOR EACH ROW WHEN ((OLD.content->'events') IS DISTINCT FROM (NEW.content->'events'))
EXECUTE FUNCTION private.cleanup_removed_upcoming_event_attendance();

CREATE OR REPLACE FUNCTION public.delete_owned_published_event(p_event_id text, p_remove_attendance boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  v_activity public.activities%ROWTYPE;
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

  SELECT * INTO v_activity FROM public.activities
  WHERE public_event_id = v_event_id FOR UPDATE;
  IF FOUND AND p_remove_attendance THEN
    IF v_activity.evaluation_closed_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='Points already distributed; attendance must be preserved';
    END IF;
    PERFORM private.cancel_activity_evaluation_records(v_activity.id,v_actor_id,true);
  END IF;

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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_owned_published_event(p_event_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $legacy$
SELECT public.delete_owned_published_event(p_event_id,false);
$legacy$;
REVOKE ALL ON FUNCTION public.delete_owned_published_event(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delete_owned_published_event(text) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_owned_published_event(text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delete_owned_published_event(text,boolean) TO authenticated;
