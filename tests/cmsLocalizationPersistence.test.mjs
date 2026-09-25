import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Dynamic imports to capture RED status when modules are not yet created
let SupabaseCmsLocalizationRepository;
let mapRowToRecord;
let mapRecordToRow;
let InMemoryCmsLocalizationRepository;
let CmsLocalizationProvider;
let useCmsLocalizationRepository;

try {
  const repoModule = await import('../src/services/localization/SupabaseCmsLocalizationRepository.ts');
  SupabaseCmsLocalizationRepository = repoModule.SupabaseCmsLocalizationRepository;
} catch {
  // Expected to fail in RED phase
}

try {
  const mappingModule = await import('../src/domain/cmsLocalizationMapping.ts');
  mapRowToRecord = mappingModule.mapRowToRecord;
  mapRecordToRow = mappingModule.mapRecordToRow;
} catch {
  // Expected to fail in RED phase
}

try {
  const inMemModule = await import('../src/domain/cmsLocalizationRepository.ts');
  InMemoryCmsLocalizationRepository = inMemModule.InMemoryCmsLocalizationRepository;
} catch {
  // Expected to fail in RED phase
}

try {
  const ctxModule = await import('../src/context/CmsLocalizationContext.tsx');
  CmsLocalizationProvider = ctxModule.CmsLocalizationProvider;
  useCmsLocalizationRepository = ctxModule.useCmsLocalizationRepository;
} catch {
  // Expected to fail in RED phase
}

// ---------------------------------------------------------------------------
// Mock Supabase Client Helper
// ---------------------------------------------------------------------------

function createMockSupabaseClient(initialRows = []) {
  const rows = [...initialRows];
  const queryLogs = [];

  return {
    rows,
    queryLogs,
    rpc(fn, args) {
      queryLogs.push({ type: 'rpc', method: fn, args });
      return Promise.resolve({ data: null, error: null });
    },
    from(table) {
      assert.equal(table, 'cms_localizations');
      let currentQuery = {
        table,
        type: 'select',
        filters: {},
        selectedColumns: '*',
      };

      const builder = {
        select(cols = '*') {
          currentQuery.type = 'select';
          currentQuery.selectedColumns = cols;
          return builder;
        },
        eq(col, val) {
          currentQuery.filters[col] = val;
          return builder;
        },
        async maybeSingle() {
          queryLogs.push({ ...currentQuery, method: 'maybeSingle' });
          const matched = rows.find((r) =>
            Object.entries(currentQuery.filters).every(([k, v]) => r[k] === v)
          );
          return { data: matched ? JSON.parse(JSON.stringify(matched)) : null, error: null };
        },
        async single() {
          queryLogs.push({ ...currentQuery, method: 'single' });
          const matched = rows.find((r) =>
            Object.entries(currentQuery.filters).every(([k, v]) => r[k] === v)
          );
          if (!matched) {
            return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
          }
          return { data: JSON.parse(JSON.stringify(matched)), error: null };
        },
        upsert(rowOrRows, options = {}) {
          currentQuery.type = 'upsert';
          currentQuery.upsertRow = rowOrRows;
          currentQuery.upsertOptions = options;
          queryLogs.push({ ...currentQuery });

          const row = Array.isArray(rowOrRows) ? rowOrRows[0] : rowOrRows;
          const conflictKeys = (options.onConflict || 'target,locale,partition').split(',');

          const idx = rows.findIndex((r) =>
            conflictKeys.every((k) => r[k] === row[k])
          );

          const savedRow = {
            id: idx >= 0 ? rows[idx].id : `uuid-${Date.now()}-${Math.random()}`,
            created_at: idx >= 0 ? rows[idx].created_at : new Date().toISOString(),
            ...JSON.parse(JSON.stringify(row)),
          };

          if (idx >= 0) {
            rows[idx] = savedRow;
          } else {
            rows.push(savedRow);
          }

          return {
            select() {
              return {
                async single() {
                  return { data: JSON.parse(JSON.stringify(savedRow)), error: null };
                },
              };
            },
          };
        },
        delete() {
          currentQuery.type = 'delete';
          return {
            eq(col, val) {
              currentQuery.filters[col] = val;
              return {
                eq(col2, val2) {
                  currentQuery.filters[col2] = val2;
                  return {
                    eq(col3, val3) {
                      currentQuery.filters[col3] = val3;
                      queryLogs.push({ ...currentQuery, method: 'delete' });
                      const initialCount = rows.length;
                      for (let i = rows.length - 1; i >= 0; i--) {
                        if (Object.entries(currentQuery.filters).every(([k, v]) => rows[i][k] === v)) {
                          rows.splice(i, 1);
                        }
                      }
                      return { error: null, count: initialCount - rows.length };
                    },
                  };
                },
              };
            },
          };
        },
      };

      return builder;
    },
  };
}

