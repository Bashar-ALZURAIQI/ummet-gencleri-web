import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, 'utf8');

const eventMigrationPath = `${root}/supabase/migrations/20260919120000_creator_owned_event_editing.sql`;
const galleryMigrationPath = `${root}/supabase/migrations/20260919130000_executive_owned_gallery_management.sql`;
const appContextSource = read('src/context/AppContext.tsx');

function getSqlFunctions(sql) {
  const fns = {};
  const matches = sql.matchAll(/create or replace function public\.([a-z0-9_]+)\([\s\S]*?\n\$function\$;/ig);
  for (const match of matches) {
    fns[match[1]] = match[0];
  }
  return fns;
}

test('EVENT EDIT 1-10: Ownership and roles for event edit', () => {
  const sql = readFileSync(eventMigrationPath, 'utf8');
  const fns = getSqlFunctions(sql);
  const updateEventFn = fns['update_owned_published_event'];

  assert.ok(updateEventFn, 'missing update_owned_published_event function');

  // 1-7, 9: Executive check
  assert.match(updateEventFn, /private\.is_current_executive\(\)/i, 'must check if current executive');
  // 1, 8, 10: President can edit any, non-President must be owner
  assert.match(updateEventFn, /v_position IS DISTINCT FROM 'PRESIDENT'/i, 'must bypass owner check for president');
  assert.match(updateEventFn, /activity\.created_by/i, 'must read true creator from activities');
  assert.match(updateEventFn, /v_owner_id IS NULL[\s\S]*?only the president may edit it/i, 'ownerless events are president only');
  assert.match(updateEventFn, /v_owner_id IS DISTINCT FROM v_actor_id[\s\S]*?only edit events you created/i, 'rejects other executive events');
});

test('EVENT EDIT 11-13: Preserves array, exact ID, and ownership', () => {
  const sql = readFileSync(eventMigrationPath, 'utf8');
  const fns = getSqlFunctions(sql);
  const updateEventFn = fns['update_owned_published_event'];

  // 11: Build new events array replacing only target index
  assert.match(updateEventFn, /v_new_events := v_new_events \|\| jsonb_build_array\(v_patched_event\)/i);
  assert.match(updateEventFn, /v_new_events := v_new_events \|\| jsonb_build_array\(v_events -> i\)/i);

  // 12-13: ID and ownership cannot change
  assert.match(updateEventFn, /p_event_patch - 'id' - 'createdByRole' - 'createdBy' - 'registered'/i, 'must strip protected fields');
  assert.match(updateEventFn, /jsonb_set\(v_patched_event, '\{id\}', to_jsonb\(v_event_id\)\)/i, 'must force ID to match target exactly');
});

test('GALLERY STORAGE 16-17: Gallery image upload policy allows all executives', () => {
  const sql = readFileSync(galleryMigrationPath, 'utf8');

  // Storage policy check
  const policyMatch = sql.match(/CREATE POLICY "gallery_authorized_insert"[\s\S]*?\);/i);
  assert.ok(policyMatch, 'missing gallery_authorized_insert policy');
  const policy = policyMatch[0];

  // Allows all executive roles, rejects student
  assert.match(policy, /authz\.position_key = 'PRESIDENT'/i);
  assert.match(policy, /authz\.position_key = 'MEDIA_HEAD'/i);
  assert.match(policy, /authz\.position_key IN \(\s*'VICE_PRESIDENT',\s*'FINANCE_HEAD',\s*'AUDIT_HEAD',\s*'ACADEMIC_HEAD',\s*'ACTIVITIES_HEAD'\s*\)/i);
  assert.match(policy, /bucket_id = 'gallery'/i);
});

test('GALLERY STORAGE 18-20: Album creation stamps server auth.uid', () => {
  const sql = readFileSync(galleryMigrationPath, 'utf8');
  const fns = getSqlFunctions(sql);
  const createAlbumFn = fns['create_gallery_album'];

  assert.ok(createAlbumFn);
  assert.match(createAlbumFn, /INSERT INTO private\.gallery_album_ownership \(album_id, owner_user_id\)\s*VALUES \(v_album_id, v_actor_id\)/i, 'must insert ownership row with server-side actor ID');
  assert.match(createAlbumFn, /p_album - 'createdBy' - 'createdByRole'/i, 'must strip client-supplied ownership');
});

