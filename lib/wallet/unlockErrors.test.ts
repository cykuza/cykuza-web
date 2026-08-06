import {
  UNLOCK_FAILED,
  unlockFailedWithAttempts,
  UNLOCK_LOCKOUT,
} from './unlockErrors';

describe('unlockErrors', () => {
  it('formats remaining attempts (singular and plural)', () => {
    expect(unlockFailedWithAttempts(1)).toBe(`${UNLOCK_FAILED}. 1 attempt remaining.`);
    expect(unlockFailedWithAttempts(4)).toBe(`${UNLOCK_FAILED}. 4 attempts remaining.`);
    expect(unlockFailedWithAttempts(0)).toBe(`${UNLOCK_FAILED}. 0 attempts remaining.`);
  });

  it('exposes lockout copy without revealing which factor failed', () => {
    expect(UNLOCK_LOCKOUT).toContain('15 minutes');
    expect(UNLOCK_FAILED).toBe('Unlock failed');
  });
});
