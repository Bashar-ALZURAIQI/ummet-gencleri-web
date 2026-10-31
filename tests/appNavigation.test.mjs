import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Import the pure domain navigation module (to be implemented)
import {
  viewToUrl,
  urlToView,
  validateReturnTo,
  createSafeLoginUrl,
  isValidAdminTab,
  isValidCommitteeId,
  ADMIN_TABS,
  COMMITTEE_IDS,
} from '../src/domain/appNavigation.ts';

// ---------------------------------------------------------------------------
// Pure Routing Tests (1 - 13)
// ---------------------------------------------------------------------------

test('1. home -> /', () => {
  assert.equal(viewToUrl({ kind: 'home' }), '/');
  assert.deepEqual(urlToView('/'), { view: { kind: 'home' } });
});

test('2. about -> /about', () => {
  assert.equal(viewToUrl({ kind: 'about' }), '/about');
  assert.deepEqual(urlToView('/about'), { view: { kind: 'about' } });
});

test('3. programs -> /programs', () => {
  assert.equal(viewToUrl({ kind: 'programs' }), '/programs');
  assert.deepEqual(urlToView('/programs'), { view: { kind: 'programs' } });
});

test('4. news -> /news', () => {
  assert.equal(viewToUrl({ kind: 'news' }), '/news');
  assert.deepEqual(urlToView('/news'), { view: { kind: 'news' } });
});

test('5. gallery -> /gallery', () => {
  assert.equal(viewToUrl({ kind: 'gallery' }), '/gallery');
  assert.deepEqual(urlToView('/gallery'), { view: { kind: 'gallery' } });
});

test('6. contact -> /contact', () => {
  assert.equal(viewToUrl({ kind: 'contact' }), '/contact');
  assert.deepEqual(urlToView('/contact'), { view: { kind: 'contact' } });
});

test('7. guide -> /guide', () => {
  assert.equal(viewToUrl({ kind: 'guide' }), '/guide');
  assert.deepEqual(urlToView('/guide'), { view: { kind: 'guide' } });
});

test('8. faq -> /faq', () => {
  assert.equal(viewToUrl({ kind: 'faq' }), '/faq');
  assert.deepEqual(urlToView('/faq'), { view: { kind: 'faq' } });
});

test('9. board -> /board', () => {
  assert.equal(viewToUrl({ kind: 'board' }), '/board');
  assert.deepEqual(urlToView('/board'), { view: { kind: 'board' } });
});

test('10. every valid committee serializes/parses correctly', () => {
  const expectedCommittees = [
    'presidency',
    'vice-presidency',
    'media',
    'academic',
    'supervisory',
    'activities',
    'finance',
  ];

  for (const cid of expectedCommittees) {
    assert.ok(isValidCommitteeId(cid), `Expected ${cid} to be a valid committee ID`);
    const url = viewToUrl({ kind: 'committee', committeeId: cid });
    assert.equal(url, `/committee/${cid}`);
    const parsed = urlToView(`/committee/${cid}`);
    assert.deepEqual(parsed, { view: { kind: 'committee', committeeId: cid } });
  }
});

test('11. URL -> View roundtrip for all static views', () => {
  const testCases = [
    { url: '/', expected: { kind: 'home' } },
    { url: '/about', expected: { kind: 'about' } },
    { url: '/programs', expected: { kind: 'programs' } },
    { url: '/contact', expected: { kind: 'contact' } },
    { url: '/gallery', expected: { kind: 'gallery' } },
    { url: '/news', expected: { kind: 'news' } },
    { url: '/guide', expected: { kind: 'guide' } },
    { url: '/faq', expected: { kind: 'faq' } },
    { url: '/board', expected: { kind: 'board' } },
    { url: '/login', expected: { kind: 'login' } },
    { url: '/register', expected: { kind: 'register' } },
    { url: '/forgot-password', expected: { kind: 'forgot-password' } },
    { url: '/update-password', expected: { kind: 'update-password' } },
    { url: '/student', expected: { kind: 'student-dashboard' } },
    { url: '/admin', expected: { kind: 'admin' } },
  ];

  for (const tc of testCases) {
    const parsed = urlToView(tc.url);
    assert.deepEqual(parsed.view, tc.expected, `urlToView('${tc.url}')`);
    const serialized = viewToUrl(tc.expected);
    assert.equal(serialized, tc.url, `viewToUrl(${JSON.stringify(tc.expected)})`);
  }
});

test('12. View -> URL roundtrip with query parameters', () => {
  const viewWithTab = { kind: 'admin', tab: 'member-points' };
  const url = viewToUrl(viewWithTab);
  assert.equal(url, '/admin?tab=member-points');
  const parsed = urlToView(url);
  assert.deepEqual(parsed.view, viewWithTab);

  const loginWithReturn = { kind: 'login', returnTo: '/admin?tab=member-points' };
  const loginUrl = viewToUrl(loginWithReturn);
  assert.equal(loginUrl, '/login?returnTo=%2Fadmin%3Ftab%3Dmember-points');
  const parsedLogin = urlToView(loginUrl);
  assert.deepEqual(parsedLogin.view, loginWithReturn);
});

