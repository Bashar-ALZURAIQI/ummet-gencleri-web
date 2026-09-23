-- Provide an authoritative way for a student to withdraw from a task.
-- This safely removes their PENDING enrollment and frees up the slot.
-- Evaluated enrollments (PERFECT, PARTIAL, FAILED) are preserved as historical facts.

CREATE OR REPLACE FUNCTION public.cancel_task_enrollment(
  p_task_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_deadline timestamptz;
  v_task_status public.task_status;
  v_completion_status public.task_completion_status;
  v_enrollment_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Not authenticated';
  END IF;

  -- Lock the task row to prevent race conditions during capacity adjustments
  SELECT task.deadline, task.status
  INTO v_deadline, v_task_status
  FROM public.tasks AS task
  WHERE task.id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Task not found';
  END IF;

  IF v_deadline <= now() OR v_task_status = 'CLOSED' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cannot cancel after deadline or when task is closed';
  END IF;

  SELECT enrollment.id, enrollment.completion_status
  INTO v_enrollment_id, v_completion_status
  FROM public.task_enrollments AS enrollment
  WHERE enrollment.task_id = p_task_id
    AND enrollment.student_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Enrollment not found';
  END IF;

  IF v_completion_status <> 'PENDING'::public.task_completion_status THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Cannot cancel an evaluated task enrollment';
  END IF;

  DELETE FROM public.task_enrollments
  WHERE id = v_enrollment_id;

  IF v_task_status = 'FULL'::public.task_status THEN
    UPDATE public.tasks
    SET status = 'OPEN'::public.task_status
    WHERE id = p_task_id;
  END IF;

END
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_task_enrollment(uuid) TO authenticated;