test('GALLERY STORAGE 21-24: Owner edit own album, replace cover', () => {
  const sql = readFileSync(galleryMigrationPath, 'utf8');
  const fns = getSqlFunctions(sql);
  const updateAlbumFn = fns['update_owned_gallery_album'];

  assert.ok(updateAlbumFn);
  assert.match(updateAlbumFn, /v_position IS DISTINCT FROM 'PRESIDENT'/i);
  assert.match(updateAlbumFn, /FROM private\.gallery_album_ownership/i);
  assert.match(updateAlbumFn, /v_owner_id IS DISTINCT FROM v_actor_id[\s\S]*?only edit albums you created/i);
  assert.match(updateAlbumFn, /p_album_patch - 'id' - 'createdByRole' - 'createdBy' - 'media' - 'photoCount' - 'videoCount'/i, 'strips media and protected fields but leaves coverImage editable');
});

test('GALLERY STORAGE 25-29: Owner append media', () => {
  const sql = readFileSync(galleryMigrationPath, 'utf8');
  const fns = getSqlFunctions(sql);
  const appendMediaFn = fns['append_owned_gallery_media'];

  assert.ok(appendMediaFn);
  assert.match(appendMediaFn, /v_owner_id IS DISTINCT FROM v_actor_id[\s\S]*?only add media to albums you created/i);
  assert.match(appendMediaFn, /v_owner_id IS NULL[\s\S]*?only the president may add media/i);
});

test('GALLERY STORAGE 30-32: Unrelated storage permissions preserved', () => {
  const sql = readFileSync(galleryMigrationPath, 'utf8');
  const fns = getSqlFunctions(sql);
  const registerAssetFn = fns['register_managed_asset'];

  assert.ok(registerAssetFn);
  assert.match(registerAssetFn, /asset_bucket = 'avatars'/i);
  assert.match(registerAssetFn, /asset_bucket = 'site_assets'/i);
  assert.match(registerAssetFn, /v_is_guide_document :=[\s\S]*?v_folder = 'documents'[\s\S]*?'GUIDE'/i);
});

test('RUNTIME REGRESSION 33-35: No Realtime channels restored, 30s polling', () => {
  assert.doesNotMatch(appContextSource, /channel\('published_site_content'\)/i, 'must not subscribe to published site content realtime');
  assert.doesNotMatch(appContextSource, /channel\('public_executive_directory_events'\)/i, 'must not subscribe to directory realtime');
  assert.doesNotMatch(appContextSource, /setInterval\([\s\S]*?30000\)/i, 'must not reintroduce 30s polling');
});

