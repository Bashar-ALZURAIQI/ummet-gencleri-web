-- Monthly star uses only the current calendar month AND the active season.
-- Season settlement is an accounting reset, not earned monthly points.
CREATE OR REPLACE FUNCTION public.get_public_monthly_star()
RETURNS TABLE(student_id uuid,student_name text,avatar_path text,points_last_30_days bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $monthly_star$
  WITH bounds AS (
    SELECT greatest(
      date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul',
      COALESCE((SELECT started_at FROM public.economy_seasons
        WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1),now())
    ) AS period_start
  )
  SELECT p.id,p.name,p.avatar_path,sum(l.amount)::bigint
  FROM public.points_ledger AS l
  JOIN public.profiles AS p ON p.id=l.student_id
  CROSS JOIN bounds
  WHERE l.created_at>=bounds.period_start
    AND l.created_at<=now()
    AND l.source_key NOT LIKE 'season-close:%'
    AND p.status='active' AND p.total_points>0
    AND EXISTS(SELECT 1 FROM public.student_applications AS a
      WHERE a.student_user_id=p.id AND a.status='accepted')
  GROUP BY p.id,p.name,p.avatar_path,p.created_at
  HAVING sum(l.amount)>0
  ORDER BY sum(l.amount) DESC,p.created_at,p.id LIMIT 1;
$monthly_star$;
REVOKE ALL ON FUNCTION public.get_public_monthly_star() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_public_monthly_star() TO anon,authenticated;
