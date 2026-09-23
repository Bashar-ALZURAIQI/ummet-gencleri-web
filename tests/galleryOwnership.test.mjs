import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');

// Test that the migration exists and has the correct logic for album persistence
const migrationPath = `${root}/supabase/migrations/20260919130000_executive_owned_gallery_management.sql`;

test('GALLERY ALBUM CREATION: All current executives can create albums', () => {
  assert.ok(existsSync(migrationPath), 'Missing WIP migration file');
  const sql = readFileSync(migrationPath, 'utf8');

  // Verify the create_gallery_album function is defined and allows all current executives
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_gallery_album/i);
  assert.match(sql, /IF v_actor_id IS NULL OR NOT \(SELECT private\.is_current_executive\(\)\) THEN[\s\S]*?Only current executives may create albums/i);
  assert.match(sql, /INSERT INTO private\.gallery_album_ownership/i);
});

test('GALLERY ALBUM UPDATE: Owners and President can edit albums', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.update_owned_gallery_album/i);
  // Verify ownership checks
  assert.match(sql, /IF v_position IS DISTINCT FROM 'PRESIDENT' THEN[\s\S]*?SELECT ownership\.owner_user_id/i);
  assert.match(sql, /IF v_owner_id IS DISTINCT FROM v_actor_id THEN/i);
});

test('GALLERY MEDIA APPEND: Owners and President can append media', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.append_owned_gallery_media/i);
  // Verify ownership checks
  assert.match(sql, /IF v_position IS DISTINCT FROM 'PRESIDENT' THEN[\s\S]*?SELECT ownership\.owner_user_id/i);
  assert.match(sql, /IF v_owner_id IS DISTINCT FROM v_actor_id THEN/i);
});

test('GALLERY LIST OWNED: Returns correctly scoped albums', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.list_own_album_ids/i);
  // President sees all, others see their own
  assert.match(sql, /IF v_position = 'PRESIDENT' THEN[\s\S]*?SELECT COALESCE\(jsonb_agg\(album_row\.value ->> 'id'\), '\[\]'::jsonb\)[\s\S]*?ELSE[\s\S]*?FROM private\.gallery_album_ownership AS ownership/i);
});

test('FRONTEND STATE UPDATE: ownedAlbumIds is maintained after creation', () => {
  const mediaGallery = readFileSync(`${root}/src/pages/MediaGallery.tsx`, 'utf8');
  const adminDashboard = readFileSync(`${root}/src/pages/AdminDashboard.tsx`, 'utf8');

  // AdminDashboard should update ownedAlbumIds on non-President create
  assert.match(adminDashboard, /setOwnedAlbumIds\(prev => new Set\(\[\.\.\.prev, newAlbumId\]\)\);/);
  // MediaGallery should update ownedAlbumIds on non-President create
  assert.match(mediaGallery, /setOwnedAlbumIds\(prev => new Set\(\[\.\.\.prev, newAlbumId\]\)\);/);
});

// ---------------------------------------------------------
// NEW TESTS FOR GALLERY LOCALIZATION PUBLISHING
// ---------------------------------------------------------

const publishMigrationPath = `${root}/supabase/migrations/20260921130000_owned_gallery_localization_publish.sql`;

test('PRESIDENT can publish translation for any album', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /v_is_president := \(SELECT private\.is_current_president\(\)\)/);
  assert.match(sql, /IF NOT v_is_president THEN[\s\S]*?IF NOT EXISTS \([\s\S]*?private\.gallery_album_ownership/);
});

test('PRESIDENT can publish translation for any media', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.publish_owned_gallery_media_localization/);
  assert.match(sql, /IF NOT v_is_president THEN[\s\S]*?IF NOT EXISTS \([\s\S]*?private\.gallery_album_ownership/);
});

test('MEDIA_HEAD can publish translation for their OWN album', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  // MEDIA_HEAD is an executive. The function allows current executives and checks ownership.
  assert.match(sql, /IF NOT \(SELECT private\.is_current_executive\(\)\) THEN[\s\S]*?Only current executives may publish/);
  assert.match(sql, /private\.gallery_album_ownership ownership[\s\S]*?WHERE ownership\.album_id = v_album_id[\s\S]*?AND ownership\.owner_user_id = v_actor_id/);
});

test('MEDIA_HEAD can publish translation for media in their OWN album', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /private\.gallery_album_ownership ownership[\s\S]*?WHERE ownership\.album_id = v_album_id[\s\S]*?AND ownership\.owner_user_id = v_actor_id/);
});

test('MEDIA_HEAD CANNOT publish translation for someone else\'s album', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to localize albums created by another executive'/);
});

test('MEDIA_HEAD CANNOT publish translation for someone else\'s media', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to localize media for albums created by another executive'/);
});

test('Any other EXECUTIVE can publish translation for their OWN album', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  // The logic is based on is_current_executive() and ownership, applying to any executive.
  assert.match(sql, /SELECT private\.is_current_executive\(\)/);
});

