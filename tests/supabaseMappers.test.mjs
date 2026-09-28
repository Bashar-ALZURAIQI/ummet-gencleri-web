import test from 'node:test';
import assert from 'node:assert/strict';

const mappers = await import('../src/domain/supabaseMappers.ts');

const authUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'login@example.org',
  user_metadata: { role: 'PRESIDENT' },
};

const profileRow = {
  id: authUser.id,
  name: 'Member Name',
  email: 'legacy-president@example.org',
  contact_email: 'contact@example.org',
  university: 'Example University',
  major: 'Engineering',
  year: '3',
  phone: '+90 555 000 0000',
  status: 'active',
  joined_at: '2025-09-01T00:00:00Z',
  created_at: '2025-08-01T00:00:00Z',
  bio: 'Short profile',
  avatar_path: `${authUser.id}/avatar.webp`,
  updated_at: '2026-08-22T00:00:00Z',
};

test('maps Auth identity, profile data, and the matching UUID assignment without trusting profile email or metadata role', () => {
  const identity = mappers.mapSupabaseIdentity(authUser, profileRow, {
    user_id: authUser.id,
    position_key: 'MEDIA_HEAD',
    committee_key: 'media',
    assigned_by: null,
    assigned_at: '2026-08-22T00:00:00Z',
    updated_at: '2026-08-22T00:00:00Z',
  });

  assert.deepEqual(identity.currentUser, {
    userId: authUser.id,
    name: 'Member Name',
    email: 'login@example.org',
    loginEmail: 'login@example.org',
    contactEmail: 'contact@example.org',
    university: 'Example University',
    major: 'Engineering',
    year: '3',
    phone: '+90 555 000 0000',
    photo: `${authUser.id}/avatar.webp`,
    avatarPath: `${authUser.id}/avatar.webp`,
    bio: 'Short profile',
    updatedAt: '2026-08-22T00:00:00Z',
    role: 'MEDIA_HEAD',
    committee: 'media',
  });
  assert.deepEqual(identity.student, {
    id: authUser.id,
    userId: authUser.id,
    name: 'Member Name',
    email: 'login@example.org',
    loginEmail: 'login@example.org',
    contactEmail: 'contact@example.org',
    university: 'Example University',
    major: 'Engineering',
    year: '3',
    joinedAt: '2025-09-01T00:00:00Z',
    registeredEvents: [],
    status: 'active',
    phone: '+90 555 000 0000',
    photo: `${authUser.id}/avatar.webp`,
    bio: 'Short profile',
  });
});

test('defaults an unassigned account to STUDENT and normalizes missing profile values safely', () => {
  const identity = mappers.mapSupabaseIdentity(
    { id: authUser.id, email: 'president-looking@example.org' },
    { id: authUser.id, status: null, email: 'must-not-be-used@example.org' },
    null,
  );

  assert.deepEqual(identity.currentUser, {
    userId: authUser.id,
    name: '',
    email: 'president-looking@example.org',
    loginEmail: 'president-looking@example.org',
    contactEmail: '',
    university: '',
    major: '',
    year: '',
    phone: '',
    photo: '',
    avatarPath: '',
    bio: '',
    updatedAt: '',
    role: 'STUDENT',
  });
  assert.deepEqual(identity.student, {
    id: authUser.id,
    userId: authUser.id,
    name: '',
    email: 'president-looking@example.org',
    loginEmail: 'president-looking@example.org',
    contactEmail: '',
    university: '',
    major: '',
    year: '',
    joinedAt: '',
    registeredEvents: [],
    status: 'inactive',
    phone: '',
    photo: '',
    bio: '',
  });
});

test('preserves removed and banned profile states so stale accepted applications cannot restore access', () => {
  for (const status of ['removed', 'banned']) {
    const identity = mappers.mapSupabaseIdentity(authUser, { ...profileRow, status }, null);
    assert.equal(identity.student.status, status);
  }
});

