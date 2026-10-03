import test from 'node:test';
import assert from 'node:assert/strict';

const { AuthEpochController } = await import('../src/domain/authEpoch.ts');
const {
  canExposeAdminUi,
  routeAfterConfirmedIdentityRefresh,
} = await import('../src/domain/liveIdentityRouting.ts');

function immediateScheduler() {
  return {
    schedule(callback) { callback(); return 1; },
    cancel() {},
  };
}

test('confirmed role loss routes an executive to the student dashboard', () => {
  assert.equal(
    routeAfterConfirmedIdentityRefresh('PRESIDENT', 'STUDENT', 'admin'),
    'student-dashboard',
  );
});

test('confirmed role gain routes a student to the admin dashboard', () => {
  assert.equal(
    routeAfterConfirmedIdentityRefresh('STUDENT', 'ACADEMIC_HEAD', 'student-dashboard'),
    'admin',
  );
});

test('a profile-only refresh retains the current route', () => {
  assert.equal(
    routeAfterConfirmedIdentityRefresh('MEDIA_HEAD', 'MEDIA_HEAD', 'news'),
    'news',
  );
  assert.equal(
    routeAfterConfirmedIdentityRefresh('STUDENT', 'STUDENT', 'student-dashboard'),
    'student-dashboard',
  );
});

test('an out-of-order refresh cannot restore an older executive role', async () => {
  const epochs = new AuthEpochController(immediateScheduler());
  epochs.activate();
  const olderEpoch = epochs.beginEvent();
  const newerEpoch = epochs.beginEvent();
  let appliedRole = 'STUDENT';

  await Promise.resolve();
  if (epochs.isCurrent(newerEpoch)) appliedRole = 'STUDENT';
  await Promise.resolve();
  if (epochs.isCurrent(olderEpoch)) appliedRole = 'PRESIDENT';

  assert.equal(appliedRole, 'STUDENT');
});

test('admin UI is gated during auth initialization and after demotion, but stays visible during background identity refresh', () => {
  assert.equal(canExposeAdminUi('PRESIDENT', true, false), false);
  assert.equal(canExposeAdminUi('PRESIDENT', false, true), true); // changed to true
  assert.equal(canExposeAdminUi('STUDENT', false, false), false);
  assert.equal(canExposeAdminUi('VICE_PRESIDENT', false, false), true);
  assert.equal(canExposeAdminUi(null, false, true), false);
});
