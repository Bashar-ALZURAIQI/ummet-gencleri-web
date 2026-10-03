CREATE OR REPLACE FUNCTION public.submit_student_suggestion(
  p_target_role text,
  p_category text,
  p_title text,
  p_content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_suggestion_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  -- Eligibility check with banned_until
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    JOIN public.student_applications sa ON sa.student_user_id = p.id
    WHERE u.id = v_user_id
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND p.status = 'active'
      AND sa.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Membership required';
  END IF;

  INSERT INTO public.student_suggestions (student_user_id, target_role, category, title, content)
  VALUES (v_user_id, p_target_role, btrim(p_category), btrim(p_title), btrim(p_content))
  RETURNING id INTO v_suggestion_id;

  RETURN v_suggestion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_student_suggestion FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_suggestion TO authenticated;