test('rejects an assignment for another UUID or an invalid role/committee pair', () => {
  for (const assignment of [
    {
      user_id: '22222222-2222-2222-2222-222222222222',
      position_key: 'PRESIDENT',
      committee_key: 'presidency',
    },
    {
      user_id: authUser.id,
      position_key: 'PRESIDENT',
      committee_key: 'media',
    },
    {
      user_id: authUser.id,
      position_key: 'ROOT',
      committee_key: 'presidency',
    },
  ]) {
    assert.equal(
      mappers.mapSupabaseIdentity(authUser, profileRow, assignment).currentUser.role,
      'STUDENT',
    );
  }
});

test('uses created_at only when joined_at is missing and keeps the Auth UUID authoritative', () => {
  const identity = mappers.mapSupabaseIdentity(
    authUser,
    {
      ...profileRow,
      id: '33333333-3333-3333-3333-333333333333',
      joined_at: undefined,
    },
    undefined,
  );

  assert.equal(identity.student.id, authUser.id);
  assert.equal(identity.student.userId, authUser.id);
  assert.equal(identity.student.joinedAt, profileRow.created_at);
});

test('maps general profile updates without allowing either avatar field into the database payload', () => {
  assert.deepEqual(
    mappers.mapProfileUpdatesToDatabase({
      name: 'Updated Name',
      contactEmail: 'new-contact@example.org',
      photo: `${authUser.id}/avatar-attacker.webp`,
      avatar_path: `${authUser.id}/avatar-bypass.webp`,
      loginEmail: 'changed-login@example.org',
      role: 'PRESIDENT',
    }),
    {
      name: 'Updated Name',
      contact_email: 'new-contact@example.org',
    },
  );
});

test('maps the public executive contact email without exposing a login email', () => {
  assert.deepEqual(
    mappers.mapPublicExecutiveDirectoryRow({
      user_id: authUser.id,
      position_key: 'ACADEMIC_HEAD',
      committee_key: 'academic',
      name: 'Academic Member',
      university: 'Example University',
      major: 'History',
      year: '4',
      bio: 'Public biography',
      avatar_path: `${authUser.id}/avatar.webp`,
      profile_updated_at: '2026-08-22T00:00:00Z',
      assignment_updated_at: '2026-08-22T01:00:00Z',
      login_email: 'must-not-be-exposed@example.org',
      contact_email: 'public-contact@example.org',
    }),
    {
      userId: authUser.id,
      position: 'ACADEMIC_HEAD',
      committee: 'academic',
      name: 'Academic Member',
      contactEmail: 'public-contact@example.org',
      university: 'Example University',
      major: 'History',
      year: '4',
      bio: 'Public biography',
      avatarPath: `${authUser.id}/avatar.webp`,
      profileUpdatedAt: '2026-08-22T00:00:00Z',
      assignmentUpdatedAt: '2026-08-22T01:00:00Z',
    },
  );
});

test('maps the president-only account directory with read-only login email and optional assignment', () => {
  assert.deepEqual(
    mappers.mapPresidentAssignableMemberRow({
      user_id: authUser.id,
      login_email: 'login@example.org',
      name: 'Member Name',
      university: 'Example University',
      major: 'Engineering',
      year: '3',
      bio: 'Short profile',
      avatar_path: `${authUser.id}/avatar.webp`,
      profile_updated_at: '2026-08-22T00:00:00Z',
      position_key: 'MEDIA_HEAD',
      committee_key: 'media',
      assignment_updated_at: '2026-08-22T01:00:00Z',
      contact_email: 'must-not-be-returned@example.org',
      phone: '05375922478',
    }),
    {
      userId: authUser.id,
      loginEmail: 'login@example.org',
      name: 'Member Name',
      university: 'Example University',
      major: 'Engineering',
      year: '3',
      phone: '05375922478',
      bio: 'Short profile',
      avatarPath: `${authUser.id}/avatar.webp`,
      profileUpdatedAt: '2026-08-22T00:00:00Z',
      position: 'MEDIA_HEAD',
      committee: 'media',
      assignmentUpdatedAt: '2026-08-22T01:00:00Z',
    },
  );
});
