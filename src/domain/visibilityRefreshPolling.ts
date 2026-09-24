export const DEFAULT_VISIBILITY_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export interface VisibilityRefreshEnvironment {
  isVisible: () => boolean;
  setInterval: (callback: () => void, delayMs: number) => unknown;
  clearInterval: (handle: unknown) => void;
  addVisibilityChangeListener: (listener: () => void) => void;
  removeVisibilityChangeListener: (listener: () => void) => void;
}

export function createVisibilityRefreshPolling(options: {
  requestRefresh: () => void;
  environment?: VisibilityRefreshEnvironment;
  intervalMs?: number;
}): () => void {
  const env = options.environment || {
    isVisible: () => typeof document !== 'undefined' && document.visibilityState === 'visible',
    setInterval: (cb, ms) => setInterval(cb, ms),
    clearInterval: (handle) => clearInterval(handle as number),
    addVisibilityChangeListener: (listener) => {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', listener);
      }
    },
    removeVisibilityChangeListener: (listener) => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', listener);
      }
    }
  };

  const intervalMs = options.intervalMs || DEFAULT_VISIBILITY_REFRESH_INTERVAL_MS;
  const requestRefresh = options.requestRefresh;
  let isDisposed = false;

  const intervalCallback = () => {
    if (isDisposed) return;
    if (env.isVisible()) {
      requestRefresh();
    }
  };

  const visibilityListener = () => {
    if (isDisposed) return;
    if (env.isVisible()) {
      requestRefresh();
    }
  };

  const intervalHandle = env.setInterval(intervalCallback, intervalMs);
  env.addVisibilityChangeListener(visibilityListener);

  return function cleanup() {
    if (isDisposed) return;
    isDisposed = true;
    env.clearInterval(intervalHandle);
    env.removeVisibilityChangeListener(visibilityListener);
  };
}
