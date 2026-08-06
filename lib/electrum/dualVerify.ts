/**
 * Dual-server Electrum verify (balance/UTXO fingerprint + broadcast txid).
 * Composes on ElectrumClient — does not rewrite tip-probe / session circuit.
 */

import { ElectrumClient } from '@/lib/wallet/electrum';
import {
  chainFingerprint,
  type BalanceSnapshot,
  type FingerprintUtxo,
} from './fingerprint';

export type ElectrumVerifyCode = 'SERVERS_DISAGREE' | 'VERIFY_FAILED';

export class ElectrumVerifyError extends Error {
  readonly code: ElectrumVerifyCode;

  constructor(code: ElectrumVerifyCode) {
    const message =
      code === 'SERVERS_DISAGREE'
        ? 'Servers disagree — check Electrum config'
        : 'Could not verify with second server';
    super(message);
    this.name = 'ElectrumVerifyError';
    this.code = code;
  }
}

export function dualServerPairs(urls: string[]): Array<[string, string]> {
  if (urls.length < 2) return [];
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < urls.length - 1; i++) {
    pairs.push([urls[i]!, urls[i + 1]!]);
  }
  if (urls.length >= 3) {
    pairs.push([urls[urls.length - 1]!, urls[0]!]);
  }
  return pairs;
}

export type ChainSnapshot = {
  balance: BalanceSnapshot;
  utxos: FingerprintUtxo[];
};

export type DualClient = {
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
  serverVersion: () => Promise<[string, string]>;
  getBalance: (scripthash: string) => Promise<BalanceSnapshot>;
  listUnspent: (
    scripthash: string
  ) => Promise<Array<{ tx_hash: string; tx_pos: number; value: number }>>;
  broadcast: (hex: string) => Promise<string>;
};

function toFingerprintUtxos(
  rows: Array<{ tx_hash: string; tx_pos: number; value: number }>
): FingerprintUtxo[] {
  return rows.map((u) => ({
    txid: u.tx_hash,
    vout: u.tx_pos,
    value: u.value,
  }));
}

async function connectAndProbe(client: DualClient, url: string): Promise<void> {
  await client.connect(url);
  await client.serverVersion();
}

type DualOutcome<T> =
  | { kind: 'ok'; value: T; primaryUrl: string }
  | { kind: 'primary_connect_failed' }
  | { kind: 'verify_failed' }
  | { kind: 'disagree' }
  | { kind: 'primary_rpc_failed'; error: Error };

async function tryDualPair<T>(
  primaryUrl: string,
  secondaryUrl: string,
  createClient: () => DualClient,
  run: (
    primary: DualClient,
    secondary: DualClient
  ) => Promise<
    | { kind: 'ok'; value: T }
    | { kind: 'disagree' }
    | { kind: 'verify_failed' }
    | { kind: 'primary_rpc_failed'; error: Error }
  >
): Promise<DualOutcome<T>> {
  const primary = createClient();
  const secondary = createClient();
  try {
    const connectResults = await Promise.allSettled([
      connectAndProbe(primary, primaryUrl),
      connectAndProbe(secondary, secondaryUrl),
    ]);

    if (connectResults[0].status === 'rejected') {
      return { kind: 'primary_connect_failed' };
    }
    if (connectResults[1].status === 'rejected') {
      return { kind: 'verify_failed' };
    }

    const result = await run(primary, secondary);
    if (result.kind === 'ok') {
      return { kind: 'ok', value: result.value, primaryUrl };
    }
    return result;
  } finally {
    primary.disconnect();
    secondary.disconnect();
  }
}

export function createDefaultDualClient(): DualClient {
  return new ElectrumClient();
}

/**
 * Dual balance+UTXO fingerprint refresh. When verifyEnabled and ≥2 urls:
 * try ordered pairs; primary connect fail rotates; secondary fail / mismatch fail closed.
 * When verify off or <2 urls: fetch from first reachable URL only.
 */