// ---------------------------------------------------------------------------
// 1–4. Contract Adherence & Partition Queries
// ---------------------------------------------------------------------------

test('1. SupabaseCmsLocalizationRepository implements repository contract', () => {
  assert.ok(SupabaseCmsLocalizationRepository, 'SupabaseCmsLocalizationRepository must be defined');
  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  assert.equal(typeof repo.getPublished, 'function');
  assert.equal(typeof repo.getLocalization, 'function');
  assert.equal(typeof repo.savePublished, 'function');
  assert.equal(typeof repo.deletePublished, 'function');
  assert.equal(typeof repo.getDraft, 'function');
  assert.equal(typeof repo.saveDraft, 'function');
  assert.equal(typeof repo.deleteDraft, 'function');
});

test('2. getDraft queries draft partition only', async () => {
  const mockClient = createMockSupabaseClient([
    {
      id: 'row-1',
      target: 'about',
      locale: 'tr',
      partition: 'published',
      payload: { title: 'Yayınlanmış Başlık' },
      status: 'fresh',
      source_hash: 'hash-1',
      source_version: '1',
      stale_paths: [],
      manual_paths: [],
      updated_at: '2026-09-06T10:00:00.000Z',
    },
    {
      id: 'row-2',
      target: 'about',
      locale: 'tr',
      partition: 'draft',
      payload: { title: 'Taslak Başlık' },
      status: 'draft',
      source_hash: 'hash-1',
      source_version: '1',
      stale_paths: [],
      manual_paths: ['title'],
      updated_at: '2026-09-06T11:00:00.000Z',
    },
  ]);

  const repo = new SupabaseCmsLocalizationRepository(mockClient);
  const draft = await repo.getDraft('about', 'tr');

  assert.ok(draft);
  assert.equal(draft.payload.title, 'Taslak Başlık');
  assert.equal(draft.status, 'draft');

  // Verify query explicitly asked for partition = 'draft'
  const draftQuery = mockClient.queryLogs.find(
    (q) => q.filters.partition === 'draft' && q.filters.target === 'about' && q.filters.locale === 'tr'
  );
  assert.ok(draftQuery, 'Must query partition = "draft"');
});

test('3. getPublished queries published partition only', async () => {
  const mockClient = createMockSupabaseClient([
    {
      id: 'row-1',
      target: 'about',
      locale: 'tr',
      partition: 'published',
      payload: { title: 'Yayınlanmış Başlık' },
      status: 'fresh',
      source_hash: 'hash-1',
      source_version: '1',
      stale_paths: [],
      manual_paths: [],
      updated_at: '2026-09-06T10:00:00.000Z',
    },
    {
      id: 'row-2',
      target: 'about',
      locale: 'tr',
      partition: 'draft',
      payload: { title: 'Taslak Başlık' },
      status: 'draft',
      source_hash: 'hash-1',
      source_version: '1',
      stale_paths: [],
      manual_paths: [],
      updated_at: '2026-09-06T11:00:00.000Z',
    },
  ]);

  const repo = new SupabaseCmsLocalizationRepository(mockClient);
  const published = await repo.getPublished('about', 'tr');

  assert.ok(published);
  assert.equal(published.payload.title, 'Yayınlanmış Başlık');

  const pubQuery = mockClient.queryLogs.find(
    (q) => q.filters.partition === 'published' && q.filters.target === 'about' && q.filters.locale === 'tr'
  );
  assert.ok(pubQuery, 'Must query partition = "published"');
});

test('4. missing row returns expected null behavior', async () => {
  const mockClient = createMockSupabaseClient([]);
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  const draft = await repo.getDraft('events', 'en');
  assert.equal(draft, null);

  const published = await repo.getPublished('events', 'en');
  assert.equal(published, null);
});

