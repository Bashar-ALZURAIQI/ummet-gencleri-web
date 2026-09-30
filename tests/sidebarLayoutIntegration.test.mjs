import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => {
  const content = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  return content.replace(/\r\n/g, '\n');
};

test('sidebar layout provides independent full-height scrolling for navigation and content', async () => {
  const layout = await read('src/components/SidebarLayout.tsx');

  assert.match(layout, /aria-expanded/);
  assert.match(layout, /aria-controls/);
  assert.match(layout, /role="dialog"/);
  assert.match(layout, /addEventListener\('keydown'/);
  assert.match(layout, /document\.body\.style\.overflow/);
  assert.match(layout, /lg:hidden/);
  assert.match(layout, /\bhidden\b/);
  assert.match(layout, /\blg:block\b/);
  assert.match(layout, /flex h-full w-full overflow-hidden/);
  assert.match(layout, /h-full w-\[17rem\] shrink-0 overflow-y-auto/);
  assert.match(layout, /h-full min-w-0 flex-1 overflow-y-auto/);
  assert.match(layout, /direction === 'rtl' \? 'right-0' : 'left-0'/);
  assert.doesNotMatch(layout, /sticky top-24/);
});

test('dashboard pages own the viewport and the student header scrolls inside the main content pane', async () => {
  const [admin, student] = await Promise.all([
    read('src/pages/AdminDashboard.tsx'),
    read('src/pages/StudentDashboard.tsx'),
  ]);

  assert.match(admin, /className="h-screen overflow-hidden bg-gray-50 pt-16 lg:pt-20"/);
  assert.match(student, /className="h-screen overflow-hidden bg-gray-50 pt-16 lg:pt-20"/);

  const studentSidebarStart = student.indexOf('<SidebarLayout<StudentPortalTabId>');
  const studentSidebarEnd = student.indexOf('</SidebarLayout>', studentSidebarStart);
  const studentHeader = student.indexOf('bg-gradient-to-l from-navy-800 to-navy-950');
  assert.ok(studentSidebarStart >= 0 && studentSidebarEnd > studentSidebarStart);
  assert.ok(studentHeader > studentSidebarStart && studentHeader < studentSidebarEnd);
});

test('admin overview header and permission notice exist only inside the statistics tab', async () => {
  const admin = await read('src/pages/AdminDashboard.tsx');
  const dashboardStart = admin.indexOf('export default function AdminDashboard');
  const statsStart = admin.indexOf('function StatsTab');
  const headerTitle = admin.indexOf('لوحة تحكم الإدارة');
  const permissionNotice = admin.indexOf('صلاحياتك:');

  assert.ok(statsStart > dashboardStart);
  assert.ok(headerTitle > statsStart, 'expected dashboard title inside StatsTab');
  assert.ok(permissionNotice > statsStart, 'expected permission notice inside StatsTab');
  assert.equal(admin.indexOf('لوحة تحكم الإدارة', headerTitle + 1), -1);
  assert.equal(admin.indexOf('صلاحياتك:', permissionNotice + 1), -1);
});

test('selecting a mobile sidebar item reports the selection before closing the drawer', async () => {
  const layout = await read('src/components/SidebarLayout.tsx');
  const select = layout.indexOf('onSelect(item.id)');
  const close = layout.indexOf('closeDrawer()');

  assert.ok(select >= 0, 'expected SidebarLayout to select the clicked item');
  assert.ok(close > select, 'expected SidebarLayout to close the drawer after selection');
});

test('mobile dialog moves, traps, and restores keyboard focus', async () => {
  const layout = await read('src/components/SidebarLayout.tsx');

  assert.match(layout, /useRef/);
  assert.match(layout, /ref=\{menuButtonRef\}/);
  assert.match(layout, /ref=\{drawerRef\}/);
  assert.match(layout, /querySelectorAll/);
  assert.match(layout, /event\.key !== 'Tab'/);
  assert.match(layout, /event\.shiftKey/);
  assert.match(layout, /event\.preventDefault\(\)/);
  assert.match(layout, /firstFocusable\.focus\(\)/);
  assert.match(layout, /lastFocusable\.focus\(\)/);
  assert.match(layout, /menuButton\?\.focus\(\)/);
});

const assertAdminSidebarContracts = (admin) => {
  assert.match(admin, /import \{ SidebarLayout \} from '\.\.\/components\/SidebarLayout'/);
  assert.match(admin, /type AdminTab =[\s\S]*'branding'/);
  assert.match(admin, /<SidebarLayout/);
  assert.match(admin, /items=\{visibleTabs\}/);
  assert.doesNotMatch(admin, /overflow-x-auto[\s\S]{0,300}visibleTabs\.map/);

  const guardedTabContracts = [
    {
      id: 'branding',
      navigationGuard: /currentUser\?\.role\s*===\s*'PRESIDENT'/,
      contentGuard: /currentUser\?\.role\s*===\s*'PRESIDENT'/,
      component: 'SiteBrandingPanel',
    },
    {
      id: 'board',
      navigationGuard: /canEditSection\(\s*'board'\s*\)/,
      contentGuard: /canEditSection\(\s*'board'\s*\)/,
      component: 'BoardTab',
    },
    {
      id: 'events',
      navigationGuard: /!!currentUser\s*&&\s*isLeadershipRole\(\s*currentUser\.role\s*\)/,
      contentGuard: /currentUser\s*&&\s*isLeadershipRole\(\s*currentUser\.role\s*\)/,
      component: 'EventsTab',
    },
    {
      id: 'gallery',
      navigationGuard: /!!currentUser\s*&&\s*isLeadershipRole\(\s*currentUser\.role\s*\)/,
      contentGuard: /currentUser\s*&&\s*isLeadershipRole\(\s*currentUser\.role\s*\)/,
      component: 'GalleryTab',
    },
    {
      id: 'news',
      navigationGuard: /canEditSection\(\s*'news'\s*\)/,
      contentGuard: /canEditSection\(\s*'news'\s*\)/,
      component: 'NewsTab',
    },
    {
      id: 'plans',
      navigationGuard: /canEditSection\(\s*'plans'\s*\)/,
      contentGuard: /canEditSection\(\s*'plans'\s*\)/,
      component: 'PlansTab',
    },
    {
      id: 'excuses',
      navigationGuard: /canManageExcuses\(\s*currentUser\?\.role\s*\)/,
      contentGuard: /canManageExcuses\(\s*currentUser\?\.role\s*\)/,
      component: 'ExcuseReviewPanel',
    },
    {
      id: 'oversight',
      navigationGuard: /canManageOversight\(\s*currentUser\?\.role\s*\)/,
      contentGuard: /canManageOversight\(\s*currentUser\?\.role\s*\)/,
      component: 'OversightEvaluationPanel',
    },
    {
      id: 'task-management',
      navigationGuard: /canManageTasks\(\s*currentUser\?\.role\s*\)/,
      contentGuard: /canManageTasks\(\s*currentUser\?\.role\s*\)/,
      component: 'TaskManagementDashboard',
    },
    {
      id: 'member-points',
      navigationGuard: /canManageMemberPoints\(\s*currentUser\?\.role\s*\)/,
      contentGuard: /currentUser\s*&&\s*canManageMemberPoints\(\s*currentUser\.role\s*\)/,
      component: 'MemberPointsAdminPanel',
    },
  ];

  for (const { id, navigationGuard, contentGuard, component } of guardedTabContracts) {
    const navigation = new RegExp(
      `\\{\\s*id\\s*:\\s*'${id}'\\s*,[^{}]*?show\\s*:\\s*${navigationGuard.source}[^{}]*\\}`,
    );
    const content = new RegExp(
      `\\{\\s*tab\\s*===\\s*'${id}'\\s*&&\\s*${contentGuard.source}\\s*&&\\s*<${component}\\b`,
    );

    assert.match(admin, navigation, `expected ${id} navigation to retain its access guard`);
    assert.match(admin, content, `expected ${id} content branch to retain its access guard`);
  }

  const navigationOnlyContracts = [
    {
      id: 'applications',
      navigationGuard: /currentUser\?\.role\s*===\s*'PRESIDENT'/,
      content: /\{\s*tab\s*===\s*'applications'\s*&&\s*\(/,
    },
  ];

  for (const { id, navigationGuard, content } of navigationOnlyContracts) {
    const navigation = new RegExp(
      `\\{\\s*id\\s*:\\s*'${id}'\\s*,[^{}]*?show\\s*:\\s*${navigationGuard.source}[^{}]*\\}`,
    );
    assert.match(admin, navigation, `expected ${id} navigation to retain its current access guard`);
    assert.match(admin, content, `expected ${id} content branch to retain its current contract`);
  }

  return { guardedTabContracts, navigationOnlyContracts };
};

test('admin dashboard delegates its existing visible tabs to the sidebar and preserves sensitive access contracts', async () => {
  const admin = await read('src/pages/AdminDashboard.tsx');

  const { guardedTabContracts, navigationOnlyContracts } = assertAdminSidebarContracts(admin);

  for (const { id, navigationGuard, contentGuard, component } of guardedTabContracts) {
    const navigationMutation = new RegExp(
      `(\\{\\s*id\\s*:\\s*'${id}'\\s*,[^{}]*?show\\s*:\\s*)${navigationGuard.source}`,
    );
    const navigationGuardRemoved = admin.replace(navigationMutation, '$1true');
    assert.notEqual(navigationGuardRemoved, admin, `expected ${id} navigation mutation to apply before asserting failure`);
    assert.throws(() => assertAdminSidebarContracts(navigationGuardRemoved), assert.AssertionError);

    const contentMutation = new RegExp(
      `(\\{\\s*tab\\s*===\\s*'${id}'\\s*)&&\\s*${contentGuard.source}\\s*&&\\s*(<${component}\\b)`,
    );
    const contentGuardRemoved = admin.replace(contentMutation, '$1&& $2');
    assert.notEqual(contentGuardRemoved, admin, `expected ${id} content mutation to apply before asserting failure`);
    assert.throws(() => assertAdminSidebarContracts(contentGuardRemoved), assert.AssertionError);
  }

  for (const { id, navigationGuard } of navigationOnlyContracts) {
    const navigationMutation = new RegExp(
      `(\\{\\s*id\\s*:\\s*'${id}'\\s*,[^{}]*?show\\s*:\\s*)${navigationGuard.source}`,
    );
    const navigationGuardRemoved = admin.replace(navigationMutation, '$1true');
    assert.notEqual(navigationGuardRemoved, admin, `expected ${id} navigation mutation to apply before asserting failure`);
    assert.throws(() => assertAdminSidebarContracts(navigationGuardRemoved), assert.AssertionError);
  }
});

const assertStudentSidebarContracts = (student) => {
  assert.match(student, /import \{ SidebarLayout \} from '\.\.\/components\/SidebarLayout'/);
  assert.match(student, /studentPortalTabs\(!!myApplication\)\.map\(\(item\)\s*=>\s*\(\{[\s\S]*?icon:\s*STUDENT_TAB_ICONS\[item\.id\]/);
  assert.doesNotMatch(student, /overflow-x-auto[\s\S]{0,300}studentPortalTabs/);

  const sidebarStart = student.indexOf('<SidebarLayout<StudentPortalTabId>');
  const sidebarEnd = student.indexOf('</SidebarLayout>', sidebarStart);
  const portalSetupStart = student.indexOf('const studentTabs =');
  assert.ok(sidebarStart >= 0, 'expected the accepted student portal to start with SidebarLayout');
  assert.ok(sidebarEnd > sidebarStart, 'expected SidebarLayout to wrap a bounded student portal region');
  assert.ok(portalSetupStart >= 0 && portalSetupStart < sidebarStart, 'expected navigation setup before the sidebar render');
  assert.equal((student.match(/<SidebarLayout\b/g) ?? []).length, 1, 'expected one student sidebar shell');

  const sidebarContent = student.slice(sidebarStart, sidebarEnd);
  assert.match(sidebarContent, /items=\{studentTabs\}[\s\S]*?activeId=\{tab\}[\s\S]*?onSelect=\{handleTabSelect\}/);
  assert.match(sidebarContent, /<ApplicationBanner\b/);
  assert.match(sidebarContent, /<PushNotificationControl\b/);
  assert.doesNotMatch(sidebarContent, /<Modal\b/);

  const accessReturns = [
    { name: 'logged-out', pattern: /if\s*\(\s*!currentStudent\s*\)\s*\{/ },
    { name: 'loading', pattern: /if\s*\(\s*studentAccess\s*===\s*'loading'\s*\)\s*\{/ },
    { name: 'removed', pattern: /if\s*\(\s*studentAccess\s*===\s*'removed'\s*\)\s*\{/ },
    { name: 'pending', pattern: /if\s*\(\s*studentAccess\s*===\s*'pending'\s*\)\s*\{/ },
    { name: 'interview', pattern: /if\s*\(\s*studentAccess\s*===\s*'interview'\s*\)\s*\{/ },
    { name: 'rejected', pattern: /if\s*\(\s*studentAccess\s*===\s*'rejected'\s*\)\s*\{/ },
  ];

  const locatedAccessReturns = accessReturns.map(({ name, pattern }) => {
    const match = pattern.exec(student);
    assert.ok(match?.index !== undefined, `expected ${name} access screen to retain its early return`);
    return { name, start: match.index };
  });

  for (const [index, { name, start }] of locatedAccessReturns.entries()) {
    const end = locatedAccessReturns[index + 1]?.start ?? portalSetupStart;
    const branchSource = student.slice(start, end);
    assert.match(branchSource, /return\s*\(/, `expected ${name} screen to return before the next access branch`);
    assert.ok(start < portalSetupStart, `expected ${name} access screen to precede accepted portal setup`);
    assert.ok(start < sidebarStart, `expected ${name} access screen to remain outside SidebarLayout`);
  }

  const applicationBannerStart = student.indexOf('<ApplicationBanner');
  const pushControlStart = student.indexOf('<PushNotificationControl');
  const profileModalStart = student.indexOf('<Modal open={editOpen}');
  const profileSettingsStart = student.indexOf('<ProfileSettings');
  const welcomeDismissalStart = student.indexOf('dismissWelcomeMessage(window.localStorage, userId)');
  assert.ok(applicationBannerStart > sidebarStart && applicationBannerStart < sidebarEnd, 'expected the application banner in the independently scrolling content pane');
  assert.ok(pushControlStart > sidebarStart && pushControlStart < sidebarEnd, 'expected accepted push controls in the independently scrolling content pane');
  assert.ok(profileModalStart > sidebarEnd && profileSettingsStart > profileModalStart, 'expected profile editor controls outside the sidebar');
  assert.ok(welcomeDismissalStart > sidebarEnd, 'expected accepted welcome dismissal to remain available');
  assert.match(student, /onClick=\{\(\)\s*=>\s*setEditOpen\(true\)\}/);

  const contentBranches = [
    { id: 'activities', component: /<StudentActivitiesPanel\b/ },
    { id: 'tasks', component: /<StudentTasksPanel\b/ },
    { id: 'achievements', component: /<StudentGamificationPanel\b/ },
    { id: 'suggestions', component: /قدّم اقتراحًا/ },
    { id: 'messages', component: /<StudentContactMessages\b/ },
    { id: 'application', component: /<ApplicationDetails\b/ },
  ];

  for (const { id, component } of contentBranches) {
    assert.match(
      sidebarContent,
      new RegExp(`tab\\s*===\\s*'${id}'[\\s\\S]{0,5000}${component.source}`),
      `expected ${id} content branch to remain inside SidebarLayout`,
    );
  }
};

test('student dashboard delegates its existing tabs to the sidebar and preserves every content branch', async () => {
  const student = await read('src/pages/StudentDashboard.tsx');

  assertStudentSidebarContracts(student);

  const removedBranch = student.match(/  if\s*\(\s*studentAccess\s*===\s*'removed'\s*\)\s*\{[\s\S]*?\n  \}\n\n/);
  assert.ok(removedBranch, 'expected removed access screen fixture for mutation evidence');

  const removedAccessScreenDeleted = student.replace(removedBranch[0], '');
  assert.notEqual(removedAccessScreenDeleted, student, 'expected removed access-screen deletion mutation to apply');
  assert.throws(() => assertStudentSidebarContracts(removedAccessScreenDeleted), assert.AssertionError);

  const removedAccessScreenMoved = student
    .replace(removedBranch[0], '')
    .replace('</SidebarLayout>', `</SidebarLayout>\n${removedBranch[0]}`);
  assert.notEqual(removedAccessScreenMoved, student, 'expected removed access-screen move mutation to apply');
  assert.throws(() => assertStudentSidebarContracts(removedAccessScreenMoved), assert.AssertionError);

  const applicationBannerDeleted = student.replace(/        \{myApplication && currentUser && \([\s\S]*?        \)\}\n\n/, '');
  assert.notEqual(applicationBannerDeleted, student, 'expected application banner deletion mutation to apply');
  assert.throws(() => assertStudentSidebarContracts(applicationBannerDeleted), assert.AssertionError);

  const pushControlDeleted = student.replace('{isAccepted && <PushNotificationControl />}', '');
  assert.notEqual(pushControlDeleted, student, 'expected push-control deletion mutation to apply');
  assert.throws(() => assertStudentSidebarContracts(pushControlDeleted), assert.AssertionError);

  const activitiesBranchDeleted = student.replace('<StudentActivitiesPanel onJoiningCountChange={setJoiningActivityCount} />', '<div />');
  assert.notEqual(activitiesBranchDeleted, student, 'expected activities content-branch deletion mutation to apply');
  assert.throws(() => assertStudentSidebarContracts(activitiesBranchDeleted), assert.AssertionError);
});
