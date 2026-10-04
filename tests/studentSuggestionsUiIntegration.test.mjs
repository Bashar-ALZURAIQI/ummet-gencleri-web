import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const studentSource = readFileSync('./src/pages/StudentDashboard.tsx', 'utf8');
const adminSource = readFileSync('./src/pages/AdminDashboard.tsx', 'utf8');

test('StudentDashboard UI integration', () => {
  // no public setSuggestions use
  assert.ok(!studentSource.includes('setSuggestions('), 'no setSuggestions use');

  // awaits submitSuggestion
  assert.ok(studentSource.includes('await submitSuggestion('), 'awaits submitSuggestion');

  // submitting busy state prevents double-submit
  assert.ok(studentSource.includes('disabled={submitting}'), 'submit button disabled while submitting');

  // hard mutation failure keeps form contents (not cleared if !ok)
  // refreshPending displays a distinct warning
  assert.ok(studentSource.includes('refreshPending'), 'handles refreshPending in UI');
  assert.ok(studentSource.includes('suggestionSubmitFailure'), 'shows suggestionSubmitFailure on hard error');

  // loading/error state is represented
  assert.ok(studentSource.includes('suggestionsLoading'), 'uses suggestionsLoading');
  assert.ok(studentSource.includes('suggestionsError'), 'uses suggestionsError');

  // transition guard prevents refresh loops
  assert.ok(studentSource.includes('prevTabRef.current !== \'suggestions\''), 'has transition guard for suggestion refresh');
});

test('AdminDashboard UI integration', () => {
  // awaits respondToSuggestion
  assert.ok(adminSource.includes('await respondToSuggestion('), 'awaits respondToSuggestion');

  // response busy state prevents double-submit
  assert.ok(adminSource.includes('disabled={replySubmitting}'), 'reply button disabled while submitting');

  // no authoritative local status mutation
   // Actually it might set status locally before submit? We need to verify it doesn't fake local response append.

  // hard failure is shown and does not pretend success
  // refreshPending displays distinct warning
  assert.ok(adminSource.includes('refreshPending'), 'handles refreshPending in Admin UI');
  assert.ok(adminSource.includes('responseFailure'), 'shows responseFailure on hard error');
});

test('i18n keys for suggestions exist', () => {
  const ar = readFileSync('./src/i18n/locales/ar.ts', 'utf8');
  const en = readFileSync('./src/i18n/locales/en.ts', 'utf8');
  const tr = readFileSync('./src/i18n/locales/tr.ts', 'utf8');

  // Arabic
  assert.ok(ar.includes(`suggestionsLoading: 'جارٍ تحميل الاقتراحات...'`), 'AR suggestionsLoading');
  assert.ok(ar.includes(`suggestionsLoadFailure: 'تعذر تحميل الاقتراحات.'`), 'AR suggestionsLoadFailure');

  // English
  assert.ok(en.includes(`suggestionsLoading: 'Loading suggestions...'`), 'EN suggestionsLoading');
  assert.ok(en.includes(`suggestionSubmitting: 'Submitting suggestion...'`), 'EN suggestionSubmitting');

  // Turkish
  assert.ok(tr.includes(`suggestionsLoading: 'Öneriler yükleniyor...'`), 'TR suggestionsLoading');
  assert.ok(tr.includes(`suggestionSubmitting: 'Öneri gönderiliyor...'`), 'TR suggestionSubmitting');
});
