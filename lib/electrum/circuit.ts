/**
 * Per-endpoint circuit breaker.
 * `canAttempt` is a pure read; `beginAttempt` acquires a half-open slot.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

const DEFAULT_COOLDOWN_MS = 45_000;

export class CircuitBreaker {
  private readonly openedAt = new Map<string, number>();
  private readonly halfOpenInFlight = new Set<string>();

  constructor(private readonly cooldownMs = DEFAULT_COOLDOWN_MS) {}

  state(url: string, now = Date.now()): CircuitState {
    const opened = this.openedAt.get(url);
    if (opened == null) return 'closed';
    if (now - opened >= this.cooldownMs) return 'half-open';
    return 'open';
  }

  /** Pure: whether an attempt may be started. */
  canAttempt(url: string, now = Date.now()): boolean {
    const s = this.state(url, now);
    if (s === 'closed') return true;
    if (s === 'open') return false;
    return !this.halfOpenInFlight.has(url);
  }

  /** Acquire attempt slot (half-open allows one concurrent try). */
  beginAttempt(url: string, now = Date.now()): boolean {
    if (!this.canAttempt(url, now)) return false;
    if (this.state(url, now) === 'half-open') {
      this.halfOpenInFlight.add(url);
    }
    return true;
  }

  succeed(url: string): void {
    this.openedAt.delete(url);
    this.halfOpenInFlight.delete(url);
  }

  fail(url: string, openCircuit = true): void {
    this.halfOpenInFlight.delete(url);
    if (openCircuit) {
      this.openedAt.set(url, Date.now());
    }
  }
}

let sharedBreaker: CircuitBreaker | null = null;

export function getSharedCircuitBreaker(): CircuitBreaker {
  if (!sharedBreaker) sharedBreaker = new CircuitBreaker();
  return sharedBreaker;
}
