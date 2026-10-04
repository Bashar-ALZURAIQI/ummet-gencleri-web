CREATE OR REPLACE FUNCTION public.list_visible_student_suggestions_v2()
RETURNS TABLE (
  id uuid,
  student_user_id uuid,
  student_name text,
  target_role text,
  category text,
  title text,
  content text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  responses json
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_is_president boolean;
  v_exec_roles text[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = v_user_id
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  ) THEN
    RETURN;
  END IF;
  
  v_is_president := private.is_current_president();

  SELECT array_agg(position_key) INTO v_exec_roles
  FROM public.executive_assignments
  WHERE user_id = v_user_id;

  IF v_exec_roles IS NULL THEN
    v_exec_roles := ARRAY[]::text[];
  END IF;

  RETURN QUERY
  SELECT
    ss.id,
    ss.student_user_id,
    COALESCE(p.name, 'Unknown'),
    ss.target_role,
    ss.category,
    ss.title,
    ss.content,
    ss.status,
    ss.created_at,
    ss.updated_at,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', sr.id,
            'responder_user_id', sr.responder_user_id,
            'by', rp.name,
            'byRole', (SELECT ea.position_key FROM public.executive_assignments ea WHERE ea.user_id = sr.responder_user_id LIMIT 1),
            'response_text', sr.response_text,
            'created_at', sr.created_at
          ) ORDER BY sr.created_at ASC
        )
        FROM public.suggestion_responses sr
        LEFT JOIN public.profiles rp ON rp.id = sr.responder_user_id
        WHERE sr.suggestion_id = ss.id
      ),
      '[]'::json
    ) AS responses
  FROM public.student_suggestions ss
  LEFT JOIN public.profiles p ON p.id = ss.student_user_id
  WHERE ss.student_user_id = v_user_id
     OR v_is_president
     OR ss.target_role = ANY(v_exec_roles)
  ORDER BY ss.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_visible_student_suggestions_v2 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_visible_student_suggestions_v2 TO authenticated;
