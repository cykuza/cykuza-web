/**
 * Send policy helpers — address confirm suffix + large-send fraction.
 */

/** Fraction of confirmed balance that triggers a large-send warning. */
export const LARGE_SEND_BALANCE_FRACTION = 0.5;

export function isLargeSend(
  totalSats: number,
  confirmedBalanceSats: number
): boolean {
  if (
    !Number.isFinite(totalSats) ||
    !Number.isFinite(confirmedBalanceSats) ||
    confirmedBalanceSats <= 0
  ) {
    return false;
  }
  return totalSats > confirmedBalanceSats * LARGE_SEND_BALANCE_FRACTION;
}

export const ADDRESS_CONFIRM_SUFFIX_LENGTH = 6;

export function addressConfirmSuffix(address: string): string {
  return address.slice(-ADDRESS_CONFIRM_SUFFIX_LENGTH);
}

export function matchesAddressConfirmSuffix(
  address: string,
  suffix: string
): boolean {
  if (
    typeof suffix !== 'string' ||
    suffix.length < ADDRESS_CONFIRM_SUFFIX_LENGTH
  ) {
    return false;
  }
  return addressConfirmSuffix(address) === suffix;
}
