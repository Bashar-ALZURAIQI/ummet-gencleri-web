import test from 'node:test';
import assert from 'node:assert/strict';

const getObjectKeysRecursively = (obj, prefix = '') => {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return getObjectKeysRecursively(value, fullPath);
    }
    return [fullPath];
  });
};

test('1. Task withdrawal keys exist in AR/TR/EN', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const requiredKeys = [
    'tasks.cancelParticipation',
    'tasks.canceling',
    'tasks.confirmCancel',
    'tasks.cancelSuccess'
  ];

  const arKeys = new Set(getObjectKeysRecursively(ar));
  const trKeys = new Set(getObjectKeysRecursively(tr));
  const enKeys = new Set(getObjectKeysRecursively(en));

  for (const key of requiredKeys) {
    assert.ok(arKeys.has(key), `AR missing key: ${key}`);
    assert.ok(trKeys.has(key), `TR missing key: ${key}`);
    assert.ok(enKeys.has(key), `EN missing key: ${key}`);
  }
});
