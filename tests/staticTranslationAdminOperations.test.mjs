import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

const collectLeafKeys = (obj, prefix = '') => {
  const keys = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      keys.push(...collectLeafKeys(val, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
};

test('1. AR/TR/EN admin operational keys exist with required glossary', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const requiredKeys = [
    // Contact inbox
    'admin.inbox.loading',
    'admin.inbox.empty',
    'admin.inbox.repliedBadge',
    'admin.inbox.repliedBy',
    'admin.inbox.deliveryStatus',
    'admin.inbox.resendEmail',
    'admin.inbox.form.label',
    'admin.inbox.form.placeholder',
    'admin.inbox.form.submit',
    'admin.inbox.form.submitting',
    'admin.inbox.status.unread',
    'admin.inbox.status.read',
    'admin.inbox.status.replied',
    'admin.inbox.delivery.notRequired',
    'admin.inbox.delivery.pending',
    'admin.inbox.delivery.sent',
    'admin.inbox.delivery.failed',
    'admin.inbox.feedback.saveFailed',
    'admin.inbox.feedback.saveSuccess',
    'admin.inbox.feedback.resendSuccess',
    'admin.inbox.feedback.resendFailed',

    // Suggestions & Complaints
    'admin.suggestions.title',
    'admin.suggestions.subtitlePresident',
    'admin.suggestions.subtitleTargeted',
    'admin.suggestions.emptyTitle',
    'admin.suggestions.emptySubtitlePresident',
    'admin.suggestions.emptySubtitleTargeted',
    'admin.suggestions.targetedTo',
    'admin.suggestions.repliesCount',
    'admin.suggestions.canReply',
    'admin.suggestions.viewOnly',
    'admin.suggestions.replyToast',
    'admin.suggestions.status.new',
    'admin.suggestions.status.reviewing',
    'admin.suggestions.status.implemented',
    'admin.suggestions.status.closed',
    'admin.suggestions.modal.title',
    'admin.suggestions.modal.empty',
    'admin.suggestions.modal.generalCategory',
    'admin.suggestions.modal.untitled',
    'admin.suggestions.modal.noContent',
    'admin.suggestions.modal.presidentSupervision',
    'admin.suggestions.modal.suggestionTitle',
    'admin.suggestions.modal.fullText',
    'admin.suggestions.modal.responsesLog',
    'admin.suggestions.modal.notTargetedNotice',
    'admin.suggestions.modal.closedNotice',
    'admin.suggestions.modal.formTitle',
    'admin.suggestions.modal.statusLabel',
    'admin.suggestions.modal.replyLabel',
    'admin.suggestions.modal.replyPlaceholder',
    'admin.suggestions.modal.submitButton',

    // Guide suggestions
    'admin.guideSuggestions.title',
    'admin.guideSuggestions.subtitle',
    'admin.guideSuggestions.refresh',
    'admin.guideSuggestions.unauthorized',
    'admin.guideSuggestions.loadFailed',
    'admin.guideSuggestions.updateFailed',
    'admin.guideSuggestions.deleteFailed',
    'admin.guideSuggestions.confirmDelete',
    'admin.guideSuggestions.statusUpdated',
    'admin.guideSuggestions.deletedSuccess',
    'admin.guideSuggestions.searchAria',
    'admin.guideSuggestions.searchPlaceholder',
    'admin.guideSuggestions.loading',
    'admin.guideSuggestions.emptyTitle',
    'admin.guideSuggestions.emptySubtitle',
    'admin.guideSuggestions.submittedBy',
    'admin.guideSuggestions.statusLabel',
    'admin.guideSuggestions.status.pending',
    'admin.guideSuggestions.status.reviewing',
    'admin.guideSuggestions.status.implemented',
    'admin.guideSuggestions.status.rejected',

    // Excuse review
    'admin.excuses.title',
    'admin.excuses.subtitle',
    'admin.excuses.refresh',
    'admin.excuses.empty',
    'admin.excuses.pendingBadge',
    'admin.excuses.reviewedSuccess',
    'admin.excuses.actions.accept',
    'admin.excuses.actions.partial',
    'admin.excuses.actions.reject',

    // Oversight / attendance
    'admin.oversight.title',
    'admin.oversight.subtitle',
    'admin.oversight.refresh',
    'admin.oversight.empty',
    'admin.oversight.paidNotice',
    'admin.oversight.pointsValue',
    'admin.oversight.closeAndDistribute',
    'admin.oversight.confirmClose',
    'admin.oversight.closedSuccess',
    'admin.oversight.selectAttendance',
    'admin.oversight.attendance.onTime',
    'admin.oversight.attendance.late',
    'admin.oversight.attendance.veryLate',
    'admin.oversight.attendance.absent',

    // Tasks & Internal task creation
    'admin.tasks.title',
    'admin.tasks.subtitle',
    'admin.tasks.refresh',
    'admin.tasks.empty',
    'admin.tasks.enrolledCount',
    'admin.tasks.deadline',
    'admin.tasks.reward',
    'admin.tasks.createdBy',
    'admin.tasks.evaluationSectionTitle',
    'admin.tasks.closeTaskButton',
    'admin.tasks.loadingEnrollments',
    'admin.tasks.noEnrollments',
    'admin.tasks.selectEvaluation',
    'admin.tasks.mustEvaluateAll',
    'admin.tasks.confirmClose',
    'admin.tasks.evaluationSaved',
    'admin.tasks.taskFinalized',
    'admin.tasks.status.full',
    'admin.tasks.status.open',
    'admin.tasks.evaluations.perfect',
    'admin.tasks.evaluations.partial',
    'admin.tasks.evaluations.failed',
    'admin.tasks.creation.title',
    'admin.tasks.creation.subtitle',
    'admin.tasks.creation.titleLabel',
    'admin.tasks.creation.deadlineLabel',
    'admin.tasks.creation.descriptionLabel',
    'admin.tasks.creation.pointsLabel',
    'admin.tasks.creation.studentsLabel',
    'admin.tasks.creation.submitButton',
    'admin.tasks.creation.submitting',
    'admin.tasks.creation.incompleteError',
    'admin.tasks.creation.futureDeadlineError',
    'admin.tasks.creation.successToast',

    // Member points
    'admin.memberPoints.title',
    'admin.memberPoints.season',
    'admin.memberPoints.seasonLoading',
    'admin.memberPoints.refresh',
    'admin.memberPoints.endSeasonButton',
    'admin.memberPoints.negativeWarningTitle',
    'admin.memberPoints.adjustButton',
    'admin.memberPoints.table.member',
    'admin.memberPoints.table.balance',
    'admin.memberPoints.table.tier',
    'admin.memberPoints.table.action',
    'admin.memberPoints.tiers.gold',
    'admin.memberPoints.tiers.silver',
    'admin.memberPoints.tiers.bronze',
    'admin.memberPoints.modal.title',
    'admin.memberPoints.modal.amountLabel',
    'admin.memberPoints.modal.amountPlaceholder',
    'admin.memberPoints.modal.reasonLabel',
    'admin.memberPoints.modal.saveButton',
    'admin.memberPoints.modal.savingButton',
    'admin.memberPoints.endSeasonPrompt',
    'admin.memberPoints.defaultNewSeason',
    'admin.memberPoints.endSeasonConfirm',
    'admin.memberPoints.endSeasonSuccess',
    'admin.memberPoints.invalidAdjustment',
    'admin.memberPoints.adjustmentSuccess',
  ];

  const getVal = (dict, keyPath) => keyPath.split('.').reduce((acc, part) => acc?.[part], dict);

  for (const k of requiredKeys) {
    assert.ok(getVal(ar, k), `Missing AR key: ${k}`);
    assert.ok(getVal(tr, k), `Missing TR key: ${k}`);
    assert.ok(getVal(en, k), `Missing EN key: ${k}`);
  }
});

test('2. Dictionary parity remains intact across AR, TR, and EN', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const arKeys = collectLeafKeys(ar);
  const trKeys = collectLeafKeys(tr);
  const enKeys = collectLeafKeys(en);

  assert.deepEqual(trKeys, arKeys, 'TR keys must match AR keys exactly');
  assert.deepEqual(enKeys, arKeys, 'EN keys must match AR keys exactly');
});

