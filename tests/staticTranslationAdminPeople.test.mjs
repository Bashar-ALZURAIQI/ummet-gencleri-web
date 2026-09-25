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

test('1. AR/TR/EN people/admin keys exist with required glossary', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');

  const requiredKeys = [
    // Members management
    'admin.members.searchPlaceholder',
    'admin.members.accountsCount',
    'admin.members.table.member',
    'admin.members.table.email',
    'admin.members.table.currentRole',
    'admin.members.table.university',
    'admin.members.table.major',
    'admin.members.table.action',
    'admin.members.actions.transferRole',
    'admin.members.actions.removeMember',
    'admin.members.actions.cannotRemoveSelf',
    'admin.members.actions.removeAria',
    'admin.members.roleModal.title',
    'admin.members.roleModal.selectedMember',
    'admin.members.roleModal.currentPosition',
    'admin.members.roleModal.presidentDemotionWarning',
    'admin.members.roleModal.regularStudent',
    'admin.members.roleModal.currentBadge',
    'admin.members.roleModal.alreadyStudent',
    'admin.members.roleModal.mustTransferPresidentFirst',
    'admin.members.roleModal.revokeToStudentTooltip',
    'admin.members.roleModal.cancel',
    'admin.members.roleModal.confirmRevoke',
    'admin.members.roleModal.revoking',
    'admin.members.roleModal.confirmTransfer',
    'admin.members.roleModal.transferring',
    'admin.members.removeModal.title',
    'admin.members.removeModal.warning',
    'admin.members.removeModal.cancel',
    'admin.members.removeModal.confirmRemove',
    'admin.members.removeModal.removing',
    'admin.members.feedback.alreadyHasRole',
    'admin.members.feedback.alreadyStudent',
    'admin.members.feedback.transferSuccess',
    'admin.members.feedback.transferFailed',
    'admin.members.feedback.transferError',
    'admin.members.feedback.revokeSuccess',
    'admin.members.feedback.revokeFailed',
    'admin.members.feedback.revokeError',
    'admin.members.feedback.removeSuccess',
    'admin.members.feedback.removeFailed',
    'admin.members.feedback.removeError',

    // Applications management
    'admin.applications.filters.all',
    'admin.applications.filters.pending',
    'admin.applications.filters.interview',
    'admin.applications.filters.accepted',
    'admin.applications.filters.rejected',
    'admin.applications.searchPlaceholder',
    'admin.applications.count',
    'admin.applications.table.applicant',
    'admin.applications.table.university',
    'admin.applications.table.appliedAt',
    'admin.applications.table.status',
    'admin.applications.table.interview',
    'admin.applications.table.email',
    'admin.applications.table.actions',
    'admin.applications.actions.acceptForInterview',
    'admin.applications.actions.finalAccept',
    'admin.applications.actions.reject',
    'admin.applications.actions.decidedAt',
    'admin.applications.interviewModal.title',
    'admin.applications.interviewModal.dateLabel',
    'admin.applications.interviewModal.dateHint',
    'admin.applications.interviewModal.timeLabel',
    'admin.applications.interviewModal.urlLabel',
    'admin.applications.interviewModal.urlHint',
    'admin.applications.interviewModal.urlPlaceholder',
    'admin.applications.interviewModal.cancel',
    'admin.applications.interviewModal.submit',
    'admin.applications.interviewModal.saving',
    'admin.applications.interviewModal.invalidDateFormat',
    'admin.applications.interviewModal.pastDateError',
    'admin.applications.interviewModal.saveFailed',
    'admin.applications.interviewModal.successNotice',
    'admin.applications.decisionModal.acceptTitle',
    'admin.applications.decisionModal.rejectTitle',
    'admin.applications.decisionModal.acceptBody',
    'admin.applications.decisionModal.rejectNotice',
    'admin.applications.decisionModal.rejectReasonLabel',
    'admin.applications.decisionModal.rejectReasonPlaceholder',
    'admin.applications.decisionModal.cancel',
    'admin.applications.decisionModal.confirmAccept',
    'admin.applications.decisionModal.confirmReject',
    'admin.applications.decisionModal.saving',
    'admin.applications.decisionModal.saveFailed',
    'admin.applications.decisionModal.successNotice',
    'admin.applications.emailStatus.noLog',
    'admin.applications.emailStatus.sent',
    'admin.applications.emailStatus.failed',
    'admin.applications.emailStatus.sending',
    'admin.applications.emailStatus.retry',
    'admin.applications.emailStatus.retrying',
    'admin.applications.emailStatus.retrySuccess',
    'admin.applications.emailStatus.retryFailed',

    // Executive board / Committee management
    'admin.board.addMember',
    'admin.board.headTitle',
    'admin.board.editMyProfile',
    'admin.board.namePlaceholder',
    'admin.board.positionPlaceholder',
    'admin.board.contactEmailUnpublished',
    'admin.board.photoManagedNotice',
    'admin.board.bioPlaceholder',
    'admin.board.statsSection',
    'admin.board.responsibilitiesSection',
    'admin.board.addResponsibility',
    'admin.board.noResponsibilities',
    'admin.board.membersSection',
    'admin.board.defaultMemberPosition',
    'admin.board.unspecified',
    'admin.board.noMembersInCommittee',
    'admin.board.editTooltip',
    'admin.board.deleteTooltip',
    'admin.board.confirmDeleteMember',
    'admin.board.confirmDeleteResp',
    'admin.board.memberModal.addTitle',
    'admin.board.memberModal.editTitle',
    'admin.board.memberModal.memberLabel',
    'admin.board.memberModal.searchPlaceholder',
    'admin.board.memberModal.notFoundError',
    'admin.board.memberModal.positionLabel',
    'admin.board.memberModal.positionPlaceholder',
    'admin.board.memberModal.photoLabel',
    'admin.board.memberModal.photoRequiredError',
    'admin.board.memberModal.memberAccountRequired',
    'admin.board.memberModal.cancel',
    'admin.board.memberModal.saveChanges',
    'admin.board.memberModal.add',
    'admin.board.memberModal.cannotIdentifyAccount',
    'admin.board.headModal.title',
    'admin.board.headModal.fullName',
    'admin.board.headModal.positionLabel',
    'admin.board.headModal.bioLabel',
    'admin.board.headModal.photoLabel',
    'admin.board.headModal.photoHint',
    'admin.board.headModal.officialEmail',
    'admin.board.headModal.phoneLabel',
    'admin.board.headModal.phoneHint',
    'admin.board.headModal.universityLabel',
    'admin.board.headModal.universityPlaceholder',
    'admin.board.headModal.majorLabel',
    'admin.board.headModal.majorPlaceholder',
    'admin.board.headModal.yearLabel',
    'admin.board.headModal.yearSelectPlaceholder',
    'admin.board.headModal.years.firstYear',
    'admin.board.headModal.years.secondYear',
    'admin.board.headModal.years.thirdYear',
    'admin.board.headModal.years.fourthYear',
    'admin.board.headModal.years.postgrad',
    'admin.board.headModal.cancel',
    'admin.board.headModal.save',
    'admin.board.headModal.saveFailed',
    'admin.board.respModal.addTitle',
    'admin.board.respModal.editTitle',
    'admin.board.respModal.textLabel',
    'admin.board.respModal.placeholder',
    'admin.board.respModal.cancel',
    'admin.board.respModal.save',

    // Profile edits panel
    'admin.profileEdits.title',
    'admin.profileEdits.pendingCount',
    'admin.profileEdits.loading',
    'admin.profileEdits.empty',
    'admin.profileEdits.detailsUnavailable',
    'admin.profileEdits.approve',
    'admin.profileEdits.editDraft',
    'admin.profileEdits.reject',
    'admin.profileEdits.editModalTitle',
    'admin.profileEdits.presidentRevisedNote',
    'admin.profileEdits.diffTable.field',
    'admin.profileEdits.diffTable.original',
    'admin.profileEdits.diffTable.proposed',
    'admin.profileEdits.draftEditor.responsibilities',
    'admin.profileEdits.draftEditor.onePerLine',
    'admin.profileEdits.draftEditor.stats',
    'admin.profileEdits.draftEditor.statValue',
    'admin.profileEdits.draftEditor.statLabel',
    'admin.profileEdits.draftEditor.members',
    'admin.profileEdits.draftEditor.membersHint',
    'admin.profileEdits.draftEditor.memberName',
    'admin.profileEdits.draftEditor.memberPosition',
    'admin.profileEdits.draftEditor.cancel',
    'admin.profileEdits.draftEditor.approveRevision',
    'admin.profileEdits.draftEditor.approving',
  ];

  const getVal = (dict, keyPath) => keyPath.split('.').reduce((acc, part) => acc?.[part], dict);

  for (const k of requiredKeys) {
    assert.ok(getVal(ar, k), `Missing AR key: ${k}`);
    assert.ok(getVal(tr, k), `Missing TR key: ${k}`);
    assert.ok(getVal(en, k), `Missing EN key: ${k}`);
  }

  // Approved glossary requirements
  assert.equal(ar.roles.unionPresident, 'رئيس الاتحاد');
  assert.equal(tr.roles.unionPresident, 'Birlik Başkanı');
  assert.equal(en.roles.unionPresident, 'Union President');

  assert.equal(ar.roles.vicePresident, 'نائب الرئيس');
  assert.equal(tr.roles.vicePresident, 'Başkan Yardımcısı');
  assert.equal(en.roles.vicePresident, 'Vice President');

  assert.equal(ar.roles.student, 'طالب');
  assert.equal(tr.roles.student, 'Öğrenci');
  assert.equal(en.roles.student, 'Student');

  assert.equal(ar.roles.member, 'عضو');
  assert.equal(tr.roles.member, 'Üye');
  assert.equal(en.roles.member, 'Member');

  assert.equal(ar.admin.tabs.board, 'الهيئة التنفيذية');
  assert.equal(tr.admin.tabs.board, 'Yönetim Kurulu');
  assert.equal(en.admin.tabs.board, 'Executive Board');
  assert.notEqual(tr.admin.tabs.board, 'Yürütme Kurulu');
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

test('3. Member management labels in MembersTab use translations', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /t\(['"]admin\.members\.searchPlaceholder['"]/);
  assert.match(code, /t\(['"]admin\.members\.table\.member['"]/);
  assert.match(code, /t\(['"]admin\.members\.table\.email['"]/);
  assert.match(code, /t\(['"]admin\.members\.table\.currentRole['"]/);
  assert.match(code, /t\(['"]admin\.members\.table\.university['"]/);
  assert.match(code, /t\(['"]admin\.members\.table\.major['"]/);
  assert.match(code, /t\(['"]admin\.members\.table\.action['"]/);
  assert.match(code, /t\(['"]admin\.members\.roleModal\.title['"]/);
  assert.match(code, /t\(['"]admin\.members\.removeModal\.title['"]/);
});

test('4. Membership application labels in ApplicationsTab use translations', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /t\(['"]admin\.applications\.filters\.all['"]/);
  assert.match(code, /t\(['"]admin\.applications\.filters\.pending['"]/);
  assert.match(code, /t\(['"]admin\.applications\.filters\.interview['"]/);
  assert.match(code, /t\(['"]admin\.applications\.filters\.accepted['"]/);
  assert.match(code, /t\(['"]admin\.applications\.filters\.rejected['"]/);
  assert.match(code, /t\(['"]admin\.applications\.searchPlaceholder['"]/);
  assert.match(code, /t\(['"]admin\.applications\.table\.applicant['"]/);
  assert.match(code, /t\(['"]admin\.applications\.table\.university['"]/);
  assert.match(code, /t\(['"]admin\.applications\.table\.appliedAt['"]/);
  assert.match(code, /t\(['"]admin\.applications\.table\.status['"]/);
  assert.match(code, /t\(['"]admin\.applications\.table\.interview['"]/);
  assert.match(code, /t\(['"]admin\.applications\.table\.email['"]/);
  assert.match(code, /t\(['"]admin\.applications\.table\.actions['"]/);
  assert.match(code, /t\(['"]admin\.applications\.interviewModal\.title['"]/);
  assert.match(code, /t\(['"]admin\.applications\.decisionModal\./);
});

test('5. ApplicationEmailStatus labels use translations', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /t\(['"]admin\.applications\.emailStatus\.sent['"]/);
  assert.match(code, /t\(['"]admin\.applications\.emailStatus\.failed['"]/);
  assert.match(code, /t\(['"]admin\.applications\.emailStatus\.sending['"]/);
  assert.match(code, /t\(['"]admin\.applications\.emailStatus\.retry['"]/);
});

test('6. Executive board labels in BoardTab use translations', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /t\(['"]admin\.board\.addMember['"]/);
  assert.match(code, /t\(['"]admin\.board\.headTitle['"]/);
  assert.match(code, /t\(['"]admin\.board\.statsSection['"]/);
  assert.match(code, /t\(['"]admin\.board\.responsibilitiesSection['"]/);
  assert.match(code, /t\(['"]admin\.board\.membersSection['"]/);
  assert.match(code, /t\(['"]admin\.board\.memberModal\.addTitle['"]/);
  assert.match(code, /t\(['"]admin\.board\.headModal\.title['"]/);
  assert.match(code, /t\(['"]admin\.board\.respModal\.addTitle['"]/);
});

test('7. ProfileEditsPanel and EditDiffTable use translations', async () => {
  const panel = await read('src/components/ProfileEditsPanel.tsx');
  const diff = await read('src/components/EditDiffTable.tsx');
  const editor = await read('src/components/ExecutiveEditDraftEditor.tsx');

  assert.match(panel, /useTranslation/);
  assert.match(panel, /t\(['"]admin\.profileEdits\.title['"]/);
  assert.match(panel, /t\(['"]admin\.profileEdits\.approve['"]/);
  assert.match(panel, /t\(['"]admin\.profileEdits\.reject['"]/);

  assert.match(diff, /t\(['"]admin\.profileEdits\.diffTable\.field['"]/);
  assert.match(editor, /t\(['"]admin\.profileEdits\.draftEditor\.responsibilities['"]/);
});

test('8. Member names remain untouched', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /member\.name/);
  assert.match(code, /removeCandidate\.name/);
  assert.match(code, /c\.head\?\.name/);
  assert.match(code, /m\?\.name/);
});

test('9. Emails remain untouched', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /member\.email/);
  assert.match(code, /currentUser\.contactEmail/);
  assert.match(code, /a\.email/);
});

test('10. Application motivation remains untouched', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.doesNotMatch(code, /t\([^)]*motivation/);
});

test('11. Interview URLs remain untranslated while security normalization is preserved', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /value=\{interviewForm\.meetingUrl\}/);
  assert.match(
    code,
    /normalizeMeetingUrl\(interviewForm\.meetingUrl\)/,
  );
  assert.match(code, /meetingUrl:\s*normalizedUrl/);

  assert.doesNotMatch(
    code,
    /t\([^)]*interviewForm\.meetingUrl/,
  );
  assert.doesNotMatch(
    code,
    /t\([^)]*normalizedUrl/,
  );
});

test('12. Internal role keys remain unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /currentUser\?\.role === 'PRESIDENT'/);
  assert.match(code, /role === 'STUDENT'/);
  assert.match(code, /roleModal\.role === 'PRESIDENT'/);
  assert.match(code, /roleModal\.role === 'STUDENT'/);
});

test('13. Internal status keys remain unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /a\.status === 'pending'/);
  assert.match(code, /a\.status === 'interview'/);
  assert.match(code, /a\.status === 'accepted'/);
  assert.match(code, /a\.status === 'rejected'/);
});

test('14. President protection remains unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /roleModal\.role === 'PRESIDENT'/);
  assert.match(code, /member\.id === currentUser\.userId/);
  assert.match(code, /disabled=\{[^}]*roleModal\.role === 'PRESIDENT'/);
  assert.match(code, /لا يمكن إنهاء منصب الرئيس وإعادته إلى طالب مباشرة/);
});

test('15. Executive -> student revocation behavior remains unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /revokeExecutiveAssignment\(roleModal\.id\)/);
  assert.match(code, /buildRevocationConfirmation/);
  assert.match(code, /طالب عادي/);
});

test('16. Executive transfer behavior remains unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /transferMemberRole\(roleModal\.id, pendingAssignment\.role\)/);
  assert.match(code, /buildTransferConfirmation/);
});

test('17. Application approve/reject behavior remains unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /decideApplication\(\s*decisionModal\.id,\s*decisionForm\.status/);
  assert.match(code, /scheduleInterview\(\s*interviewModal\.id/);
});

test('18. Authorization guards remain unchanged', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /if \(currentUser\?\.role !== 'PRESIDENT'\) return null;/);
  assert.match(code, /c\.head\?\.id !== currentUser\?\.userId/);
});

test('19. No URL locale routes added', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.doesNotMatch(code, /['"]\/(ar|tr|en)\//);
});

test('20. No machine translation API added', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.doesNotMatch(code, /google\.translate|translate\.googleapis|deepl/i);
});

test('21. No Supabase schema/database changes in AdminDashboard', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.doesNotMatch(code, /supabase\.from/);
  assert.doesNotMatch(code, /supabase\.rpc/);
});

test('22. Content-management panels remain untouched for 5C3B2', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /function EventsTab/);
  assert.match(code, /function GalleryTab/);
  assert.match(code, /function NewsTab/);
});

test('23. Operational panels remain untouched for 5C3B3', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /function ContactInboxTab/);
  assert.match(code, /function PlansTab/);
  assert.match(code, /function SuggestionsTab/);
});

test('24. Stored academic-year canonical values remain unchanged', async () => {
  const authCode = await read('src/pages/AuthPages.tsx');
  const mockCode = await read('src/data/mockData.ts');

  assert.match(authCode, /value="السنة الأولى"/);
  assert.match(authCode, /value="السنة الثانية"/);
  assert.match(authCode, /value="السنة الثالثة"/);
  assert.match(authCode, /value="السنة الرابعة"/);
  assert.match(authCode, /value="دراسات عليا"/);

  assert.match(mockCode, /year:\s*'السنة الأولى'/);
  assert.match(mockCode, /year:\s*'السنة الثانية'/);
  assert.match(mockCode, /year:\s*'السنة الثالثة'/);
  assert.match(mockCode, /year:\s*'السنة الرابعة'/);
});

test('25. First year displays: AR = السنة الأولى, TR = Birinci Sınıf, EN = First Year', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');
  const { getAcademicYearPresentation } = await import('../src/domain/academicYearPresentation.ts');

  const makeT = (dict) => (k, fb) => k.split('.').reduce((acc, part) => acc?.[part], dict) ?? fb;

  assert.equal(getAcademicYearPresentation('السنة الأولى', makeT(ar)), 'السنة الأولى');
  assert.equal(getAcademicYearPresentation('السنة الأولى', makeT(tr)), 'Birinci Sınıf');
  assert.equal(getAcademicYearPresentation('السنة الأولى', makeT(en)), 'First Year');
});

test('26. Other actual registration year options map correctly', async () => {
  const { default: ar } = await import('../src/i18n/locales/ar.ts');
  const { default: tr } = await import('../src/i18n/locales/tr.ts');
  const { default: en } = await import('../src/i18n/locales/en.ts');
  const { getAcademicYearPresentation } = await import('../src/domain/academicYearPresentation.ts');

  const makeT = (dict) => (k, fb) => k.split('.').reduce((acc, part) => acc?.[part], dict) ?? fb;

  // Second year
  assert.equal(getAcademicYearPresentation('السنة الثانية', makeT(ar)), 'السنة الثانية');
  assert.equal(getAcademicYearPresentation('السنة الثانية', makeT(tr)), 'İkinci Sınıf');
  assert.equal(getAcademicYearPresentation('السنة الثانية', makeT(en)), 'Second Year');

  // Third year
  assert.equal(getAcademicYearPresentation('السنة الثالثة', makeT(ar)), 'السنة الثالثة');
  assert.equal(getAcademicYearPresentation('السنة الثالثة', makeT(tr)), 'Üçüncü Sınıf');
  assert.equal(getAcademicYearPresentation('السنة الثالثة', makeT(en)), 'Third Year');

  // Fourth year
  assert.equal(getAcademicYearPresentation('السنة الرابعة', makeT(ar)), 'السنة الرابعة');
  assert.equal(getAcademicYearPresentation('السنة الرابعة', makeT(tr)), 'Dördüncü Sınıf');
  assert.equal(getAcademicYearPresentation('السنة الرابعة', makeT(en)), 'Fourth Year');

  // Postgraduate
  assert.equal(getAcademicYearPresentation('دراسات عليا', makeT(ar)), 'دراسات عليا');
  assert.equal(getAcademicYearPresentation('دراسات عليا', makeT(tr)), 'Yüksek Lisans / Doktora');
  assert.equal(getAcademicYearPresentation('دراسات عليا', makeT(en)), 'Postgraduate');
});

test('27. Unknown historical value falls back to itself', async () => {
  const { default: en } = await import('../src/i18n/locales/en.ts');
  const { getAcademicYearPresentation } = await import('../src/domain/academicYearPresentation.ts');

  const makeT = (dict) => (k, fb) => k.split('.').reduce((acc, part) => acc?.[part], dict) ?? fb;

  assert.equal(getAcademicYearPresentation('خريج', makeT(en)), 'خريج');
  assert.equal(getAcademicYearPresentation('2023-2024', makeT(en)), '2023-2024');
  assert.equal(getAcademicYearPresentation('', makeT(en)), '');
  assert.equal(getAcademicYearPresentation(null, makeT(en)), '');
  assert.equal(getAcademicYearPresentation(undefined, makeT(en)), '');
});

test('28. ApplicationsTab uses getAcademicYearPresentation for display and preserves raw data', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /getAcademicYearPresentation/);
  // Payload/data updates and raw mappings still use a.year / app.year / app.academic_year
  assert.match(code, /applications\.map|filtered\.map/);
});

test('29. University, major and motivation remain untranslated', async () => {
  const code = await read('src/pages/AdminDashboard.tsx');

  assert.match(code, /\{a\.university\}/);
  assert.match(code, /\{a\.major\}/);
  assert.doesNotMatch(code, /t\([^)]*a\.university/);
  assert.doesNotMatch(code, /t\([^)]*a\.major/);
  assert.doesNotMatch(code, /t\([^)]*a\.motivation/);
});

