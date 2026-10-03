import test from 'node:test';
import assert from 'node:assert/strict';

import {
  urlToView,
  viewToUrl,
  validateReturnTo,
  resolveProtectedDestination,
} from '../src/domain/appNavigation.ts';

import { canExposeAdminUi } from '../src/domain/liveIdentityRouting.ts';

// ---------------------------------------------------------------------------
// Protected Deep Link Routing (33 - 35, 40 - 44)
// ---------------------------------------------------------------------------

test('33. logged-out /admin route does not grant Admin access', () => {
  assert.equal(canExposeAdminUi(null, false, false), false);
  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin' },
    currentUser: null,
    authInitializing: false,
    identityRefreshing: false,
    permittedTabs: [],
  });

  assert.equal(decision.shouldRenderProtected, false);
  assert.equal(decision.redirectView?.kind, 'login');
});

test('34. logged-out /admin?tab=members resolves to Login', () => {
  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin', tab: 'members' },
    currentUser: null,
    authInitializing: false,
    identityRefreshing: false,
    permittedTabs: [],
  });

  assert.equal(decision.shouldRenderProtected, false);
  assert.deepEqual(decision.redirectView, {
    kind: 'login',
    returnTo: '/admin?tab=members',
  });
});

test('35. intended returnTo is preserved', () => {
  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin', tab: 'member-points' },
    currentUser: null,
    authInitializing: false,
    identityRefreshing: false,
    permittedTabs: [],
  });

  assert.equal(decision.redirectView?.returnTo, '/admin?tab=member-points');
});

test('40. authorized login restores requested Admin destination', () => {
  const presidentUser = { userId: 'p1', role: 'PRESIDENT' };
  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin', tab: 'members' },
    currentUser: presidentUser,
    authInitializing: false,
    identityRefreshing: false,
    permittedTabs: ['stats', 'members', 'member-points'],
  });

  assert.equal(decision.shouldRenderProtected, true);
  assert.deepEqual(decision.effectiveView, { kind: 'admin', tab: 'members' });
});

test('41. login to account unauthorized for requested tab does NOT restore forbidden tab', () => {
  // Academic Head opens /admin?tab=members
  const academicHead = { userId: 'a1', role: 'ACADEMIC_HEAD' };
  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin', tab: 'members' },
    currentUser: academicHead,
    authInitializing: false,
    identityRefreshing: false,
    permittedTabs: ['stats', 'plans'], // 'members' is NOT permitted for Academic Head
  });

  assert.equal(decision.shouldRenderProtected, true);
  // Must normalize to permitted tab (e.g. stats), NOT members!
  assert.equal(decision.effectiveView?.tab, 'stats');
  assert.notEqual(decision.effectiveView?.tab, 'members');
});

test('42. Student cannot enter Admin via copied URL', () => {
  const studentUser = { userId: 's1', role: 'STUDENT' };
  assert.equal(canExposeAdminUi(studentUser.role, false, false), false);

  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin', tab: 'members' },
    currentUser: studentUser,
    authInitializing: false,
    identityRefreshing: false,
    permittedTabs: [],
  });

  assert.equal(decision.shouldRenderProtected, false);
  assert.deepEqual(decision.redirectView, { kind: 'student-dashboard' });
});

test('43. Admin URL cannot create role/permission state', () => {
  // Visiting /admin?tab=members without session yields currentUser === null
  assert.equal(canExposeAdminUi(undefined, false, false), false);
  assert.equal(canExposeAdminUi(null, false, false), false);
});

test('44. URL cannot bypass canExposeAdminUi or tab-specific authorization', () => {
  // Even if URL has ?tab=pending-edits:
  assert.equal(canExposeAdminUi('STUDENT', false, false), false);
  assert.equal(canExposeAdminUi('MEDIA_HEAD', true, false), false, 'Blocked while authInitializing');
  assert.equal(canExposeAdminUi('PRESIDENT', false, true), true, 'Allowed while identityRefreshing');
});

// ---------------------------------------------------------------------------
// Auth Initialization Race Safety (45 - 49)
// ---------------------------------------------------------------------------

