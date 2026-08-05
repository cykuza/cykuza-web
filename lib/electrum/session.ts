/**
 * Long-lived browser Electrum session: connect by capability profile,
 * own health monitoring, failover on indexing failures for tx_get methods.
 */

import { ElectrumClient } from '@/lib/wallet/electrum';
import { CircuitBreaker } from './circuit';
import {
  ElectrumError,
  methodRequiresTxGet,
  toElectrumError,
} from './errors';
import { probeCapability } from './probe';
import type { Capability, CapabilityProfile } from './types';

const CONNECT_TIMEOUT_MS = 10_000;
const HEALTH_POLL_MS = 5_000;
const RECONNECT_DELAY_MS = 2_000;

export type ElectrumSessionOptions = {
  urls: string[];
  profile: CapabilityProfile;
  scripthash?: string;
  circuit?: CircuitBreaker;
  /** Invoked when the live socket drops; consumer typically calls connect(true). */
  onConnectionLost?: () => void;
};

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

export class ElectrumSession {
  private readonly urls: string[];
  private readonly profile: CapabilityProfile;
  private readonly scripthash?: string;
  private readonly circuit: CircuitBreaker;
  private readonly onConnectionLost?: () => void;

  private client: ElectrumClient | null = null;
  private url: string | null = null;
  private serverIndex = 0;
  private capabilities = new Set<Capability>();
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private connectInFlight: Promise<void> | null = null;

  constructor(options: ElectrumSessionOptions) {
    if (options.urls.length === 0) {
      throw ElectrumError.config('No ElectrumX servers configured');
    }
    if (
      options.profile.required.includes('scripthash') ||
      options.profile.optional?.includes('scripthash')
    ) {
      if (!options.scripthash) {
        throw ElectrumError.config('scripthash is required for this capability profile');
      }
    }

    this.urls = options.urls;
    this.profile = options.profile;
    this.scripthash = options.scripthash;
    this.circuit = options.circuit ?? new CircuitBreaker();
    this.onConnectionLost = options.onConnectionLost;
  }

  get connected(): boolean {
    return !!this.client?.connected;
  }

  get currentUrl(): string | null {
    return this.url;
  }

  get currentIndex(): number {
    return this.serverIndex;
  }

  get serverUrls(): readonly string[] {
    return this.urls;
  }

  /** Typed wallet/explorer RPC surface when connected. */
  get electrum(): ElectrumClient | null {
    return this.client;
  }

  has(capability: Capability): boolean {
    return this.capabilities.has(capability);
  }

  /**
   * Establish a session that satisfies the required profile.
   * @param rotate when true, start from the next URL in the pool
   */
  async connect(rotate = false): Promise<void> {
    if (this.disposed) {
      throw ElectrumError.transport('Electrum session is disposed');
    }
    if (this.connectInFlight) {
      return this.connectInFlight;
    }

    this.connectInFlight = this.connectInternal(rotate).finally(() => {
      this.connectInFlight = null;
    });
    return this.connectInFlight;
  }

  async call(method: string, params: unknown[] = []): Promise<unknown> {
    if (!this.client?.connected) {
      await this.connect(false);
    }
    if (!this.client?.connected || !this.url) {
      throw ElectrumError.transport('Not connected to Electrum server');
    }

    const activeUrl = this.url;
    const activeClient = this.client;

    try {
      const result = await activeClient.call(method, params);
      this.circuit.succeed(activeUrl);
      return result;
    } catch (err) {
      const e = toElectrumError(err);

      if (e.isIndexingUnavailable) {
        this.capabilities.delete('tx_get');
        this.circuit.fail(activeUrl, true);

        if (methodRequiresTxGet(method) || this.profile.required.includes('tx_get')) {
          await this.connect(true);
          if (!this.client?.connected) {
            throw ElectrumError.indexingUnavailable(undefined, e);
          }
          return this.client.call(method, params);
        }
      } else if (e.isTransport) {
        this.circuit.fail(activeUrl, true);
      }

      throw e;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
    this.teardownClient();
  }

  private async connectInternal(rotate: boolean): Promise<void> {
    this.clearTimers();
    this.teardownClient();

    const start = rotate
      ? (this.serverIndex + 1) % this.urls.length
      : this.serverIndex;

    let lastError: ElectrumError | null = null;
    let attempted = 0;

    for (let i = 0; i < this.urls.length; i++) {
      if (this.disposed) {
        throw ElectrumError.transport('Electrum session is disposed');
      }

      const index = (start + i) % this.urls.length;
      const url = this.urls[index];

      if (!this.circuit.beginAttempt(url)) {
        continue;
      }
      attempted++;

      const client = new ElectrumClient();
      try {
        await withTimeout(
          client.connect(url),
          CONNECT_TIMEOUT_MS,
          'Connection timeout'
        );

        const call = (method: string, params: unknown[] = []) =>
          client.call(method, params);

        const caps = new Set<Capability>();

        for (const cap of this.profile.required) {
          await probeCapability(call, cap, this.scripthash);
          caps.add(cap);
        }

        for (const cap of this.profile.optional ?? []) {
          if (caps.has(cap)) continue;
          try {
            await probeCapability(call, cap, this.scripthash);
            caps.add(cap);
          } catch {
            // optional: session remains valid without this capability
          }
        }

        this.circuit.succeed(url);
        this.client = client;
        this.url = url;
        this.serverIndex = index;
        this.capabilities = caps;
        this.startHealthMonitor(client);
        return;
      } catch (err) {
        lastError = toElectrumError(err);
        try {
          client.disconnect();
        } catch {
          // ignore
        }
        this.circuit.fail(url, lastError.isIndexingUnavailable || lastError.isTransport);
      }
    }

    if (attempted === 0) {
      throw ElectrumError.transport(
        'All Electrum backends temporarily unavailable (circuit open). Retry shortly.'
      );
    }

    throw lastError ?? ElectrumError.transport('Failed to connect to any Electrum server');
  }

  private startHealthMonitor(client: ElectrumClient): void {
    this.clearTimers();
    this.healthTimer = setInterval(() => {
      if (this.disposed) {
        this.clearTimers();
        return;
      }
      if (!client.connected) {
        this.clearTimers();
        this.teardownClient();
        this.reconnectTimer = setTimeout(() => {
          this.onConnectionLost?.();
        }, RECONNECT_DELAY_MS);
      }
    }, HEALTH_POLL_MS);
  }

  private clearTimers(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownClient(): void {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        // ignore
      }
    }
    this.client = null;
    this.url = null;
    this.capabilities = new Set();
  }
}
