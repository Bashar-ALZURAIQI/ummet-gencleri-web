-- Drop and recreate push_notifications_destination_check
DO $$
DECLARE
    c_name text;
BEGIN
    FOR c_name IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.push_notifications'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%destination %'
    )
    LOOP
        EXECUTE 'ALTER TABLE public.push_notifications DROP CONSTRAINT ' || quote_ident(c_name);
    END LOOP;
END
$$;

ALTER TABLE public.push_notifications
  ADD CONSTRAINT push_notifications_destination_check
  CHECK (destination IN (
    '/?push=news',
    '/?push=programs',
    '/?push=gallery',
    '/?push=student-dashboard',
    '/?push=admin-applications',
    '/?push=contact-inbox',
    '/?push=guide-suggestions',
    '/?push=student-suggestions'
  ));

-- Guide suggestions trigger
CREATE OR REPLACE FUNCTION private.enqueue_guide_suggestion_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_president_id uuid;
  v_academic_id uuid;
BEGIN
  -- Resolve President
  SELECT user_id INTO v_president_id FROM public.executive_assignments WHERE position_key = 'PRESIDENT' LIMIT 1;
  -- Resolve Academic Head
  SELECT user_id INTO v_academic_id FROM public.executive_assignments WHERE position_key = 'ACADEMIC_HEAD' LIMIT 1;

  -- Insert for President
  IF v_president_id IS NOT NULL THEN
    INSERT INTO public.push_notifications (
      kind, source_event_key, target_user_id, title, body, destination
    ) VALUES (
      'PERSONAL',
      'guide:new:' || NEW.id || ':president',
      v_president_id,
      'اقتراح جديد لدليل الطالب',
      'وصل اقتراح جديد يحتاج إلى المراجعة.',
      '/?push=guide-suggestions'
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Insert for Academic Head (if different from President)
  IF v_academic_id IS NOT NULL AND (v_president_id IS NULL OR v_academic_id <> v_president_id) THEN
    INSERT INTO public.push_notifications (
      kind, source_event_key, target_user_id, title, body, destination
    ) VALUES (
      'PERSONAL',
      'guide:new:' || NEW.id || ':academic',
      v_academic_id,
      'اقتراح جديد لدليل الطالب',
      'وصل اقتراح جديد يحتاج إلى المراجعة.',
      '/?push=guide-suggestions'
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.enqueue_guide_suggestion_push_notification() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guide_suggestions_enqueue_push ON public.guide_suggestions;
CREATE TRIGGER guide_suggestions_enqueue_push
AFTER INSERT ON public.guide_suggestions
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_guide_suggestion_push_notification();

-- Contact Us trigger
CREATE OR REPLACE FUNCTION private.enqueue_contact_message_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_president_id uuid;
BEGIN
  SELECT user_id INTO v_president_id FROM public.executive_assignments WHERE position_key = 'PRESIDENT' LIMIT 1;

  IF v_president_id IS NOT NULL THEN
    INSERT INTO public.push_notifications (
      kind, source_event_key, target_user_id, title, body, destination
    ) VALUES (
      'PERSONAL',
      'contact:new:' || NEW.id,
      v_president_id,
      'رسالة جديدة عبر تواصل معنا',
      'وصلت رسالة جديدة تحتاج إلى المراجعة.',
      '/?push=contact-inbox'
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.enqueue_contact_message_push_notification() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS contact_messages_enqueue_push ON public.contact_messages;
CREATE TRIGGER contact_messages_enqueue_push
AFTER INSERT ON public.contact_messages
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_contact_message_push_notification();

-- Student Suggestions trigger
CREATE OR REPLACE FUNCTION private.enqueue_student_suggestion_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_assignee_id uuid;
BEGIN
  SELECT user_id INTO v_assignee_id FROM public.executive_assignments WHERE position_key = NEW.target_role LIMIT 1;

  IF v_assignee_id IS NOT NULL THEN
    INSERT INTO public.push_notifications (
      kind, source_event_key, target_user_id, title, body, destination
    ) VALUES (
      'PERSONAL',
      'suggestion:new:' || NEW.id,
      v_assignee_id,
      'اقتراح جديد',
      'لديك اقتراح جديد موجّه إليك.',
      '/?push=student-suggestions'
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.enqueue_student_suggestion_push_notification() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS student_suggestions_enqueue_push ON public.student_suggestions;
CREATE TRIGGER student_suggestions_enqueue_push
AFTER INSERT ON public.student_suggestions
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_student_suggestion_push_notification();

-- Workload Badges RPC
CREATE OR REPLACE FUNCTION public.get_current_user_workload_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_pending_guide int := 0;
  v_unread_contact int := 0;
  v_new_student_suggestions int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '{"pendingGuideSuggestions": 0, "unreadContactMessages": 0, "newStudentSuggestions": 0}'::jsonb;
  END IF;

  SELECT position_key INTO v_role FROM public.executive_assignments WHERE user_id = v_user_id LIMIT 1;

  IF v_role IS NULL THEN
    RETURN '{"pendingGuideSuggestions": 0, "unreadContactMessages": 0, "newStudentSuggestions": 0}'::jsonb;
  END IF;

  -- Evaluate guide suggestions for PRESIDENT and ACADEMIC_HEAD
  IF v_role IN ('PRESIDENT', 'ACADEMIC_HEAD') THEN
    SELECT count(*) INTO v_pending_guide FROM public.guide_suggestions WHERE status = 'PENDING';
  END IF;

  -- Evaluate contact messages for PRESIDENT
  IF v_role = 'PRESIDENT' THEN
    SELECT count(*) INTO v_unread_contact FROM public.contact_messages WHERE status = 'UNREAD';
  END IF;

  -- Evaluate new student suggestions for CURRENT role
  SELECT count(*) INTO v_new_student_suggestions FROM public.student_suggestions WHERE target_role = v_role AND status = 'new';

  RETURN jsonb_build_object(
    'pendingGuideSuggestions', v_pending_guide,
    'unreadContactMessages', v_unread_contact,
    'newStudentSuggestions', v_new_student_suggestions
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.get_current_user_workload_counts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_user_workload_counts() TO authenticated;
