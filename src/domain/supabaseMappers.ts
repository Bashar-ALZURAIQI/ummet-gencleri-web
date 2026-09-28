import type { CommitteeId, Student, UserRole } from '../data/mockData.ts';
import { sanitizeProfileUpdates } from './accountIdentity.ts';

export interface AuthIdentity {
  id: string;
  email?: string | null;
}

export interface ProfileRow {
  id?: unknown;
  name?: unknown;
  contact_email?: unknown;
  university?: unknown;
  major?: unknown;
  year?: unknown;
  phone?: unknown;
  status?: unknown;
  joined_at?: unknown;
  created_at?: unknown;
  bio?: unknown;
  avatar_path?: unknown;
  updated_at?: unknown;
}

export interface ExecutiveAssignmentRow {
  user_id?: unknown;
  position_key?: unknown;
  committee_key?: unknown;
  assigned_by?: unknown;
  assigned_at?: unknown;
  updated_at?: unknown;
}

export interface PublicExecutiveDirectoryRow {
  user_id?: unknown;
  position_key?: unknown;
  committee_key?: unknown;
  name?: unknown;
  contact_email?: unknown;
  university?: unknown;
  major?: unknown;
  year?: unknown;
  bio?: unknown;
  avatar_path?: unknown;
  profile_updated_at?: unknown;
  assignment_updated_at?: unknown;
}

export interface PublicExecutiveDirectoryMember {
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

export interface PresidentAssignableMemberRow {
  user_id?: unknown;
  login_email?: unknown;
  name?: unknown;
  university?: unknown;
  major?: unknown;
  year?: unknown;
  phone?: unknown;
  bio?: unknown;
  avatar_path?: unknown;
  profile_updated_at?: unknown;
  position_key?: unknown;
  committee_key?: unknown;
  assignment_updated_at?: unknown;
}

export interface PresidentAssignableMember {
  userId: string;
  loginEmail: string;
  name: string;
  university: string;
  major: string;
  year: string;
  phone?: string;
  bio: string;
  avatarPath: string;
  profileUpdatedAt: string;
  position: Exclude<UserRole, 'STUDENT'> | null;
  committee: CommitteeId | null;
  assignmentUpdatedAt: string;
}

export interface CurrentUser {
  userId: string;
  name: string;
  email: string;
  loginEmail: string;
  contactEmail: string;
  university: string;
  major: string;
  year: string;
  phone: string;
  photo: string;
  avatarPath: string;
  bio: string;
  updatedAt: string;
  role: UserRole;
  committee?: CommitteeId;
}

export interface MappedSessionIdentity {
  currentUser: CurrentUser;
  student: Student;
}

export type DatabaseProfileUpdates = Partial<{
  name: string;
  contact_email: string;
  university: string;
  major: string;
  year: string;
  phone: string;
  bio: string;
}>;

const ROLE_COMMITTEES: Readonly<Partial<Record<UserRole, CommitteeId>>> = {
  PRESIDENT: 'presidency',
  VICE_PRESIDENT: 'vice-presidency',
  MEDIA_HEAD: 'media',
  FINANCE_HEAD: 'finance',
  AUDIT_HEAD: 'supervisory',
  ACADEMIC_HEAD: 'academic',
  ACTIVITIES_HEAD: 'activities',
};

const safeText = (value: unknown): string =>
  typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);

function mapAssignment(
  authUserId: string,
  row: ExecutiveAssignmentRow | null | undefined,
): { role: UserRole; committee?: CommitteeId } {
  const role = safeText(row?.position_key) as UserRole;
  const committee = ROLE_COMMITTEES[role];

  if (!row || safeText(row.user_id) !== authUserId || !committee || row.committee_key !== committee) {
    return { role: 'STUDENT' };
  }

  return { role, committee };
}

