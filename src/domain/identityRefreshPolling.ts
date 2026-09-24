import {
  createVisibilityRefreshPolling,
  DEFAULT_VISIBILITY_REFRESH_INTERVAL_MS,
  type VisibilityRefreshEnvironment,
} from './visibilityRefreshPolling.ts';

export const IDENTITY_REFRESH_INTERVAL_MS = DEFAULT_VISIBILITY_REFRESH_INTERVAL_MS;

export type IdentityRefreshPollingEnvironment = VisibilityRefreshEnvironment;

export function createIdentityRefreshPolling(options: {
  requestRefresh: () => void;
  environment?: IdentityRefreshPollingEnvironment;
  intervalMs?: number;
}): () => void {
  return createVisibilityRefreshPolling(options);
}
