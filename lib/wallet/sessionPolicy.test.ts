import {
  attachLockOnHide,
  DEFAULT_AUTO_LOCK_MS,
  shouldLockOnHide,
  type HideLockTarget,
} from './sessionPolicy';

describe('sessionPolicy', () => {
  it('defaults idle lock to 5 minutes', () => {
    expect(DEFAULT_AUTO_LOCK_MS).toBe(5 * 60 * 1000);
  });

  it('shouldLockOnHide only when vault present and unlocked', () => {
    expect(shouldLockOnHide({ hasVault: true, isLocked: false })).toBe(true);
    expect(shouldLockOnHide({ hasVault: true, isLocked: true })).toBe(false);
    expect(shouldLockOnHide({ hasVault: false, isLocked: false })).toBe(false);
  });

  it('attachLockOnHide dedupes visibilitychange + pagehide', () => {
    const listeners = new Map<string, () => void>();
    const target: HideLockTarget = {
      visibilityState: 'visible',
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
    };

    let locks = 0;
    const detach = attachLockOnHide({
      target,
      shouldLock: () => true,
      lock: () => {
        locks += 1;
      },
    });

    target.visibilityState = 'hidden';
    listeners.get('visibilitychange')!();
    listeners.get('pagehide')!();
    expect(locks).toBe(1);

    target.visibilityState = 'visible';
    listeners.get('visibilitychange')!();
    target.visibilityState = 'hidden';
    listeners.get('visibilitychange')!();
    expect(locks).toBe(2);

    detach();
  });
});
