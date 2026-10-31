import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const path = new URL('../public/hosting-check.html', import.meta.url);
test('Cloudflare trial probe is standalone, has no database dependency and cannot write user data', () => {
  const html = readFileSync(path, 'utf8');
  assert.match(html, /استضافة اتحاد شباب الأمة/);
  assert.match(html, /fetch\('\/favicon\.png\?hosting_check='/);
  assert.match(html, /noindex,nofollow/);
  assert.doesNotMatch(html, /supabase|\/auth\/v1\/|\/rest\/v1\/|send-union-mail|service_role|VITE_SUPABASE_/i);
  assert.doesNotMatch(html, /method:\s*['"](POST|PUT|DELETE|PATCH)/i);
});
test('Cloudflare trial instructions pin an isolated branch and do not change production', () => {
  const doc = readFileSync(new URL('../docs/cloudflare-pages-trial.md', import.meta.url),'utf8');
  assert.match(doc, /experiment\/cloudflare-pages-isolated/);
  assert.match(doc, /do \*\*not\*\* merge/i);
  assert.match(doc, /production branch/i);
  assert.match(doc, /VITE_SUPABASE_ANON_KEY/);
  assert.match(doc, /separate staging Supabase project/i);
  assert.equal(existsSync(new URL('../public/404.html', import.meta.url)),false);
});
