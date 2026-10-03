import { isLeadershipRole, type UserRole } from '../data/mockData.ts';

export function routeAfterConfirmedIdentityRefresh<T extends string>(
  previousRole: UserRole,
  nextRole: UserRole,
  currentView: T,
): T | 'admin' | 'student-dashboard' {
  const wasExecutive = isLeadershipRole(previousRole);
  const isExecutive = isLeadershipRole(nextRole);

  if (wasExecutive && !isExecutive) return 'student-dashboard';
  if (!wasExecutive && isExecutive) return 'admin';
  if (wasExecutive && isExecutive && previousRole !== nextRole) return 'admin';
  return currentView;
}

export function canExposeAdminUi(
  role: UserRole | null | undefined,
  authInitializing: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  identityRefreshing: boolean,
): boolean {
  return !authInitializing
    && role !== null
    && role !== undefined
    && isLeadershipRole(role);
}
