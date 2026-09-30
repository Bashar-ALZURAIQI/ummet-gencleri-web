import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('Student Guide Mobile Overflow Prevention Contract', async (t) => {
  const guidePath = join(process.cwd(), 'src/pages/StudentGuide.tsx');
  const content = readFileSync(guidePath, 'utf8');

  await t.test('1. Main grid uses min-w-0 and minmax(0,1fr)', () => {
    assert.ok(content.includes('grid min-w-0 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]'), 'Main grid has min-w-0 and minmax column');
  });

  await t.test('2. Main content column has min-w-0', () => {
    assert.ok(content.includes('className="min-w-0 space-y-6"'), 'Content column wrapper has min-w-0');
  });

  await t.test('3. Section header uses min-w-0 on text container', () => {
    assert.ok(content.includes('<div className="min-w-0 flex-1">'), 'Section header text container has min-w-0');
  });

  await t.test('4. Guide item cards have min-w-0 on flex containers', () => {
    assert.ok(content.includes('className="flex min-w-0 items-start gap-3"'), 'Outer item flex has min-w-0');
    assert.ok(content.includes('className="min-w-0 flex-1"'), 'Inner item flex has min-w-0');
  });

  await t.test('5. Tip rows use explicit shrink wrapper and break-all for links', () => {
    assert.ok(content.includes('className="flex min-w-0 items-start gap-2'), 'Tip row flex has min-w-0');
    assert.ok(content.includes('className="dynamic-text-safe min-w-0 flex-1 [&_a]:break-all"'), 'Tip text has explicit shrinkable wrapper with break-all');
  });

  await t.test('6. Body text uses dynamic-text-safe and link break-all', () => {
    assert.ok(content.includes('<p className="dynamic-text-safe mt-1 min-w-0 text-sm leading-relaxed text-gray-600 [&_a]:break-all">'), 'Body text has safe wrapping');
  });

  await t.test('7. Document download button is bounded', () => {
    assert.ok(content.includes('inline-flex min-w-0 max-w-full'), 'Download button has max-w-full and min-w-0');
    assert.ok(content.includes('className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"'), 'Download label truncates');
  });

  await t.test('8. Sidebar section labels are explicitly wrapped and bounded', () => {
    assert.ok(content.includes('<span className="dynamic-text-safe min-w-0 flex-1 text-start">'), 'Sidebar label is wrapped safely');
  });

  await t.test('9. Existing contact min-w-0 fix is preserved', () => {
    // Look for contact link fix added previously
    assert.ok(content.includes('flex-col min-w-0 text-sm'), 'Contact link maintains min-w-0');
    assert.ok(content.includes('className="flex-1 min-w-0"'), 'Contact info wrapper maintains min-w-0');
  });
});
