import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminDashboardPath = path.join(__dirname, '../src/pages/AdminDashboard.tsx');

test('test_gallery_album_session_draft', () => {
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("buildSessionDraftKey(currentUser.userId, 'admin:gallery-album', editAlbumId === 'create' ? 'create' : 'edit', editAlbumId === 'create' ? undefined : editAlbumId)"), 'Must build album edit key');
  assert.ok(source.includes("albumDraft.clearDraft()"), 'Album submit success must clear draft');
  assert.ok(source.includes("albumForm.coverImage.startsWith('blob:')"), 'Must detect un-uploaded blob URL for coverImage');
});

test('test_gallery_media_session_draft', () => {
  const source = fs.readFileSync(adminDashboardPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(source.includes("buildSessionDraftKey("), 'Must build media edit key');
  assert.ok(source.includes("`${editMediaId.albumId}.${editMediaId.mediaId}`"), 'Must serialize album and media id together with dot');
  assert.ok(source.includes("mediaDraft.clearDraft()"), 'Media submit success must clear draft');
  assert.ok(source.includes("mediaForm.url.startsWith('blob:')"), 'Must detect un-uploaded blob URL for media url');
});
