DO $migration$
DECLARE
  r record;
  v_def text;
  v_fixed text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f','p')
      AND p.proname IN (
        'append_owned_gallery_media',
        'approve_profile_edit_request',
        'approve_site_edit_request',
        'publish_own_committee',
        'publish_own_committee_fields',
        'publish_site_content',
        'replace_member_avatar',
        'replace_site_logo',
        'submit_site_edit_request',
        'update_owned_gallery_album',
        'update_owned_published_event'
      )
      AND position('40001' in pg_get_functiondef(p.oid)) > 0
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_fixed := replace(v_def, 'ERRCODE = ''40001''', 'ERRCODE = ''PT409''');
    IF v_fixed = v_def THEN
      RAISE EXCEPTION 'Expected 40001 ERRCODE replacement was not found for function oid %', r.oid;
    END IF;
    EXECUTE v_fixed;
  END LOOP;
END
$migration$;;
