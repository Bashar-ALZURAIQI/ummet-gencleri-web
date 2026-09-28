-- Expose student phone numbers strictly for President-authorized member management.
-- Preserves existing authorization gates and doesn't expose it to ordinary students.
CREATE OR REPLACE FUNCTION public.list_president_assignable_members()
RETURNS TABLE (
  user_id uuid,
  login_email text,
  name text,
  university text,
  major text,
  year text,
  phone text,
  bio text,
  avatar_path text,
  profile_updated_at timestamptz,
  position_key text,
  committee_key text,
  assignment_updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only the current president may list account login emails and phone numbers';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.name,
    p.university,
    p.major,
    p.year,
    p.phone,
    p.bio,
    p.avatar_path,
    p.updated_at,
    ea.position_key,
    ea.committee_key,
    ea.updated_at
  FROM auth.users AS u
  JOIN public.profiles AS p ON p.id = u.id
  LEFT JOIN public.executive_assignments AS ea ON ea.user_id = u.id
  WHERE u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())
    AND p.status = 'active'
  ORDER BY p.name, u.id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_president_assignable_members() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_president_assignable_members() TO authenticated;
