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
});
