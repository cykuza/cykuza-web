/**
 * Typed ElectrumX RPC surface for server code.
 * Each function validates the protocol response so callers never handle `unknown`.
 */

import { ElectrumError } from './errors';
import { callElectrumX } from './pool';
import type {
  ChainTip,
  ElectrumXTransaction,
  ScripthashBalance,
  ScripthashHistoryEntry,
} from './protocol';
import type { ElectrumNetwork } from './types';

const TXID_PATTERN = /^[a-fA-F0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export async function getChainTip(network: ElectrumNetwork): Promise<ChainTip> {
  const tip = await callElectrumX(network, 'blockchain.headers.subscribe', []);

  if (typeof tip === 'number' && Number.isFinite(tip)) {
    return { height: tip, headerHex: '' };
  }

  if (isRecord(tip) && typeof tip.height === 'number') {
    return {
      height: tip.height,
      headerHex: typeof tip.hex === 'string' ? tip.hex : '',
      difficulty: typeof tip.difficulty === 'number' ? tip.difficulty : undefined,
    };
  }

  throw ElectrumError.protocol('Invalid response from blockchain.headers.subscribe');
}

/**
 * Block header hex. ElectrumX returns a hex string, or `{ hex }` when a
 * checkpoint height is requested.
 */
export async function getBlockHeaderHex(
  network: ElectrumNetwork,
  height: number
): Promise<string> {
  const header = await callElectrumX(network, 'blockchain.block.header', [height]);

  if (typeof header === 'string') return header;
  if (isRecord(header) && typeof header.hex === 'string') return header.hex;

  throw ElectrumError.protocol('Invalid response from blockchain.block.header');
}

export async function getTxidFromPos(
  network: ElectrumNetwork,
  height: number,
  position: number
): Promise<string> {
  const txid = await callElectrumX(network, 'blockchain.transaction.id_from_pos', [
    height,
    position,
    false,
  ]);

  if (typeof txid !== 'string' || !TXID_PATTERN.test(txid)) {
    throw ElectrumError.protocol('Invalid response from blockchain.transaction.id_from_pos');
  }
  return txid;
}

export async function getTransaction(
  network: ElectrumNetwork,
  txid: string
): Promise<ElectrumXTransaction> {
  const tx = await callElectrumX(network, 'blockchain.transaction.get', [txid, true]);

  if (!isRecord(tx)) {
    throw ElectrumError.protocol('Invalid response from blockchain.transaction.get');
  }
  return tx as ElectrumXTransaction;
}

export async function getScripthashBalance(
  network: ElectrumNetwork,
  scripthash: string
): Promise<ScripthashBalance> {
  const balance = await callElectrumX(network, 'blockchain.scripthash.get_balance', [
    scripthash,
  ]);

  if (!isRecord(balance) || typeof balance.confirmed !== 'number') {
    throw ElectrumError.protocol('Invalid response from blockchain.scripthash.get_balance');
  }

  return {
    confirmed: balance.confirmed,
    unconfirmed: typeof balance.unconfirmed === 'number' ? balance.unconfirmed : 0,
  };
}

function toHistoryEntries(value: unknown): ScripthashHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ScripthashHistoryEntry =>
      isRecord(entry) && typeof entry.tx_hash === 'string'
  );
}

export async function getScripthashHistory(
  network: ElectrumNetwork,
  scripthash: string
): Promise<ScripthashHistoryEntry[]> {
  return toHistoryEntries(
    await callElectrumX(network, 'blockchain.scripthash.get_history', [scripthash])
  );
}

export async function getScripthashMempool(
  network: ElectrumNetwork,
  scripthash: string
): Promise<ScripthashHistoryEntry[]> {
  return toHistoryEntries(
    await callElectrumX(network, 'blockchain.scripthash.get_mempool', [scripthash])
  );
}
