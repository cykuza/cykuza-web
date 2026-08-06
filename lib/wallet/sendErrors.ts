/**
 * Typed send/policy errors with stable codes for UI mapping.
 * Messages must never embed hostnames, URLs, addresses, or tx hex.
 */

export type SendErrorCode =
  | 'INVALID_ADDRESS'
  | 'ADDRESS_CONFIRM_MISMATCH'
  | 'SPEND_LIMIT_OVERRIDE_REQUIRED'
  | 'LARGE_SEND_ACK_REQUIRED';

const SEND_MESSAGES: Record<SendErrorCode, string> = {
  INVALID_ADDRESS: 'Invalid address for the selected network',
  ADDRESS_CONFIRM_MISMATCH:
    'Recipient address confirmation does not match. Check the last characters.',
  SPEND_LIMIT_OVERRIDE_REQUIRED:
    'Daily spend limit exceeded. Allow once and confirm with password.',
  LARGE_SEND_ACK_REQUIRED:
    'Large send acknowledgment required (more than half of confirmed balance).',
};

export class SendError extends Error {
  readonly code: SendErrorCode;

  constructor(code: SendErrorCode, message?: string) {
    super(message ?? SEND_MESSAGES[code]);
    this.name = 'SendError';
    this.code = code;
  }
}

export function isSendError(err: unknown): err is SendError {
  return err instanceof SendError;
}
