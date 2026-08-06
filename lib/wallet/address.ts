import * as bitcoin from 'bitcoinjs-lib';
import { getNetwork, type NetworkType } from '../cyberyenNetwork';
import { SendError } from './sendErrors';

/**
 * Strict Bech32 address validation for the active Cyberyen network.
 * Accepts only native segwit under the network's bech32 HRP
 * (`cy` mainnet / `tcyb` testnet).
 */
export function assertValidAddress(
  address: string,
  networkType: NetworkType
): void {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new SendError('INVALID_ADDRESS');
  }

  const network = getNetwork(networkType);
  const expectedHrp = network.bech32;
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith(`${expectedHrp}1`)) {
    throw new SendError('INVALID_ADDRESS');
  }

  try {
    bitcoin.address.toOutputScript(trimmed, network);
  } catch {
    throw new SendError('INVALID_ADDRESS');
  }
}

/** Soft check — returns false instead of throwing. */
export function isValidAddress(
  address: string,
  networkType: NetworkType
): boolean {
  try {
    assertValidAddress(address, networkType);
    return true;
  } catch {
    return false;
  }
}
