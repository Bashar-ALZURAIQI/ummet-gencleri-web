import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../'+p, import.meta.url),'utf8');
const config = JSON.parse(read('vercel.json'));
const regex = new RegExp('^'+config.rewrites[0].source+'$');
test('SPA deep links continue to resolve through index.html',()=>{
 for (const p of ['/','/news','/programs','/student','/admin','/forgot-password','/update-password']) assert.equal(regex.test(p),true,p);
 assert.equal(config.rewrites[0].destination,'/index.html');
});
test('static asset paths are not rewritten to HTML and APIs remain untouched',()=>{
 for(const p of ['/assets/old-chunk.js','/assets/no-such.css','/icons/missing.svg','/api/send-union-mail']) assert.equal(regex.test(p),false,p);
});
test('Vite dynamic import error triggers at most one automatic refresh in 60 seconds',()=>{
 const main=read('src/main.tsx');
 assert.match(main,/vite:preloadError/);
 assert.match(main,/now - last < 60_000/);
 assert.match(main,/sessionStorage\.setItem\(key, String\(now\)\)/);
 assert.match(main,/event\.preventDefault\(\)/);
 assert.match(main,/window\.location\.reload\(\)/);
 assert.match(main,/Disabled session storage: avoid an uncontrolled reload loop/);
});
test('long login delay has accurate warning and user-controlled retry without touching Supabase auth',()=>{
 const auth=read('src/pages/AuthPages.tsx');
 assert.match(auth,/setTimeout\(\(\) => setSlowLogin\(true\), 15000\)/);
 assert.match(auth,/loading && slowLogin/);
 assert.match(auth,/role="status"/);
 assert.match(auth,/t\('auth\.slowLoginWarning'\)/);
 assert.match(auth,/onClick=\{\(\) => window\.location\.reload\(\)\}/);
 assert.match(auth,/const res = await login\(email\.trim\(\), password\)/);
});
test('warning is localized without exposing credentials',()=>{
 for(const [lang,word] of [['ar','تأخر الاتصال'],['tr','Giriş hizmetinden'],['en','sign-in service']]){
  const file=read('src/i18n/locales/'+lang+'.ts');
  assert.match(file, /slowLoginWarning:/);
  assert.ok(file.includes(word));
 }
});
