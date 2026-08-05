/**
 * Browser-side Electrum connect with capability probes + circuit awareness.
 */

import { ElectrumClient } from '@/lib/wallet/electrum';
import { CircuitBreaker } from './circuit';
import { isIndexingUnavailable, errorMessage } from './errors';
import {
  Capability,
  hasAllCapabilities,
  probeScripthashCapability,
  probeTxGetCapability,
} from './probe';

export type ConnectResult = {
  client: ElectrumClient;
  url: string;
  index: number;
  capabilities: Set<Capability>;
};

export type ConnectOptions = {
  urls: string[];
  startIndex?: number;
  required: readonly Capability[];
  /** Required when 'scripthash' is in required */
  scripthash?: string;
  circuit: CircuitBreaker;
  connectTimeoutMs?: number;
};

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Try servers in order until one satisfies required capabilities.
 * Records circuit success/failure per URL.
 */
export async function connectWithCapabilities(
  options: ConnectOptions
): Promise<ConnectResult> {
  const {
    urls,
    startIndex = 0,
    required,
    scripthash,
    circuit,
    connectTimeoutMs = 10_000,
  } = options;

  if (urls.length === 0) {
    throw new Error('No ElectrumX servers configured');
  }

  if (required.includes('scripthash') && !scripthash) {
    throw new Error('scripthash is required for scripthash capability probe');
  }

  let lastError: Error | null = null;
  let attempted = 0;

  for (let i = 0; i < urls.length; i++) {
    const index = (startIndex + i) % urls.length;
    const url = urls[index];

    if (!circuit.allow(url)) {
      continue;
    }
    attempted++;

    const client = new ElectrumClient();
    try {
      await withTimeout(client.connect(url), connectTimeoutMs, 'Connection timeout');

      const version = await client.serverVersion();
      const protocol = parseFloat(version[1]);
      if (Number.isNaN(protocol) || protocol < 1.4) {
        throw new Error('Electrum server protocol too old. Require >=1.4');
      }

      const caps = new Set<Capability>(['transport']);
      const call = (method: string, params: unknown[] = []) => client.call(method, params);

      if (required.includes('headers') || required.includes('tx_get')) {
        await probeTxGetCapability(call);
        caps.add('headers');
        caps.add('tx_get');
      }

      if (required.includes('scripthash') && scripthash) {
        await probeScripthashCapability(call, scripthash);
        caps.add('scripthash');
      }

      if (!hasAllCapabilities(caps, required)) {
        throw new Error(
          `Server missing capabilities: need [${required.join(', ')}], have [${[...caps].join(', ')}]`
        );
      }

      circuit.recordSuccess(url);
      return { client, url, index, capabilities: caps };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(errorMessage(err));
      try {
        client.disconnect();
      } catch {
        // ignore
      }
      if (isIndexingUnavailable(err)) {
        circuit.open(url);
      } else {
        circuit.recordFailure(url);
      }
    }
  }

  if (attempted === 0) {
    throw new Error(
      'All Electrum backends temporarily unavailable (circuit open). Retry shortly.'
    );
  }

  throw lastError || new Error('Failed to connect to any Electrum server');
}

/**
 * Execute a call; on indexing outage open circuit and optionally failover once.
 */
export async function callWithIndexingFailover<T>(args: {
  call: () => Promise<T>;
  url: string;
  circuit: CircuitBreaker;
  onIndexingFailover?: () => Promise<T>;
}): Promise<T> {
  try {
    const result = await args.call();
    args.circuit.recordSuccess(args.url);
    return result;
  } catch (err) {
    if (isIndexingUnavailable(err)) {
      args.circuit.open(args.url);
      if (args.onIndexingFailover) {
        return args.onIndexingFailover();
      }
    }
    throw err;
  }
}
