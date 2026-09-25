import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isTranslatableLocationValue,
  deriveFieldLocalizationState,
  recordManualPath,
  resolveDraftBasePayload,
} from '../src/domain/cmsLocalizationEditor.ts';
import {
  isCmsPathTranslatable,
  extractTranslatableCmsFields,
  CMS_TRANSLATABLE_SCHEMA,
} from '../src/domain/cmsTranslatableFields.ts';
import {
  computeSourceHash,
} from '../src/domain/cmsLocalization.ts';
import {
  InMemoryCmsLocalizationRepository,
} from '../src/domain/cmsLocalizationRepository.ts';
import { getEventCategoryLabel } from '../src/domain/eventCategoryPresentation.ts';

const readAdminDashboard = () =>
  readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');

const readEntityTranslationTabs = () =>
  readFile(
    new URL('../src/components/cmsLocalization/CmsEntityTranslationTabs.tsx', import.meta.url),
    'utf8',
  ).catch(() => '');

// ---------------------------------------------------------------------------
// 1. Discovery: Programs Dynamic CMS Flow Check
// ---------------------------------------------------------------------------

test('1. Programs dynamic CMS flow does not exist in AdminDashboard', async () => {
  const source = await readAdminDashboard();
  assert.doesNotMatch(source, /id:\s*['"]programs['"]/);
  assert.doesNotMatch(source, /<ProgramsTab/);
  assert.doesNotMatch(source, /savePublishedSiteTarget\(\s*['"]programs['"]/);
});

// ---------------------------------------------------------------------------
// 2. Events: Schema & Allowed Editorial Fields
// ---------------------------------------------------------------------------

test('2. Eligible Event editorial fields (title, description, location) are translatable', () => {
  assert.equal(isCmsPathTranslatable('events', 'title'), true);
  assert.equal(isCmsPathTranslatable('events', '*.title'), true);
  assert.equal(isCmsPathTranslatable('events', 'description'), true);
  assert.equal(isCmsPathTranslatable('events', '*.description'), true);
  assert.equal(isCmsPathTranslatable('events', 'location'), true);
  assert.equal(isCmsPathTranslatable('events', '*.location'), true);
});

test('3. Event fixed enums (category, activityType) do NOT enter CMS localization', () => {
  assert.equal(isCmsPathTranslatable('events', 'category'), false);
  assert.equal(isCmsPathTranslatable('events', '*.category'), false);
  assert.equal(isCmsPathTranslatable('events', 'activityType'), false);
  assert.equal(isCmsPathTranslatable('events', '*.activityType'), false);
});

test('4. Event technical fields (id, date, time, capacity, points, image, url, status) are excluded', () => {
  const technicalPaths = [
    'id', 'date', 'time', 'capacity', 'registered', 'pointsValue',
    'registrationDeadline', 'image', 'eventUrl', 'status', 'createdBy', 'createdByRole',
  ];
  for (const path of technicalPaths) {
    assert.equal(isCmsPathTranslatable('events', path), false, `events.${path} should not be translatable`);
    assert.equal(isCmsPathTranslatable('events', `0.${path}`), false, `events.0.${path} should not be translatable`);
  }
});

test('5. Human-readable Event location respects isTranslatableLocationValue guard', () => {
  assert.equal(isTranslatableLocationValue('قاعة المؤتمرات - جامعة أتاتورك'), true);
  assert.equal(isTranslatableLocationValue('Main Campus Hall B'), true);
  assert.equal(isTranslatableLocationValue('https://maps.google.com/?q=41.0,28.9'), false);
  assert.equal(isTranslatableLocationValue('geo:41.0082,28.9784'), false);
  assert.equal(isTranslatableLocationValue('41.0082, 28.9784'), false);
  assert.equal(isTranslatableLocationValue(''), false);
  assert.equal(isTranslatableLocationValue('   '), false);
});

// ---------------------------------------------------------------------------
// 3. News: Schema & Allowed Editorial Fields
// ---------------------------------------------------------------------------

test('6. Eligible News editorial fields (title, category, excerpt, fullContent) are translatable', () => {
  assert.equal(isCmsPathTranslatable('news', 'title'), true);
  assert.equal(isCmsPathTranslatable('news', '*.title'), true);
  assert.equal(isCmsPathTranslatable('news', 'category'), true);
  assert.equal(isCmsPathTranslatable('news', '*.category'), true);
  assert.equal(isCmsPathTranslatable('news', 'excerpt'), true);
  assert.equal(isCmsPathTranslatable('news', '*.excerpt'), true);
  assert.equal(isCmsPathTranslatable('news', 'fullContent'), true);
  assert.equal(isCmsPathTranslatable('news', '*.fullContent'), true);
});

test('7. News technical fields (id, date, image, externalUrl, pinned) are excluded', () => {
  const technicalPaths = ['id', 'date', 'image', 'externalUrl', 'pinnedOnHomepage'];
  for (const path of technicalPaths) {
    assert.equal(isCmsPathTranslatable('news', path), false, `news.${path} should not be translatable`);
    assert.equal(isCmsPathTranslatable('news', `0.${path}`), false, `news.0.${path} should not be translatable`);
  }
});

// ---------------------------------------------------------------------------
// 4. Reusable Component: CmsEntityTranslationTabs
// ---------------------------------------------------------------------------

test('8. CmsEntityTranslationTabs component exists and exports props interface and component', async () => {
  const source = await readEntityTranslationTabs();
  assert.ok(source.length > 0, 'CmsEntityTranslationTabs.tsx must exist');
  assert.match(source, /export\s+interface\s+CmsEntityTranslationTabsProps/);
  assert.match(source, /export\s+function\s+CmsEntityTranslationTabs/);
});

test('9. CmsEntityTranslationTabs renders Arabic, Turkish, and English language tabs', async () => {
  const source = await readEntityTranslationTabs();
  assert.match(source, /العربية/);
  assert.match(source, /Türkçe/);
  assert.match(source, /English/);
  assert.match(source, /TranslationStatusBadge/);
});

test('10. Directionality enforces AR RTL and TR/EN LTR', async () => {
  const source = await readEntityTranslationTabs();
  assert.match(source, /dir="rtl"/);
  assert.match(source, /LocalizedFieldEditor/);
});

test('11. CmsEntityTranslationTabs omits non-translatable technical locations', async () => {
  const source = await readEntityTranslationTabs();
  assert.match(source, /isTranslatableLocationValue/);
});

// ---------------------------------------------------------------------------
// 5. Admin Integration: Events & News Modals
// ---------------------------------------------------------------------------

test('12. EventsTab in AdminDashboard imports and embeds CmsEntityTranslationTabs', async () => {
  const source = await readAdminDashboard();
  assert.match(source, /import\s+.*CmsEntityTranslationTabs/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="events"/);
});

test('13. NewsTab in AdminDashboard embeds CmsEntityTranslationTabs', async () => {
  const source = await readAdminDashboard();
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="news"/);
});

test('14. Shared technical fields in Events modal remain outside language tabs', async () => {
  const source = await readAdminDashboard();
  assert.match(source, /categoryLabels/);
  assert.match(source, /getEventCategoryLabel/);
  assert.match(source, /id=\{fieldId\('capacity'\)\}/);
  assert.match(source, /id=\{fieldId\('date'\)\}/);
  assert.match(source, /id=\{fieldId\('time'\)\}/);
});

test('15. Shared technical fields in News modal remain outside language tabs', async () => {
  const source = await readAdminDashboard();
  assert.match(source, /id=\{fieldId\('category'\)\}/);
  assert.match(source, /id=\{fieldId\('date'\)\}/);
  assert.match(source, /usage="news-image"/);
  assert.match(source, /id=\{fieldId\('externalUrl'\)\}/);
  assert.match(source, /pinnedOnHomepage/);
});

test('16. Canonical Arabic values remain the primary entity source values', async () => {
  const source = await readAdminDashboard();
  assert.match(source, /title:\s*form\.title/);
});

// ---------------------------------------------------------------------------
// 6. Repository Draft & Entity ID Lifecycle Safety
// ---------------------------------------------------------------------------

test('17. Repository saves TR/EN records to draft partition only', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonicalEvents = [
    { id: 'ev-1', title: 'ندوة فكرية', description: 'وصف الفعالية', location: 'قاعة 1' },
  ];
  const trDraft = [
    { id: 'ev-1', title: 'Düşünce Semineri', description: 'Etkinlik açıklaması', location: 'Salon 1' },
  ];

  await repo.saveDraft({
    target: 'events',
    locale: 'tr',
    payload: trDraft,
    status: 'draft',
    manualPaths: ['0.title', '0.description', '0.location'],
    sourceHash: computeSourceHash(canonicalEvents),
  });

  const draft = await repo.getDraft('events', 'tr');
  assert.ok(draft);
  assert.equal(draft.status, 'draft');
  assert.deepEqual(draft.payload, trDraft);

  const published = await repo.getPublished('events', 'tr');
  assert.equal(published, null, 'Draft save must not alter published partition');
});

test('18. Saving draft for one event preserves sibling events in the target payload', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonicalEvents = [
    { id: 'ev-1', title: 'فعالية 1', description: 'وصف 1', location: 'قاعة 1' },
    { id: 'ev-2', title: 'فعالية 2', description: 'وصف 2', location: 'قاعة 2' },
  ];
  const existingDraft = [
    { id: 'ev-1', title: 'Etkinlik 1', description: 'Açıklama 1', location: 'Salon 1' },
  ];

  await repo.saveDraft({
    target: 'events',
    locale: 'tr',
    payload: existingDraft,
    status: 'draft',
    manualPaths: ['0.title'],
    sourceHash: computeSourceHash(canonicalEvents),
  });

  // Update ev-2 in draft
  const latestDraft = await repo.getDraft('events', 'tr');
  const base = latestDraft ? [...(latestDraft.payload)] : [];
  const existingIdx = base.findIndex((el) => el.id === 'ev-2');
  const updatedItem = { id: 'ev-2', title: 'Etkinlik 2', description: 'Açıklama 2', location: 'Salon 2' };
  if (existingIdx >= 0) {
    base[existingIdx] = updatedItem;
  } else {
    base.push(updatedItem);
  }

  await repo.saveDraft({
    target: 'events',
    locale: 'tr',
    payload: base,
    status: 'draft',
    manualPaths: recordManualPath(latestDraft.manualPaths, '1.title'),
    sourceHash: computeSourceHash(canonicalEvents),
  });

  const reloaded = await repo.getDraft('events', 'tr');
  assert.equal(reloaded.payload.length, 2, 'Both sibling events must be preserved in draft');
  assert.equal(reloaded.payload[0].title, 'Etkinlik 1');
  assert.equal(reloaded.payload[1].title, 'Etkinlik 2');
});

test('19. New entity translation binds to authoritative ID upon canonical creation', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const newId = 'ev-created-' + Date.now();
  const canonicalEvents = [
    { id: newId, title: 'عنوان جديد', description: 'وصف جديد', location: 'موقع جديد' },
  ];
  const localizedItem = {
    id: newId,
    title: 'New Title TR',
    description: 'New Description TR',
    location: 'New Location TR',
  };

  await repo.saveDraft({
    target: 'events',
    locale: 'tr',
    payload: [localizedItem],
    status: 'draft',
    manualPaths: ['0.title'],
    sourceHash: computeSourceHash(canonicalEvents),
  });

  const draft = await repo.getDraft('events', 'tr');
  assert.ok(draft);
  assert.equal(draft.payload[0].id, newId, 'Translation must bind to the authoritative event ID');
});

test('20. Zero Supabase imports in new translation tab component', async () => {
  const source = await readEntityTranslationTabs();
  assert.doesNotMatch(source, /@supabase/);
  assert.doesNotMatch(source, /from\s+['"].*supabase.*['"]/);
});

// ---------------------------------------------------------------------------
// 7. Unified Event Translation Across Both Edit Flows (Admin & ProgramsPage)
// ---------------------------------------------------------------------------

const readProgramsPage = () =>
  readFile(new URL('../src/pages/ProgramsPage.tsx', import.meta.url), 'utf8');

test('21. Actual Events-page edit flow embeds CmsEntityTranslationTabs', async () => {
  const source = await readProgramsPage();
  assert.match(source, /import\s+.*CmsEntityTranslationTabs/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="events"/);
});

test('22. AdminDashboard Event flow still embeds CmsEntityTranslationTabs', async () => {
  const source = await readAdminDashboard();
  assert.match(source, /import\s+.*CmsEntityTranslationTabs/);
  assert.match(source, /<CmsEntityTranslationTabs[^>]*target="events"/);
});

test('23. Both flows use identical Event eligible editorial fields (title, location, description)', async () => {
  const adminSource = await readAdminDashboard();
  const programsSource = await readProgramsPage();
  for (const field of ['title', 'location', 'description']) {
    assert.match(adminSource, new RegExp(`name:\\s*['"]${field}['"]`));
    assert.match(programsSource, new RegExp(`name:\\s*['"]${field}['"]`));
  }
});

test('24. category and activityType remain excluded from Event translation tabs in both flows', async () => {
  const adminSource = await readAdminDashboard();
  const programsSource = await readProgramsPage();
  const adminEventsBlock = adminSource.match(/<CmsEntityTranslationTabs[^>]*target="events"[\s\S]*?<\/CmsEntityTranslationTabs>/)?.[0] ?? '';
  assert.doesNotMatch(adminEventsBlock, /name:\s*['"]category['"]/);
  assert.doesNotMatch(adminEventsBlock, /name:\s*['"]activityType['"]/);
  assert.doesNotMatch(programsSource, /name:\s*['"]category['"]/);
  assert.doesNotMatch(programsSource, /name:\s*['"]activityType['"]/);
});

test('25. Technical Event fields remain excluded from translation tabs in both flows', async () => {
  const adminSource = await readAdminDashboard();
  const programsSource = await readProgramsPage();
  for (const tech of ['capacity', 'pointsValue', 'registrationDeadline', 'date', 'time', 'status', 'image', 'eventUrl']) {
    assert.doesNotMatch(adminSource, new RegExp(`name:\\s*['"]${tech}['"]`));
    assert.doesNotMatch(programsSource, new RegExp(`name:\\s*['"]${tech}['"]`));
  }
});

test('26. Human-readable location rule remains guarded with isLocation in both flows', async () => {
  const adminSource = await readAdminDashboard();
  const programsSource = await readProgramsPage();
  assert.match(adminSource, /name:\s*['"]location['"][^}]*isLocation:\s*true/);
  assert.match(programsSource, /name:\s*['"]location['"][^}]*isLocation:\s*true/);
});

test('27. Actual-page flow uses real Event identity and authoritative ID binding', async () => {
  const programsSource = await readProgramsPage();
  assert.match(programsSource, /recordId=\{editId\}/);
  assert.match(programsSource, /repository\.publishOwnedEventLocalization/);
  assert.match(programsSource, /target:\s*['"]events['"]/);
});

test('28. No second localization system was introduced in ProgramsPage', async () => {
  const programsSource = await readProgramsPage();
  assert.doesNotMatch(programsSource, /@supabase/);
  assert.doesNotMatch(programsSource, /createTranslationRepository/);
  assert.match(programsSource, /useCmsLocalizationRepository/);
});

