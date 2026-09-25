-- Migration to drop unused realtime tables from supabase_realtime publication
-- The application freshness is now provided by bounded HTTP refresh,
-- while RLS remains the authorization authority.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'executive_assignments'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.executive_assignments;
    END IF;
END;
$$;;
