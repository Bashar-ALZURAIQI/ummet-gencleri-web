import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('Absence Excuse Translations Contract Test', async (t) => {
  const arPath = join(process.cwd(), 'src/i18n/locales/ar.ts');
  const enPath = join(process.cwd(), 'src/i18n/locales/en.ts');
  const trPath = join(process.cwd(), 'src/i18n/locales/tr.ts');
  const programsPagePath = join(process.cwd(), 'src/pages/ProgramsPage.tsx');

  const readContent = (path) => readFileSync(path, 'utf8');

  const keys = [
    'excuseModalTitle',
    'excuseExplanation',
    'excuseLabel',
    'excusePlaceholder',
    'submitExcuse',
    'savingExcuse'
  ];

  await t.test('AR keys exist', () => {
    const content = readContent(arPath);
    for (const key of keys) {
      assert.ok(content.includes(key), `Missing ${key} in AR`);
    }
  });

  await t.test('EN keys exist', () => {
    const content = readContent(enPath);
    for (const key of keys) {
      assert.ok(content.includes(key), `Missing ${key} in EN`);
    }
  });

  await t.test('TR keys exist', () => {
    const content = readContent(trPath);
    for (const key of keys) {
      assert.ok(content.includes(key), `Missing ${key} in TR`);
    }
  });

  await t.test('ProgramsPage uses translation keys instead of Arabic literals', () => {
    const content = readContent(programsPagePath);
    assert.ok(content.includes("t('programs.excuseModalTitle'"), 'Should use translated modal title');
    assert.ok(content.includes("t('programs.excuseExplanation'"), 'Should use translated explanation');
    assert.ok(content.includes("t('programs.excuseLabel'"), 'Should use translated label');
    assert.ok(content.includes("t('programs.excusePlaceholder'"), 'Should use translated placeholder');
    assert.ok(content.includes("t('common.cancel'"), 'Should use translated cancel');
    assert.ok(content.includes("t('programs.savingExcuse'"), 'Should use translated savingExcuse');
    assert.ok(content.includes("t('programs.submitExcuse'"), 'Should use translated submitExcuse');
  });
});
