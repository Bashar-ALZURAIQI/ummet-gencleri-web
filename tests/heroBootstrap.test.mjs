import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInitialSiteContent, isUsableSiteContent } from '../src/domain/siteContentBootstrap.ts';
import { DEFAULT_SITE_CONTENT } from '../src/data/defaultSiteContent.ts';

test('Hero Bootstrap Cache Resolver', async (t) => {
  const validCache = {
    brand: { name: 'brand' },
    footer: { email: 'email' },
    hero: { title: 'title', image: 'image', badge1: { value: '1' }, badge2: { value: '2' } },
    stats: [],
    about: { title: 'about' },
    boardPreview: { title: 'board' }
  };

  const bundleCache = {
    siteContent: {
      ...validCache,
      hero: { ...validCache.hero, title: 'bundle-title' }
    }
  };

  await t.test('1. valid legacy cache -> returned', () => {
    const result = resolveInitialSiteContent(JSON.stringify(validCache), bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'title');
  });

  await t.test('2. malformed legacy cache + valid bundle cache -> bundle returned', () => {
    const result = resolveInitialSiteContent('{ malformed json', bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'bundle-title');
  });

  await t.test('3. partial legacy cache + valid bundle -> bundle returned', () => {
    const partialCache = { ...validCache, hero: {} }; // missing required hero string fields
    const result = resolveInitialSiteContent(JSON.stringify(partialCache), bundleCache, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, 'bundle-title');
  });

  await t.test('4. malformed both -> fallback', () => {
    const result = resolveInitialSiteContent('{ malformed json', null, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, DEFAULT_SITE_CONTENT.hero.title);
  });

  await t.test('5. partial both -> fallback', () => {
    const partialCache = { ...validCache, stats: null }; // missing array
    const partialBundle = { siteContent: partialCache };
    const result = resolveInitialSiteContent(JSON.stringify(partialCache), partialBundle, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, DEFAULT_SITE_CONTENT.hero.title);
  });

  await t.test('6. no caches -> fallback', () => {
    const result = resolveInitialSiteContent(null, null, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.title, DEFAULT_SITE_CONTENT.hero.title);
  });

  await t.test('7. valid hero image preserved', () => {
    const result = resolveInitialSiteContent(JSON.stringify(validCache), null, DEFAULT_SITE_CONTENT);
    assert.equal(result.hero.image, 'image');
  });

  await t.test('8. fallback hero image is neutral/empty', () => {
    assert.equal(DEFAULT_SITE_CONTENT.hero.image, '');
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