// ---------------------------------------------------------------------------
// 5–14. Save Semantics, Partitions, Uniqueness & Payload Preservation
// ---------------------------------------------------------------------------

test('5. saveDraft writes draft partition only', async () => {
  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  await repo.saveDraft({
    target: 'events',
    locale: 'tr',
    payload: [{ id: 'ev-1', title: 'Türkçe Etkinlik' }],
    status: 'draft',
    manualPaths: ['ev-1.title'],
    sourceHash: 'hash-abc',
    sourceVersion: '2',
  });

  const saved = mockClient.rows.find((r) => r.target === 'events' && r.locale === 'tr');
  assert.ok(saved);
  assert.equal(saved.partition, 'draft');
  assert.equal(saved.status, 'draft');
});

test('6. savePublished writes published partition only', async () => {
  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  await repo.savePublished({
    target: 'events',
    locale: 'en',
    payload: [{ id: 'ev-1', title: 'English Event' }],
    status: 'fresh',
    manualPaths: [],
    sourceHash: 'hash-abc',
    sourceVersion: '2',
  });

  const saved = mockClient.rows.find((r) => r.target === 'events' && r.locale === 'en');
  assert.ok(saved);
  assert.equal(saved.partition, 'published');
  assert.equal(saved.status, 'fresh');
});

test('7. logical save key (target, locale, partition) prevents duplicate records', async () => {
  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  await repo.saveDraft({
    target: 'programsContent',
    locale: 'tr',
    payload: { title: 'İlk Başlık' },
    status: 'draft',
  });

  await repo.saveDraft({
    target: 'programsContent',
    locale: 'tr',
    payload: { title: 'Güncellenmiş Başlık' },
    status: 'draft',
  });

  const matchingRows = mockClient.rows.filter(
    (r) => r.target === 'programsContent' && r.locale === 'tr' && r.partition === 'draft'
  );
  assert.equal(matchingRows.length, 1, 'Should upsert in-place rather than duplicate');
  assert.equal(matchingRows[0].payload.title, 'Güncellenmiş Başlık');
});

test('8. target is strictly preserved', async () => {
  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  const res = await repo.saveDraft({
    target: 'committees',
    locale: 'en',
    payload: [{ id: 'presidency', name: 'Presidency' }],
    status: 'draft',
  }, { committeeId: 'presidency' });

  assert.equal(res.target, 'committees');
});

test('9. locale is strictly preserved', async () => {
  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  const res = await repo.saveDraft({
    target: 'site',
    locale: 'tr',
    payload: { hero: { title: 'Başlık' } },
    status: 'draft',
  });

  assert.equal(res.locale, 'tr');
});

test('10. payload is preserved as full JSON object or array without truncation', async () => {
  const complexPayload = {
    hero: { badge: 'Yeni', title: 'Ana Başlık', count: 42, active: true },
    sections: ['A', 'B', { nested: [1, 2, 3] }],
    nullField: null,
  };

  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  await repo.saveDraft({
    target: 'site',
    locale: 'tr',
    payload: complexPayload,
    status: 'draft',
  });

  const fetched = await repo.getDraft('site', 'tr');
  assert.deepEqual(fetched.payload, complexPayload);
});

test('11. sourceHash is preserved', async () => {
  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  await repo.saveDraft({
    target: 'about',
    locale: 'en',
    payload: { title: 'About' },
    status: 'draft',
    sourceHash: 'sha256-abcdef123456',
  });

  const fetched = await repo.getDraft('about', 'en');
  assert.equal(fetched.sourceHash, 'sha256-abcdef123456');
});

test('12. sourceVersion is preserved', async () => {
  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  await repo.saveDraft({
    target: 'about',
    locale: 'en',
    payload: { title: 'About' },
    status: 'draft',
    sourceVersion: '4',
  });

  const fetched = await repo.getDraft('about', 'en');
  assert.equal(fetched.sourceVersion, '4');
});

test('13. stalePaths are preserved', async () => {
  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  await repo.saveDraft({
    target: 'faqCategories',
    locale: 'tr',
    payload: [],
    status: 'stale',
    stalePaths: ['faq-1.question', 'faq-2.answer'],
  });

  const fetched = await repo.getDraft('faqCategories', 'tr');
  assert.deepEqual(fetched.stalePaths, ['faq-1.question', 'faq-2.answer']);
});

