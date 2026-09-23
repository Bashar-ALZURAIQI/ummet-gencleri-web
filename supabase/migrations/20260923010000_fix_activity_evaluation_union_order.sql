BEGIN;

DROP FUNCTION IF EXISTS public.list_activity_evaluations();

CREATE FUNCTION public.list_activity_evaluations()
RETURNS TABLE (
  activity_id uuid,
  activity_title text,
  activity_type public.activity_type,
  points_value integer,
  deadline timestamptz,
  evaluation_closed_at timestamptz,
  student_id uuid,
  student_name text,
  avatar_path text,
  attendance_status public.attendance_status,
  decision public.activity_decision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT', 'AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to evaluate attendance';
  END IF;

  RETURN QUERY
  SELECT
    q.activity_id,
    q.activity_title,
    q.activity_type,
    q.points_value,
    q.deadline,
    q.evaluation_closed_at,
    q.student_id,
    q.student_name,
    q.avatar_path,
    q.attendance_status,
    q.decision
  FROM (
    -- 1. JOINING enrollments for unclosed activities
    SELECT
      a.id AS activity_id, a.title AS activity_title, a.type AS activity_type, a.points_value, a.deadline, a.evaluation_closed_at,
      p.id AS student_id, p.name AS student_name, p.avatar_path, e.attendance_status, e.decision
    FROM public.activities a
    JOIN public.activity_enrollments e ON e.activity_id = a.id
    JOIN public.profiles p ON p.id = e.student_id
    WHERE e.decision = 'JOINING'
      AND a.evaluation_closed_at IS NULL

    UNION ALL

    -- 2. Explicitly IGNORED enrollments for unclosed activities
    SELECT
      a.id, a.title, a.type, a.points_value, a.deadline, a.evaluation_closed_at,
      p.id, p.name, p.avatar_path, NULL::public.attendance_status, e.decision
    FROM public.activities a
    JOIN public.activity_enrollments e ON e.activity_id = a.id
    JOIN public.profiles p ON p.id = e.student_id
    WHERE e.decision = 'IGNORED'
      AND a.evaluation_closed_at IS NULL

    UNION ALL

    -- 3. Active accepted students with no enrollment for unclosed MANDATORY activities
    SELECT
      a.id, a.title, a.type, a.points_value, a.deadline, a.evaluation_closed_at,
      p.id, p.name, p.avatar_path, NULL::public.attendance_status, 'IGNORED'::public.activity_decision
    FROM public.activities a
    CROSS JOIN public.profiles p
    JOIN public.student_applications app ON app.student_user_id = p.id
    WHERE a.type = 'MANDATORY'
      AND a.evaluation_closed_at IS NULL
      AND p.status = 'active'
      AND app.status = 'accepted'
      AND NOT EXISTS (
        SELECT 1
        FROM public.activity_enrollments e
        WHERE e.activity_id = a.id
          AND e.student_id = p.id
      )

    UNION ALL

    -- 4. Unclosed activities with zero enrollments and zero students, so the activity card is not lost
    SELECT
      a.id, a.title, a.type, a.points_value, a.deadline, a.evaluation_closed_at,
      NULL::uuid, NULL::text, NULL::text, NULL::public.attendance_status, NULL::public.activity_decision
    FROM public.activities a
    WHERE a.evaluation_closed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.activity_enrollments e WHERE e.activity_id = a.id AND e.decision = 'JOINING'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.activity_enrollments e WHERE e.activity_id = a.id AND e.decision = 'IGNORED'
      )
      AND (
        a.type <> 'MANDATORY'
        OR NOT EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.student_applications app ON app.student_user_id = p.id
          WHERE p.status = 'active' AND app.status = 'accepted'
        )
      )
  ) AS q
  ORDER BY q.deadline, q.student_name NULLS LAST;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_activity_evaluations() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_activity_evaluations() TO authenticated;

COMMIT;
