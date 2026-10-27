import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const mobileMenu = source.match(/\{\/\* Mobile menu \*\/\}([\s\S]*)$/)?.[1] ?? '';

test('anonymous mobile menu exposes a standalone login action using the real login route', () => {
  assert.match(mobileMenu, /!currentUser\s*&&\s*\(/);
  assert.match(mobileMenu, /onClick=\{\(\)\s*=>\s*go\(\{\s*kind:\s*'login'\s*\}\)\}/);
  assert.match(mobileMenu, /<LogIn[\s\S]*?t\('auth\.login'\)/);
});

test('student portal remains present and authenticated mobile users do not receive login', () => {
  assert.match(mobileMenu, /onClick=\{goStudentPortal\}/);
  const loginGuard = mobileMenu.match(/!currentUser\s*&&\s*\(([\s\S]*?)\n\s*\)\}/)?.[1] ?? '';
  assert.match(loginGuard, /kind:\s*'login'/);
});

test('desktop anonymous login action remains present', () => {
  const desktop = source.match(/\{\/\* Right actions \*\/\}([\s\S]*?)\{\/\* Mobile toggle \*\/\}/)?.[1] ?? '';
  assert.match(desktop, /kind:\s*'login'/);
  assert.match(desktop, /t\('auth\.login'\)/);
});

test('authenticated phone header directly exposes role-correct portal and logout beside language', () => {
  const headerActions = source.match(/\{\/\* Right actions \*\/\}([\s\S]*?)\{\/\* Mobile toggle \*\/\}/)?.[1] ?? '';
  assert.match(headerActions, /<LanguageSwitcher variant="desktop" \/>/);
  assert.match(headerActions, /showMobileAccountActions\s*&&\s*\(/);
  assert.match(headerActions, /data-mobile-account-actions/);
  assert.match(headerActions, /sm:hidden/);
  assert.match(headerActions, /onClick=\{goStudentPortal\}/);
  assert.match(headerActions, /t\('dashboard\.studentPortal'\)/);
  assert.match(headerActions, /t\('admin\.adminDashboard'\)/);
  assert.match(headerActions, /onClick=\{\(\) => \{ void logout\(\);/);
  assert.match(headerActions, /aria-label=\{t\('auth\.logout'\)\}/);
  assert.match(headerActions, /className="truncate"/);
});

test('mobile shortcut only appears after a confirmed student or admin role, and public login is unchanged', () => {
  assert.match(source, /const showMobileAccountActions = !!currentUser\s*&& !authInitializing\s*&& !identityRefreshing\s*&& \(currentUser\.role === 'STUDENT' \|\| adminUiAllowed\);/);
  assert.match(source, /const mobilePortalIsAdmin = adminUiAllowed/);
  assert.match(source, /if \(currentUser\?\.role === 'STUDENT'\) go\(\{ kind: 'student-dashboard' \}\)/);
  assert.match(source, /else if \(adminUiAllowed\) goAdmin\(\)/);
  assert.match(source, /!currentUser[\s\S]*?kind: 'login'/);
  // The narrow-screen controls have textual accessible names in every locale.
  assert.match(source, /aria-label=\{mobilePortalIsAdmin \? t\('admin\.adminDashboard'\) : t\('dashboard\.studentPortal'\)\}/);
});
