import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('all account and executive identity surfaces render through UserAvatar', async () => {
  const sources = await Promise.all([
    '../src/components/Navbar.tsx',
    '../src/pages/StudentDashboard.tsx',
    '../src/pages/AdminDashboard.tsx',
    '../src/pages/BoardPage.tsx',
    '../src/pages/CommitteePage.tsx',
  ].map(read));

  for (const source of sources) {
    assert.match(source, /import UserAvatar from ['"]\.\.\/components\/UserAvatar['"]|import UserAvatar from ['"]\.\/UserAvatar['"]/);
    assert.match(source, /<UserAvatar/);
  }

  assert.doesNotMatch(sources[0], /currentUser\.name[^\n]*charAt\(0\)/);
  assert.doesNotMatch(sources[2], /currentUser\?\.name\?\.charAt\(0\)/);
  assert.doesNotMatch(sources[3], /<img[^>]+head\?\.photo/);
  assert.doesNotMatch(sources[4], /<img[^>]+(?:head|m)\.?\??\.photo/);
});

test('context loads and subscribes to the public executive projection and syncs confirmed profiles by UUID', async () => {
  const [context, committee, admin] = await Promise.all([
    read('../src/context/AppContext.tsx'),
    read('../src/pages/CommitteePage.tsx'),
    read('../src/pages/AdminDashboard.tsx'),
  ]);

  assert.match(context, /refreshPublicExecutiveBoard/);
  assert.match(context, /synchronizeProfileIdentityByUserId/);
  assert.doesNotMatch(context, /photo:\s*[^,\n]*\|\|\s*DEFAULT_PHOTO/);
  assert.doesNotMatch(committee, /const photo = memberForm\.photo \|\| `https?:/);
  assert.doesNotMatch(admin, /const photo = memberForm\.photo \|\| `https?:/);
});

test('board profile editing is wired to the authenticated owners profiles row only', async () => {
  const [context, admin] = await Promise.all([
    read('../src/context/AppContext.tsx'),
    read('../src/pages/AdminDashboard.tsx'),
  ]);

  assert.match(context, /prepareOwnExecutiveProfileUpdate/);
  assert.match(context, /updateOwnProfileService\(owner\.userId, prepared\.data\)/);
  assert.doesNotMatch(context, /from\(['"]board_members['"]\)\.update/);
  assert.match(admin, /c\.head\?\.id === currentUser\?\.userId/);
});

test('public executive refresh selects contact_email and binds it to the board head email', async () => {
  const [service, mapper, directory] = await Promise.all([
    read('../src/services/accountService.ts'),
    read('../src/domain/supabaseMappers.ts'),
    read('../src/domain/accountDirectoryDisplay.ts'),
  ]);

  assert.match(service, /PUBLIC_EXECUTIVE_DIRECTORY_SELECT_COLUMNS[\s\S]*?['"]contact_email['"]/);
  assert.match(mapper, /contactEmail:\s*safeText\(row\.contact_email\)/);
  assert.match(directory, /email:\s*executive\.contactEmail/);
  assert.doesNotMatch(mapper, /contactEmail:\s*safeText\(row\.login_email\)/);
});
