BEGIN;

REVOKE EXECUTE
ON FUNCTION public.publish_event_localization(text, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.publish_event_localization(text, text, jsonb);

COMMIT;
