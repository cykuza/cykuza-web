/**
 * Electrum / daemon error taxonomy for capability routing.
 * IndexingUnavailable = daemon cannot serve confirmed txs (txindex down / warmup).
 */

export type ElectrumFailureKind =
  | 'indexing_unavailable'
  | 'not_found'
  | 'transport'
  | 'timeout'
  | 'unknown';

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err ?? 'Unknown error');
}

export function isIndexingUnavailable(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes('daemonerror') ||
    msg.includes('no such mempool transaction') ||
    msg.includes('use -txindex') ||
    msg.includes('provide a block hash to enable blockchain transaction') ||
    (msg.includes('daemon error') && msg.includes('txindex'))
  );
}

export function isTransportFailure(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes('websocket') ||
    msg.includes('disconnected') ||
    msg.includes('not connected') ||
    msg.includes('connection timeout') ||
    msg.includes('connection closed') ||
    msg.includes('connection reset')
  );
}

export function isTimeoutFailure(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return msg.includes('timed out') || msg.includes('timeout');
}

export function classifyElectrumFailure(err: unknown): ElectrumFailureKind {
  if (isIndexingUnavailable(err)) return 'indexing_unavailable';
  if (isTimeoutFailure(err)) return 'timeout';
  if (isTransportFailure(err)) return 'transport';

  const msg = errorMessage(err).toLowerCase();
  if (msg.includes('no such mempool or blockchain transaction')) {
    return 'not_found';
  }
  return 'unknown';
}

/** User-facing message for explorer when backend index is down. */
export function indexingUnavailableMessage(): string {
  return 'Backend indexing temporarily unavailable. Try another server or retry shortly.';
}
