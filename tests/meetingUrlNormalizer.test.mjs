import assert from 'assert';
import { normalizeMeetingUrl } from '../src/utils/meetingUrlNormalizer.ts';

async function runTests() {
  console.log('Running meetingUrlNormalizer tests...');
  let passed = 0;
  let failed = 0;

  function run(name, fn) {
    try {
      fn();
      console.log(`\x1b[32m✔ ${name}\x1b[0m`);
      passed++;
    } catch (err) {
      console.error(`\x1b[31m✘ ${name}\x1b[0m`);
      console.error(err.message);
      failed++;
    }
  }

  // VALID / NORMALIZED
  run('1. meet.google.com/urv-rsty-sxb -> accepted, normalized to https://meet.google.com/urv-rsty-sxb', () => {
    assert.strictEqual(normalizeMeetingUrl('meet.google.com/urv-rsty-sxb'), 'https://meet.google.com/urv-rsty-sxb');
  });

  run('2. https://meet.google.com/urv-rsty-sxb -> accepted unchanged', () => {
    assert.strictEqual(normalizeMeetingUrl('https://meet.google.com/urv-rsty-sxb'), 'https://meet.google.com/urv-rsty-sxb');
  });

  run('3. https://meet.google.com/urv-rsty-sxb?authuser=0 -> accepted', () => {
    assert.strictEqual(normalizeMeetingUrl('https://meet.google.com/urv-rsty-sxb?authuser=0'), 'https://meet.google.com/urv-rsty-sxb?authuser=0');
  });

  run('4. zoom.us/j/123456789 -> accepted, normalized to https://zoom.us/j/123456789', () => {
    assert.strictEqual(normalizeMeetingUrl('zoom.us/j/123456789'), 'https://zoom.us/j/123456789');
  });

  run('5. https://zoom.us/j/123456789 -> accepted', () => {
    assert.strictEqual(normalizeMeetingUrl('https://zoom.us/j/123456789'), 'https://zoom.us/j/123456789');
  });

  // INVALID
  run('6. http://meet.google.com/urv-rsty-sxb -> rejected (must be https)', () => {
    assert.strictEqual(normalizeMeetingUrl('http://meet.google.com/urv-rsty-sxb'), null);
  });

  run('7. https://meet.google.com.evil.com/abc -> rejected', () => {
    assert.strictEqual(normalizeMeetingUrl('https://meet.google.com.evil.com/abc'), null);
  });

  run('8. https://evil.com/meet.google.com/abc -> rejected', () => {
    assert.strictEqual(normalizeMeetingUrl('https://evil.com/meet.google.com/abc'), null);
  });

  run('9. javascript:alert(1) -> rejected', () => {
    assert.strictEqual(normalizeMeetingUrl('javascript:alert(1)'), null);
  });

  run('10. random text -> rejected', () => {
    assert.strictEqual(normalizeMeetingUrl('random text'), null);
  });

  run('11. unsupported arbitrary domain (example.com/foo) -> rejected', () => {
    assert.strictEqual(normalizeMeetingUrl('example.com/foo'), null);
  });

  console.log(`\nTests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
