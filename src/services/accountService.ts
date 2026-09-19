import type { Session } from '@supabase/supabase-js';
import type { UserRole } from '../data/mockData.ts';
import {
  mapProfileUpdatesToDatabase,
  mapPresidentAssignableMemberRow,
  mapPublicExecutiveDirectoryRow,
  mapSupabaseIdentity,
  type ExecutiveAssignmentRow,
  type MappedSessionIdentity,
  type ProfileRow,
  type PresidentAssignableMember,
  type PresidentAssignableMemberRow,
  type PublicExecutiveDirectoryMember,
  type PublicExecutiveDirectoryRow,
} from '../domain/supabaseMappers.ts';
import {
  createIdentitySubscription,
  type IdentityRealtimeClient,
  type IdentityRealtimeChangeKind,
} from '../domain/realtimeIdentitySubscription.ts';
import {
  executeTransferRpcRequest,
  type ExecutiveTransferServiceOutcome,
} from '../domain/executiveTransferServiceOutcome.ts';
import {
  classifyRevocationRpcResult,
  type ExecutiveRevocationOutcome,
} from '../domain/executiveRevocation.ts';
import {
  createPasswordVerificationClient,
  serviceFailure,
  serviceSuccess,
  supabase,
  type ServiceError,
  type ServiceResult,
} from '../lib/supabase.ts';
import { executePasswordChange } from '../domain/passwordChange.ts';
import {
  createMemberRemovalService,
  type MemberRemovalResult,
} from '../domain/memberRemovalGateway.ts';

export const PROFILE_SELECT_COLUMNS = [
  'id',
  'name',
  'contact_email',
  'university',
  'major',
  'year',
  'phone',
  'status',
  'joined_at',
  'created_at',
  'bio',
  'avatar_path',
  'updated_at',
].join(',');

const ASSIGNMENT_SELECT_COLUMNS = [
  'user_id',
  'position_key',
  'committee_key',
  'assigned_by',
  'assigned_at',
  'updated_at',
].join(',');

const ASSIGNABLE_MEMBER_SELECT_COLUMNS = [
  'user_id',
  'name',
  'university',
  'major',
  'year',
  'bio',
  'avatar_path',
  'updated_at',
].join(',');

const PUBLIC_EXECUTIVE_DIRECTORY_SELECT_COLUMNS = [
  'user_id',
  'position_key',
  'committee_key',
  'name',
  'contact_email',
  'university',
  'major',
  'year',
  'bio',
  'avatar_path',
  'profile_updated_at',
  'assignment_updated_at',
].join(',');

export interface AssignableMember {
  userId: string;
  name: string;
  university: string;
  major: string;
  year: string;
  bio: string;
  avatarPath: string;
  updatedAt: string;
}

export type { TransferExecutiveAssignmentResult } from '../domain/executiveTransferServiceOutcome.ts';

type ExecutiveRole = Exclude<UserRole, 'STUDENT'>;

const text = (value: unknown): string =>
  typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);

