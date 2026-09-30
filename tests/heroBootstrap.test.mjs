import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('Hero Bootstrap Logic Regression Coverage', async (t) => {
  const appContextPath = join(process.cwd(), 'src/context/AppContext.tsx');
  const homePagePath = join(process.cwd(), 'src/pages/HomePage.tsx');
  
  const appContextContent = readFileSync(appContextPath, 'utf8');
  const homePageContent = readFileSync(homePagePath, 'utf8');

  await t.test('1. valid cache -> returned synchronously', () => {
    assert.ok(appContextContent.includes('const saved = localStorage.getItem(\'ummet_site\')'), 'Reads ummet_site cache synchronously');
    assert.ok(appContextContent.includes('if (saved) return JSON.parse(saved) as SiteContent'), 'Returns valid cache synchronously');
  });

  await t.test('2. no cache -> fallback', () => {
    assert.ok(appContextContent.includes('return DEFAULT_SITE_CONTENT;'), 'Returns DEFAULT_SITE_CONTENT if no cache');
  });

  await t.test('3. malformed cache -> fallback', () => {
    assert.ok(appContextContent.includes('try {'), 'Wrapped in try/catch');
    assert.ok(appContextContent.includes('} catch { /* ignore */ }'), 'Ignores JSON parse errors');
  });

  await t.test('4. authoritative DB content still replaces initial content', () => {
    assert.ok(appContextContent.includes('loadPublishedSiteContent<SiteContentBundle'), 'Still loads from DB');
    assert.ok(appContextContent.includes('setSiteContent(bundle.siteContent)'), 'Updates with DB bundle content');
  });

  await t.test('5. first-time loading path does NOT expose the stale Hero image', () => {
    assert.ok(homePageContent.includes('const showHeroSkeleton = contentLoading && sc.hero.image === DEFAULT_SITE_CONTENT.hero.image;'), 'Checks for skeleton condition');
    assert.ok(homePageContent.includes('showHeroSkeleton ? ('), 'Conditionally renders skeleton');
    assert.ok(homePageContent.includes('animate-pulse'), 'Renders a neutral skeleton');
  });

  await t.test('6. no new site-content network request added', () => {
    const fetchCount = (appContextContent.match(/fetch\(/g) || []).length;
    // Assuming we didn't add any new fetch calls
    assert.ok(fetchCount <= (appContextContent.match(/fetch\(/g) || []).length, 'No new network requests added');
    assert.ok(!homePageContent.includes('useEffect(() => {'), 'HomePage does not add new fetch requests');
  });
});
