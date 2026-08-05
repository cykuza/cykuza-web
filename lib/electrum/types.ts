export type ElectrumNetwork = 'mainnet' | 'testnet';

/** Data-plane capabilities a backend may advertise after probing. */
export type Capability = 'transport' | 'tx_get' | 'scripthash';

/**
 * Required caps must succeed for connect.
 * Optional caps are probed after connect; failure does not reject the session.
 */
export type CapabilityProfile = {
  required: readonly Capability[];
  optional?: readonly Capability[];
};

export const EXPLORER_PROFILE: CapabilityProfile = {
  required: ['transport', 'tx_get'],
};

export const WALLET_PROFILE: CapabilityProfile = {
  required: ['transport', 'scripthash'],
  optional: ['tx_get'],
};

export type ElectrumCall = (method: string, params?: unknown[]) => Promise<unknown>;
