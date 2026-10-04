import test from 'node:test';
import assert from 'node:assert/strict';
import { createSuggestionRefreshGate, shouldRefreshSuggestionsOnTabTransition } from '../src/domain/studentSuggestionRefreshGate.ts';

test('request 1 invalid after newer request', () => {
  const gate = createSuggestionRefreshGate();
  const req1 = gate.beginRequest({ epoch: 1, userId: 'u1', role: 'STUDENT' });
  const req2 = gate.beginRequest({ epoch: 1, userId: 'u1', role: 'STUDENT' });
  assert.equal(gate.isRequestValid(req1), false);
  assert.equal(gate.isRequestValid(req2), true);
});

test('userId change invalidates old request', () => {
  const gate = createSuggestionRefreshGate();
  const req1 = gate.beginRequest({ epoch: 1, userId: 'u1', role: 'STUDENT' });
  gate.beginRequest({ epoch: 1, userId: 'u2', role: 'STUDENT' });
  assert.equal(gate.isRequestValid(req1), false);
});

test('role change invalidates old request', () => {
  const gate = createSuggestionRefreshGate();
  const req1 = gate.beginRequest({ epoch: 1, userId: 'u1', role: 'STUDENT' });
  gate.beginRequest({ epoch: 1, userId: 'u1', role: 'PRESIDENT' });
  assert.equal(gate.isRequestValid(req1), false);
});

test('epoch change invalidates old request', () => {
  const gate = createSuggestionRefreshGate();
  const req1 = gate.beginRequest({ epoch: 1, userId: 'u1', role: 'STUDENT' });
  gate.beginRequest({ epoch: 2, userId: 'u1', role: 'STUDENT' });
  assert.equal(gate.isRequestValid(req1), false);
});

test('clear/logout invalidates old request', () => {
  const gate = createSuggestionRefreshGate();
  const req1 = gate.beginRequest({ epoch: 1, userId: 'u1', role: 'STUDENT' });
  gate.clear();
  assert.equal(gate.isRequestValid(req1), false);
});

test('tab transition refresh behavior', () => {
  let refreshCount = 0;
  
  const assertTransition = (prev, next, expected) => {
    const result = shouldRefreshSuggestionsOnTabTransition(prev, next);
    assert.equal(result, expected, `Failed for ${prev} -> ${next}`);
    if (result) refreshCount++;
  };

  // Unit assertions
  assertTransition(null, 'suggestions', true);
  assertTransition('activities', 'suggestions', true);
  assertTransition('suggestions', 'suggestions', false);
  assertTransition('suggestions', 'activities', false);
  assertTransition('activities', 'activities', false);

  // Simulate sequence
  refreshCount = 0;
  assertTransition(null, 'suggestions', true);
  assertTransition('suggestions', 'activities', false);
  assertTransition('activities', 'suggestions', true);
  
  assert.equal(refreshCount, 2);
});
