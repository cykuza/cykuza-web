/**
 * Tip-derived data-plane probes — no hardcoded txids.
 */

export type ElectrumCall = (method: string, params?: unknown[]) => Promise<unknown>;

export type Capability = 'transport' | 'headers' | 'tx_get' | 'scripthash';

const TIP_DEPTH = 6;

function tipHeight(tip: unknown): number {
  if (tip && typeof tip === 'object' && 'height' in tip) {
    const h = (tip as { height: unknown }).height;
    if (typeof h === 'number' && Number.isFinite(h)) return h;
  }
  if (typeof tip === 'number' && Number.isFinite(tip)) return tip;
  throw new Error('Invalid tip from blockchain.headers.subscribe');
}

/**
 * Verify headers + confirmed transaction.get via a recent block's coinbase.
 */
export async function probeTxGetCapability(call: ElectrumCall): Promise<{
  height: number;
  txid: string;
}> {
  const tip = await call('blockchain.headers.subscribe', []);
  const height = tipHeight(tip);
  const probeHeight = Math.max(1, height - TIP_DEPTH);

  const txid = await call('blockchain.transaction.id_from_pos', [
    probeHeight,
    0,
    false,
  ]);

  if (typeof txid !== 'string' || txid.length < 64) {
    throw new Error('Invalid txid from blockchain.transaction.id_from_pos');
  }

  const tx = await call('blockchain.transaction.get', [txid, true]);
  if (!tx || (typeof tx !== 'object' && typeof tx !== 'string')) {
    throw new Error('Invalid response from blockchain.transaction.get');
  }

  return { height, txid };
}

/** Headers-only tip check (lighter than full tx_get). */
export async function probeHeadersCapability(call: ElectrumCall): Promise<number> {
  const tip = await call('blockchain.headers.subscribe', []);
  return tipHeight(tip);
}

/** Lightweight scripthash probe (wallet data plane). */
export async function probeScripthashCapability(
  call: ElectrumCall,
  scripthash: string
): Promise<void> {
  const bal = await call('blockchain.scripthash.get_balance', [scripthash]);
  if (!bal || typeof bal !== 'object') {
    throw new Error('Invalid response from blockchain.scripthash.get_balance');
  }
}

export function hasAllCapabilities(
  have: ReadonlySet<Capability>,
  required: readonly Capability[]
): boolean {
  return required.every((c) => have.has(c));
}
