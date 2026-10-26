import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('every account password field uses the shared accessible visibility control', async () => {
  const [authPages, profileSettings, passwordField] = await Promise.all([
    read('../src/pages/AuthPages.tsx'),
    read('../src/components/ProfileSettings.tsx'),
    read('../src/components/PasswordField.tsx'),
  ]);

  assert.doesNotMatch(authPages, /<input[\s\S]{0,180}?type="password"/);
  assert.doesNotMatch(profileSettings, /<input[\s\S]{0,180}?type="password"/);
  assert.match(authPages, /<PasswordField/g);
  assert.match(profileSettings, /<PasswordField/g);
  assert.match(passwordField, /EyeOff/);
  assert.match(passwordField, /Eye/);
  assert.match(passwordField, /aria-label=/);
  assert.match(passwordField, /type="button"/);
});

test('forgot and update password screens are routed through the existing View router', async () => {
  const [app, context, authPages] = await Promise.all([
    read('../src/App.tsx'),
    read('../src/context/AppContext.tsx'),
    read('../src/pages/AuthPages.tsx'),
  ]);

  assert.match(context, /kind: 'forgot-password'/);
  assert.match(context, /kind: 'update-password'/);
  assert.match(app, /<ForgotPasswordPage/);
  assert.match(app, /<UpdatePasswordPage/);
  assert.match(authPages, /هل نسيت كلمة المرور؟/);
  assert.match(authPages, /تم إرسال رابط الاستعادة إلى بريدك الإلكتروني/);
  assert.match(authPages, /تم تغيير كلمة المرور بنجاح/);
});

test('recovery update UI is gated by the confirmed Supabase PASSWORD_RECOVERY event', async () => {
  const context = await read('../src/context/AppContext.tsx');

  assert.match(context, /event === 'PASSWORD_RECOVERY'/);
  assert.match(context, /passwordRecoveryReady/);
  assert.match(context, /requestPasswordReset/);
  assert.match(context, /updateRecoveredPassword/);
  assert.match(context, /finishPasswordRecovery/);
});

test('recovery callback URL is preserved until Supabase has consumed its credentials', async () => {
  const [app, client, context, auth] = await Promise.all([
    read('../src/App.tsx'),
    read('../src/lib/supabase.ts'),
    read('../src/context/AppContext.tsx'),
    read('../src/pages/AuthPages.tsx'),
  ]);
  assert.match(app, /Supabase Auth still needs the callback code\/hash/);
  assert.doesNotMatch(app, /navigate\(\{ kind: 'update-password' \}, \{ replace: true \}\);/);
  assert.ok(client.indexOf('extractRecoveryCallbackAccessToken(window.location.href)') < client.indexOf('createClient(supabaseUrl, supabaseAnonKey)'));
  assert.match(context, /isInitialRecoveryCallbackSession\(session\)/);
  assert.match(context, /await supabase\.auth\.getUser\(\)/);
  assert.match(context, /data\.user\?\.id === session\.user\.id/);
  assert.match(context, /passwordRecoveryGateRef\.current === 'READY'/);
  assert.match(auth, /verificationTimedOut/);
  assert.match(auth, /window\.setTimeout\(\(\) => setVerificationTimedOut\(true\), 15000\)/);
});