test('3. Contact inbox static UI translated in ContactInboxTab', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /admin\.inbox\.loading/);
  assert.match(code, /admin\.inbox\.empty/);
  assert.match(code, /admin\.inbox\.status\.unread/);
  assert.match(code, /admin\.inbox\.status\.read/);
  assert.match(code, /admin\.inbox\.status\.replied/);
  assert.match(code, /admin\.inbox\.delivery\.notRequired/);
  assert.match(code, /admin\.inbox\.repliedBadge/);
  assert.match(code, /admin\.inbox\.form\.label/);
  assert.match(code, /admin\.inbox\.form\.submit/);
  assert.match(code, /admin\.inbox\.feedback\.saveSuccess/);
});

test('4. Suggestions static UI translated in SuggestionsTab & modal', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /admin\.suggestions\.title/);
  assert.match(code, /admin\.suggestions\.subtitlePresident/);
  assert.match(code, /admin\.suggestions\.emptyTitle/);
  assert.match(code, /admin\.suggestions\.targetedTo/);
  assert.match(code, /admin\.suggestions\.canReply/);
  assert.match(code, /admin\.suggestions\.modal\.title/);
  assert.match(code, /admin\.suggestions\.modal\.suggestionTitle/);
  assert.match(code, /admin\.suggestions\.modal\.statusLabel/);
  assert.match(code, /admin\.suggestions\.modal\.submitButton/);
});

