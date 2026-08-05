export type ElectrumNetwork = 'mainnet' | 'testnet';

export function getElectrumServerUrls(network: ElectrumNetwork): string[] {
  const envVar =
    network === 'mainnet'
      ? process.env.NEXT_PUBLIC_ELECTRUMX_MAINNET
      : process.env.NEXT_PUBLIC_ELECTRUMX_TESTNET;

  if (!envVar || envVar.trim() === '') {
    return [];
  }

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
