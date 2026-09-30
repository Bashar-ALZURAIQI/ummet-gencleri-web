import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInitialSiteContent, isUsableSiteContent } from '../src/domain/siteContentBootstrap.ts';
import { DEFAULT_SITE_CONTENT } from '../src/data/defaultSiteContent.ts';

test('Hero Bootstrap Cache Resolver Shape Guard', async (t) => {
  const validCache = structuredClone(DEFAULT_SITE_CONTENT);
  validCache.hero.image = 'cached-image';
  validCache.hero.title = 'legacy-title';

  const bundleCache = {
    siteContent: structuredClone(DEFAULT_SITE_CONTENT)
  };
  bundleCache.siteContent.hero.title = 'bundle-title';

  await t.test('1. valid legacy cache -> returned', () => {
    const result = resolveInitialSiteContent(JSON.stringify(validCache), bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'legacy-title');
  });

  await t.test('2. malformed legacy cache + valid bundle cache -> bundle returned', () => {
    const result = resolveInitialSiteContent('{ malformed json', bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'bundle-title');
  });

  await t.test('3. partial legacy cache -> bundle returned', () => {
    const partialCache = structuredClone(validCache);
    partialCache.hero = {}; // intentionally destroy the hero shape
    const result = resolveInitialSiteContent(JSON.stringify(partialCache), bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'bundle-title');
  });

  await t.test('4. malformed both -> fallback', () => {
    const result = resolveInitialSiteContent('{ malformed json', null, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, DEFAULT_SITE_CONTENT.hero.title);
  });

  await t.test('5. no caches -> fallback', () => {
    const result = resolveInitialSiteContent(null, null, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, DEFAULT_SITE_CONTENT.hero.title);
  });

  await t.test('6. fallback hero image is neutral/empty', () => {
    assert.equal(DEFAULT_SITE_CONTENT.hero.image, '');
  });

  // Specific Rejection Tests for Shape Validation
  await t.test('7. rejects missing about.features', () => {
    const partial = structuredClone(validCache);
    delete partial.about.features;
    const result = resolveInitialSiteContent(JSON.stringify(partial), bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'bundle-title', 'Should reject cache and fall through to bundle');
  });

  await t.test('8. rejects missing about.imageBadge', () => {
    const partial = structuredClone(validCache);
    delete partial.about.imageBadge;
    const result = resolveInitialSiteContent(JSON.stringify(partial), bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'bundle-title');
  });

  await t.test('9. rejects missing footer.social', () => {
    const partial = structuredClone(validCache);
    delete partial.footer.social;
    const result = resolveInitialSiteContent(JSON.stringify(partial), bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'bundle-title');
  });

  await t.test('10. rejects malformed stats item', () => {
    const partial = structuredClone(validCache);
    // @ts-expect-error test malformed value
    partial.stats[0].value = 'not-a-number';
    const result = resolveInitialSiteContent(JSON.stringify(partial), bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'bundle-title');
  });

  await t.test('11. rejects missing hero.badge1.label', () => {
    const partial = structuredClone(validCache);
    delete partial.hero.badge1.label;
    const result = resolveInitialSiteContent(JSON.stringify(partial), bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'bundle-title');
  });

  await t.test('12. rejects missing boardPreview.memberIds', () => {
    const partial = structuredClone(validCache);
    delete partial.boardPreview.memberIds;
    const result = resolveInitialSiteContent(JSON.stringify(partial), bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'bundle-title');
  });
});

test('Hero Network Contract', async (t) => {
  const appContextPath = join(process.cwd(), 'src/context/AppContext.tsx');
  const homePagePath = join(process.cwd(), 'src/pages/HomePage.tsx');
  
  const appContextContent = readFileSync(appContextPath, 'utf8');
  const homePageContent = readFileSync(homePagePath, 'utf8');

  await t.test('AppContext still has exactly ONE site-content load path using loadPublishedSiteContent', () => {
    const count = (appContextContent.match(/void loadPublishedSiteContent</g) || []).length;
    assert.equal(count, 1);
  });

  await t.test('HomePage introduces no fetch/network call', () => {
    assert.ok(!homePageContent.includes('fetch('), 'HomePage does not introduce fetch');
    assert.ok(!homePageContent.includes('useEffect('), 'HomePage does not introduce new effects');
  });
});