export async function loadSessionIdentity(
  session: Session | null,
): Promise<ServiceResult<MappedSessionIdentity>> {
  const userId = session?.user.id;
  const loginEmail = session?.user.email;
  if (!userId || !loginEmail) {
    return serviceFailure(null, 'SESSION_IDENTITY_MISSING', 'The authenticated session is missing its UUID or login email.');
  }

  const profileResponse = await supabase
    .from('profiles')
    .select(PROFILE_SELECT_COLUMNS)
    .eq('id', userId)
    .single();
  if (profileResponse.error) {
    return serviceFailure(profileResponse.error, 'PROFILE_LOAD_FAILED', 'Unable to load the authenticated profile.');
  }

  const assignmentResponse = await supabase
    .from('executive_assignments')
    .select(ASSIGNMENT_SELECT_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (assignmentResponse.error) {
    return serviceFailure(assignmentResponse.error, 'ASSIGNMENT_LOAD_FAILED', 'Unable to load the authenticated assignment.');
  }

  return serviceSuccess(mapSupabaseIdentity(
    { id: userId, email: loginEmail },
    profileResponse.data as ProfileRow,
    assignmentResponse.data as ExecutiveAssignmentRow | null,
  ));
}

export async function listAssignableMembers(): Promise<ServiceResult<AssignableMember[]>> {
  const { data, error } = await supabase
    .from('public_member_profiles')
    .select(ASSIGNABLE_MEMBER_SELECT_COLUMNS)
    .order('name', { ascending: true });
  if (error) {
    return serviceFailure(error, 'ASSIGNABLE_MEMBERS_LOAD_FAILED', 'Unable to load assignable members.');
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return serviceSuccess(rows.map((row) => ({
    userId: text(row.user_id),
    name: text(row.name),
    university: text(row.university),
    major: text(row.major),
    year: text(row.year),
    bio: text(row.bio),
    avatarPath: text(row.avatar_path),
    updatedAt: text(row.updated_at),
  })));
}

export async function listPresidentAssignableMembers(): Promise<ServiceResult<PresidentAssignableMember[]>> {
  const { data, error } = await supabase.rpc('list_president_assignable_members');
  if (error) {
    return serviceFailure(error, 'PRESIDENT_MEMBER_DIRECTORY_LOAD_FAILED', 'Unable to load the president account directory.');
  }

  return serviceSuccess(
    ((data ?? []) as unknown as PresidentAssignableMemberRow[])
      .map(mapPresidentAssignableMemberRow),
  );
}

export async function listPublicExecutiveDirectory(): Promise<ServiceResult<PublicExecutiveDirectoryMember[]>> {
  const { data, error } = await supabase
    .from('public_executive_directory')
    .select(PUBLIC_EXECUTIVE_DIRECTORY_SELECT_COLUMNS)
    .order('position_key', { ascending: true });
  if (error) {
    return serviceFailure(error, 'EXECUTIVE_DIRECTORY_LOAD_FAILED', 'Unable to load the public executive directory.');
  }

  return serviceSuccess(
    ((data ?? []) as unknown as PublicExecutiveDirectoryRow[])
      .map(mapPublicExecutiveDirectoryRow),
  );
}

export async function updateOwnProfile(
  userId: string,
  updates: Record<string, unknown>,
): Promise<ServiceResult<ProfileRow>> {
  const databaseUpdates = mapProfileUpdatesToDatabase(updates);

  if (!userId || Object.keys(databaseUpdates).length === 0) {
    return serviceFailure(null, 'PROFILE_UPDATE_EMPTY', 'No editable profile fields were provided.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(databaseUpdates)
    .eq('id', userId)
    .select(PROFILE_SELECT_COLUMNS)
    .single();
  if (error) {
    return serviceFailure(error, 'PROFILE_UPDATE_FAILED', 'Unable to update the authenticated profile.');
  }

  return serviceSuccess(data as ProfileRow);
}

export async function transferExecutiveAssignment(
  position: ExecutiveRole,
  targetUserId: string,
): Promise<ExecutiveTransferServiceOutcome> {
  return executeTransferRpcRequest(async () => {
    const { data, error } = await supabase.rpc('transfer_executive_assignment', {
      position,
      target_user_id: targetUserId,
    });
    return { data, error };
  });
}

export async function revokeExecutiveAssignment(
  targetUserId: string,
): Promise<ExecutiveRevocationOutcome> {
  try {
    const { data, error } = await supabase.rpc('revoke_executive_assignment', {
      target_user_id: targetUserId,
    });
    return classifyRevocationRpcResult({ data, error });
  } catch {
    return {
      kind: 'indeterminate',
      error: {
        code: 'ASSIGNMENT_REVOCATION_INDETERMINATE',
        message: 'The assignment revocation result could not be confirmed safely.',
      },
    };
  }
}

export async function removeMemberMembership(targetUserId: string): Promise<MemberRemovalResult> {
  return createMemberRemovalService(supabase).remove(targetUserId);
}

export function subscribeToOwnProfileAndAssignment(
  userId: string,
  requestConfirmedRefresh: (kind: IdentityRealtimeChangeKind) => void,
  onError: (error: ServiceError) => void,
  onSubscribed: () => void,
): () => Promise<ServiceResult<void>> {
  return createIdentitySubscription({
    client: supabase as unknown as IdentityRealtimeClient,
    userId,
    requestConfirmedRefresh,
    onError,
    onSubscribed,
  });
}

export async function changeOwnPassword(
  loginEmail: string,
  currentPassword: string,
  newPassword: string,
  options: {
    expectedUserId: string;
  },
): Promise<ServiceResult<{ userId: string }>> {
  const result = await executePasswordChange({
    loginEmail,
    expectedUserId: options.expectedUserId,
    currentPassword,
    newPassword,
    mainClient: supabase,
    createVerificationClient: createPasswordVerificationClient,
  });
  return result.ok
    ? serviceSuccess({ userId: result.userId })
    : serviceFailure(null, result.code, 'Unable to change the password safely.');
}