test('14. manualPaths are preserved', async () => {
  const mockClient = createMockSupabaseClient();
  const repo = new SupabaseCmsLocalizationRepository(mockClient);

  await repo.saveDraft({
    target: 'faqCategories',
    locale: 'tr',
    payload: [],
    status: 'draft',
    manualPaths: ['faq-1.answer'],
  });

  const fetched = await repo.getDraft('faqCategories', 'tr');
  assert.deepEqual(fetched.manualPaths, ['faq-1.answer']);
});

// ---------------------------------------------------------------------------
// 15–17. Mapping & Error Normalization
// ---------------------------------------------------------------------------

test('15. row-to-domain mapping converts database columns to CmsLocalizationRecord', () => {
  assert.ok(mapRowToRecord, 'mapRowToRecord must be defined');

  const row = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    target: 'news',
    locale: 'tr',
    partition: 'draft',
    payload: { title: 'Haber' },
    status: 'draft',
    source_hash: 'hash-xyz',
    source_version: '5',
    stale_paths: ['title'],
    manual_paths: ['content'],
    updated_at: '2026-09-06T12:00:00.000Z',
    updated_by: 'user-123',
    created_at: '2026-09-06T11:00:00.000Z',
  };

  const record = mapRowToRecord(row);
  assert.equal(record.target, 'news');
  assert.equal(record.locale, 'tr');
  assert.deepEqual(record.payload, { title: 'Haber' });
  assert.equal(record.status, 'draft');
  assert.equal(record.sourceHash, 'hash-xyz');
  assert.equal(record.sourceVersion, '5');
  assert.deepEqual(record.stalePaths, ['title']);
  assert.deepEqual(record.manualPaths, ['content']);
  assert.equal(record.updatedAt, '2026-09-06T12:00:00.000Z');
  assert.equal(record.updatedBy, 'user-123');
});

test('16. domain-to-row mapping converts CmsLocalizationRecord to database row', () => {
  assert.ok(mapRecordToRow, 'mapRecordToRow must be defined');

  const record = {
    target: 'news',
    locale: 'en',
    payload: { title: 'News' },
    status: 'fresh',
    sourceHash: 'hash-xyz',
    sourceVersion: '5',
    stalePaths: ['summary'],
    manualPaths: ['title'],
    updatedAt: '2026-09-06T12:00:00.000Z',
    updatedBy: 'admin@example.com',
  };

  const row = mapRecordToRow(record, 'published');
  assert.equal(row.target, 'news');
  assert.equal(row.locale, 'en');
  assert.equal(row.partition, 'published');
  assert.deepEqual(row.payload, { title: 'News' });
  assert.equal(row.status, 'fresh');
  assert.equal(row.source_hash, 'hash-xyz');
  assert.equal(row.source_version, '5');
  assert.deepEqual(row.stale_paths, ['summary']);
  assert.deepEqual(row.manual_paths, ['title']);
  assert.equal(row.updated_at, '2026-09-06T12:00:00.000Z');
  assert.equal(row.updated_by, 'admin@example.com');
});

test('17. database errors normalize safely into CmsLocalizationRepositoryError', async () => {
  const failingClient = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return { data: null, error: { message: 'Connection terminated', code: 'P0001' } };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const repo = new SupabaseCmsLocalizationRepository(failingClient);
  await assert.rejects(
    async () => {
      await repo.getDraft('site', 'tr');
    },
    {
      name: 'CmsLocalizationRepositoryError',
    }
  );
});

// ---------------------------------------------------------------------------
// 18–20. Component Decoupling & Context Wiring
// ---------------------------------------------------------------------------

