/**
 * Trust banner mapping — UI renders only; policy lives in electrumTrust.
 */

import type { ElectrumTrustLevel } from './electrumTrust';
import { electrumTrustMessage } from './electrumTrust';

export type TrustBannerTone = 'warn' | 'danger';

export type TrustBanner = {
  tone: TrustBannerTone;
  message: string;
};

export function trustBanner(
  level: ElectrumTrustLevel,
  network: 'mainnet' | 'testnet' = 'mainnet'
): TrustBanner | null {
  if (level === 'unconfigured') {
    return {
      tone: 'danger',
      message:
        network === 'testnet'
          ? 'Testnet has no default Electrum servers. Open Network settings and add a custom wss:// endpoint.'
          : 'No Electrum endpoints configured. Open Network settings and add a custom wss:// endpoint.',
    };
  }
  if (level === 'verify_off') {
    return {
      tone: 'danger',
      message:
        electrumTrustMessage('verify_off') ??
        'Enable dual-server verify before Refresh or Send.',
    };
  }
  if (level === 'degraded') {
    return {
      tone: 'danger',
      message:
        electrumTrustMessage('degraded') ??
        'Dual-server verify needs two reachable Electrum endpoints.',
    };
  }
  if (level === 'single') {
    return {
      tone: 'warn',
      message:
        'Only one Electrum endpoint is configured. The server can see your addresses and may lie about balances — add a second host and enable verify for stronger protection.',
    };
  }
  return null;
}
