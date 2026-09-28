import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('Mobile Login Visibility', async (t) => {
  const navbarPath = join(process.cwd(), 'src/components/Navbar.tsx');
  const navbarCode = readFileSync(navbarPath, 'utf8');

  await t.test('1. logged-out mobile users have a Login action outside the hamburger menu', () => {
    assert.match(navbarCode, /className="flex items-center gap-1 sm:gap-1\.5 rounded-xl bg-navy-800/);
    assert.doesNotMatch(navbarCode, /className="hidden items-center gap-1\.5 rounded-xl bg-navy-800/);
  });

  await t.test('2. authenticated users do not receive the logged-out Login action', () => {
    assert.match(navbarCode, /\{\s*currentUser \? \([\s\S]*\) : \(\s*<button[\s\S]*?\{t\('auth\.login'\)\}\s*<\/button>\s*\)\}/);
  });

  await t.test('3. existing login route/navigation remains unchanged', () => {
    assert.match(navbarCode, /onClick=\{\(\) => go\(\{ kind: 'login' \}\)\}/);
  });
});
