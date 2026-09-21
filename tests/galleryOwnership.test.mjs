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