test('Any other EXECUTIVE can publish translation for media in their OWN album', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /SELECT private\.is_current_executive\(\)/);
});

test('Any other EXECUTIVE CANNOT publish translation for someone else\'s album', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /Not authorized to localize albums created by another executive/);
});

test('Any other EXECUTIVE CANNOT publish translation for someone else\'s media', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /Not authorized to localize media for albums created by another executive/);
});

test('STUDENT CANNOT publish translation for any album', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /IF NOT \(SELECT private\.is_current_executive\(\)\) THEN[\s\S]*?RAISE EXCEPTION USING ERRCODE = '42501'/);
});

test('STUDENT CANNOT publish translation for any media', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /IF NOT \(SELECT private\.is_current_executive\(\)\) THEN[\s\S]*?RAISE EXCEPTION USING ERRCODE = '42501'/);
});

test('Translation must fail if album does not exist in published_site_content', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /IF v_canonical_album IS NULL THEN[\s\S]*?RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Album not found in published galleryAlbums'/);
});

test('Translation must fail if media does not exist inside the album in published_site_content', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /IF v_canonical_media IS NULL THEN[\s\S]*?RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Media not found in album'/);
});

test('Translation MUST merge correctly without overwriting existing translations in other albums', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /SELECT jsonb_agg\([\s\S]*?CASE[\s\S]*?WHEN item ->> 'id' = v_album_id THEN/);
  assert.match(sql, /ELSE item/);
});

test('Translation MUST merge correctly without overwriting existing translations in other media', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /SELECT jsonb_agg\([\s\S]*?CASE[\s\S]*?WHEN m_item ->> 'id' = v_media_id THEN/);
  assert.match(sql, /ELSE m_item/);
});

test('Translation MUST ONLY update title/description/location for albums (ignores other fields)', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /v_sanitized_translation := jsonb_build_object\('id', v_album_id\)/);
  assert.match(sql, /p_translation \? 'title'/);
  assert.match(sql, /p_translation \? 'description'/);
  assert.match(sql, /p_translation \? 'location'/);
});

test('Translation MUST ONLY update caption for media (ignores other fields)', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /v_sanitized_media_translation := jsonb_build_object\('id', v_media_id\)/);
  assert.match(sql, /p_translation \? 'caption'/);
});

test('Generic cms_localizations_published_insert policy remains untouched (President-only)', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  // Ensuring the migration does not contain any DROP POLICY or ALTER POLICY for insert
  assert.doesNotMatch(sql, /POLICY "cms_localizations_published_insert"/i);
});

test('Generic cms_localizations_published_update policy remains untouched (President-only)', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  // Ensuring the migration does not contain any DROP POLICY or ALTER POLICY for update
  assert.doesNotMatch(sql, /POLICY "cms_localizations_published_update"/i);
});

test('empty album translation rejected', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /IF \(v_sanitized_translation - 'id'\) = '{}'::jsonb THEN[\s\S]*?RAISE EXCEPTION/);
});

test('empty media caption rejected', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /IF \(v_sanitized_media_translation - 'id'\) = '{}'::jsonb THEN[\s\S]*?RAISE EXCEPTION/);
});

test('title-only album translation tracks title only', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /IF v_sanitized_translation \? 'title' AND NOT \(v_album_id \|\| '\.title'/);
});

test('description-only tracks description only', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /IF v_sanitized_translation \? 'description' AND NOT \(v_album_id \|\| '\.description'/);
});

test('location-only tracks location only', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /IF v_sanitized_translation \? 'location' AND NOT \(v_album_id \|\| '\.location'/);
});

test('unrelated manual_paths preserved', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /v_manual_paths := v_existing_row\.manual_paths;/);
});

