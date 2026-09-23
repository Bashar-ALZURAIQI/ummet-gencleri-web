-- Drop existing constraints dynamically and safely
DO $$
DECLARE
    c_name text;
BEGIN
    FOR c_name IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.push_notifications'::regclass
          AND (pg_get_constraintdef(oid) ILIKE '%kind %' OR pg_get_constraintdef(oid) ILIKE '%destination %')
    )
    LOOP
        EXECUTE 'ALTER TABLE public.push_notifications DROP CONSTRAINT ' || quote_ident(c_name);
    END LOOP;
END
$$;

-- Add new constraints that include NEW_APPLICATION and admin-applications
ALTER TABLE public.push_notifications
  ADD CONSTRAINT push_notifications_kind_check
  CHECK (kind IN ('NEWS', 'EVENT', 'GALLERY_ALBUM', 'PERSONAL', 'NEW_APPLICATION'));

ALTER TABLE public.push_notifications
  ADD CONSTRAINT push_notifications_destination_check
  CHECK (destination IN ('/?push=news', '/?push=programs', '/?push=gallery', '/?push=student-dashboard', '/?push=admin-applications'));

-- RPC for President to subscribe to push
CREATE OR REPLACE FUNCTION public.register_current_president_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (id uuid, user_id uuid, is_active boolean, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_endpoint text := btrim(COALESCE(p_endpoint, ''));
  v_p256dh text := btrim(COALESCE(p_p256dh, ''));
  v_auth_key text := btrim(COALESCE(p_auth_key, ''));
  v_user_agent text := NULLIF(left(btrim(COALESCE(p_user_agent, '')), 500), '');
  v_subscription public.push_subscriptions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current President may subscribe to admin push';
  END IF;

  IF length(v_endpoint) NOT BETWEEN 16 AND 2048
     OR v_endpoint !~ '^https://[^[:space:]]+$'
     OR length(v_p256dh) NOT BETWEEN 16 AND 256
     OR v_p256dh !~ '^[A-Za-z0-9_-]+$'
     OR length(v_auth_key) NOT BETWEEN 8 AND 128
     OR v_auth_key !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid push subscription data is required';
  END IF;

  INSERT INTO public.push_subscriptions (
    user_id, endpoint, p256dh, auth_key, user_agent, is_active,
    failure_count, updated_at
  ) VALUES (
    v_user_id, v_endpoint, v_p256dh, v_auth_key, v_user_agent, true,
    0, now()
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh,
      auth_key = EXCLUDED.auth_key,
      user_agent = EXCLUDED.user_agent,
      is_active = true,
      failure_count = 0,
      updated_at = now()
  RETURNING * INTO v_subscription;

  IF v_user_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Membership changed during subscription';
  END IF;

  id := v_subscription.id;
  user_id := v_subscription.user_id;
  is_active := v_subscription.is_active;
  updated_at := v_subscription.updated_at;
  RETURN NEXT;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.register_current_president_push_subscription(text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_current_president_push_subscription(text, text, text, text) TO authenticated;

-- Overwrite delivery eligible list to handle NEW_APPLICATION properly
DROP FUNCTION IF EXISTS public.list_eligible_push_subscriptions_for_delivery();
DROP FUNCTION IF EXISTS public.list_eligible_push_subscriptions_for_delivery(uuid);

CREATE OR REPLACE FUNCTION public.list_eligible_push_subscriptions_for_delivery(p_notification_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,user_id uuid,endpoint text,p256dh text,auth_key text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$
  SELECT s.id,s.user_id,s.endpoint,s.p256dh,s.auth_key
  FROM public.push_subscriptions s
  JOIN public.profiles p ON p.id=s.user_id AND p.status='active'
  LEFT JOIN public.push_notifications n ON n.id=p_notification_id
  WHERE s.is_active
    AND (
      (
        (p_notification_id IS NULL OR n.kind <> 'NEW_APPLICATION')
        AND EXISTS (SELECT 1 FROM public.student_applications a WHERE a.student_user_id = s.user_id AND a.status = 'accepted')
        AND (p_notification_id IS NULL OR n.target_user_id IS NULL OR n.target_user_id = s.user_id)
      )
      OR (
        p_notification_id IS NOT NULL AND n.kind = 'NEW_APPLICATION'
        AND EXISTS (SELECT 1 FROM public.executive_assignments ea WHERE ea.user_id = s.user_id AND ea.position_key = 'PRESIDENT')
      )
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.list_eligible_push_subscriptions_for_delivery(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_eligible_push_subscriptions_for_delivery(uuid) TO service_role;

-- Enqueue trigger for new applications
CREATE OR REPLACE FUNCTION private.enqueue_new_application_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_applicant_name text;
BEGIN
  -- We ONLY trigger on genuine NEW applications
  SELECT name INTO v_applicant_name FROM public.profiles WHERE id = NEW.student_user_id;
  IF v_applicant_name IS NULL THEN
    v_applicant_name := 'طالب جديد';
  END IF;

  INSERT INTO public.push_notifications (
    kind, source_event_key, title, body, destination
  ) VALUES (
    'NEW_APPLICATION',
    'application:new:' || NEW.id,
    'طلب انضمام جديد',
    'وصل طلب انضمام جديد من ' || v_applicant_name || '.',
    '/?push=admin-applications'
  )
  ON CONFLICT (source_event_key) DO NOTHING;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.enqueue_new_application_push_notification() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS student_applications_enqueue_new_application_push ON public.student_applications;
CREATE TRIGGER student_applications_enqueue_new_application_push
AFTER INSERT ON public.student_applications
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_new_application_push_notification();
