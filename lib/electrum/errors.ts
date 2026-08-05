/**
 * Typed Electrum / daemon failures — routing uses `kind`, not string scraping at call sites.
 */

export type ElectrumFailureKind =
  | 'indexing_unavailable'
  | 'not_found'
  | 'transport'
  | 'timeout'
  | 'protocol'
  | 'config'
  | 'unknown';

export class ElectrumError extends Error {
  readonly kind: ElectrumFailureKind;
  readonly cause?: unknown;

  constructor(kind: ElectrumFailureKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'ElectrumError';
    this.kind = kind;
    this.cause = cause;
  }

  get isIndexingUnavailable(): boolean {
    return this.kind === 'indexing_unavailable';
  }

  get isTransport(): boolean {
    return this.kind === 'transport' || this.kind === 'timeout';
  }

  static indexingUnavailable(message?: string, cause?: unknown): ElectrumError {
    return new ElectrumError(
      'indexing_unavailable',
      message ||
        'Backend indexing temporarily unavailable. Try another server or retry shortly.',
      cause
    );
  }

  static transport(message: string, cause?: unknown): ElectrumError {
    return new ElectrumError('transport', message, cause);
  }

  static config(message: string): ElectrumError {
    return new ElectrumError('config', message);
  }

  static protocol(message: string, cause?: unknown): ElectrumError {
    return new ElectrumError('protocol', message, cause);
  }
}

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err ?? 'Unknown error');
}

/** Normalize any thrown value into ElectrumError. */
export function toElectrumError(err: unknown): ElectrumError {
  if (err instanceof ElectrumError) return err;

  const msg = rawMessage(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes('daemonerror') ||
    lower.includes('no such mempool transaction') ||
    lower.includes('use -txindex') ||
    lower.includes('provide a block hash to enable blockchain transaction') ||
    (lower.includes('daemon error') && lower.includes('txindex'))
  ) {
    return ElectrumError.indexingUnavailable(undefined, err);
  }

  if (lower.includes('no such mempool or blockchain transaction')) {
    return new ElectrumError('not_found', msg, err);
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return new ElectrumError('timeout', msg, err);
  }

  if (
    lower.includes('websocket') ||
    lower.includes('disconnected') ||
    lower.includes('not connected') ||
    lower.includes('connection closed') ||
    lower.includes('connection reset') ||
    lower.includes('connection refused') ||
    lower.includes('econnrefused')
  ) {
    return ElectrumError.transport(msg, err);
  }

  if (lower.includes('protocol too old')) {
    return ElectrumError.protocol(msg, err);
  }

  return new ElectrumError('unknown', msg, err);
}

/** Methods that require a working daemon txindex / confirmed-tx data plane. */
export function methodRequiresTxGet(method: string): boolean {
  return (
    method === 'blockchain.transaction.get' ||
    method === 'blockchain.transaction.get_merkle'
  );
}
