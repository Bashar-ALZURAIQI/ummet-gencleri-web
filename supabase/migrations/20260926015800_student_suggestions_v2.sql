CREATE TABLE IF NOT EXISTS public.student_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES public.profiles(id),
  target_role text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_target_role CHECK (target_role IN ('PRESIDENT', 'VICE_PRESIDENT', 'MEDIA_HEAD', 'FINANCE_HEAD', 'AUDIT_HEAD', 'ACADEMIC_HEAD', 'ACTIVITIES_HEAD')),
  CONSTRAINT valid_status CHECK (status IN ('new', 'reviewing', 'implemented', 'closed')),
  CONSTRAINT valid_category CHECK (char_length(btrim(category)) BETWEEN 1 AND 100),
  CONSTRAINT valid_title CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT valid_content CHECK (char_length(btrim(content)) BETWEEN 5 AND 5000)
);

CREATE TABLE IF NOT EXISTS public.suggestion_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.student_suggestions(id),
  responder_user_id uuid NOT NULL REFERENCES public.profiles(id),
  response_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_response_text CHECK (char_length(btrim(response_text)) BETWEEN 1 AND 5000)
);

ALTER TABLE public.student_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestion_responses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.student_suggestions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.suggestion_responses FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.student_suggestions TO authenticated;
GRANT SELECT ON TABLE public.suggestion_responses TO authenticated;

CREATE POLICY "suggestions_student_select"
  ON public.student_suggestions
  FOR SELECT
  TO authenticated
  USING (student_user_id = auth.uid());

CREATE POLICY "suggestions_exec_select"
  ON public.student_suggestions
  FOR SELECT
  TO authenticated
  USING (
    private.is_current_president()
    OR
    EXISTS (
      SELECT 1 FROM public.executive_assignments ea
      WHERE ea.user_id = auth.uid() AND ea.position_key = student_suggestions.target_role
    )
  );

CREATE POLICY "suggestion_responses_student_select"
  ON public.suggestion_responses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_suggestions ss
      WHERE ss.id = suggestion_responses.suggestion_id AND ss.student_user_id = auth.uid()
    )
  );

CREATE POLICY "suggestion_responses_exec_select"
  ON public.suggestion_responses
  FOR SELECT
  TO authenticated
  USING (
    private.is_current_president()
    OR
    EXISTS (
      SELECT 1 FROM public.executive_assignments ea
      JOIN public.student_suggestions ss ON ss.target_role = ea.position_key
      WHERE ea.user_id = auth.uid() AND ss.id = suggestion_responses.suggestion_id
    )
  );

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
    JOIN public.student_applications sa ON sa.user_id = p.id
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

CREATE OR REPLACE FUNCTION public.respond_to_student_suggestion(
  p_suggestion_id uuid,
  p_response_text text,
  p_new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_target_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  SELECT target_role INTO v_target_role
  FROM public.student_suggestions
  WHERE id = p_suggestion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion not found';
  END IF;

  -- Verify responder is not banned
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = v_user_id
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT (
    private.is_current_president()
    OR EXISTS (
      SELECT 1 FROM public.executive_assignments
      WHERE user_id = v_user_id AND position_key = v_target_role
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.suggestion_responses (suggestion_id, responder_user_id, response_text)
  VALUES (p_suggestion_id, v_user_id, btrim(p_response_text));

  UPDATE public.student_suggestions
  SET status = p_new_status, updated_at = now()
  WHERE id = p_suggestion_id;

END;
$$;

CREATE OR REPLACE FUNCTION public.list_visible_student_suggestions()
RETURNS TABLE (
  id uuid,
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
            'by', COALESCE(rp.name, 'Exec'),
            'byRole', COALESCE((SELECT ea.position_key FROM public.executive_assignments ea WHERE ea.user_id = sr.responder_user_id LIMIT 1), 'PRESIDENT'),
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

REVOKE ALL ON FUNCTION public.submit_student_suggestion FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_suggestion TO authenticated;

REVOKE ALL ON FUNCTION public.respond_to_student_suggestion FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_student_suggestion TO authenticated;

REVOKE ALL ON FUNCTION public.list_visible_student_suggestions FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_visible_student_suggestions TO authenticated;
