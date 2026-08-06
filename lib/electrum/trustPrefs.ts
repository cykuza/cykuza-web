/**
 * verifyWithSecondServer preference (default on — security-positive).
 */

export const VERIFY_SECOND_SERVER_KEY = 'wallet_verify_with_second_server';

/** Missing key → true (parity with extension normalize). */
export function readVerifyWithSecondServer(
  storage: Pick<Storage, 'getItem'> = localStorage
): boolean {
  try {
    const raw = storage.getItem(VERIFY_SECOND_SERVER_KEY);
    if (raw === null) return true;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'boolean') return parsed;
    return true;
  } catch {
    return true;
  }
}

export function writeVerifyWithSecondServer(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage
): void {
  storage.setItem(VERIFY_SECOND_SERVER_KEY, JSON.stringify(enabled === true));
}
