/**
 * Unlock failure copy (parity with cykuza-extension S11).
 * Wrong vault password and wrong BIP39 passphrase share one user-facing phrase
 * so unlock does not oracle which factor failed.
 */
export const UNLOCK_FAILED = 'Unlock failed';

export function unlockFailedWithAttempts(remaining: number): string {
  const n = Math.max(0, Math.floor(remaining));
  return `${UNLOCK_FAILED}. ${n} attempt${n === 1 ? '' : 's'} remaining.`;
}

export const UNLOCK_LOCKOUT =
  'Too many failed attempts. Please wait 15 minutes before trying again.';
