-- Remove global realtime channels for high-traffic public tables to reduce load

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'published_site_content') THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.published_site_content;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'student_guide') THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.student_guide;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'faq') THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.faq;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'public_executive_directory_events') THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.public_executive_directory_events;
    END IF;
  END IF;
END $$;