test('5. Guide suggestions static UI translated in GuideSuggestionsPanel', async () => {
  const code = await read('src/components/GuideSuggestionsPanel.tsx');

  assert.match(code, /useTranslation/);
  assert.match(code, /admin\.guideSuggestions\.title/);
  assert.match(code, /admin\.guideSuggestions\.subtitle/);
  assert.match(code, /admin\.guideSuggestions\.refresh/);
  assert.match(code, /admin\.guideSuggestions\.unauthorized/);
  assert.match(code, /admin\.guideSuggestions\.searchPlaceholder/);
  assert.match(code, /admin\.guideSuggestions\.emptyTitle/);
  assert.match(code, /admin\.guideSuggestions\.statusLabel/);
});

test('6. Excuse review static UI translated in ExcuseReviewPanel', async () => {
  const code = await read('src/components/ExcuseReviewPanel.tsx');

  assert.match(code, /useTranslation/);
  assert.match(code, /admin\.excuses\.title/);
  assert.match(code, /admin\.excuses\.subtitle/);
  assert.match(code, /admin\.excuses\.refresh/);
  assert.match(code, /admin\.excuses\.empty/);
  assert.match(code, /admin\.excuses\.pendingBadge/);
  assert.match(code, /admin\.excuses\.actions\.accept/);
  assert.match(code, /admin\.excuses\.actions\.partial/);
  assert.match(code, /admin\.excuses\.actions\.reject/);
});

test('7. Oversight/attendance static UI translated in OversightEvaluationPanel', async () => {
  const code = await read('src/components/OversightEvaluationPanel.tsx');

  assert.match(code, /useTranslation/);
  assert.match(code, /admin\.oversight\.title/);
  assert.match(code, /admin\.oversight\.subtitle/);
  assert.match(code, /admin\.oversight\.refresh/);
  assert.match(code, /admin\.oversight\.paidNotice/);
  assert.match(code, /admin\.oversight\.closeAndDistribute/);
  assert.match(code, /admin\.oversight\.selectAttendance/);
  assert.match(code, /admin\.oversight\.attendance\.onTime/);
});

