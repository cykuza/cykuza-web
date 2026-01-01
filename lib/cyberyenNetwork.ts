import { Network } from 'bitcoinjs-lib';

/**
 * Cyberyen network parameters
 * Based on Litecoin v0.21 fork with MWEB support
 */
export const cyberyenNetwork: Network = {
  messagePrefix: '\x19Cyberyen Signed Message:\n',
  bech32: 'cy',
  bip32: {
    public: 0x0188b21e,
    private: 0x0188ade4,
  },
  pubKeyHash: 0x1c, // Cyberyen mainnet (Litecoin uses 0x30)
  scriptHash: 0x16, // Cyberyen P2SH (Litecoin uses 0x32)
  wif: 0x9c,
};

export const cyberyenTestnet: Network = {
  messagePrefix: '\x19Cyberyen Testnet Signed Message:\n',
  bech32: 'tcyb',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x70,
  scriptHash: 0x3a,
  wif: 0xc4,
};

export type NetworkType = 'mainnet' | 'testnet';

export function getNetwork(networkType: NetworkType): Network {
  if (networkType === 'testnet') {
    return cyberyenTestnet;
  }
  return cyberyenNetwork;
}












