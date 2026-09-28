import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildAccountDirectoryDisplay,
  mergeInstitutionalCommitteeContent,
  synchronizeProfileIdentityByUserId,
  stripPrivateExecutiveEmailsForCache,
  stripPrivateLoginEmailsForCache,
} = await import('../src/domain/accountDirectoryDisplay.ts');

const viceId = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';

test('builds UUID-backed members and executive heads from confirmed safe projections', () => {
  const result = buildAccountDirectoryDisplay(
    [
      { userId: viceId, name: 'خير الله', university: 'جامعة أ', major: 'طب', year: '4', phone: '0512345678', bio: 'نبذة', avatarPath: 'vice.webp', updatedAt: '2026-08-22' },
      { userId: studentId, name: 'أحمد', university: 'جامعة ب', major: 'هندسة', year: '2', phone: undefined, bio: '', avatarPath: '', updatedAt: '2026-08-21' },
    ],
    [
      { userId: viceId, position: 'VICE_PRESIDENT', committee: 'vice-presidency', name: 'خير الله', contactEmail: 'contact@example.org', university: 'جامعة أ', major: 'طب', year: '4', bio: 'نبذة', avatarPath: 'vice.webp', profileUpdatedAt: '2026-08-22', assignmentUpdatedAt: '2026-08-22' },
    ],
  );

  assert.deepEqual(result.members, [
    { id: viceId, name: 'خير الله', email: '', university: 'جامعة أ', major: 'طب', year: '4', phone: '0512345678', photo: 'vice.webp', updatedAt: '2026-08-22', role: 'VICE_PRESIDENT', committee: 'vice-presidency', joinedAt: '2026-08-22', status: 'active' },
    { id: studentId, name: 'أحمد', email: '', university: 'جامعة ب', major: 'هندسة', year: '2', phone: '', photo: '', updatedAt: '2026-08-21', role: 'STUDENT', joinedAt: '2026-08-21', status: 'active' },
  ]);
  assert.deepEqual(result.heads['vice-presidency'], {
    id: viceId,
    name: 'خير الله',
    role: 'نائب الرئيس',
    bio: 'نبذة',
    photo: 'vice.webp',
    email: 'contact@example.org',
    phone: '',
    university: 'جامعة أ',
    major: 'طب',
    year: '4',
    updatedAt: '2026-08-22',
  });
});

test('synchronizes a confirmed profile by UUID without touching a same-email account', () => {
  assert.equal(typeof synchronizeProfileIdentityByUserId, 'function');

  const otherUser = {
    id: studentId,
    name: 'اسم قديم مماثل',
    email: 'shared@example.org',
    university: 'جامعة ب',
    major: 'هندسة',
    year: '2',
    phone: '',
    photo: 'other.webp',
    role: 'STUDENT',
    joinedAt: '2026-01-01',
    status: 'active',
  };
  const otherCommittee = {
    id: 'media',
    head: { id: studentId, name: 'اسم قديم مماثل', email: 'shared@example.org', photo: 'other.webp' },
  };
  const result = synchronizeProfileIdentityByUserId({
    currentUser: { userId: viceId, name: 'قديم', email: 'shared@example.org', photo: '' },
    currentStudent: { id: viceId, userId: viceId, name: 'قديم', email: 'shared@example.org', photo: '' },
    members: [
      { id: viceId, name: 'قديم', email: 'shared@example.org', photo: '' },
      otherUser,
    ],
    committees: [
      { id: 'vice-presidency', head: { id: viceId, name: 'قديم', email: 'shared@example.org', photo: '' } },
      otherCommittee,
    ],
  }, {
    userId: viceId,
    name: 'خير الله الجديد',
    contactEmail: 'contact@example.org',
    university: 'جامعة أ',
    major: 'طب',
    year: '4',
    phone: '05000000000',
    bio: 'نبذة جديدة',
    avatarPath: `${viceId}/avatar.webp`,
    updatedAt: '2026-08-23T01:00:00Z',
  });

  assert.equal(result.currentUser.name, 'خير الله الجديد');
  assert.equal(result.currentStudent.name, 'خير الله الجديد');
  assert.equal(result.members[0].photo, `${viceId}/avatar.webp`);
  assert.equal(result.committees[0].head.id, viceId);
  assert.equal(result.committees[0].head.name, 'خير الله الجديد');
  assert.equal(result.committees[0].head.updatedAt, '2026-08-23T01:00:00Z');
  assert.deepEqual(result.members[1], otherUser);
  assert.deepEqual(result.committees[1], otherCommittee);
});

test('strips president-only login emails before writing UUID-backed members to a browser cache', () => {
  const cached = stripPrivateLoginEmailsForCache([
    { id: viceId, email: 'vice-login@example.org', name: 'خير الله' },
    { id: 'legacy-member', email: 'legacy-display@example.org', name: 'قديم' },
  ]);

  assert.deepEqual(cached, [
    { id: viceId, email: '', name: 'خير الله' },
    { id: 'legacy-member', email: 'legacy-display@example.org', name: 'قديم' },
  ]);
});

test('strips stale executive login emails from initial and cached public committee state', () => {
  assert.equal(typeof stripPrivateExecutiveEmailsForCache, 'function');
  const committees = stripPrivateExecutiveEmailsForCache([
    {
      id: 'presidency',
      head: { id: viceId, name: 'الرئيس', email: 'president-login@example.org' },
    },
    {
      id: 'media',
      head: { id: studentId, name: 'الإعلامي', email: 'media-login@example.org' },
    },
  ]);

  assert.deepEqual(committees, [
    { id: 'presidency', head: { id: viceId, name: 'الرئيس', email: '' } },
    { id: 'media', head: { id: studentId, name: 'الإعلامي', email: '' } },
  ]);
});

test('institutional committee refresh preserves profile-owned current holder identity', () => {
  assert.equal(typeof mergeInstitutionalCommitteeContent, 'function');
  const currentHolder = {
    id: viceId,
    name: 'الحامل الحالي',
    bio: 'نبذة حديثة',
    photo: `${viceId}/avatar.webp`,
    email: 'current@example.org',
  };

  const merged = mergeInstitutionalCommitteeContent([
    { id: 'vice-presidency', title: 'قديم', responsibilities: ['قديم'], head: currentHolder },
    { id: 'media', title: 'الإعلام', head: { id: studentId, name: 'الإعلامي' } },
  ], [
    {
      id: 'vice-presidency',
      title: 'مؤسسي محدث',
      responsibilities: ['مهمة جديدة'],
      head: { id: otherId, name: 'الحامل السابق', bio: 'قديم', photo: 'old.webp' },
    },
    { id: 'media', title: 'إعلام محدث', head: { id: studentId, name: 'نسخة قديمة' } },
  ]);

  assert.equal(merged[0].title, 'مؤسسي محدث');
  assert.deepEqual(merged[0].responsibilities, ['مهمة جديدة']);
  assert.deepEqual(merged[0].head, currentHolder);
  assert.equal(merged[1].title, 'إعلام محدث');
  assert.equal(merged[1].head.name, 'الإعلامي');
});
