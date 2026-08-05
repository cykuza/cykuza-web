import type { Capability, ElectrumCall } from './types';
import { ElectrumError } from './errors';

const TIP_CONFIRMATION_DEPTH = 6;

function tipHeight(tip: unknown): number {
  if (tip && typeof tip === 'object' && 'height' in tip) {
    const h = (tip as { height: unknown }).height;
    if (typeof h === 'number' && Number.isFinite(h)) return h;
  }
  if (typeof tip === 'number' && Number.isFinite(tip)) return tip;
  throw ElectrumError.protocol('Invalid tip from blockchain.headers.subscribe');
}

/**
 * Tip-derived confirmation that confirmed transaction.get works (no hardcoded txid).
 */
export async function probeTxGet(call: ElectrumCall): Promise<void> {
  const tip = await call('blockchain.headers.subscribe', []);
  const height = tipHeight(tip);
  const probeHeight = Math.max(1, height - TIP_CONFIRMATION_DEPTH);

  const txid = await call('blockchain.transaction.id_from_pos', [
    probeHeight,
    0,
    false,
  ]);

  if (typeof txid !== 'string' || txid.length < 64) {
    throw ElectrumError.protocol('Invalid txid from blockchain.transaction.id_from_pos');
  }

  const tx = await call('blockchain.transaction.get', [txid, true]);
  if (!tx || (typeof tx !== 'object' && typeof tx !== 'string')) {
    throw ElectrumError.protocol('Invalid response from blockchain.transaction.get');
  }
}

export async function probeScripthash(
  call: ElectrumCall,
  scripthash: string
): Promise<void> {
  const bal = await call('blockchain.scripthash.get_balance', [scripthash]);
  if (!bal || typeof bal !== 'object') {
    throw ElectrumError.protocol('Invalid response from blockchain.scripthash.get_balance');
  }
}

export async function assertMinProtocol(
  call: ElectrumCall,
  clientName = 'cykuza'
): Promise<void> {
  const version = (await call('server.version', [clientName, '1.4'])) as [string, string];
  const protocol = parseFloat(version?.[1]);
  if (Number.isNaN(protocol) || protocol < 1.4) {
    throw ElectrumError.protocol('Electrum server protocol too old. Require >=1.4');
  }
}

export async function probeCapability(
  call: ElectrumCall,
  capability: Capability,
  scripthash?: string
): Promise<void> {
  switch (capability) {
    case 'transport':
      await assertMinProtocol(call);
      return;
    case 'tx_get':
      await probeTxGet(call);
      return;
    case 'scripthash':
      if (!scripthash) {
        throw ElectrumError.config('scripthash is required to probe scripthash capability');
      }
      await probeScripthash(call, scripthash);
      return;
    default: {
      const _exhaustive: never = capability;
      throw ElectrumError.protocol(`Unknown capability: ${_exhaustive}`);
    }
  }
}
