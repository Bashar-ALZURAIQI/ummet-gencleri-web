import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relPath) => {
  const content = await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');
  return content.replace(/\r\n/g, '\n');
};

const getObjectKeysRecursively = (obj, prefix = '') => {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return getObjectKeysRecursively(value, fullPath);
    }
    return [fullPath];
  });
};

test('1. Required student dashboard keys exist in AR/TR/EN', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const requiredKeys = [
    'student.sidebarTitle',
    'student.tabs.activities',
    'student.tabs.tasks',
    'student.tabs.achievements',
    'student.tabs.suggestions',
    'student.tabs.messages',
    'student.tabs.application',
    'student.editProfile',
    'student.stats.registeredActivities',
    'student.stats.submittedSuggestions',
    'student.stats.memberSince',
    'student.stats.status',
    'student.status.active',
    'student.status.inactive',
    'student.profileTitle',
    'student.profileEmail',
    'student.profileUniversity',
    'student.profileMajor',
    'student.profileYear',
    'student.myRegisteredActivities',
    'student.suggestions.title',
    'student.suggestions.subtitle',
    'student.suggestions.success',
    'student.suggestions.titleLabel',
    'student.suggestions.titlePlaceholder',
    'student.suggestions.targetRoleLabel',
    'student.suggestions.categoryLabel',
    'student.suggestions.categories.activity',
    'student.suggestions.categories.complaint',
    'student.suggestions.categories.development',
    'student.suggestions.categories.programs',
    'student.suggestions.categories.other',
    'student.suggestions.detailsLabel',
    'student.suggestions.detailsPlaceholder',
    'student.suggestions.previousTitle',
    'student.suggestions.empty',
    'student.suggestions.directedTo',
    'student.suggestions.replyFrom',
    'student.suggestions.statusNew',
    'student.suggestions.statusReviewing',
    'student.suggestions.statusImplemented',
    'student.suggestions.statusClosed',
    'student.messages.loading',
    'student.messages.title',
    'student.messages.subtitle',
    'student.messages.newMessage',
    'student.messages.empty',
    'student.messages.replied',
    'student.messages.waiting',
    'student.messages.adminReply',
    'student.applicationBanner.pendingTitle',
    'student.applicationBanner.pendingBody',
    'student.applicationBanner.interviewTitle',
    'student.applicationBanner.interviewBody',
    'student.applicationBanner.acceptedTitle',
    'student.applicationBanner.acceptedBody',
    'student.applicationBanner.rejectedTitle',
    'student.applicationBanner.rejectedFallback',
    'student.applicationBanner.closeWelcome',
    'student.applicationDetails.stagesTitle',
    'student.applicationDetails.detailsTitle',
    'student.applicationDetails.interviewTitle',
    'student.applicationDetails.joinInterview',
    'student.applicationDetails.appliedAt',
    'student.applicationDetails.decisionDate',
    'student.applicationDetails.finalAcceptance',
    'student.applicationDetails.interviewStage',
    'student.applicationDetails.underReviewStage',
    'student.applicationDetails.fullAccessNotice',
    'student.applicationDetails.fullAccessTitle',
    'student.loginRequiredTitle',
    'student.loginRequiredText',
    'student.verifyingMembership',
    'student.removedMessage',
    'student.pendingReviewNotice',
    'student.interviewAcceptedTitle',
    'student.dateLabel',
    'student.timeLabel',
    'student.interviewLink',
    'student.toBeDetermined',
  ];

  const arKeys = new Set(getObjectKeysRecursively(ar));
  const trKeys = new Set(getObjectKeysRecursively(tr));
  const enKeys = new Set(getObjectKeysRecursively(en));

  for (const k of requiredKeys) {
    assert.ok(arKeys.has(k), `Missing key in ar.ts: ${k}`);
    assert.ok(trKeys.has(k), `Missing key in tr.ts: ${k}`);
    assert.ok(enKeys.has(k), `Missing key in en.ts: ${k}`);
  }
});

test('2. Dictionary parity remains intact across AR, TR, and EN', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const arKeys = getObjectKeysRecursively(ar).sort();
  const trKeys = getObjectKeysRecursively(tr).sort();
  const enKeys = getObjectKeysRecursively(en).sort();

  assert.deepEqual(arKeys, trKeys, 'ar and tr key sets must match');
  assert.deepEqual(arKeys, enKeys, 'ar and en key sets must match');
});