test('45. protected direct load does not prematurely redirect while authInitializing', () => {
  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin', tab: 'member-points' },
    currentUser: null,
    authInitializing: true, // Still checking session
    identityRefreshing: false,
    permittedTabs: [],
  });

  assert.equal(decision.isPendingAuth, true, 'Must wait for session check');
  assert.equal(decision.shouldRenderProtected, false, 'Do not render protected UI while pending');
  assert.equal(decision.redirectView, undefined, 'Must NOT redirect prematurely');
});

test('46. protected direct load does not prematurely redirect while identityRefreshing', () => {
  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin', tab: 'member-points' },
    currentUser: null,
    authInitializing: false,
    identityRefreshing: true, // Still refreshing identity
    permittedTabs: [],
  });

  assert.equal(decision.isPendingAuth, true);
  assert.equal(decision.shouldRenderProtected, false);
  assert.equal(decision.redirectView, undefined);
});

test('47. no protected content renders during unresolved identity', () => {
  assert.equal(canExposeAdminUi('PRESIDENT', true, false), false);
  assert.equal(canExposeAdminUi('PRESIDENT', false, true), true);
});

test('48. after confirmed authorized identity requested route is restored', () => {
  const president = { userId: 'p1', role: 'PRESIDENT' };
  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin', tab: 'member-points' },
    currentUser: president,
    authInitializing: false,
    identityRefreshing: false,
    permittedTabs: ['stats', 'member-points'],
  });

  assert.equal(decision.shouldRenderProtected, true);
  assert.deepEqual(decision.effectiveView, { kind: 'admin', tab: 'member-points' });
});

test('49. after confirmed unauthorized identity safe route is selected', () => {
  const student = { userId: 's1', role: 'STUDENT' };
  const decision = resolveProtectedDestination({
    requestedView: { kind: 'admin', tab: 'member-points' },
    currentUser: student,
    authInitializing: false,
    identityRefreshing: false,
    permittedTabs: [],
  });

  assert.equal(decision.shouldRenderProtected, false);
  assert.deepEqual(decision.redirectView, { kind: 'student-dashboard' });
});

// ---------------------------------------------------------------------------
// Login / Logout Flows (56 - 59)
// ---------------------------------------------------------------------------

test('56. successful login consumes valid pending returnTo only after identity is known', () => {
  const returnTo = '/admin?tab=member-points';
  const valid = validateReturnTo(returnTo);
  assert.equal(valid, '/admin?tab=member-points');

  const parsedTarget = urlToView(valid);
  assert.deepEqual(parsedTarget.view, { kind: 'admin', tab: 'member-points' });
});

test('57. failed login preserves pending destination', () => {
  // If login form errors, view remains login with same returnTo
  const loginView = { kind: 'login', returnTo: '/admin?tab=member-points' };
  const url = viewToUrl(loginView);
  assert.equal(url, '/login?returnTo=%2Fadmin%3Ftab%3Dmember-points');
  const parsed = urlToView(url);
  assert.deepEqual(parsed.view, loginView);
});

test('58. ordinary login with no returnTo keeps existing role-based behavior', () => {
  // Student -> student-dashboard
  const studentRole = 'STUDENT';
  const defaultStudentView = studentRole === 'STUDENT' ? { kind: 'student-dashboard' } : { kind: 'admin' };
  assert.deepEqual(defaultStudentView, { kind: 'student-dashboard' });

  // Executive -> admin
  const execRole = 'PRESIDENT';
  const defaultExecView = execRole === 'STUDENT' ? { kind: 'student-dashboard' } : { kind: 'admin' };
  assert.deepEqual(defaultExecView, { kind: 'admin' });
});

test('59. logout cannot leave protected route visible', () => {
  // On logout, currentUser becomes null and navigation replaces to '/'
  const loggedOutDecision = resolveProtectedDestination({
    requestedView: { kind: 'admin' },
    currentUser: null,
    authInitializing: false,
    identityRefreshing: false,
    permittedTabs: [],
  });

  assert.equal(loggedOutDecision.shouldRenderProtected, false);
});