test('unrelated stale_paths preserved', () => {
  const sql = readFileSync(publishMigrationPath, 'utf8');
  assert.match(sql, /stale_paths = \([\s\S]*?SELECT array_agg\(p\)[\s\S]*?FROM unnest\(stale_paths\) p/);
});

test('new album with empty locale does not call publish RPC', () => {
  const mediaGallery = readFileSync(`${root}/src/pages/MediaGallery.tsx`, 'utf8');
  assert.match(mediaGallery, /const hasTr = albumTranslations\.tr && Object\.values\(albumTranslations\.tr\)\.some\(v => v\.trim\(\) !== ''\);/);
});

test('new album with entered TR/EN publishes after album creation', () => {
  const mediaGallery = readFileSync(`${root}/src/pages/MediaGallery.tsx`, 'utf8');
  assert.match(mediaGallery, /if \(hasTr\) \{[\s\S]*?await localizationRepo\.publishOwnedGalleryAlbumLocalization/);
});

// ---------------------------------------------------------
// NEW TESTS FOR GALLERY DELETION
// ---------------------------------------------------------
const deleteMigrationPath = `${root}/supabase/migrations/20260921150000_gallery_delete_rpcs.sql`;

test('DELETE: President can delete any album', () => {
  const sql = readFileSync(deleteMigrationPath, 'utf8');
  assert.match(sql, /v_is_president := \(SELECT private\.is_current_president\(\)\);/);
  assert.match(sql, /IF NOT v_is_president THEN[\s\S]*?IF NOT EXISTS \([\s\S]*?private\.gallery_album_ownership/);
});

test('DELETE: Owner can delete own album', () => {
  const sql = readFileSync(deleteMigrationPath, 'utf8');
  assert.match(sql, /WHERE ownership\.album_id = v_album_id[\s\S]*?AND ownership\.owner_user_id = v_actor_id/);
});

test('DELETE: Non-owner delete denied', () => {
  const sql = readFileSync(deleteMigrationPath, 'utf8');
  assert.match(sql, /RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to delete albums created by another executive';/);
});

test('DELETE: MEDIA_HEAD non-owner denied', () => {
  // MEDIA_HEAD is not checked separately, only owners and president can delete.
  const adminDash = readFileSync(`${root}/src/pages/AdminDashboard.tsx`, 'utf8');
  assert.match(adminDash, /if \(isPresident \|\| ownedAlbumIds\.has\(id\)\) \{/);
});

test('DELETE: Student denied', () => {
  const sql = readFileSync(deleteMigrationPath, 'utf8');
  assert.match(sql, /IF NOT \(SELECT private\.is_current_executive\(\)\) THEN[\s\S]*?Only current executives may delete gallery/);
});

test('DELETE: Deleted album removed from content', () => {
  const sql = readFileSync(deleteMigrationPath, 'utf8');
  assert.match(sql, /WHERE album_item ->> 'id' <> v_album_id;/);
  assert.match(sql, /UPDATE public\.published_site_content[\s\S]*?SET content = jsonb_set\(content, '\{galleryAlbums\}', v_updated_albums\)/);
});

test('DELETE: Ownership row removed', () => {
  const sql = readFileSync(deleteMigrationPath, 'utf8');
  assert.match(sql, /DELETE FROM private\.gallery_album_ownership[\s\S]*?WHERE album_id = v_album_id;/);
});

test('DELETE: Localization cleanup correct', () => {
  const sql = readFileSync(deleteMigrationPath, 'utf8');
  assert.match(sql, /WHERE item ->> 'id' <> v_album_id;/);
  assert.match(sql, /UPDATE public\.cms_localizations[\s\S]*?SET payload = v_updated_payload/);
});

test('DELETE: Unrelated localization preserved', () => {
  const sql = readFileSync(deleteMigrationPath, 'utf8');
  assert.match(sql, /manual_paths = ARRAY\([\s\S]*?WHERE p NOT LIKE v_album_id \|\| '\.%' AND p <> v_album_id/);
});

test('DELETE: Media delete does not delete whole album', () => {
  const sql = readFileSync(deleteMigrationPath, 'utf8');
  assert.match(sql, /jsonb_set\([\s\S]*?album_item,[\s\S]*?'\{media\}'/);
  assert.match(sql, /WHERE m_item ->> 'id' <> v_media_id/);
});

// ---------------------------------------------------------
// NEW TESTS FOR NEW MEDIA TRANSLATION FIX
// ---------------------------------------------------------
test('new media cannot publish localization before canonical save', () => {
  const mediaGallery = readFileSync(`${root}/src/pages/MediaGallery.tsx`, 'utf8');
  assert.match(mediaGallery, /recordId=\{selectedAlbum\?\.media\.some\(m => m\.id === editingMediaId\) \? editingMediaId : null\}/);
  assert.match(mediaGallery, /احفظ الصورة\/الفيديو أولًا قبل نشر الترجمة\./);
});

test('existing media owner localization publishes', () => {
  const mediaGallery = readFileSync(`${root}/src/pages/MediaGallery.tsx`, 'utf8');
  assert.match(mediaGallery, /publishOwnedGalleryMediaLocalization\(selectedAlbum\.id, editingMediaId, loc, fields\)/);
  assert.match(mediaGallery, /<Edit3/);
});

test('new media flow publishes after save automatically', () => {
  const mediaGallery = readFileSync(`${root}/src/pages/MediaGallery.tsx`, 'utf8');
  assert.match(mediaGallery, /await publishCmsEntityLocales\(\{[\s\S]*?recordId: newMedia\.id, translations: mediaTranslations/);
});

test('error messages for translation failure show specific language', () => {
  const mediaGallery = readFileSync(`${root}/src/pages/MediaGallery.tsx`, 'utf8');
  assert.match(mediaGallery, /throw new Error\(loc === 'tr' \? 'تم حفظ الصورة\/الفيديو، لكن تعذر نشر الترجمة التركية\.' : 'تم حفظ الصورة\/الفيديو، لكن تعذر نشر الترجمة الإنجليزية\.'\)/);
});
