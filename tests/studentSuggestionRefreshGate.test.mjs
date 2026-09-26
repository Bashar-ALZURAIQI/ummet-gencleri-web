import test from 'node:test';
import assert from 'node:assert/strict';
import { createSuggestionRefreshGate } from '../src/domain/studentSuggestionRefreshGate.ts';

test('createSuggestionRefreshGate prevents older slow refresh overwriting newer refresh', () => {
  const gate = createSuggestionRefreshGate();
  
  const req1 = gate.beginRequest({ epoch: 1, userId: 'u1', role: 'PRESIDENT' });
  const req2 = gate.beginRequest({ epoch: 1, userId: 'u1', role: 'PRESIDENT' });

  assert.equal(gate.isRequestValid(req1), false);
  assert.equal(gate.isRequestValid(req2), true);
});

test('createSuggestionRefreshGate prevents prior account response publishing', () => {
  const gate = createSuggestionRefreshGate();
  
  const req1 = gate.beginRequest({ epoch: 1, userId: 'u1', role: 'STUDENT' });
  
  // account switch
  gate.beginRequest({ epoch: 2, userId: 'u2', role: 'STUDENT' });
  
  assert.equal(gate.isRequestValid(req1), false);
});
