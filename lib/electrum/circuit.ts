/**
 * Per-endpoint circuit breaker for Electrum backends.
 * open → skip until cooldown; half-open → one probe/attempt allowed.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export type CircuitSnapshot = {
  state: CircuitState;
  openedAt: number | null;
  failures: number;
};

const DEFAULT_COOLDOWN_MS = 45_000;
const DEFAULT_FAILURES_TO_OPEN = 1;

export class CircuitBreaker {
  private readonly openedAt = new Map<string, number>();
  private readonly failures = new Map<string, number>();
  private readonly halfOpenProbe = new Map<string, boolean>();

  constructor(
    private readonly cooldownMs = DEFAULT_COOLDOWN_MS,
    private readonly failuresToOpen = DEFAULT_FAILURES_TO_OPEN
  ) {}

  snapshot(url: string): CircuitSnapshot {
    return {
      state: this.state(url),
      openedAt: this.openedAt.get(url) ?? null,
      failures: this.failures.get(url) ?? 0,
    };
  }

  state(url: string): CircuitState {
    const opened = this.openedAt.get(url);
    if (opened == null) return 'closed';

    const elapsed = Date.now() - opened;
    if (elapsed >= this.cooldownMs) {
      return 'half-open';
    }
    return 'open';
  }

  /** Whether this endpoint may be selected for a new attempt. */
  allow(url: string): boolean {
    const s = this.state(url);
    if (s === 'closed') return true;
    if (s === 'open') return false;
    // half-open: allow a single concurrent probe
    if (this.halfOpenProbe.get(url)) return false;
    this.halfOpenProbe.set(url, true);
    return true;
  }

  recordSuccess(url: string): void {
    this.openedAt.delete(url);
    this.failures.delete(url);
    this.halfOpenProbe.delete(url);
  }

  recordFailure(url: string): void {
    const next = (this.failures.get(url) ?? 0) + 1;
    this.failures.set(url, next);
    this.halfOpenProbe.delete(url);
    if (next >= this.failuresToOpen) {
      this.openedAt.set(url, Date.now());
    }
  }

  /** Force open (e.g. confirmed indexing outage). */
  open(url: string): void {
    this.failures.set(url, this.failuresToOpen);
    this.openedAt.set(url, Date.now());
    this.halfOpenProbe.delete(url);
  }
}

/** Process-wide breaker shared by API routes (server) and useful for tests. */
let sharedBreaker: CircuitBreaker | null = null;

export function getSharedCircuitBreaker(): CircuitBreaker {
  if (!sharedBreaker) {
    sharedBreaker = new CircuitBreaker();
  }
  return sharedBreaker;
}