test('3. Student sidebar labels use translations', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.match(code, /useTranslation/, 'StudentDashboard.tsx must import useTranslation');
  assert.match(code, /title=\{t\(['"]student\.sidebarTitle['"]/);
  assert.match(code, /t\(`student\.tabs\.\$\{item\.id\}`/);
});

test('4. Profile static labels use translations', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.match(code, /t\(['"]student\.editProfile['"]/);
  assert.match(code, /t\(['"]student\.profileTitle['"]/);
  assert.match(code, /t\(['"]student\.profileEmail['"]/);
  assert.match(code, /t\(['"]student\.profileUniversity['"]/);
  assert.match(code, /t\(['"]student\.profileMajor['"]/);
  assert.match(code, /t\(['"]student\.profileYear['"]/);
  assert.doesNotMatch(code, />\s*تعديل الملف الشخصي\s*</);
});

test('5. Activity static controls use translations', async () => {
  const [dashboard, activities, controls] = await Promise.all([
    read('src/pages/StudentDashboard.tsx'),
    read('src/components/StudentActivitiesPanel.tsx'),
    read('src/components/ActivityDecisionControls.tsx'),
  ]);

  assert.match(dashboard, /t\(['"]student\.myRegisteredActivities['"]/);
  assert.match(activities, /useTranslation/);
  assert.match(controls, /useTranslation/);
});

test('6. Suggestion static UI uses translations', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.match(code, /t\(['"]student\.suggestions\.title['"]/);
  assert.match(code, /t\(['"]student\.suggestions\.previousTitle['"]/);
  assert.match(code, /t\(['"]student\.suggestions\.success['"]/);
  assert.doesNotMatch(code, />\s*قدّم اقتراحًا\s*</);
  assert.doesNotMatch(code, />\s*اقتراحاتي السابقة\s*</);
  assert.doesNotMatch(code, />\s*تم إرسال اقتراحك بنجاح!\s*</);
});

test('7. Points/recognition static labels use translations', async () => {
  const [tasks, gamification] = await Promise.all([
    read('src/components/StudentTasksPanel.tsx'),
    read('src/components/StudentGamificationPanel.tsx'),
  ]);

  assert.match(tasks, /useTranslation/);
  assert.match(gamification, /useTranslation/);
});

test('8. Notifications static UI uses translations where present', async () => {
  const push = await read('src/components/PushNotificationControl.tsx');

  assert.match(push, /useTranslation/);
});

test('9. Status labels map from internal keys without changing keys', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  // Verify internal keys are preserved in StatusBadge
  assert.match(code, /new:\s*\{/);
  assert.match(code, /reviewing:\s*\{/);
  assert.match(code, /implemented:\s*\{/);
  assert.match(code, /closed:\s*\{/);
});

test('10. currentUser.name remains untouched', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.match(code, /currentStudent\.name/);
});

test('11. Email/phone/student identity values remain untouched', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.match(code, /currentStudent\.email/);
  assert.match(code, /currentStudent\.university/);
  assert.match(code, /currentStudent\.major/);
});

test('12. Dynamic activity titles/descriptions remain untouched', async () => {
  const code = await read('src/components/StudentActivitiesPanel.tsx');

  assert.match(code, /item\.title/);
  assert.match(code, /item\.description/);
});

test('13. Student-written suggestions remain untouched', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.match(code, /s\.title/);
  assert.match(code, /s\.content/);
});

test('14. Dynamic backend/admin response text remains untouched', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.match(code, /r\.text/);
  assert.match(code, /message\.reply\.replyText/);
});

test('15. Point numbers remain unchanged', async () => {
  const gamification = await read('src/components/StudentGamificationPanel.tsx');

  assert.match(gamification, /summary\.totalPoints/);
  assert.match(gamification, /summary\.rank/);
});

test('16. Existing SidebarLayout navigation behavior remains unchanged', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.match(code, /<SidebarLayout<StudentPortalTabId>/);
  assert.match(code, /activeId=\{tab\}/);
  assert.match(code, /onSelect=\{handleTabSelect\}/);
});

test('17. Existing RTL/LTR behavior remains unchanged', async () => {
  const layout = await read('src/components/SidebarLayout.tsx');

  assert.match(layout, /dir=\{direction\}/);
  assert.match(layout, /direction === 'rtl' \? 'border-l border-gray-200' : 'border-r border-gray-200'/);
});

test('18. No /ar, /tr, /en URL routes introduced in StudentDashboard', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.doesNotMatch(code, /['"]\/(ar|tr|en)\//);
});

test('19. No machine translation API added', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.doesNotMatch(code, /google\.translate|translate\.googleapis|deepl/i);
});

test('20. No Supabase schema/database change added in StudentDashboard', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  assert.doesNotMatch(code, /supabase\.from/);
  assert.doesNotMatch(code, /supabase\.rpc/);
});

test('21. Auth pages remain unaffected', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');

  assert.ok(ar.auth.login);
  assert.ok(ar.auth.registerTitle);
});

test('22. AdminDashboard.tsx remains untouched in 5C2', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /export default function AdminDashboard/);
});

test('23. Application stages keep 3 stages intact without decorative connector lines', async () => {
  const code = await read('src/pages/StudentDashboard.tsx');

  // Verify all three stages remain intact
  assert.match(code, /key:\s*'pending'/);
  assert.match(code, /key:\s*'interview'/);
  assert.match(code, /key:\s*'accepted'/);

  // Verify decorative connector lines between stages are removed
  assert.doesNotMatch(code, /steps\.map[\s\S]*?h-0\.5[\s\S]*?bg-emerald-500/);
  assert.doesNotMatch(code, /steps\.map[\s\S]*?absolute[\s\S]*?-ml-12/);
});