test('EVENT TRANSLATION 36-37: Partial Translation Merge', () => {
  const sql = readFileSync(`${root}/supabase/migrations/20260921160000_event_ownership_complete.sql`, 'utf8');
  const fns = getSqlFunctions(sql);
  const publishFn = fns['publish_owned_event_translation'];

  assert.ok(publishFn);
  // Matches COALESCE of existing translation with new object
  assert.match(publishFn, /v_new_translation := COALESCE\(v_current_item, jsonb_build_object\('id', v_event_id\)\)/i);
  // Status explicitly fresh on both INSERT and UPDATE
  assert.match(publishFn, /status = 'fresh'/i);
  // Advisory lock before SELECT FOR UPDATE
  assert.match(publishFn, /pg_advisory_xact_lock\([\s\S]*?cms_localizations_events_' \|\| v_locale/i);
});

test('EVENT DELETE 38-39: Database version increment', () => {
  const sql = readFileSync(`${root}/supabase/migrations/20260921160000_event_ownership_complete.sql`, 'utf8');
  const fns = getSqlFunctions(sql);
  const deleteFn = fns['delete_owned_published_event'];

  assert.ok(deleteFn);
  assert.match(deleteFn, /version = version \+ 1/i);
  assert.match(deleteFn, /RETURNING version INTO v_new_version/i);
  assert.match(deleteFn, /'newVersion', v_new_version/i);
});

test('EVENT TRANSLATION 40-41: FOUND reuse prevention', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
  const sql = readFileSync(`${root}/supabase/migrations/20260921160000_event_ownership_complete.sql`, 'utf8');
  const publishFn = sql.substring(sql.indexOf('publish_owned_event_translation'));

  // Ensure v_loc_exists is captured exactly after FOR UPDATE
  assert.match(publishFn, /FOR UPDATE;\s*v_loc_exists := FOUND;/i);
  // Ensure we check v_loc_exists
  assert.match(publishFn, /IF NOT v_loc_exists THEN/i);
  // Ensure we do not use FOUND for the conditional logic later
  assert.doesNotMatch(publishFn, /IF NOT FOUND THEN/i);
});


test('EVENT SYNC 42-49: Activity double sync fix', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
  const sql = readFileSync(`${root}/supabase/migrations/20260921210000_fix_event_activity_double_sync.sql`, 'utf8');
  const fns = getSqlFunctions(sql);

  const createFn = fns['create_published_event'];
  const updateFn = fns['update_owned_published_event'];

  // 1 & 2: No duplicate public_event_id insert path
  assert.doesNotMatch(createFn, /INSERT INTO public\.activities/i);
  assert.doesNotMatch(updateFn, /UPDATE public\.activities SET/i);

  // The sync logic is now in the trigger sync_published_event_activities

  // 0: sync function checks private.is_current_executive() ensuring unauthenticated/student are denied
  assert.match(sql, /IF v_user_id IS NULL OR NOT \(SELECT private\.is_current_executive\(\)\) THEN/i);

  // 3 & 4: VICE_PRESIDENT can create/edit own because it checks CREATOR or PRESIDENT
  assert.match(sql, /IF v_position IS DISTINCT FROM 'PRESIDENT' AND v_existing_created_by <> v_user_id THEN/i);

  // 7: created_by is preserved on update (it uses EXCLUDED for everything except created_by)
  assert.doesNotMatch(sql, /created_by = EXCLUDED\.created_by/i);
  assert.match(sql, /created_by, type,[\s\S]*?VALUES \([\s\S]*?v_user_id/i);

  // 8: It executes inside the trigger, so it's transactional with published_site_content
  assert.match(sql, /ON CONFLICT \(public_event_id\) DO UPDATE/i);
});

test('EVENT TRANSLATION VERSION FIX 50-59: No nonexistent version column', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
  const sql = readFileSync(`${root}/supabase/migrations/20260921220000_fix_event_localization_version_field.sql`, 'utf8');

  // 1 & 2: publish_owned_event_translation contains NO v_loc.version reference and NO version column
  assert.doesNotMatch(sql, /v_loc\.version/i);
  assert.doesNotMatch(sql, /version = /i);
  assert.doesNotMatch(sql, /RETURNING version/i);

  // 3 & 7: Uses only real cms_localizations fields, preserves source_version/source_hash implicitly by omission
  assert.match(sql, /INSERT INTO public\.cms_localizations\s*\(\s*target, locale, partition, payload, manual_paths, stale_paths, status, updated_at, updated_by\s*\)/i);
  assert.match(sql, /UPDATE public\.cms_localizations\s+SET payload = v_updated_payload,\s+manual_paths = v_new_manual_paths,\s+stale_paths = v_new_stale_paths,\s+status = 'fresh',\s+updated_at = now\(\),\s+updated_by = v_actor_id::text/i);

  // 4 & 5: Turkish and English translation locales
  assert.match(sql, /IF v_locale NOT IN \('tr', 'en'\)/i);

  // 6: Partial merge preserves existing fields
  assert.match(sql, /v_new_translation := jsonb_set\(v_new_translation, '\{title\}', to_jsonb\(p_title\)\);/i);

  // 8: manual_paths remain field-level
  assert.match(sql, /v_paths_to_update := array_append\(v_paths_to_update, v_event_id \|\| '\.title'\);/i);

  // 9: stale_paths remain non-null
  assert.match(sql, /IF v_new_stale_paths IS NULL THEN v_new_stale_paths := ARRAY\[\]::text\[\]; END IF;/i);
  assert.match(sql, /stale_paths, status, updated_at/i);

  // 10: owner/non-owner/President authorization still holds
  assert.match(sql, /SELECT 1 FROM public\.activities activity\s+WHERE activity\.public_event_id = v_event_id AND activity\.created_by = v_actor_id/i);
});
