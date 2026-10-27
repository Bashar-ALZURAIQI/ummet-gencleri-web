import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('homepage renders pinned upcoming events using navigation-only preview', async () => {
  const home = await read('src/pages/HomePage.tsx');
  assert.match(home, /e\.showOnHomepage && e\.status === 'upcoming'/);
  assert.match(home, /<EventCard key=\{e\.id\} event=\{e\} presentation="homepage" \/>/);
  assert.doesNotMatch(home, /loadStudentActivityBoard|setOwnActivityDecision/);
});

test('homepage preview navigates everyone to Programs instead of showing unverified membership state', async () => {
  const card = await read('src/components/EventCard.tsx');
  const previewStart = card.indexOf("presentation === 'homepage' ? (");
  const previewEnd = card.indexOf(") : (\n          <ActivityDecisionControls", previewStart);
  assert.ok(previewStart > 0 && previewEnd > previewStart, 'homepage and registration branches must remain distinct');
  const preview = card.slice(previewStart, previewEnd);
  assert.match(preview, /onClick=\{\(\) => setView\(\{ kind: 'programs' \}\)\}/);
  assert.match(preview, /t\('home\.viewEventInPrograms'\)/);
  assert.match(preview, /type="button"/);
  assert.match(preview, /focus-visible:outline/);
  assert.doesNotMatch(preview, /disabled|studentAccess|hasStudent|currentUser|activityLoading|activityBusy|onJoin|onDecline/);
});

test('full registration and membership checks stay in ProgramsPage, unchanged', async () => {
  const [card, programs] = await Promise.all([
    read('src/components/EventCard.tsx'),
    read('src/pages/ProgramsPage.tsx'),
  ]);
  assert.match(card, /presentation = 'registration'/);
  assert.match(card, /<ActivityDecisionControls/);
  assert.match(card, /access=\{studentAccess\}/);
  assert.match(card, /onJoin=\{\(\) => activity && onJoin\?\.\(activity\)\}/);
  assert.match(programs, /activity=\{activityByEventId\.get\(e\.id\) \?\? null\}/);
  assert.match(programs, /onJoin=\{\(activity\) =>/);
  assert.match(programs, /onDecline=\{declineActivity\}/);
  assert.doesNotMatch(programs, /presentation="homepage"/);
});

test('event card still shows its original image, date, venue, capacity and external link', async () => {
  const card = await read('src/components/EventCard.tsx');
  for (const pattern of [/src=\{event\.image\}/, /formatPublicDate\(/, /formatPublicTime\(/,
    /event\.location/, /formatEnrollmentCount\(registered, capacity, t\)/,
    /href=\{event\.eventUrl\}/, /t\('programs\.visitEvent'\)/]) {
    assert.match(card, pattern);
  }
});

test('homepage CTA has human translations in Arabic, Turkish and English', async () => {
  for (const [language, expected] of [
    ['ar', 'التفاصيل والتسجيل في البرامج والأنشطة'],
    ['tr', 'Detaylar ve kayıt için programlara git'],
    ['en', 'View details and register in Programs'],
  ]) {
    const dictionary = (await import('../src/i18n/locales/' + language + '.ts')).default;
    assert.equal(dictionary.home.viewEventInPrograms, expected);
  }
});

test('event card preserves the ended-event state for expired activities', async () => {
  const card = await read('src/components/EventCard.tsx');
  assert.match(card, /event\.status === 'upcoming' \?/);
  assert.match(card, /t\('programs\.endedEvent'\)/);
  const home = await read('src/pages/HomePage.tsx');
  assert.match(home, /getEffectiveEventStatus\(e\.status, e\.date, nowTime\)/);
});
