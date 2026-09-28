import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pushDestinationFromUrl } from '../src/domain/webPushClient.ts';
import { isLeadershipRole } from '../src/data/mockData.ts';
import { isSameAuthOwner } from '../src/domain/confirmedAuthOwner.ts';
import { mapWorkloadCounts } from '../src/domain/workloadValidation.ts';
import { resolveEffectiveAdminTab } from '../src/domain/appNavigation.ts';

test('Targeted Executive Notifications Frontend (Phase 2)', async (t) => {
  await t.test('1-5. Executive notification UI eligibility helper', () => {
    assert.strictEqual(isLeadershipRole('PRESIDENT'), true);
    assert.strictEqual(isLeadershipRole('ACADEMIC_HEAD'), true);
    assert.strictEqual(isLeadershipRole('VICE_PRESIDENT'), true);
    assert.strictEqual(isLeadershipRole('STUDENT'), false);
    assert.strictEqual(isLeadershipRole(null), false);
    assert.strictEqual(isLeadershipRole(undefined), false);
  });



  await t.test('16-19. Workload response mapper/validator', () => {
    // 16. valid counts
    const valid = mapWorkloadCounts({
      pendingGuideSuggestions: 1,
      unreadContactMessages: 2,
      newStudentSuggestions: 3,
    });
    assert.deepStrictEqual(valid, {
      pendingGuideSuggestions: 1,
      unreadContactMessages: 2,
      newStudentSuggestions: 3,
    });

    // 17. rejects negative
    assert.throws(() => {
      mapWorkloadCounts({
        pendingGuideSuggestions: -1,
        unreadContactMessages: 2,
        newStudentSuggestions: 3,
      });
    });

    // 18. rejects fractional
    assert.throws(() => {
      mapWorkloadCounts({
        pendingGuideSuggestions: 1.5,
        unreadContactMessages: 2,
        newStudentSuggestions: 3,
      });
    });

    // 19. rejects malformed/missing fields
    assert.throws(() => {
      mapWorkloadCounts({
        pendingGuideSuggestions: 1,
        unreadContactMessages: 2,
        // missing newStudentSuggestions
      });
    });
    assert.throws(() => {
      mapWorkloadCounts(null);
    });
  });

  await t.test('20-22. Auth-owner equality/staleness helper', () => {
    const ownerA = { userId: 'user1', epoch: 1, loginEmail: 'a@b.com', role: 'PRESIDENT' };
    const ownerA_changedEpoch = { userId: 'user1', epoch: 2, loginEmail: 'a@b.com', role: 'PRESIDENT' };
    const ownerA_changedRole = { userId: 'user1', epoch: 1, loginEmail: 'a@b.com', role: 'ACADEMIC_HEAD' };
    const ownerB = { userId: 'user2', epoch: 1, loginEmail: 'b@b.com', role: 'ACADEMIC_HEAD' };

    assert.strictEqual(isSameAuthOwner(ownerA, ownerA), true, 'same auth owner/epoch/role accepted');
    assert.strictEqual(isSameAuthOwner(ownerA, ownerA_changedEpoch), false, 'changed epoch rejected');
    assert.strictEqual(isSameAuthOwner(ownerA, ownerA_changedRole), false, 'changed role rejected');
    assert.strictEqual(isSameAuthOwner(ownerA, ownerB), false, 'changed user rejected');
    assert.strictEqual(isSameAuthOwner(ownerA, null), false, 'missing owner -> false');
  });

  await t.test('23-25. Deep link mappings exist for new notification destinations', () => {
    assert.equal(pushDestinationFromUrl('https://site.test/?push=guide-suggestions'), 'guide-suggestions');
    assert.equal(pushDestinationFromUrl('https://site.test/?push=contact-inbox'), 'contact-inbox');
    assert.equal(pushDestinationFromUrl('https://site.test/?push=student-suggestions'), 'student-suggestions');
  });

  await t.test('25a. resolveEffectiveAdminTab enforces deep-link authorization', () => {
    const mockStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

    // authorized for inbox
    const authInbox = resolveEffectiveAdminTab({ urlTab: 'inbox', permittedTabs: ['stats', 'inbox'], userId: 'u1', storage: mockStorage });
    assert.strictEqual(authInbox, 'inbox');

    // unauthorized for inbox
    const unauthInbox = resolveEffectiveAdminTab({ urlTab: 'inbox', permittedTabs: ['stats'], userId: 'u1', storage: mockStorage });
    assert.strictEqual(unauthInbox, 'stats');

    // authorized for guide-suggestions
    const authGuide = resolveEffectiveAdminTab({ urlTab: 'guide-suggestions', permittedTabs: ['stats', 'guide-suggestions'], userId: 'u1', storage: mockStorage });
    assert.strictEqual(authGuide, 'guide-suggestions');

    // unauthorized for guide-suggestions
    const unauthGuide = resolveEffectiveAdminTab({ urlTab: 'guide-suggestions', permittedTabs: ['stats', 'inbox'], userId: 'u1', storage: mockStorage });
    assert.strictEqual(unauthGuide, 'stats');

    // authorized for suggestions
    const authSuggestions = resolveEffectiveAdminTab({ urlTab: 'suggestions', permittedTabs: ['stats', 'suggestions'], userId: 'u1', storage: mockStorage });
    assert.strictEqual(authSuggestions, 'suggestions');

    // current permissions win if role changed
    const roleChanged = resolveEffectiveAdminTab({ urlTab: 'suggestions', permittedTabs: ['stats'], userId: 'u1', storage: mockStorage });
    assert.strictEqual(roleChanged, 'stats');
  });

  await t.test('26-27. SQL queries in migration', () => {
    const sqlPath = join(process.cwd(), 'supabase/migrations/20260927230446_targeted_executive_notifications.sql');
    const sqlContent = readFileSync(sqlPath, 'utf8');

    // 26. President workload SQL counts ALL new suggestions
    assert.ok(
      sqlContent.includes(`IF v_role = 'PRESIDENT' THEN\n    SELECT count(*) INTO v_new_student_suggestions FROM public.student_suggestions WHERE status = 'new';`),
      'Migration must count ALL student suggestions for PRESIDENT'
    );

    // 27. non-President workload SQL filters target_role
    assert.ok(
      sqlContent.includes(`ELSE\n    SELECT count(*) INTO v_new_student_suggestions FROM public.student_suggestions WHERE target_role = v_role AND status = 'new';`),
      'Migration must count targeted student suggestions for non-PRESIDENT'
    );
  });

  await t.test('28. ExecutivePushControl is no longer mounted only inside ApplicationsTab', () => {
    const dashboardPath = join(process.cwd(), 'src/pages/AdminDashboard.tsx');
    const dashboardContent = readFileSync(dashboardPath, 'utf8');

    assert.ok(
      dashboardContent.includes('<ExecutivePushControl role={currentUser.role} />'),
      'ExecutivePushControl must be present'
    );
    // Ensure it's not nested in tab === 'applications' logic
    const indexOfApplicationsTab = dashboardContent.indexOf(`tab === 'applications'`);
    const indexOfPushControl = dashboardContent.indexOf('<ExecutivePushControl');
    assert.ok(indexOfPushControl < indexOfApplicationsTab, 'ExecutivePushControl must be placed above the tab-specific rendering (in the shared shell)');
  });

  await t.test('29. mutations trigger workload refresh (statically verified)', () => {
    const contextPath = join(process.cwd(), 'src/context/AppContext.tsx');
    const contextContent = readFileSync(contextPath, 'utf8');
    const panelPath = join(process.cwd(), 'src/components/GuideSuggestionsPanel.tsx');
    const panelContent = readFileSync(panelPath, 'utf8');

    // Verify each mutation calls refreshWorkloadCounts
    assert.match(contextContent, /const respondToSuggestion[\s\S]*?refreshWorkloadCounts\(\)/, 'respondToSuggestion must refresh workload');
    assert.match(contextContent, /const markContactMessageRead[\s\S]*?refreshWorkloadCounts\(\)/, 'markContactMessageRead must refresh workload');
    assert.match(contextContent, /const replyToContactMessage[\s\S]*?refreshWorkloadCounts\(\)/, 'replyToContactMessage must refresh workload');

    assert.match(panelContent, /const updateStatus[\s\S]*?refreshWorkloadCounts\(\)/, 'updateGuideSuggestionStatus must refresh workload');
    assert.match(panelContent, /const remove[\s\S]*?refreshWorkloadCounts\(\)/, 'deleteGuideSuggestion must refresh workload');

    // Regression check: no independent createVisibilityRefreshPolling loop for workload counts
    assert.doesNotMatch(contextContent, /const (workloadPolling|workloadRefresh) = createVisibilityRefreshPolling/, 'Must NOT introduce another independent polling loop');
  });
});
