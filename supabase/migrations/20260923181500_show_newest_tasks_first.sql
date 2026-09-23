-- Show the newest tasks first on the student task board.

CREATE OR REPLACE FUNCTION public.list_student_task_board()
RETURNS TABLE (
  task_id uuid,
  title text,
  description text,
  points_reward integer,
  required_students integer,
  deadline timestamptz,
  status public.task_status,
  enrollment_count integer,
  is_enrolled boolean,
  completion_status public.task_completion_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.student_applications AS application
      ON application.student_user_id = profile.id
     AND application.status = 'accepted'
    WHERE profile.id = v_user_id
      AND profile.status = 'active'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only accepted active students may load the task board';
  END IF;

  RETURN QUERY
  SELECT
    task.id AS task_id,
    task.title,
    task.description,
    task.points_reward,
    task.required_students,
    task.deadline,
    task.status,
    counts.enrollment_count,
    (own_enrollment.student_id IS NOT NULL) AS is_enrolled,
    own_enrollment.completion_status
  FROM public.tasks AS task
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS enrollment_count
    FROM public.task_enrollments AS enrollment
    WHERE enrollment.task_id = task.id
  ) AS counts
  LEFT JOIN public.task_enrollments AS own_enrollment
    ON own_enrollment.task_id = task.id
   AND own_enrollment.student_id = v_user_id
  WHERE (
    (task.deadline > now() AND task.status <> 'CLOSED'::public.task_status)
    OR own_enrollment.student_id IS NOT NULL
  )
  ORDER BY task.created_at DESC, task.id DESC;
END
$function$;
