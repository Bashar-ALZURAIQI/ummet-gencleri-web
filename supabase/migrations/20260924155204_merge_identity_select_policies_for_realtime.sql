DROP POLICY IF EXISTS executive_assignments_select_own ON public.executive_assignments;
DROP POLICY IF EXISTS executive_assignments_select_president ON public.executive_assignments;
CREATE POLICY executive_assignments_select_authorized
ON public.executive_assignments
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR COALESCE((SELECT authz.is_president FROM private.current_user_authorization authz), false)
);

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_internal_economy_admin_select ON public.profiles;
CREATE POLICY profiles_select_authorized
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) = id
  OR COALESCE((SELECT authz.can_manage FROM private.current_internal_economy_authorization authz), false)
);;
