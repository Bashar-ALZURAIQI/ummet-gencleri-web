import test from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveEventStatus } from '../src/domain/eventTemporalStatus.ts';

test('1. persisted upcoming + future datetime => upcoming', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const future = '2026-09-24T12:00:00Z';
  assert.equal(getEffectiveEventStatus('upcoming', future, now), 'upcoming');
});

test('2. persisted upcoming + past datetime => past', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const past = '2026-09-22T12:00:00Z';
  assert.equal(getEffectiveEventStatus('upcoming', past, now), 'past');
});

test('3. persisted upcoming + datetime exactly equal to now => past', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const exact = '2026-09-23T12:00:00Z';
  assert.equal(getEffectiveEventStatus('upcoming', exact, now), 'past');
});

test('4. persisted past + future datetime => past', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const future = '2026-09-24T12:00:00Z';
  assert.equal(getEffectiveEventStatus('past', future, now), 'past');
});

test('5. invalid or unexpected time handling => fallback to persisted status', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  assert.equal(getEffectiveEventStatus('upcoming', '', now), 'upcoming');
  assert.equal(getEffectiveEventStatus('upcoming', 'invalid-date', now), 'upcoming');
  assert.equal(getEffectiveEventStatus('past', 'invalid-date', now), 'past');
});

import fs from 'node:fs/promises';

test('6. ProgramsPage uses effective temporal status mapping', async () => {
  const code = await fs.readFile('src/pages/ProgramsPage.tsx', 'utf8');
  assert.ok(
    code.includes('getEffectiveEventStatus(e.status, e.date, nowTime)'),
    'ProgramsPage must map event status using getEffectiveEventStatus'
  );
  assert.ok(
    code.includes('const effectiveEvents ='),
    'ProgramsPage must use mapped effective events instead of raw events'
  );
});

test('7. HomePage uses effective temporal status mapping', async () => {
  const code = await fs.readFile('src/pages/HomePage.tsx', 'utf8');
  assert.ok(
    code.includes('getEffectiveEventStatus(e.status, e.date, nowTime)'),
    'HomePage must map event status using getEffectiveEventStatus'
  );
  assert.ok(
    code.includes('const effectiveEvents ='),
    'HomePage must use mapped effective events instead of raw events'
  );
});

