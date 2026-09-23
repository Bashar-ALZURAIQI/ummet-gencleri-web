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
