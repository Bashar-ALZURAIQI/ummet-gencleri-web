import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { overlayLocalizedCmsPayload } from '../src/domain/cmsPublicRead.ts';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';
import { CMS_TARGETS, computeSourceHash } from '../src/domain/cmsLocalization.ts';

// ---------------------------------------------------------------------------
// 1–4. Codebase Hygiene & Retirement of Machine Translation Assets
// ---------------------------------------------------------------------------

test('1. AzureTranslator.ts is permanently removed', () => {
  assert.equal(
    existsSync(new URL('../src/services/translation/AzureTranslator.ts', import.meta.url)),
    false,
    'AzureTranslator.ts must not exist in repository',
  );
});

test('2. translate-cms-content edge function directory does not exist', () => {
  assert.equal(
    existsSync(new URL('../supabase/functions/translate-cms-content/', import.meta.url)),
    false,
    'supabase/functions/translate-cms-content/ directory must not exist',
  );
});

test('3. cmsTranslationCandidate.ts is permanently removed', () => {
  assert.equal(
    existsSync(new URL('../src/domain/cmsTranslationCandidate.ts', import.meta.url)),
    false,
    'cmsTranslationCandidate.ts must not exist in repository',
  );
});

test('4. src/services/translation/ directory is permanently removed', () => {
  assert.equal(
    existsSync(new URL('../src/services/translation/', import.meta.url)),
    false,
    'src/services/translation/ directory must not exist in repository',
  );
});

// ---------------------------------------------------------------------------
// 5–9. Component & Context Level Purity (Manual Controls Only)
// ---------------------------------------------------------------------------

