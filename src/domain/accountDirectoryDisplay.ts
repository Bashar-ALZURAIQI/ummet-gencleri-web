import {
  ROLE_LABEL,
  type BoardMember,
  type CommitteeId,
  type UserRole,
} from '../data/mockData.ts';
import { isLinkedAccountId } from './executiveTransfer.ts';

interface AssignableDirectoryMember {
  userId: string;
  name: string;
  university: string;
  major: string;
  year: string;
  bio: string;
  avatarPath: string;
  updatedAt: string;
  phone?: string;
}

interface ExecutiveDirectoryMember {
  userId: string;
  position: Exclude<UserRole, 'STUDENT'>;
  committee: CommitteeId;
  name: string;
  contactEmail: string;
  university: string;
  major: string;
  year: string;
  bio: string;
  avatarPath: string;
  profileUpdatedAt: string;
  assignmentUpdatedAt: string;
}

export interface DirectoryDisplayMember {
  id: string;
  name: string;
  email: string;
  university: string;
  major: string;
  year: string;
  phone: string;
  photo: string;
  updatedAt: string;
  role: UserRole;
  committee?: CommitteeId;
  joinedAt: string;
  status: 'active';
}

export function buildAccountDirectoryDisplay(
  assignableMembers: AssignableDirectoryMember[],
  executives: ExecutiveDirectoryMember[],
): {
  members: DirectoryDisplayMember[];
  heads: Partial<Record<CommitteeId, BoardMember>>;
} {
  const assignmentsByUser = new Map(executives.map((entry) => [entry.userId, entry]));
  const members = assignableMembers.map((member): DirectoryDisplayMember => {
    const assignment = assignmentsByUser.get(member.userId);
    return {
      id: member.userId,
      name: member.name,
      email: '',
      university: member.university,
      major: member.major,
      year: member.year,
      phone: member.phone ?? '',
      photo: member.avatarPath,
      updatedAt: member.updatedAt,
      role: assignment?.position ?? 'STUDENT',
      ...(assignment ? { committee: assignment.committee } : {}),
      joinedAt: member.updatedAt,
      status: 'active',
    };
  });

  const heads: Partial<Record<CommitteeId, BoardMember>> = {};
  for (const executive of executives) {
    heads[executive.committee] = {
      id: executive.userId,
      name: executive.name,
      role: ROLE_LABEL[executive.position],
      bio: executive.bio,
      photo: executive.avatarPath,
      email: executive.contactEmail,
      phone: '',
      university: executive.university,
      major: executive.major,
      year: executive.year,
      updatedAt: executive.profileUpdatedAt,
    };
  }

  return { members, heads };
}

export interface ConfirmedProfileDisplay {
  userId: string;
  name: string;
  contactEmail: string;
  university: string;
  major: string;
  year: string;
  phone: string;
  bio: string;
  avatarPath: string;
  updatedAt: string;
}

export function synchronizeCurrentUserByUserId<
  T extends { userId: string } | null,
>(current: T, profile: ConfirmedProfileDisplay): T {
  if (!current || current.userId !== profile.userId) return current;
  return {
    ...current,
    name: profile.name,
    contactEmail: profile.contactEmail,
    university: profile.university,
    major: profile.major,
    year: profile.year,
    phone: profile.phone,
    bio: profile.bio,
    photo: profile.avatarPath,
    avatarPath: profile.avatarPath,
    updatedAt: profile.updatedAt,
  } as T;
}

export function synchronizeCurrentStudentByUserId<
  T extends { id: string; userId?: string } | null,
>(current: T, profile: ConfirmedProfileDisplay): T {
  if (!current || (current.userId ?? current.id) !== profile.userId) return current;
  return {
    ...current,
    name: profile.name,
    contactEmail: profile.contactEmail,
    university: profile.university,
    major: profile.major,
    year: profile.year,
    phone: profile.phone,
    bio: profile.bio,
    photo: profile.avatarPath,
  } as T;
}

export function synchronizeMembersByUserId<
  T extends { id: string },
>(members: T[], profile: ConfirmedProfileDisplay): T[] {
  return members.map((member) => member.id === profile.userId
    ? {
        ...member,
        name: profile.name,
        university: profile.university,
        major: profile.major,
        year: profile.year,
        photo: profile.avatarPath,
        updatedAt: profile.updatedAt,
      }
    : member) as T[];
}

export function synchronizeCommitteeHeadsByUserId<
  T extends { head?: { id: string } },
>(committees: T[], profile: ConfirmedProfileDisplay): T[] {
  return committees.map((committee) => committee.head?.id === profile.userId
    ? {
        ...committee,
        head: {
          ...committee.head,
          name: profile.name,
          university: profile.university,
          major: profile.major,
          year: profile.year,
          bio: profile.bio,
          photo: profile.avatarPath,
          updatedAt: profile.updatedAt,
        },
      }
    : committee) as T[];
}

export function synchronizeProfileIdentityByUserId<
  U extends { userId: string } | null,
  S extends { id: string; userId?: string } | null,
  M extends { id: string },
  C extends { head?: { id: string } },
>(state: {
  currentUser: U;
  currentStudent: S;
  members: M[];
  committees: C[];
}, profile: ConfirmedProfileDisplay): typeof state {
  return {
    currentUser: synchronizeCurrentUserByUserId(state.currentUser, profile),
    currentStudent: synchronizeCurrentStudentByUserId(state.currentStudent, profile),
    members: synchronizeMembersByUserId(state.members, profile),
    committees: synchronizeCommitteeHeadsByUserId(state.committees, profile),
  };
}

/**
 * Published committee content owns institutional fields only. Executive identity
 * is resolved separately from executive_assignments + profiles and must survive
 * content reloads, realtime publications, and approval writes.
 */
export function mergeInstitutionalCommitteeContent<
  T extends { id: string; head?: unknown },
>(current: T[], published: T[]): T[] {
  const currentById = new Map(current.map((committee) => [committee.id, committee]));
  return published.map((committee) => {
    const currentCommittee = currentById.get(committee.id);
    return currentCommittee?.head === undefined
      ? committee
      : { ...committee, head: currentCommittee.head };
  });
}

export function stripPrivateLoginEmailsForCache<T extends { id: string; email: string }>(
  members: T[],
): T[] {
  return members.map((member) => isLinkedAccountId(member.id)
    ? { ...member, email: '' }
    : member);
}

export function stripPrivateExecutiveEmailsForCache<
  T extends { head?: { email?: string } },
>(committees: T[]): T[] {
  return committees.map((committee) => committee.head
    ? { ...committee, head: { ...committee.head, email: '' } }
    : committee) as T[];
}
