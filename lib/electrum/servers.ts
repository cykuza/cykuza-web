import type { ElectrumNetwork } from './types';
import { ElectrumError } from './errors';

export function getElectrumServerUrls(network: ElectrumNetwork): string[] {
  const envVar =
    network === 'mainnet'
      ? process.env.NEXT_PUBLIC_ELECTRUMX_MAINNET
      : process.env.NEXT_PUBLIC_ELECTRUMX_TESTNET;

  if (!envVar?.trim()) return [];

  return envVar
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function electrumEnvVarName(network: ElectrumNetwork): string {
  return network === 'mainnet'
    ? 'NEXT_PUBLIC_ELECTRUMX_MAINNET'
    : 'NEXT_PUBLIC_ELECTRUMX_TESTNET';
}

export function requireElectrumServerUrls(network: ElectrumNetwork): string[] {
  const urls = getElectrumServerUrls(network);
  if (urls.length === 0) {
    throw ElectrumError.config(
      `ElectrumX server URL is not configured. Set ${electrumEnvVarName(network)} ` +
        `(example: wss://your-server:50004).`
    );
  }
  return urls;
}