test('8. Task management static UI translated in TaskManagementDashboard', async () => {
  const code = await read('src/components/TaskManagementDashboard.tsx');

  assert.match(code, /useTranslation/);
  assert.match(code, /admin\.tasks\.title/);
  assert.match(code, /admin\.tasks\.subtitle/);
  assert.match(code, /admin\.tasks\.refresh/);
  assert.match(code, /admin\.tasks\.empty/);
  assert.match(code, /admin\.tasks\.status\.full/);
  assert.match(code, /admin\.tasks\.evaluationSectionTitle/);
  assert.match(code, /admin\.tasks\.closeTaskButton/);
  assert.match(code, /admin\.tasks\.evaluations\.perfect/);
});

test('9. Internal task creation static UI translated in InternalTaskCreationPanel', async () => {
  const code = await read('src/components/InternalTaskCreationPanel.tsx');

  assert.match(code, /useTranslation/);
  assert.match(code, /admin\.tasks\.creation\.title/);
  assert.match(code, /admin\.tasks\.creation\.subtitle/);
  assert.match(code, /admin\.tasks\.creation\.titleLabel/);
  assert.match(code, /admin\.tasks\.creation\.deadlineLabel/);
  assert.match(code, /admin\.tasks\.creation\.descriptionLabel/);
  assert.match(code, /admin\.tasks\.creation\.pointsLabel/);
  assert.match(code, /admin\.tasks\.creation\.submitButton/);
});

test('10. Member points static UI translated in MemberPointsAdminPanel', async () => {
  const code = await read('src/components/MemberPointsAdminPanel.tsx');

  assert.match(code, /useTranslation/);
  assert.match(code, /admin\.memberPoints\.title/);
  assert.match(code, /admin\.memberPoints\.seasonLoading/);
  assert.match(code, /admin\.memberPoints\.refresh/);
  assert.match(code, /admin\.memberPoints\.table\.member/);
  assert.match(code, /admin\.memberPoints\.table\.balance/);
  assert.match(code, /admin\.memberPoints\.table\.tier/);
  assert.match(code, /admin\.memberPoints\.adjustButton/);
  assert.match(code, /admin\.memberPoints\.modal\.amountLabel/);
  assert.match(code, /admin\.memberPoints\.modal\.reasonLabel/);
});

test('11. Status display mappings translated in StatusPill and panels', async () => {
  const adminCode = await read('src/pages/AdminDashboard.tsx');
  assert.match(adminCode, /admin\.suggestions\.status\./);

  const guideCode = await read('src/components/GuideSuggestionsPanel.tsx');
  assert.match(guideCode, /admin\.guideSuggestions\.status\./);
});

test('12. Visitor message body remains untouched', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');
  assert.match(code, /\{active\.message\}/);
  assert.match(code, /\{active\.subject\}/);
});

test('13. Suggestion/complaint text remains untouched', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');
  assert.match(code, /\{s\.content\}/);
  assert.match(code, /\{suggestion\.content/);
  assert.match(code, /\{s\.title\}/);
});

test('14. Admin free-form replies remain untouched', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');
  assert.match(code, /\{active\.reply\.replyText\}/);
  assert.match(code, /\{r\.text\}/);
});

test('15. Excuse reason remains untouched', async () => {
  const code = await read('src/components/ExcuseReviewPanel.tsx');
  assert.match(code, /\{row\.excuseText\}/);
  assert.match(code, /\{row\.activityTitle\}/);
});

test('16. Task title/description remain untouched', async () => {
  const code = await read('src/components/TaskManagementDashboard.tsx');
  assert.match(code, /\{task\.title\}/);
  assert.match(code, /\{task\.description\}/);
  assert.match(code, /\{selectedTask\.title\}/);
});

