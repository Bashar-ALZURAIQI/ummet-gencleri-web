import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

async function read(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  } catch (error) {
    assert.fail(`${path} must exist: ${error.message}`);
  }
}

async function loadFaviconModule() {
  try {
    return await import('../src/components/DynamicFaviconSync.ts');
  } catch (error) {
    assert.fail(`DynamicFavicon helper must exist: ${error.message}`);
  }
}

function createDocumentWithNoIcon() {
  const links = [];
  let creations = 0;

  return {
    links,
    get creations() {
      return creations;
    },
    querySelector(selector) {
      assert.equal(selector, 'link[rel~="icon"]');
      return links.find((link) => link.rel.split(/\s+/).includes('icon')) ?? null;
    },
    createElement(name) {
      assert.equal(name, 'link');
      creations += 1;
      return { rel: '', href: '' };
    },
    head: {
      appendChild(link) {
        links.push(link);
        return link;
      },
    },
  };
}

test('favicon synchronization reuses one icon link and restores the safe fallback', async () => {
  const { DEFAULT_FAVICON_HREF, synchronizeFavicon } = await loadFaviconModule();
  const documentRef = createDocumentWithNoIcon();

  const created = synchronizeFavicon(documentRef, 'https://cdn.example.test/union-logo.webp');
  const reused = synchronizeFavicon(documentRef, undefined);

  assert.strictEqual(created, reused);
  assert.equal(documentRef.creations, 1);
  assert.equal(documentRef.links.length, 1);
  assert.equal(reused.rel, 'icon');
  assert.equal(reused.href, DEFAULT_FAVICON_HREF);
});

test('brand presentation wires the current logo into the navbar and app provider tree', async () => {
  const [brandMark, navbar, favicon, faviconSynchronizer, app] = await Promise.all([
    read('src/components/BrandMark.tsx'),
    read('src/components/Navbar.tsx'),
    read('src/components/DynamicFavicon.tsx'),
    read('src/components/DynamicFaviconSync.ts'),
    read('src/App.tsx'),
  ]);

  assert.match(brandMark, /logoUrl/);
  assert.match(brandMark, /logoIcon/);
  assert.match(brandMark, /alt=.*شعار/);
  assert.match(brandMark, /object-contain/);
  assert.doesNotMatch(brandMark, /bg-gradient-to-br/);
  assert.doesNotMatch(brandMark, /object-contain\s+p-1/);
  assert.match(brandMark, /onError/);
  assert.match(brandMark, /setImageFailed\(false\)/);
  assert.match(brandMark, /<Users/);

  assert.match(navbar, /<BrandMark/);
  assert.match(navbar, /logoUrl=\{siteContent\.brand\.logoUrl\}/);
  assert.match(navbar, /logoIcon=\{siteContent\.brand\.logoIcon\}/);
  assert.match(navbar, /brand\.name/);
  assert.match(navbar, /brand\.nameTr/);

  assert.match(favicon, /logoUrl/);
  assert.match(faviconSynchronizer, /link\[rel~=["']icon["']\]/);
  assert.match(faviconSynchronizer, /createElement\(['"]link['"]\)/);
  assert.match(app, /<DynamicFavicon\s*\/>/);
  assert.match(app, /<AppProvider>[\s\S]*<DynamicFavicon\s*\/>[\s\S]*<Router\s*\/>[\s\S]*<\/AppProvider>/);
});

test('favicon static artifacts correctly point to public branding assets', async () => {
  const [indexHtml, manifestJson] = await Promise.all([
    read('index.html'),
    read('public/manifest.webmanifest'),
  ]);

  const { DEFAULT_FAVICON_HREF } = await loadFaviconModule();

  // index.html correctly configured
  assert.match(indexHtml, /<link rel="icon" href="\/favicon\.png" \/>/, 'index.html favicon points to /favicon.png');
  assert.doesNotMatch(indexHtml, /union-push-icon\.svg/i, 'index.html must not use push icon as favicon');
  assert.doesNotMatch(indexHtml, /type="image\//i, 'favicon link must not hardcode MIME type incompatible with future formats');

  // DEFAULT_FAVICON_HREF matches static configuration
  assert.equal(DEFAULT_FAVICON_HREF, '/favicon.png', 'fallback favicon href matches static file');

  // manifest.webmanifest correctly configured
  assert.doesNotMatch(manifestJson, /union-push-icon\.svg/i, 'manifest must not use push icon');
  const manifest = JSON.parse(manifestJson);
  const icon192 = manifest.icons.find(i => i.sizes === '192x192');
  const icon512 = manifest.icons.find(i => i.sizes === '512x512');

  assert.ok(icon192, 'manifest must declare 192x192 icon');
  assert.equal(icon192.src, '/icons/union-brand-192.png');
  assert.ok(icon512, 'manifest must declare 512x512 icon');
  assert.equal(icon512.src, '/icons/union-brand-512.png');

  for (const icon of manifest.icons) {
    assert.doesNotMatch(icon.purpose || '', /maskable/i, 'manifest must NOT claim maskable unless a dedicated verified maskable file exists');
  }
});

test('SEO structured data properly identifies the union', async () => {
  const indexHtml = await read('index.html');

  assert.match(indexHtml, /<meta name="application-name" content="Ümmet Gençleri Birliği" \/>/, 'application-name is present');
  assert.match(indexHtml, /<meta property="og:site_name" content="Ümmet Gençleri Birliği" \/>/, 'og:site_name is present');
  assert.match(indexHtml, /<link rel="canonical" href="https:\/\/ummet-genc\.vercel\.app\/" \/>/, 'canonical URL is correctly present with trailing slash');

  const jsonLdMatch = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'JSON-LD script must exist');
  
  const jsonLdText = jsonLdMatch[1];
  assert.doesNotMatch(jsonLdText, /Vercel/, 'structured data site name must not be Vercel');

  const structuredData = JSON.parse(jsonLdText);
  assert.equal(structuredData['@context'], 'https://schema.org');

  const graph = structuredData['@graph'];
  assert.ok(Array.isArray(graph), 'should use @graph array');

  const org = graph.find(e => e['@type'] === 'Organization');
  assert.ok(org, 'Organization entity must exist');
  assert.equal(org.name, 'Ümmet Gençleri Birliği');
  assert.ok(org.alternateName.includes('اتحاد شباب الأمة'));
  assert.ok(org.alternateName.includes('UMS Union'));
  assert.ok(org.alternateName.includes('Ummah Youth Union'));
  assert.equal(org.url, 'https://ummet-genc.vercel.app/');
  assert.equal(org.logo['@type'], 'ImageObject');
  assert.equal(org.logo.url, 'https://ummet-genc.vercel.app/favicon.png');
  assert.equal(org.logo.width, 898);
  assert.equal(org.logo.height, 898);

  const website = graph.find(e => e['@type'] === 'WebSite');
  assert.ok(website, 'WebSite entity must exist');
  assert.equal(website.name, 'Ümmet Gençleri Birliği');
  assert.ok(website.alternateName.includes('اتحاد شباب الأمة'));
  assert.ok(website.alternateName.includes('UMS Union'));
  assert.ok(website.alternateName.includes('Ummah Youth Union'));
  assert.equal(website.url, 'https://ummet-genc.vercel.app/');
  assert.equal(website.publisher['@id'], org['@id']);
});