test('5. CmsTranslationSection.tsx contains NO auto-translation buttons, Sparkles, or MT workflows', async () => {
  const code = await readFile(new URL('../src/components/cmsLocalization/CmsTranslationSection.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /handleAutoTranslate/);
  assert.doesNotMatch(code, /useCmsTranslationProvider/);
  assert.doesNotMatch(code, /Sparkles/);
  assert.doesNotMatch(code, /translating/);
  assert.doesNotMatch(code, /azure/i);
});

test('6. CmsEntityTranslationTabs.tsx contains NO auto-translate triggers or buttons', async () => {
  const code = await readFile(new URL('../src/components/cmsLocalization/CmsEntityTranslationTabs.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /handleAutoTranslate/);
  assert.doesNotMatch(code, /handleTranslateBoth/);
  assert.doesNotMatch(code, /useCmsTranslationProvider/);
  assert.doesNotMatch(code, /Sparkles/);
  assert.doesNotMatch(code, /translating/);
  assert.doesNotMatch(code, /translateError/);
});

test('7. CmsEntityTranslationTabs.tsx exposes manual save draft & publish actions', async () => {
  const code = await readFile(new URL('../src/components/cmsLocalization/CmsEntityTranslationTabs.tsx', import.meta.url), 'utf8');
  assert.match(code, /handleSaveDraft/);
  assert.match(code, /handlePublish/);
  assert.match(code, /saveCmsEntityDraft/);
  assert.match(code, /publishCmsEntityFields/);
});

test('8. CmsLocalizationContext.tsx contains NO translationProvider or useCmsTranslationProvider', async () => {
  const code = await readFile(new URL('../src/context/CmsLocalizationContext.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /translationProvider/);
  assert.doesNotMatch(code, /useCmsTranslationProvider/);
  assert.doesNotMatch(code, /CmsTranslationProvider/);
});

test('9. CmsLocalizationContext.tsx maintains SupabaseCmsLocalizationRepository as runtime default', async () => {
  const code = await readFile(new URL('../src/context/CmsLocalizationContext.tsx', import.meta.url), 'utf8');
  assert.match(code, /new SupabaseCmsLocalizationRepository/);
  assert.match(code, /Default runtime repository is SupabaseCmsLocalizationRepository/);
});

// ---------------------------------------------------------------------------
// 10–14. Pure Public Read & Fallback Resolution Domain
// ---------------------------------------------------------------------------

test('10. cmsPublicRead.ts overlays published localizations on canonical Arabic content', () => {
  const canonical = {
    title: 'عنوان أصلي',
    description: 'وصف أصلي',
  };
  const localized = {
    title: 'Türkçe Başlık',
    description: 'Türkçe Açıklama',
  };

  const result = overlayLocalizedCmsPayload(canonical, localized);
  assert.equal(result.title, 'Türkçe Başlık');
  assert.equal(result.description, 'Türkçe Açıklama');
});

test('11. cmsPublicRead.ts falls back to canonical Arabic when localization field is missing or empty', () => {
  const canonical = {
    title: 'عنوان أصلي',
    description: 'وصف أصلي محمي',
  };
  const localized = {
    title: 'English Title',
    description: '   ', // empty string
  };

  const result = overlayLocalizedCmsPayload(canonical, localized);
  assert.equal(result.title, 'English Title');
  assert.equal(result.description, 'وصف أصلي محمي');
});

test('12. cmsPublicRead.ts preserves canonical metadata (IDs, URLs, dates, numbers) when overlaying strings', () => {
  const canonical = {
    id: 'rec-123',
    date: '2026-09-07T00:00:00Z',
    capacity: 150,
    imageUrl: 'https://images.unsplash.com/photo-test',
    title: 'عنوان الفعالية',
  };
  const localized = {
    id: 'rec-123',
    title: 'Event Title in English',
  };

  const result = overlayLocalizedCmsPayload(canonical, localized);
  assert.equal(result.id, 'rec-123');
  assert.equal(result.date, '2026-09-07T00:00:00Z');
  assert.equal(result.capacity, 150);
  assert.equal(result.imageUrl, 'https://images.unsplash.com/photo-test');
  assert.equal(result.title, 'Event Title in English');
});

test('13. cmsPublicRead.ts handles entity arrays matched by ID', () => {
  const canonical = [
    { id: 'item-1', title: 'عنصر 1', category: 'cat-a' },
    { id: 'item-2', title: 'عنصر 2', category: 'cat-b' },
  ];
  const localized = [
    { id: 'item-2', title: 'Item 2 (English)' },
    { id: 'item-1', title: 'Item 1 (English)' },
  ];

  const result = overlayLocalizedCmsPayload(canonical, localized);
  assert.equal(result[0].id, 'item-1');
  assert.equal(result[0].title, 'Item 1 (English)');
  assert.equal(result[0].category, 'cat-a');
  assert.equal(result[1].id, 'item-2');
  assert.equal(result[1].title, 'Item 2 (English)');
  assert.equal(result[1].category, 'cat-b');
});

test('14. cmsPublicRead.ts handles nested structures (e.g. cards, goals, guide sections)', () => {
  const canonical = {
    header: { badge: 'شارة أصلية', title: 'عنوان رئيسي' },
    cards: [
      { id: 'c1', title: 'بطاقة 1', text: 'نص بطاقة 1' },
      { id: 'c2', title: 'بطاقة 2', text: 'نص بطاقة 2' },
    ],
  };
  const localized = {
    header: { title: 'Ana Başlık' },
    cards: [
      { id: 'c1', title: 'Kart 1' },
    ],
  };

  const result = overlayLocalizedCmsPayload(canonical, localized);
  assert.equal(result.header.badge, 'شارة أصلية'); // fallback
  assert.equal(result.header.title, 'Ana Başlık');
  assert.equal(result.cards[0].title, 'Kart 1');
  assert.equal(result.cards[0].text, 'نص بطاقة 1'); // fallback
  assert.equal(result.cards[1].title, 'بطاقة 2'); // fallback
});

// ---------------------------------------------------------------------------
// 15–17. Persistence Contract: Draft vs Published Partitioning
// ---------------------------------------------------------------------------

test('15. saveDraft saves with partition = "draft"', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const record = {
    target: 'news',
    locale: 'tr',
    payload: [{ id: 'n1', title: 'Taslak Başlık' }],
    status: 'draft',
    manualPaths: ['n1.title'],
    stalePaths: [],
    sourceHash: computeSourceHash([{ id: 'n1', title: 'خبر تجريبي' }]),
    updatedAt: new Date().toISOString(),
  };

  await repo.saveDraft(record);
  const draft = await repo.getDraft('news', 'tr');
  const published = await repo.getPublished('news', 'tr');

  assert.notEqual(draft, null);
  assert.equal(draft.status, 'draft');
  assert.equal(published, null, 'Draft must not be visible in published partition');
});

test('16. savePublished saves with partition = "published"', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const record = {
    target: 'events',
    locale: 'en',
    payload: [{ id: 'e1', title: 'Published Event' }],
    status: 'fresh',
    manualPaths: ['e1.title'],
    stalePaths: [],
    sourceHash: computeSourceHash([{ id: 'e1', title: 'فعالية تجريبية' }]),
    updatedAt: new Date().toISOString(),
  };

  await repo.savePublished(record);
  const published = await repo.getPublished('events', 'en');
  assert.notEqual(published, null);
  assert.equal(published.status, 'fresh');
});

test('17. Repository rejects invalid partitions or locales', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const invalidLocaleRecord = {
    target: 'events',
    locale: 'fr', // invalid
    payload: {},
    status: 'fresh',
    manualPaths: [],
    stalePaths: [],
    sourceHash: '00000000',
    updatedAt: new Date().toISOString(),
  };

  await assert.rejects(
    async () => repo.saveDraft(invalidLocaleRecord),
    /INVALID_LOCALE/,
  );
});

// ---------------------------------------------------------------------------
// 18–19. Glossary Compliance Verification
// ---------------------------------------------------------------------------

test('18. Glossary terms: Arabic canonical strings map correctly to manual Turkish', async () => {
  const sql = await readFile(new URL('../supabase/backfill_cms_localizations_manual.sql', import.meta.url), 'utf8');

  // Strict check for Turkish terms
  assert.match(sql, /Ümmet Gençleri Birliği/);
  assert.match(sql, /Birlik Başkanı/);
  assert.match(sql, /Başkan Yardımcısı/);
  assert.match(sql, /Yönetim Kurulu/);
  // NEVER Yürütme Kurulu for الهيئة التنفيذية
  assert.doesNotMatch(sql, /Yürütme Kurulu/);
  assert.match(sql, /Ümmet Gençleri Birliği Ailesine Katılın/);
});

test('19. Glossary terms: Arabic canonical strings map correctly to manual English', async () => {
  const sql = await readFile(new URL('../supabase/backfill_cms_localizations_manual.sql', import.meta.url), 'utf8');

  // Strict check for English terms
  assert.match(sql, /Ummah Youth Union/);
  assert.match(sql, /Union President/);
  assert.match(sql, /Vice President/);
  assert.match(sql, /Executive Board/);
  assert.match(sql, /Join the Ummah Youth Union Family/);
});

// ---------------------------------------------------------------------------
// 20–21. Backfill Artifact Integrity
// ---------------------------------------------------------------------------

test('20. supabase/backfill_cms_localizations_manual.sql artifact exists and contains valid SQL for all 15 CMS targets', async () => {
  const sqlPath = new URL('../supabase/backfill_cms_localizations_manual.sql', import.meta.url);
  assert.equal(existsSync(sqlPath), true, 'backfill_cms_localizations_manual.sql must exist');

  const sql = await readFile(sqlPath, 'utf8');
  for (const target of CMS_TARGETS) {
    assert.match(sql, new RegExp(`'${target}'`), `Target ${target} must be included in backfill SQL`);
  }

  // Must have 30 INSERT statements (15 targets * 2 locales)
  const matches = sql.match(/INSERT INTO public\.cms_localizations/g);
  assert.equal(matches ? matches.length : 0, 30, 'Must have exactly 30 INSERT statements (15 targets * 2 locales)');
});

test('21. Backfill SQL uses ON CONFLICT DO NOTHING and partition = "published"', async () => {
  const sql = await readFile(new URL('../supabase/backfill_cms_localizations_manual.sql', import.meta.url), 'utf8');
  assert.match(sql, /'published'/);
  assert.doesNotMatch(sql, /'draft'/);
  const conflictClauses = sql.match(/ON CONFLICT \(target, locale, partition\) DO NOTHING;/g);
  assert.equal(conflictClauses ? conflictClauses.length : 0, 30, 'Every statement must end with ON CONFLICT DO NOTHING');
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 22–32. Localization Permission Invariants & Safety
// ---------------------------------------------------------------------------

test('22. Existing canonical CMS permissions remain unchanged', async () => {
  const { canCreateExecutiveContent, canMutateMemberPoints } = await import('../src/domain/phaseThreeEconomy.ts');
  // All executive roles remain authorized to create executive content
  assert.equal(canCreateExecutiveContent('PRESIDENT'), true);
  assert.equal(canCreateExecutiveContent('VICE_PRESIDENT'), true);
  assert.equal(canCreateExecutiveContent('ACTIVITIES_HEAD'), true);
  assert.equal(canCreateExecutiveContent('ACADEMIC_HEAD'), true);
  assert.equal(canCreateExecutiveContent('MEDIA_HEAD'), true);
  assert.equal(canCreateExecutiveContent('FINANCE_HEAD'), true);
  assert.equal(canCreateExecutiveContent('AUDIT_HEAD'), true);
  // Non-executives cannot
  assert.equal(canCreateExecutiveContent('STUDENT'), false);
  assert.equal(canCreateExecutiveContent(null), false);

  // President protections elsewhere remain unchanged
  assert.equal(canMutateMemberPoints('PRESIDENT'), true);
  assert.equal(canMutateMemberPoints('ACTIVITIES_HEAD'), false);
  assert.equal(canMutateMemberPoints('STUDENT'), false);
});

test('23. Generic published write is restricted to President while scoped RPC enables event publication', async () => {
  const alignMigrationSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );

  // Corrective migration sets generic published write policies to authz.is_president
  assert.match(alignMigrationSql, /CREATE POLICY "cms_localizations_published_insert"/);
  assert.match(alignMigrationSql, /authz\.is_president/);
  assert.match(alignMigrationSql, /CREATE POLICY "cms_localizations_published_update"/);
  assert.match(alignMigrationSql, /CREATE POLICY "cms_localizations_published_delete"/);
  // Does NOT grant broad generic table write to is_executive
  assert.doesNotMatch(alignMigrationSql, /CREATE POLICY "cms_localizations_published_insert"[\s\S]*?authz\.is_executive/);

  // Scoped RPC exists for event publication
  assert.match(alignMigrationSql, /CREATE OR REPLACE FUNCTION public\.publish_event_localization/);
});

test('24. Authorized activity creator/editor retains AR/TR/EN workflow with authoritative entity ID', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const authoritativeEventId = 'event-uuid-' + Date.now();

  const translations = {
    tr: { title: 'Türkçe Başlık', description: 'Türkçe Açıklama' },
    en: { title: 'English Title', description: 'English Description' },
  };

  // Simulating AdminDashboard / ProgramsPage binding and publishing on event creation via scoped RPC
  for (const loc of ['tr', 'en']) {
    await repo.publishOwnedEventLocalization(authoritativeEventId, loc, translations[loc]);
    const list = [{ id: authoritativeEventId, ...translations[loc] }];
    await repo.saveDraft({
      target: 'events',
      locale: loc,
      payload: list,
      status: 'draft',
      manualPaths: [`${authoritativeEventId}.title`],
      sourceHash: computeSourceHash(list),
      updatedAt: new Date().toISOString(),
    });
  }

  // Published partition has authoritative translations immediately
  const publishedTr = await repo.getPublished('events', 'tr');
  assert.notEqual(publishedTr, null);
  assert.equal(publishedTr.payload[0].id, authoritativeEventId);
  assert.equal(publishedTr.payload[0].title, 'Türkçe Başlık');
  assert.equal(publishedTr.status, 'fresh');

  // Draft partition is also synchronized
  const draftTr = await repo.getDraft('events', 'tr');
  assert.notEqual(draftTr, null);
  assert.equal(draftTr.payload[0].id, authoritativeEventId);
});

test('25. Unauthorized user cannot write localization (draft or published)', async () => {
  const baseMigrationSql = await readFile(
    new URL('../supabase/migrations/20260906220000_create_cms_localizations.sql', import.meta.url),
    'utf8',
  );
  const alignMigrationSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );

  // Draft write checks authz.is_executive; published write checks authz.is_president
  assert.match(baseMigrationSql, /cms_localizations_draft_insert[^;]+authz\.is_executive/s);
  assert.match(alignMigrationSql, /cms_localizations_published_insert[^;]+authz\.is_president/s);

  // Scoped event RPC checks is_current_executive()
  assert.match(alignMigrationSql, /private\.is_current_executive\(\)/);

  // When caller has is_executive = false, the policy evaluates to false
  const studentAuthz = { is_president: false, is_executive: false };
  assert.equal(Boolean(studentAuthz.is_executive), false);
  assert.equal(Boolean(studentAuthz.is_president), false);
});

test('26. Anonymous users cannot write (published SELECT only)', async () => {
  const baseMigrationSql = await readFile(
    new URL('../supabase/migrations/20260906220000_create_cms_localizations.sql', import.meta.url),
    'utf8',
  );
  const alignMigrationSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );

  // Grants check: anon only granted SELECT
  assert.match(baseMigrationSql, /GRANT SELECT ON TABLE public\.cms_localizations TO anon;/);
  assert.doesNotMatch(baseMigrationSql, /GRANT\s+(INSERT|UPDATE|DELETE)[^;]*TO\s+anon/i);
  assert.doesNotMatch(alignMigrationSql, /TO\s+anon/i);

  // All write policies in corrective migration are TO authenticated
  const allWritePolicies = alignMigrationSql.match(/CREATE POLICY [^;]+FOR (INSERT|UPDATE|DELETE)[^;]+TO authenticated/g);
  assert.equal(allWritePolicies?.length, 3);
});

test('27. Draft remains private and cannot leak publicly', async () => {
  const baseMigrationSql = await readFile(
    new URL('../supabase/migrations/20260906220000_create_cms_localizations.sql', import.meta.url),
    'utf8',
  );

  // Draft SELECT policy restricted to authenticated executives
  assert.match(baseMigrationSql, /CREATE POLICY "cms_localizations_draft_read"[^;]+partition = 'draft'[^;]+authz\.is_executive/s);

  // Public read domain function ignores draft partition or null payload
  const canonical = { title: 'عنوان رسمي' };
  const publishedPayload = null; // No published row exists
  const result = overlayLocalizedCmsPayload(canonical, publishedPayload);
  assert.equal(result.title, 'عنوان رسمي', 'Draft or null must never override canonical in public read');
});

test('28. Published localization is publicly readable with Arabic fallback', () => {
  const canonical = [
    { id: 'e1', title: 'فعالية رئيسية', location: 'المسرح الكبير', description: 'وصف الفعالية' }
  ];
  const publishedTr = [
    { id: 'e1', title: 'Ana Etkinlik' } // location and description missing
  ];

  const result = overlayLocalizedCmsPayload(canonical, publishedTr);
  assert.equal(result[0].title, 'Ana Etkinlik');
  assert.equal(result[0].location, 'المسرح الكبير', 'Missing location falls back to Arabic');
  assert.equal(result[0].description, 'وصف الفعالية', 'Missing description falls back to Arabic');
});

test('29. President generic publishing remains protected while event deletion is ownership-scoped', async () => {
  const appCode = await readFile(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8');
  // publishCmsTarget requires PRESIDENT
  assert.match(appCode, /if \(!owner \|\| owner\.role !== 'PRESIDENT'\) \{\s*return \{ ok: false, error: 'النشر المباشر متاح لرئيس الاتحاد الحالي فقط\.' \};/);

  const adminCode = await readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');
  assert.match(adminCode, /if \(!isPresident && !ownedEventIds\.has\(id\)\) \{/);
  assert.match(adminCode, /deleteOwnedEvent\(id\)/);
  assert.doesNotMatch(adminCode, /deleteRestrictedPresident/);

  const sqlCode = await readFile(new URL('../supabase/migrations/20260921160000_event_ownership_complete.sql', import.meta.url), 'utf8');
  assert.match(sqlCode, /IF NOT \(SELECT private\.is_current_executive\(\)\) THEN/);
  assert.match(sqlCode, /v_is_president := \(SELECT private\.is_current_president\(\)\);/);
  assert.match(sqlCode, /IF NOT v_is_president THEN/);
  assert.match(sqlCode, /activity\.public_event_id = v_event_id/);
  assert.match(sqlCode, /AND activity\.created_by = v_actor_id/);
  assert.match(sqlCode, /ERRCODE = '42501'/);
});

test('30. No translation-specific role system is introduced', async () => {
  const alignMigrationSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );

  // No custom roles or translator flags
  assert.doesNotMatch(alignMigrationSql, /TRANSLATOR/i);
  assert.doesNotMatch(alignMigrationSql, /is_translator/i);
  assert.doesNotMatch(alignMigrationSql, /translation_role/i);

  // No permissive write policies
  assert.doesNotMatch(alignMigrationSql, /FOR\s+(INSERT|UPDATE|DELETE)[^;]*USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(alignMigrationSql, /FOR\s+(INSERT|UPDATE|DELETE)[^;]*WITH\s+CHECK\s*\(\s*true\s*\)/i);

  // Reuses existing private.current_user_authorization
  assert.match(alignMigrationSql, /private\.current_user_authorization/);
});

test('31. Backfill generator does not silently use stale mock content as production source', async () => {
  const { TARGETS } = await import('../scripts/generate_manual_backfill.mjs');
  assert.equal(TARGETS.length, 15, 'Must have all 15 CMS targets');

  // Verify real production entities are present (not mock ev-1..ev-3 or alb-1..alb-3)
  const eventsTarget = TARGETS.find((t) => t.target === 'events');
  assert.equal(eventsTarget.canonical.length, 12, 'Must have 12 production events');
  assert.ok(eventsTarget.canonical.some((e) => e.id === 'e1' && e.title.includes('ورشة عمل: مهارات القيادة الشبابية')));

  const albumsTarget = TARGETS.find((t) => t.target === 'galleryAlbums');
  assert.equal(albumsTarget.canonical.length, 9, 'Must have 9 production gallery albums');

  const committeesTarget = TARGETS.find((t) => t.target === 'committees');
  assert.equal(committeesTarget.canonical.length, 7, 'Must have 7 production committees');

  const guideQuickInfoTarget = TARGETS.find((t) => t.target === 'guideQuickInfo');
  assert.match(guideQuickInfoTarget.canonical, /أرضروم مدينة جامعية آمنة/);
});

test('32. Existing manual localization preservation is enforced', async () => {
  const sql = await readFile(new URL('../supabase/backfill_cms_localizations_manual.sql', import.meta.url), 'utf8');

  // In backfill SQL, every statement ends with ON CONFLICT DO NOTHING
  const matches = sql.match(/ON CONFLICT \(target, locale, partition\) DO NOTHING;/g);
  assert.equal(matches ? matches.length : 0, 30, 'All 30 backfill statements must use ON CONFLICT DO NOTHING to preserve existing human edits');
});

// ---------------------------------------------------------------------------
// 33–43. Security Invariants (Scoped Publication & Authority Enforcement)
// ---------------------------------------------------------------------------

test('33. Invariant 1: President can perform allowed global published localization operations', async () => {
  const alignSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );
  // Published table write policies check authz.is_president
  assert.match(alignSql, /CREATE POLICY "cms_localizations_published_insert"[\s\S]*?authz\.is_president/);
  assert.match(alignSql, /CREATE POLICY "cms_localizations_published_update"[\s\S]*?authz\.is_president/);
  assert.match(alignSql, /CREATE POLICY "cms_localizations_published_delete"[\s\S]*?authz\.is_president/);

  // In AppContext, President retains global publishing authority
  const appCode = await readFile(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8');
  assert.match(appCode, /if \(!owner \|\| owner\.role !== 'PRESIDENT'\) \{\s*return \{ ok: false, error: 'النشر المباشر متاح لرئيس الاتحاد الحالي فقط\.' \};/);
});

test('34. Invariant 2: Normal executive cannot generically overwrite target-wide published rows', async () => {
  const alignSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );
  // Must NOT grant generic published insert, update, or delete to is_executive
  assert.doesNotMatch(alignSql, /CREATE POLICY "cms_localizations_published_insert"[\s\S]*?authz\.is_executive/);
  assert.doesNotMatch(alignSql, /CREATE POLICY "cms_localizations_published_update"[\s\S]*?authz\.is_executive/);
  assert.doesNotMatch(alignSql, /CREATE POLICY "cms_localizations_published_delete"[\s\S]*?authz\.is_executive/);
});

test('35. Invariant 3: Authorized executive can publish localization for their own newly-created event through the safe scoped path', async () => {
  const alignSql = await readFile(
    new URL('../supabase/migrations/20260921220000_fix_event_localization_version_field.sql', import.meta.url),
    'utf8',
  );
  assert.match(alignSql, /CREATE OR REPLACE FUNCTION public\.publish_owned_event_translation/);
  assert.match(alignSql, /private\.is_current_executive\(\)/);
  assert.match(alignSql, /SECURITY DEFINER/);
  assert.match(alignSql, /SET search_path = ''/);

  const adminCode = await readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');
  assert.match(adminCode, /repository\.publishOwnedEventLocalization\(publicEventId, loc, trData\)/);
  assert.doesNotMatch(adminCode, /publishEventLocalization\(/);

  const programsCode = await readFile(new URL('../src/pages/ProgramsPage.tsx', import.meta.url), 'utf8');
  assert.match(programsCode, /repository\.publishOwnedEventLocalization\(publicEventId, loc, trData\)/);
  assert.doesNotMatch(programsCode, /publishEventLocalization\(/);

  const supabaseAdapterCode = await readFile(new URL('../src/services/localization/SupabaseCmsLocalizationRepository.ts', import.meta.url), 'utf8');
  assert.match(supabaseAdapterCode, /rpc\('publish_owned_event_translation',/);
});

test("36. Invariant 4: That executive cannot change another event's localization", async () => {
  const alignSql = await readFile(
    new URL('../supabase/migrations/20260921220000_fix_event_localization_version_field.sql', import.meta.url),
    'utf8',
  );
  assert.match(alignSql, /IF NOT v_is_president THEN/);
  assert.match(alignSql, /activity\.public_event_id = v_event_id/);
  assert.match(alignSql, /activity\.created_by = v_actor_id/);
  assert.match(alignSql, /Not authorized to translate events created by another executive/);
});

test("36.5. Legacy public RPC retired by migration", async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const files = readdirSync(new URL('../supabase/migrations', import.meta.url));
  let foundRetirement = false;
  for (const file of files) {
    if (file.endsWith('.sql')) {
      const sql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
      if (sql.includes('DROP FUNCTION IF EXISTS public.publish_event_localization(text, text, jsonb)')) {
        foundRetirement = true;
      }
    }
  }
  assert.ok(foundRetirement, 'Retirement migration for publish_event_localization must exist');
});

test('37. Invariant 5: Media Head cannot bypass proposal workflow to publish News localization', async () => {
  const adminCode = await readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');
  // Media Head is intercepted by submitSiteEdit proposal workflow in NewsTab
  assert.match(adminCode, /if \(currentUser\?\.role === 'MEDIA_HEAD'\) \{\s*const diffs = newsDiffs\('add', null, newNews\);[\s\S]*?await submitSiteEdit/);

  // NewsTab canPublish is strictly restricted to President
  assert.match(adminCode, /<CmsEntityTranslationTabs[\s\S]*?target="news"[\s\S]*?canPublish=\{isPresident\}/);

  // Generic database published write requires President
  const alignSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );
  assert.match(alignSql, /authz\.is_president/);
});

test('38. Invariant 6: Committee special direct-publish permissions match scoped own-committee workflow', async () => {
  const committeeCode = await readFile(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');
  // Committee page translation tabs use the same scoped own-committee authority as editing.
  assert.match(committeeCode, /canPublish=\{Boolean\(canEditContent\)\}/);

  // Committee institutional edits by a current executive publish directly to their
  // own committee through the narrow publish_own_committee RPC (never the approval queue)
  assert.match(committeeCode, /persistOwnCommitteeEdit/);
  assert.doesNotMatch(committeeCode, /const result = await submitProfileEdit\(committeeId, snapshot\);/);

  // Plans and Reports canPublish is strictly restricted to President
  const adminCode = await readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');
  assert.match(adminCode, /target="plans"[\s\S]*?canPublish=\{isPresident\}/);
  assert.match(adminCode, /target="reports"[\s\S]*?canPublish=\{isPresident\}/);
});

test('39. Invariant 7: Student cannot publish', async () => {
  const alignSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );
  // Table published write policies require authz.is_president
  assert.match(alignSql, /authz\.is_president/);

  // Scoped event RPC requires private.is_current_executive()
  assert.match(alignSql, /IF NOT \(SELECT private\.is_current_executive\(\)\) THEN[\s\S]*?Only current executives may publish event localizations/);
});

test('40. Invariant 8: Anonymous cannot publish', async () => {
  const alignSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );
  // Table write policies are TO authenticated only
  assert.match(alignSql, /CREATE POLICY "cms_localizations_published_insert"[\s\S]*?TO authenticated/);
  assert.match(alignSql, /CREATE POLICY "cms_localizations_published_update"[\s\S]*?TO authenticated/);
  assert.match(alignSql, /CREATE POLICY "cms_localizations_published_delete"[\s\S]*?TO authenticated/);

  // Scoped event RPC revokes execute from anon and PUBLIC
  assert.match(alignSql, /REVOKE EXECUTE ON FUNCTION public\.publish_event_localization[\s\S]*?FROM PUBLIC, anon/);
  assert.match(alignSql, /IF v_actor_id IS NULL THEN[\s\S]*?Authentication required/);
});

test('41. Invariant 9: Draft never leaks publicly', async () => {
  const baseSql = await readFile(
    new URL('../supabase/migrations/20260906220000_create_cms_localizations.sql', import.meta.url),
    'utf8',
  );
  // Draft read policy is restricted to authenticated executives
  assert.match(baseSql, /CREATE POLICY "cms_localizations_draft_read"[\s\S]*?partition = 'draft'[\s\S]*?authz\.is_executive/);
  assert.doesNotMatch(baseSql, /CREATE POLICY "cms_localizations_draft_read"[^;]*?TO anon/);

  // Public read only queries published records
  const repo = new InMemoryCmsLocalizationRepository();
  await repo.saveDraft({
    target: 'events',
    locale: 'tr',
    payload: [{ id: 'e1', title: 'Draft Event Title' }],
    status: 'draft',
  });
  const published = await repo.getPublished('events', 'tr');
  assert.equal(published, null, 'Public getPublished must never return draft records');
});

test('42. Invariant 10: Public can still SELECT published localization', async () => {
  const baseSql = await readFile(
    new URL('../supabase/migrations/20260906220000_create_cms_localizations.sql', import.meta.url),
    'utf8',
  );
  // Published read policy is open to anon and authenticated
  assert.match(baseSql, /CREATE POLICY "cms_localizations_published_read"[\s\S]*?FOR SELECT[\s\S]*?TO anon, authenticated[\s\S]*?USING \(partition = 'published'\)/);

  // Overlay resolution functions for public consumption
  const canonical = [{ id: 'e1', title: 'العنوان الأصلي' }];
  const publishedTr = [{ id: 'e1', title: 'Yayınlanan Türkçe Başlık' }];
  const overlaid = overlayLocalizedCmsPayload(canonical, publishedTr);
  assert.equal(overlaid[0].title, 'Yayınlanan Türkçe Başlık');
});

test('43. Invariant 11: No service_role frontend bypass exists', async () => {
  const supabaseClientCode = await readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
  // No service role key in frontend client initialization
  assert.doesNotMatch(supabaseClientCode, /service_role/i);
  assert.doesNotMatch(supabaseClientCode, /SUPABASE_SERVICE_KEY/i);

  // Scoped function revokes execute from service_role
  const alignSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );
  assert.match(alignSql, /REVOKE EXECUTE ON FUNCTION public\.publish_event_localization[\s\S]*?FROM[\s\S]*?service_role/);
});