export function mapProfileRowToStudent(authUser: AuthIdentity, row: ProfileRow): Student {
  const loginEmail = safeText(authUser.email);

  return {
    id: authUser.id,
    userId: authUser.id,
    name: safeText(row.name),
    email: loginEmail,
    loginEmail,
    contactEmail: safeText(row.contact_email),
    university: safeText(row.university),
    major: safeText(row.major),
    year: safeText(row.year),
    joinedAt: safeText(row.joined_at) || safeText(row.created_at),
    registeredEvents: [],
    status: row.status === 'removed' || row.status === 'banned'
      ? row.status
      : row.status === 'active'
        ? 'active'
        : 'inactive',
    phone: safeText(row.phone),
    photo: safeText(row.avatar_path),
    bio: safeText(row.bio),
  };
}

export function mapRowsToCurrentUser(
  authUser: AuthIdentity,
  profileRow: ProfileRow,
  assignmentRow: ExecutiveAssignmentRow | null | undefined,
): CurrentUser {
  const assignment = mapAssignment(authUser.id, assignmentRow);
  const loginEmail = safeText(authUser.email);

  return {
    userId: authUser.id,
    name: safeText(profileRow.name),
    email: loginEmail,
    loginEmail,
    contactEmail: safeText(profileRow.contact_email),
    university: safeText(profileRow.university),
    major: safeText(profileRow.major),
    year: safeText(profileRow.year),
    phone: safeText(profileRow.phone),
    photo: safeText(profileRow.avatar_path),
    avatarPath: safeText(profileRow.avatar_path),
    bio: safeText(profileRow.bio),
    updatedAt: safeText(profileRow.updated_at),
    ...assignment,
  };
}

export function mapSupabaseIdentity(
  authUser: AuthIdentity,
  profileRow: ProfileRow,
  assignmentRow: ExecutiveAssignmentRow | null | undefined,
): MappedSessionIdentity {
  return {
    currentUser: mapRowsToCurrentUser(authUser, profileRow, assignmentRow),
    student: mapProfileRowToStudent(authUser, profileRow),
  };
}

export function mapProfileUpdatesToDatabase(
  updates: Record<string, unknown>,
): DatabaseProfileUpdates {
  const sanitized = sanitizeProfileUpdates(updates);
  const databaseUpdates: DatabaseProfileUpdates = {};
  if (sanitized.name !== undefined) databaseUpdates.name = sanitized.name;
  if (sanitized.contactEmail !== undefined) databaseUpdates.contact_email = sanitized.contactEmail;
  if (sanitized.university !== undefined) databaseUpdates.university = sanitized.university;
  if (sanitized.major !== undefined) databaseUpdates.major = sanitized.major;
  if (sanitized.year !== undefined) databaseUpdates.year = sanitized.year;
  if (sanitized.phone !== undefined) databaseUpdates.phone = sanitized.phone;
  if (sanitized.bio !== undefined) databaseUpdates.bio = sanitized.bio;
  return databaseUpdates;
}

export function mapPublicExecutiveDirectoryRow(
  row: PublicExecutiveDirectoryRow,
): PublicExecutiveDirectoryMember {
  return {
    userId: safeText(row.user_id),
    position: safeText(row.position_key) as Exclude<UserRole, 'STUDENT'>,
    committee: safeText(row.committee_key) as CommitteeId,
    name: safeText(row.name),
    contactEmail: safeText(row.contact_email),
    university: safeText(row.university),
    major: safeText(row.major),
    year: safeText(row.year),
    bio: safeText(row.bio),
    avatarPath: safeText(row.avatar_path),
    profileUpdatedAt: safeText(row.profile_updated_at),
    assignmentUpdatedAt: safeText(row.assignment_updated_at),
  };
}

export function mapPresidentAssignableMemberRow(
  row: PresidentAssignableMemberRow,
): PresidentAssignableMember {
  const position = safeText(row.position_key);
  const committee = safeText(row.committee_key);
  return {
    userId: safeText(row.user_id),
    loginEmail: safeText(row.login_email),
    name: safeText(row.name),
    university: safeText(row.university),
    major: safeText(row.major),
    year: safeText(row.year),
    phone: safeText(row.phone),
    bio: safeText(row.bio),
    avatarPath: safeText(row.avatar_path),
    profileUpdatedAt: safeText(row.profile_updated_at),
    position: position ? position as Exclude<UserRole, 'STUDENT'> : null,
    committee: committee ? committee as CommitteeId : null,
    assignmentUpdatedAt: safeText(row.assignment_updated_at),
  };
}