test('18. no UI component depends directly on SupabaseCmsLocalizationRepository', async () => {
  const adminSource = await readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');
  const commSource = await readFile(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');
  const progSource = await readFile(new URL('../src/pages/ProgramsPage.tsx', import.meta.url), 'utf8');
  const tabsSource = await readFile(new URL('../src/components/cmsLocalization/CmsEntityTranslationTabs.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(adminSource, /SupabaseCmsLocalizationRepository/);
  assert.doesNotMatch(commSource, /SupabaseCmsLocalizationRepository/);
  assert.doesNotMatch(progSource, /SupabaseCmsLocalizationRepository/);
  assert.doesNotMatch(tabsSource, /SupabaseCmsLocalizationRepository/);
});

test('19. InMemoryCmsLocalizationRepository continues to function independently', async () => {
  const memRepo = new InMemoryCmsLocalizationRepository();
  await memRepo.saveDraft({
    target: 'site',
    locale: 'tr',
    payload: { hero: { title: 'Test' } },
    status: 'draft',
  });

  const draft = await memRepo.getDraft('site', 'tr');
  assert.equal(draft.payload.hero.title, 'Test');
});

test('20. CmsLocalizationContext activates SupabaseCmsLocalizationRepository as default runtime repository while preserving injection', async () => {
  const ctxSource = await readFile(new URL('../src/context/CmsLocalizationContext.tsx', import.meta.url), 'utf8');
  assert.match(ctxSource, /new\s+SupabaseCmsLocalizationRepository\(\)/);
  assert.match(ctxSource, /repository\s*\?\?\s*new\s+SupabaseCmsLocalizationRepository\(\)/);
});

// ---------------------------------------------------------------------------
// 21–25. Migration Structure, Constraints & RLS Security
// ---------------------------------------------------------------------------

test('21. migration file creates public.cms_localizations table', async () => {
  const migrationSql = await readFile(new URL('../supabase/migrations/20260906220000_create_cms_localizations.sql', import.meta.url), 'utf8');
  assert.match(migrationSql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\.cms_localizations/i);
});

test('22. migration enables Row Level Security on cms_localizations', async () => {
  const migrationSql = await readFile(new URL('../supabase/migrations/20260906220000_create_cms_localizations.sql', import.meta.url), 'utf8');
  assert.match(migrationSql, /ALTER\s+TABLE\s+public\.cms_localizations\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test('23. migration contains domain validation constraints (locale tr/en, partition draft/published)', async () => {
  const migrationSql = await readFile(new URL('../supabase/migrations/20260906220000_create_cms_localizations.sql', import.meta.url), 'utf8');
  assert.match(migrationSql, /locale\s+IN\s*\(\s*'tr'\s*,\s*'en'\s*\)/i);
  assert.match(migrationSql, /partition\s+IN\s*\(\s*'draft'\s*,\s*'published'\s*\)/i);
  assert.match(migrationSql, /status\s+IN\s*\(\s*'draft'\s*,\s*'fresh'\s*,\s*'stale'\s*,\s*'missing'\s*\)/i);
});

test('24. migration enforces unique logical key on (target, locale, partition)', async () => {
  const migrationSql = await readFile(new URL('../supabase/migrations/20260906220000_create_cms_localizations.sql', import.meta.url), 'utf8');
  assert.match(migrationSql, /UNIQUE\s*\(\s*target\s*,\s*locale\s*,\s*partition\s*\)/i);
});

test('25. migration does NOT create permissive anonymous draft write policies and checks executive authorization', async () => {
  const migrationSql = await readFile(new URL('../supabase/migrations/20260906220000_create_cms_localizations.sql', import.meta.url), 'utf8');
  // Must NOT have permissive write policies
  assert.doesNotMatch(migrationSql, /FOR\s+(INSERT|UPDATE|DELETE)[^;]*USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migrationSql, /FOR\s+(INSERT|UPDATE|DELETE)[^;]*WITH\s+CHECK\s*\(\s*true\s*\)/i);
  // Must reference private.current_user_authorization
  assert.match(migrationSql, /private\.current_user_authorization/);
  assert.match(migrationSql, /authz\.is_executive/);
  assert.match(migrationSql, /authz\.is_president/);
});

// ---------------------------------------------------------------------------
// 26–27. Architecture Safety & Deployment Safeguards
// ---------------------------------------------------------------------------

test('26. manual translation architecture permanently retires automatic translation services', async () => {
  assert.equal(existsSync(new URL('../src/services/translation/AzureTranslator.ts', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/services/translation/', import.meta.url)), false);
  assert.equal(existsSync(new URL('../supabase/functions/translate-cms-content/', import.meta.url)), false);
});

test('27. no remote migration or deployment command is introduced', async () => {
  // Verifies package.json scripts contain no premature db push / deploy commands
  const pkgJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const script of Object.values(pkgJson.scripts || {})) {
    assert.doesNotMatch(script, /supabase\s+db\s+push/);
    assert.doesNotMatch(script, /supabase\s+migration\s+repair/);
  }
});

test('28. corrective migration restricts generic published write policies to President and creates scoped event RPC', async () => {
  const alignMigrationSql = await readFile(
    new URL('../supabase/migrations/20260907060000_align_cms_localizations_authorization.sql', import.meta.url),
    'utf8',
  );
  assert.match(alignMigrationSql, /DROP POLICY IF EXISTS "cms_localizations_published_insert"/);
  assert.match(alignMigrationSql, /CREATE POLICY "cms_localizations_published_insert"/);
  assert.match(alignMigrationSql, /authz\.is_president/);
  // Generic table write policies must NOT grant broad is_executive writes
  assert.doesNotMatch(alignMigrationSql, /CREATE POLICY "cms_localizations_published_insert"[\s\S]*?authz\.is_executive/);
  assert.doesNotMatch(alignMigrationSql, /CREATE POLICY "cms_localizations_published_update"[\s\S]*?authz\.is_executive/);
  assert.doesNotMatch(alignMigrationSql, /CREATE POLICY "cms_localizations_published_delete"[\s\S]*?authz\.is_executive/);
  assert.doesNotMatch(alignMigrationSql, /USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(alignMigrationSql, /WITH\s+CHECK\s*\(\s*true\s*\)/i);

  // Scoped RPC exists with security definer and empty search path
  assert.match(alignMigrationSql, /CREATE OR REPLACE FUNCTION public\.publish_event_localization/);
  assert.match(alignMigrationSql, /SECURITY DEFINER/);
  assert.match(alignMigrationSql, /SET search_path = ''/);
  assert.match(alignMigrationSql, /REVOKE EXECUTE ON FUNCTION public\.publish_event_localization/);
  assert.match(alignMigrationSql, /GRANT EXECUTE ON FUNCTION public\.publish_event_localization[\s\S]*?TO authenticated/);
});

test('29. InMemoryCmsLocalizationRepository supports scoped publishOwnedEventLocalization without mutating other events', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  // Prepopulate with existing event localization
  await repo.savePublished({
    target: 'events',
    locale: 'tr',
    payload: [
      { id: 'e1', title: 'İlk Etkinlik', description: 'Açıklama 1', location: 'Salon 1' }
    ],
    status: 'fresh',
    manualPaths: ['e1.title'],
    stalePaths: [],
    updatedAt: new Date().toISOString(),
  });

  // Publish localization for a new event e2
  await repo.publishOwnedEventLocalization('e2', 'tr', {
    title: 'İkinci Etkinlik',
    description: 'Açıklama 2',
    location: 'Salon 2',
  });

  const updated = await repo.getPublished('events', 'tr');
  assert.equal(Array.isArray(updated.payload), true);
  assert.equal(updated.payload.length, 2);
  assert.deepEqual(updated.payload[0], { id: 'e1', title: 'İlk Etkinlik', description: 'Açıklama 1', location: 'Salon 1' });
  assert.deepEqual(updated.payload[1], { id: 'e2', title: 'İkinci Etkinlik', description: 'Açıklama 2', location: 'Salon 2' });
  assert.ok(updated.manualPaths.includes('e2.title'));
});

test('30. SupabaseCmsLocalizationRepository delegates publishOwnedEventLocalization to the owned-event RPC', async () => {
  let rpcCalled = false;
  let rpcArgs = null;
  const mockClient = {
    rpc(fnName, args) {
      if (fnName === 'publish_owned_event_translation') {
        rpcCalled = true;
        rpcArgs = args;
        return Promise.resolve({ data: { status: 'fresh' }, error: null });
      }
      return Promise.resolve({ data: null, error: new Error('Unknown RPC') });
    }
  };

  const repo = new SupabaseCmsLocalizationRepository(mockClient);
  await repo.publishOwnedEventLocalization(
    'ev-99',
    'tr',
    { title: 'Test Başlık' }
  );

  assert.equal(rpcCalled, true);
  assert.equal(rpcArgs.p_event_id, 'ev-99');
  assert.equal(rpcArgs.p_locale, 'tr');
  assert.equal(rpcArgs.p_title, 'Test Başlık');
  assert.equal(rpcArgs.p_description, null);
  assert.equal(rpcArgs.p_location, null);
  assert.equal(rpcArgs.p_expected_version, 0);
});
