import { type NetworkType } from '../cyberyenNetwork';
import { assertValidAddress } from './address';
import {
  type DailySpendState,
  wouldExceedLimit,
} from './dailySpend';
import { SendError } from './sendErrors';
import { isLargeSend, matchesAddressConfirmSuffix } from './sendPolicy';

export interface AssertSendSafeguardsInput {
  toAddress: string;
  networkType: NetworkType;
  toConfirmSuffix: string;
  totalSats: number;
  confirmedBalanceSats: number;
  dailySpendLimitSats: number | null;
  dailySpend: DailySpendState;
  allowSpendLimitOnce?: boolean;
  acknowledgeLargeSend?: boolean;
  now?: number;
}

/**
 * Enforce send safeguards (domain). Order matches extension SW:
 * address → suffix → daily limit override → large-send ack.
 */
export function assertSendSafeguards(input: AssertSendSafeguardsInput): void {
  assertValidAddress(input.toAddress, input.networkType);

  if (!matchesAddressConfirmSuffix(input.toAddress, input.toConfirmSuffix)) {
    throw new SendError('ADDRESS_CONFIRM_MISMATCH');
  }

  if (
    wouldExceedLimit(
      input.dailySpendLimitSats,
      input.dailySpend,
      input.totalSats,
      input.now
    ) &&
    input.allowSpendLimitOnce !== true
  ) {
    throw new SendError('SPEND_LIMIT_OVERRIDE_REQUIRED');
  }

  if (
    isLargeSend(input.totalSats, input.confirmedBalanceSats) &&
    input.acknowledgeLargeSend !== true
  ) {
    throw new SendError('LARGE_SEND_ACK_REQUIRED');
  }
}

/** Preview flags for UI checkboxes (not authoritative — send still asserts). */
export function previewSendSafeguardFlags(input: {
  totalSats: number;
  confirmedBalanceSats: number;
  dailySpendLimitSats: number | null;
  dailySpend: DailySpendState;
  now?: number;
}): { spendLimitExceeded: boolean; largeSend: boolean } {
  return {
    spendLimitExceeded: wouldExceedLimit(
      input.dailySpendLimitSats,
      input.dailySpend,
      input.totalSats,
      input.now
    ),
    largeSend: isLargeSend(input.totalSats, input.confirmedBalanceSats),
  };
}