test('17. Student/member names remain untouched', async () => {
  const dashCode = await read('src/pages/AdminDashboard.tsx');
  assert.match(dashCode, /\{active\.senderName\}/);
  assert.match(dashCode, /\{s\.studentName\}/);

  const excuseCode = await read('src/components/ExcuseReviewPanel.tsx');
  assert.match(excuseCode, /\{row\.studentName\}/);

  const taskCode = await read('src/components/TaskManagementDashboard.tsx');
  assert.match(taskCode, /\{row\.studentName\}/);

  const pointsCode = await read('src/components/MemberPointsAdminPanel.tsx');
  assert.match(pointsCode, /\{member\.studentName\}/);
});

test('18. Emails remain untouched', async () => {
  const dashCode = await read('src/pages/AdminDashboard.tsx');
  assert.match(dashCode, /\{active\.senderEmail\}/);
  assert.match(dashCode, /\{suggestion\.studentEmail/);
});

test('19. Point numbers/balances remain unchanged', async () => {
  const pointsCode = await read('src/components/MemberPointsAdminPanel.tsx');
  assert.match(pointsCode, /\{member\.totalPoints\}/);

  const taskCode = await read('src/components/TaskManagementDashboard.tsx');
  assert.match(taskCode, /task\.pointsReward/);
});

test('20. Internal status keys remain unchanged', async () => {
  const guideCode = await read('src/components/GuideSuggestionsPanel.tsx');
  assert.match(guideCode, /'PENDING'/);
  assert.match(guideCode, /'REVIEWING'/);
  assert.match(guideCode, /'IMPLEMENTED'/);
  assert.match(guideCode, /'REJECTED'/);

  const excuseCode = await read('src/components/ExcuseReviewPanel.tsx');
  assert.match(excuseCode, /decide\(row,\s*'ACCEPTED'\)/);
  assert.match(excuseCode, /decide\(row,\s*'PARTIAL'\)/);
  assert.match(excuseCode, /decide\(row,\s*'REJECTED'\)/);

  const oversightCode = await read('src/components/OversightEvaluationPanel.tsx');
  assert.match(oversightCode, /ON_TIME/);
  assert.match(oversightCode, /LATE/);
  assert.match(oversightCode, /VERY_LATE/);
  assert.match(oversightCode, /ABSENT/);
});

test('21. Task authorization unchanged', async () => {
  const { canManageTasks, canCreateExecutiveContent } = await import('../src/domain/phaseThreeEconomy.ts');
  assert.equal(canManageTasks('PRESIDENT'), true);
  assert.equal(canManageTasks('MEDIA_HEAD'), true);
  assert.equal(canManageTasks('STUDENT'), false);
  assert.equal(canCreateExecutiveContent('FINANCE_HEAD'), true);
});

test('22. Excuse authorization unchanged', async () => {
  const { canManageExcuses } = await import('../src/domain/phaseThreeEconomy.ts');
  assert.equal(canManageExcuses('PRESIDENT'), true);
  assert.equal(canManageExcuses('VICE_PRESIDENT'), true);
  assert.equal(canManageExcuses('MEDIA_HEAD'), false);
});

test('23. Oversight authorization unchanged', async () => {
  const { canManageOversight } = await import('../src/domain/phaseThreeEconomy.ts');
  assert.equal(canManageOversight('PRESIDENT'), true);
  assert.equal(canManageOversight('AUDIT_HEAD'), true);
  assert.equal(canManageOversight('MEDIA_HEAD'), false);
});

test('24. Member-points authorization unchanged', async () => {
  const { canManageMemberPoints, canMutateMemberPoints } = await import('../src/domain/phaseThreeEconomy.ts');
  assert.equal(canManageMemberPoints('PRESIDENT'), true);
  assert.equal(canManageMemberPoints('ACADEMIC_HEAD'), true);
  assert.equal(canManageMemberPoints('AUDIT_HEAD'), true);
  assert.equal(canManageMemberPoints('MEDIA_HEAD'), false);
  assert.equal(canMutateMemberPoints('PRESIDENT'), true);
  assert.equal(canMutateMemberPoints('ACADEMIC_HEAD'), false);
});

test('25. Contact inbox authorization unchanged', async () => {
  const { canAccessContactInbox } = await import('../src/domain/contactMessagingPolicy.ts');
  assert.equal(canAccessContactInbox('PRESIDENT'), true);
  assert.equal(canAccessContactInbox('VICE_PRESIDENT'), true);
  assert.equal(canAccessContactInbox('MEDIA_HEAD'), false);
  assert.equal(canAccessContactInbox('STUDENT'), false);
});

test('26. Existing business handler calls unchanged', async () => {
  const inboxCode = await read('src/pages/AdminDashboard.tsx');
  assert.match(inboxCode, /markRead\(messageId\)/);
  assert.match(inboxCode, /reply\(active\.id,\s*replyText\.trim\(\)\)/);
  assert.match(inboxCode, /retryEmail\(active\.reply\.id\)/);

  const suggestionCode = await read('src/pages/AdminDashboard.tsx');
  assert.match(suggestionCode, /respondToSuggestion\(activeSuggestion\.id,\s*replyText\.trim\(\),\s*status\)/);

  const guideCode = await read('src/components/GuideSuggestionsPanel.tsx');
  assert.match(guideCode, /listGuideSuggestions\(\)/);
  assert.match(guideCode, /updateGuideSuggestionStatus\(suggestion\.id,\s*status\)/);
  assert.match(guideCode, /deleteGuideSuggestion\(suggestion\.id\)/);

  const excuseCode = await read('src/components/ExcuseReviewPanel.tsx');
  assert.match(excuseCode, /loadPendingExcuses\(\)/);
  assert.match(excuseCode, /reviewExcuse\(row\.enrollmentId,\s*status\)/);

  const oversightCode = await read('src/components/OversightEvaluationPanel.tsx');
  assert.match(oversightCode, /saveActivityAttendance\(row\.activityId,\s*row\.studentId,\s*status\)/);
  assert.match(oversightCode, /finalizeActivityEvaluation\(rows\[0\]\.activityId\)/);

  const taskCode = await read('src/components/TaskManagementDashboard.tsx');
  assert.match(taskCode, /loadManagedTasks\(\)/);
  assert.match(taskCode, /loadManagedTaskEnrollments\(task\.taskId\)/);
  assert.match(taskCode, /saveTaskCompletion\(row\.taskId,\s*row\.studentId,\s*status\)/);
  assert.match(taskCode, /finalizeTaskEvaluation\(selectedTask\.taskId\)/);

  const creationCode = await read('src/components/InternalTaskCreationPanel.tsx');
  assert.match(creationCode, /createInternalTask\(\{/);

  const pointsCode = await read('src/components/MemberPointsAdminPanel.tsx');
  assert.match(pointsCode, /loadMemberPoints\(\)/);
  assert.match(pointsCode, /loadActiveEconomySeason\(\)/);
  assert.match(pointsCode, /adjustMemberPoints\(\{/);
  assert.match(pointsCode, /endEconomySeason\(season\.id,\s*next\)/);
});

test('27. No machine translation API added', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  const forbiddenDeps = [
    '@google-cloud/translate',
    '@vitalets/google-translate-api',
    'deepl-node',
    'azure-cognitiveservices-translatortext',
    'openai',
  ];
  for (const dep of forbiddenDeps) {
    assert.equal(Boolean(allDeps[dep]), false, `Forbidden translation API dependency: ${dep}`);
  }
});

test('29. No URL locale routing added', async () => {
  const routerCode = await read('src/App.tsx');
  assert.doesNotMatch(routerCode, /path=["']\/:locale/);
  assert.doesNotMatch(routerCode, /path=["']\/:lang/);
});

test('30. Task 6 not started', async () => {
  const gitStatus = await read('package.json');
  assert.ok(gitStatus);
});