test('13. invalid path fails safely to home', () => {
  const invalidPaths = [
    '/unknown-path-12345',
    '/admin/unknown/subpath',
    '/committee/invalid-committee-xyz',
    '////',
    '/..%2f..%2f',
  ];

  for (const p of invalidPaths) {
    const parsed = urlToView(p);
    assert.deepEqual(parsed.view, { kind: 'home' }, `Expected ${p} to fail-closed to home`);
  }
});

// ---------------------------------------------------------------------------
// Security & Return-To Validation Tests (36 - 39)
// ---------------------------------------------------------------------------

test('36. returnTo contains only internal path', () => {
  assert.equal(validateReturnTo('/admin?tab=member-points'), '/admin?tab=member-points');
  assert.equal(validateReturnTo('/student'), '/student');
  assert.equal(validateReturnTo('/news'), '/news');
  assert.equal(validateReturnTo('/committee/media'), '/committee/media');
});

test('37. external returnTo is rejected', () => {
  assert.equal(validateReturnTo('https://evil.example/phish'), null);
  assert.equal(validateReturnTo('http://evil.example'), null);
  assert.equal(validateReturnTo('ftp://example.com'), null);
});

test('38. protocol-relative returnTo is rejected', () => {
  assert.equal(validateReturnTo('//evil.example'), null);
  assert.equal(validateReturnTo('//evil.example/admin'), null);
  assert.equal(validateReturnTo('/\\evil.example'), null);
  assert.equal(validateReturnTo('\\evil.example'), null);
});

test('39. javascript and data returnTo are rejected', () => {
  assert.equal(validateReturnTo('javascript:alert(1)'), null);
  assert.equal(validateReturnTo('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(validateReturnTo('vbscript:msgbox(1)'), null);
});

// ---------------------------------------------------------------------------
// Recovery & Web Push URL Handling (61 - 64)
// ---------------------------------------------------------------------------

test('61. password recovery route still reaches update-password', () => {
  const parsed = urlToView('/?auth=recovery');
  assert.deepEqual(parsed.view, { kind: 'update-password' });
  assert.equal(parsed.isPasswordRecovery, true);
});

test('62. generic route parsing preserves auth=recovery on any path', () => {
  const parsed = urlToView('/about?auth=recovery');
  assert.deepEqual(parsed.view, { kind: 'update-password' });
  assert.equal(parsed.isPasswordRecovery, true);
});

test('63. recovery callback delivered to Site URL without auth parameter still routes to update-password', () => {
  const parsed = urlToView('/#access_token=tokenValue&refresh_token=refreshValue&type=recovery');
  assert.deepEqual(parsed.view, { kind: 'update-password' });
  assert.equal(parsed.isPasswordRecovery, true);
  assert.deepEqual(urlToView('/#access_token=tokenValue&refresh_token=refreshValue&type=signup').view, { kind: 'home' });
});

test('64. push destination parses to intended view', () => {
  const parsedNews = urlToView('/?push=news');
  assert.deepEqual(parsedNews.view, { kind: 'news' });
  assert.equal(parsedNews.pushDestination, 'news');

  const parsedPrograms = urlToView('/?push=programs');
  assert.deepEqual(parsedPrograms.view, { kind: 'programs' });
  assert.equal(parsedPrograms.pushDestination, 'programs');

  const parsedGallery = urlToView('/?push=gallery');
  assert.deepEqual(parsedGallery.view, { kind: 'gallery' });
  assert.equal(parsedGallery.pushDestination, 'gallery');
});

// ---------------------------------------------------------------------------
// Language URL Invariance (65 - 67)
// ---------------------------------------------------------------------------

test('65. URLs remain clean and invariant across locales', () => {
  // Routes must not embed language tags
  assert.equal(viewToUrl({ kind: 'news' }), '/news');
  assert.equal(viewToUrl({ kind: 'admin', tab: 'members' }), '/admin?tab=members');
});

test('66. no /ar /tr /en route prefixes are allowed or generated', () => {
  const urls = [
    viewToUrl({ kind: 'home' }),
    viewToUrl({ kind: 'about' }),
    viewToUrl({ kind: 'news' }),
    viewToUrl({ kind: 'programs' }),
    viewToUrl({ kind: 'committee', committeeId: 'academic' }),
    viewToUrl({ kind: 'admin', tab: 'stats' }),
  ];

  for (const u of urls) {
    assert.doesNotMatch(u, /^\/(ar|tr|en)(\/|$)/);
  }
});

test('67. route IDs and AdminTab values remain language-independent machine identifiers', () => {
  assert.ok(ADMIN_TABS.includes('member-points'));
  assert.ok(ADMIN_TABS.includes('pending-edits'));
  assert.ok(COMMITTEE_IDS.includes('presidency'));
  assert.ok(COMMITTEE_IDS.includes('media'));
});