export async function dualVerifyRefresh(
  urls: string[],
  scripthash: string,
  opts: {
    verifyEnabled: boolean;
    createClient?: () => DualClient;
  }
): Promise<{ snapshot: ChainSnapshot; primaryUrl: string }> {
  const createClient = opts.createClient ?? createDefaultDualClient;
  const list = urls.filter(Boolean);

  if (!opts.verifyEnabled || list.length < 2) {
    if (list.length === 0) {
      throw new Error('No Electrum servers configured');
    }
    let lastErr: Error | undefined;
    for (const url of list) {
      const client = createClient();
      try {
        await connectAndProbe(client, url);
        const balance = await client.getBalance(scripthash);
        const rawUtxos = await client.listUnspent(scripthash);
        return {
          snapshot: { balance, utxos: toFingerprintUtxos(rawUtxos) },
          primaryUrl: url,
        };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
      } finally {
        client.disconnect();
      }
    }
    throw lastErr ?? new Error('Could not connect to Electrum');
  }

  let lastPrimaryConnectError: Error | undefined;
  for (const [primaryUrl, secondaryUrl] of dualServerPairs(list)) {
    const outcome = await tryDualPair<ChainSnapshot>(
      primaryUrl,
      secondaryUrl,
      createClient,
      async (primary, secondary) => {
        let primarySnap: ChainSnapshot;
        try {
          const balance = await primary.getBalance(scripthash);
          const rawUtxos = await primary.listUnspent(scripthash);
          primarySnap = { balance, utxos: toFingerprintUtxos(rawUtxos) };
        } catch (err) {
          return {
            kind: 'primary_rpc_failed',
            error: err instanceof Error ? err : new Error(String(err)),
          };
        }
        let secondarySnap: ChainSnapshot;
        try {
          const balance = await secondary.getBalance(scripthash);
          const rawUtxos = await secondary.listUnspent(scripthash);
          secondarySnap = { balance, utxos: toFingerprintUtxos(rawUtxos) };
        } catch {
          return { kind: 'verify_failed' };
        }
        const fpA = chainFingerprint(primarySnap.balance, primarySnap.utxos);
        const fpB = chainFingerprint(secondarySnap.balance, secondarySnap.utxos);
        if (fpA !== fpB) return { kind: 'disagree' };
        return { kind: 'ok', value: primarySnap };
      }
    );

    if (outcome.kind === 'ok') {
      return { snapshot: outcome.value, primaryUrl: outcome.primaryUrl };
    }
    if (outcome.kind === 'primary_connect_failed') {
      lastPrimaryConnectError = new Error('Primary Electrum connect failed');
      continue;
    }
    if (outcome.kind === 'verify_failed') {
      throw new ElectrumVerifyError('VERIFY_FAILED');
    }
    if (outcome.kind === 'disagree') {
      throw new ElectrumVerifyError('SERVERS_DISAGREE');
    }
    if (outcome.kind === 'primary_rpc_failed') {
      throw outcome.error;
    }
  }

  throw lastPrimaryConnectError ?? new Error('Could not connect to Electrum');
}

/**
 * Dual broadcast with matching txid requirement when verify on + ≥2 urls.
 */
export async function dualVerifyBroadcast(
  urls: string[],
  hex: string,
  opts: {
    verifyEnabled: boolean;
    createClient?: () => DualClient;
  }
): Promise<{ txid: string; primaryUrl: string }> {
  const createClient = opts.createClient ?? createDefaultDualClient;
  const list = urls.filter(Boolean);

  if (!opts.verifyEnabled || list.length < 2) {
    if (list.length === 0) {
      throw new Error('No Electrum servers configured');
    }
    let lastErr: Error | undefined;
    for (const url of list) {
      const client = createClient();
      try {
        await connectAndProbe(client, url);
        const txid = await client.broadcast(hex);
        return { txid, primaryUrl: url };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
      } finally {
        client.disconnect();
      }
    }
    throw lastErr ?? new Error('Broadcast failed');
  }

  let lastPrimaryConnectError: Error | undefined;
  for (const [primaryUrl, secondaryUrl] of dualServerPairs(list)) {
    const outcome = await tryDualPair<string>(
      primaryUrl,
      secondaryUrl,
      createClient,
      async (primary, secondary) => {
        let txidA: string;
        try {
          txidA = await primary.broadcast(hex);
        } catch (err) {
          return {
            kind: 'primary_rpc_failed',
            error: err instanceof Error ? err : new Error(String(err)),
          };
        }
        let txidB: string;
        try {
          txidB = await secondary.broadcast(hex);
        } catch {
          return { kind: 'verify_failed' };
        }
        if (txidA !== txidB) return { kind: 'disagree' };
        return { kind: 'ok', value: txidA };
      }
    );

    if (outcome.kind === 'ok') {
      return { txid: outcome.value, primaryUrl: outcome.primaryUrl };
    }
    if (outcome.kind === 'primary_connect_failed') {
      lastPrimaryConnectError = new Error('Primary Electrum connect failed');
      continue;
    }
    if (outcome.kind === 'verify_failed') {
      throw new ElectrumVerifyError('VERIFY_FAILED');
    }
    if (outcome.kind === 'disagree') {
      throw new ElectrumVerifyError('SERVERS_DISAGREE');
    }
    if (outcome.kind === 'primary_rpc_failed') {
      throw outcome.error;
    }
  }

  throw lastPrimaryConnectError ?? new Error('Broadcast failed');
}
