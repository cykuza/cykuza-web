/**
 * Session auto-lock policy (domain — no DOM).
 * Idle timer is the reliable path; visibility/pagehide is best-effort.
 */

/** Default idle lock: 5 minutes (parity with cykuza-extension S4). */
export const DEFAULT_AUTO_LOCK_MS = 5 * 60 * 1000;

export function shouldLockOnHide(opts: {
  hasVault: boolean;
  isLocked: boolean;
}): boolean {
  return opts.hasVault && !opts.isLocked;
}

export type HideLockTarget = {
  addEventListener(
    type: 'visibilitychange' | 'pagehide',
    listener: () => void
  ): void;
  removeEventListener(
    type: 'visibilitychange' | 'pagehide',
    listener: () => void
  ): void;
  visibilityState?: DocumentVisibilityState;
};

/**
 * Attach visibilitychange + pagehide. Invokes `lock` at most once per hide
 * sequence (dedupes when both events fire).
 */
export function attachLockOnHide(opts: {
  target: HideLockTarget;
  shouldLock: () => boolean;
  lock: () => void;
}): () => void {
  let fired = false;

  const tryLock = () => {
    if (fired) return;
    if (!opts.shouldLock()) return;
    fired = true;
    opts.lock();
  };

  const onVisibility = () => {
    if (opts.target.visibilityState === 'hidden') {
      tryLock();
    } else if (opts.target.visibilityState === 'visible') {
      fired = false;
    }
  };

  const onPageHide = () => {
    tryLock();
  };

  opts.target.addEventListener('visibilitychange', onVisibility);
  opts.target.addEventListener('pagehide', onPageHide);

  return () => {
    opts.target.removeEventListener('visibilitychange', onVisibility);
    opts.target.removeEventListener('pagehide', onPageHide);
  };
}
