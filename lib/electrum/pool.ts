/**
 * Server-side Electrum pool for API routes.
 * Shared circuit + tip-probe; reusable sockets outside serverless.
 */

import { ElectrumClient } from '@/lib/wallet/electrum';
import { CircuitBreaker, getSharedCircuitBreaker } from './circuit';
import {
  ElectrumError,
  methodRequiresTxGet,
  toElectrumError,
} from './errors';
import { probeCapability } from './probe';
import { requireElectrumServerUrls } from './servers';
import type { ElectrumNetwork } from './types';

const CONNECT_TIMEOUT_MS = 10_000;

function isServerless(): boolean {
  return !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AZURE_FUNCTIONS_ENVIRONMENT
  );
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(ElectrumError.transport(label)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class ElectrumPool {
  private readonly idle = new Map<string, ElectrumClient>();
  private readonly verifiedTransport = new Set<string>();
  private readonly verifiedTxGet = new Set<string>();
  private readonly circuit: CircuitBreaker;

  constructor(circuit = getSharedCircuitBreaker()) {
    this.circuit = circuit;
  }

  async call(
    network: ElectrumNetwork,
    method: string,
    params: unknown[] = []
  ): Promise<unknown> {
    const urls = requireElectrumServerUrls(network);
    const needsTxGet = methodRequiresTxGet(method);

    let lastError: ElectrumError | null = null;
    let attempted = 0;

    for (const url of urls) {
      if (!this.circuit.beginAttempt(url)) continue;
      attempted++;

      let client: ElectrumClient | null = null;

      try {
        client = await this.checkout(url);
        const rpc = (m: string, p: unknown[] = []) => client!.call(m, p);

        if (!this.verifiedTransport.has(url)) {
          await probeCapability(rpc, 'transport');
          this.verifiedTransport.add(url);
        }

        if (needsTxGet && !this.verifiedTxGet.has(url)) {
          await probeCapability(rpc, 'tx_get');
          this.verifiedTxGet.add(url);
        }

        const result = await client.call(method, params);
        this.circuit.succeed(url);
        this.checkin(url, client);
        return result;
      } catch (err) {
        lastError = toElectrumError(err);
        this.verifiedTransport.delete(url);
        this.verifiedTxGet.delete(url);
        if (client) this.discard(url, client);
        this.circuit.fail(
          url,
          lastError.isIndexingUnavailable || lastError.isTransport
        );
      }
    }

    if (attempted === 0) {
      throw ElectrumError.transport(
        'All Electrum backends temporarily unavailable (circuit open). Retry shortly.'
      );
    }

    if (lastError?.isIndexingUnavailable) {
      throw ElectrumError.indexingUnavailable(undefined, lastError);
    }

    throw (
      lastError ??
      ElectrumError.transport('Failed to call ElectrumX on all configured servers')
    );
  }

  private async checkout(url: string): Promise<ElectrumClient> {
    if (!isServerless()) {
      const existing = this.idle.get(url);
      if (existing) {
        this.idle.delete(url);
        if (existing.connected) return existing;
        try {
          existing.disconnect();
        } catch {
          // ignore
        }
        this.verifiedTransport.delete(url);
        this.verifiedTxGet.delete(url);
      }
    }

    const client = new ElectrumClient();
    await withTimeout(
      client.connect(url),
      CONNECT_TIMEOUT_MS,
      'WebSocket connection timeout'
    );
    return client;
  }

  private checkin(url: string, client: ElectrumClient): void {
    if (isServerless() || !client.connected) {
      this.discard(url, client);
      return;
    }
    this.idle.set(url, client);
  }

  private discard(url: string, client: ElectrumClient): void {
    this.idle.delete(url);
    try {
      client.disconnect();
    } catch {
      // ignore
    }
  }
}

let pool: ElectrumPool | null = null;

function getPool(): ElectrumPool {
  if (!pool) pool = new ElectrumPool();
  return pool;
}

export async function callElectrumX(
  network: ElectrumNetwork,
  method: string,
  params: unknown[] = []
): Promise<unknown> {
  return getPool().call(network, method, params);
}
