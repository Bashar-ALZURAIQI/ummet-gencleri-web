import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Task 3: CmsEntityTranslationTabs preserves empty string over async load
test('test_cms_translation_tabs_preserves_empty_string_over_async_load', () => {
  const componentPath = path.resolve('src/components/cmsLocalization/CmsEntityTranslationTabs.tsx');
  const componentSource = fs.readFileSync(componentPath, 'utf8');

  // Verify that it accepts preserveProvidedTranslations prop
  assert.ok(
    componentSource.includes('preserveProvidedTranslations?: boolean'),
    'Should declare preserveProvidedTranslations?: boolean'
  );

  // Verify that the loadAll function checks this flag before applying loaded fields
  assert.ok(
    componentSource.includes('if (!preserveProvidedTranslations) {'),
    'Should guard CMS field loading with if (!preserveProvidedTranslations)'
  );

  // activeTab API
  assert.ok(
    componentSource.includes("activeTab?: 'ar' | LocalizedCmsLocale;"),
    'Should declare activeTab prop'
  );
  assert.ok(
    componentSource.includes("onActiveTabChange?: (tab: 'ar' | LocalizedCmsLocale) => void;"),
    'Should declare onActiveTabChange prop'
  );
});

// Task 3: UnsavedDraftDecision uses localization
test('test_unsaved_draft_decision_uses_localization', () => {
  const componentPath = path.resolve('src/components/UnsavedDraftDecision.tsx');
  const componentSource = fs.readFileSync(componentPath, 'utf8');
  assert.ok(componentSource.includes("const { t } = useTranslation();"));
  assert.ok(componentSource.includes("t('drafts.unsavedTitle')"));
  assert.ok(componentSource.includes("t('drafts.continueEditing')"));
});

// Task 4: Event editor uses correct feature keys and validation with contentLoading
test('test_event_editor_uses_correct_feature_keys_and_validation_with_contentLoading', () => {
  const adminDashboardPath = path.resolve('src/pages/AdminDashboard.tsx');
  const source = fs.readFileSync(adminDashboardPath, 'utf8');

  // admin:events create key and entity-scoped edit key
  assert.ok(source.includes("buildSessionDraftKey(currentUser.userId, 'admin:events', editId ? 'edit' : 'create', editId ?? undefined)"));

  // editId not persisted inside EventDraftData
  assert.ok(!source.includes("form: { editId"));

  // modalOpen not persisted inside EventDraftData
  assert.ok(!source.includes("form: { modalOpen"));

  // contentLoading => unknown
  assert.ok(source.includes("if (contentLoading) {\n    validation = 'unknown';"));

  // non-President ownership readiness => unknown
  assert.ok(source.includes("if (!ownedEventIdsLoaded) {\n        validation = 'unknown';"));

  // successful submit clears exact draft
  assert.ok(source.includes("draft.clearDraft();"));

  // activeLocale wired to draft UI
  assert.ok(source.includes("activeTab={draft.ui.activeLocale}"));
  assert.ok(source.includes("onActiveTabChange={(t) => draft.setUi(prev => ({...prev, activeLocale: t as 'ar' | 'tr' | 'en'}))}"));

  // findOpenSessionDraft used
  assert.ok(source.includes("findOpenSessionDraft(currentUser.userId, 'admin:events')"));

  // decision rendered inside existing Modal
  assert.ok(source.includes("<Modal open={modalOpen} onClose={draft.requestClose}"));
  assert.ok(source.includes("{draft.isDecisionOpen ? ("));
  assert.ok(source.includes("<UnsavedDraftDecision"));
});

test('test_event_lifecycle_and_ui_bindings', () => {
  const adminDashboardPath = path.resolve('src/pages/AdminDashboard.tsx');
  const source = fs.readFileSync(adminDashboardPath, 'utf8');

  // Event Add opening
  assert.ok(source.includes("draft.openTarget(") && source.includes("setEditId(null)"), 'Event Add opening');
  
  // Event Edit opening
  assert.ok(source.includes("setEditId(e.id)") && source.includes("draft.openTarget("), 'Event Edit opening');

  // successful submit close
  assert.ok(source.includes("draft.clearDraft()"), 'successful submit clears exact draft');
  assert.ok(source.includes("draft.setOpen(false)"), 'successful submit closes modal');
  
  // Cancel routed through requestClose
  assert.ok(source.includes("onClick={draft.requestClose}"), 'Cancel routed through requestClose');

  // preserveProvidedTranslations wired from restoredFromStorage
  assert.ok(source.includes("preserveProvidedTranslations={draft.restoredFromStorage}"), 'preserveProvidedTranslations wired from restoredFromStorage');
});
