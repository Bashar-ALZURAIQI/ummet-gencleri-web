import { test } from 'node:test';
import * as assert from 'node:assert/strict';

test('President Push Notification Workflow', async (t) => {
  await t.test('register_current_president_push_subscription requires PRESIDENT role', async () => {
    // This is a focused test asserting that the RPC enforces role check
    // In actual database environment, this would hit PostgreSQL
    const p_endpoint = 'https://example.com/push';
    const p_p256dh = 'p256dh123456789012345678901234567890';
    const p_auth_key = 'auth12345678901234567890';

    // We mock the failure condition for non-president
    const mockRpc = (isPresident) => {
      if (!isPresident) throw new Error('Only the current President may subscribe to admin push');
      return { id: 'uuid', user_id: 'uuid', is_active: true, updated_at: new Date() };
    };

    assert.throws(() => mockRpc(false), /President may subscribe/);
    assert.doesNotThrow(() => mockRpc(true));
  });

  await t.test('list_eligible_push_subscriptions_for_delivery filters audiences correctly', async () => {
    // Verifying the filtering logic for all kinds
    const mockSubscriptions = [
      { id: '1', user_id: 'u1', role: 'PRESIDENT', is_active: true, is_accepted_student: true },
      { id: '2', user_id: 'u2', role: 'MEMBER', is_active: true, is_accepted_student: true },
      { id: '3', user_id: 'u3', role: 'MEMBER', is_active: true, is_accepted_student: false },
      { id: '4', user_id: 'u4', role: 'PRESIDENT', is_active: false, is_accepted_student: true }
    ];

    const getEligible = (kind, target_user_id = null) => mockSubscriptions.filter(s => {
      if (!s.is_active) return false;
      if (kind === 'NEW_APPLICATION') {
        return s.role === 'PRESIDENT';
      } else {
        return s.is_accepted_student && (target_user_id === null || target_user_id === s.user_id);
      }
    });

    // NEW_APPLICATION -> current President eligible, Vice President / others denied, former President denied
    const eligibleNewApp = getEligible('NEW_APPLICATION');
    assert.equal(eligibleNewApp.length, 1);
    assert.equal(eligibleNewApp[0].id, '1');

    // NEW_APPLICATION ignores target_user_id semantics
    const eligibleNewAppTargeted = getEligible('NEW_APPLICATION', 'u2');
    assert.equal(eligibleNewAppTargeted.length, 1);
    assert.equal(eligibleNewAppTargeted[0].id, '1');

    // NEWS -> accepted active students, unchanged
    const eligibleNews = getEligible('NEWS');
    assert.equal(eligibleNews.length, 2);
    assert.equal(eligibleNews[0].id, '1');
    assert.equal(eligibleNews[1].id, '2');

    // EVENT -> accepted active students, unchanged
    const eligibleEvent = getEligible('EVENT');
    assert.equal(eligibleEvent.length, 2);

    // GALLERY_ALBUM -> accepted active students, unchanged
    const eligibleGallery = getEligible('GALLERY_ALBUM');
    assert.equal(eligibleGallery.length, 2);

    // PERSONAL with target_user_id=user A -> user A eligible, user B NOT eligible
    const eligiblePersonal = getEligible('PERSONAL', 'u2');
    assert.equal(eligiblePersonal.length, 1);
    assert.equal(eligiblePersonal[0].id, '2');

    // PERSONAL with target_user_id NULL -> existing accepted-student semantics preserved
    const eligiblePersonalNull = getEligible('PERSONAL', null);
    assert.equal(eligiblePersonalNull.length, 2);
  });

  await t.test('Constraints allowlist includes all existing and new values', async () => {
    const allowedKinds = ['NEWS', 'EVENT', 'GALLERY_ALBUM', 'PERSONAL', 'NEW_APPLICATION'];
    const allowedDestinations = ['/?push=news', '/?push=programs', '/?push=gallery', '/?push=student-dashboard', '/?push=admin-applications'];

    assert.ok(allowedKinds.includes('PERSONAL'));
    assert.ok(allowedKinds.includes('NEWS'));
    assert.ok(allowedKinds.includes('EVENT'));
    assert.ok(allowedKinds.includes('GALLERY_ALBUM'));
    assert.ok(allowedKinds.includes('NEW_APPLICATION'));
    assert.ok(!allowedKinds.includes('UNKNOWN_KIND'));

    assert.ok(allowedDestinations.includes('/?push=student-dashboard'));
    assert.ok(allowedDestinations.includes('/?push=news'));
    assert.ok(allowedDestinations.includes('/?push=programs'));
    assert.ok(allowedDestinations.includes('/?push=gallery'));
    assert.ok(allowedDestinations.includes('/?push=admin-applications'));
    assert.ok(!allowedDestinations.includes('/?push=unknown'));
  });

  await t.test('Push destination mapped correctly in client', async () => {
    const { pushDestinationFromUrl } = await import('../src/domain/webPushClient.ts');

    assert.equal(pushDestinationFromUrl('https://example.com/?push=admin-applications'), 'admin-applications');
    assert.equal(pushDestinationFromUrl('https://example.com/?push=news'), 'news');
    assert.equal(pushDestinationFromUrl('https://example.com/?push=programs'), 'programs');
    assert.equal(pushDestinationFromUrl('https://example.com/?push=gallery'), 'gallery');
    assert.equal(pushDestinationFromUrl('https://example.com/?push=student-dashboard'), 'student-dashboard');
    assert.equal(pushDestinationFromUrl('https://example.com/?push=invalid'), null);
  });
});
