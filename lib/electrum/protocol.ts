/**
 * Shapes returned by the ElectrumX protocol.
 * Owned by the protocol layer; UI parsers consume these types.
 */

export interface ElectrumXInput {
  txid?: string;
  vout?: number;
  prevout_hash?: string;
  prevout_n?: number;
  scriptSig?: { hex?: string; asm?: string };
  script_sig?: string;
  sequence?: number;
  coinbase?: string | null;
  address?: string;
  value?: number;
  prevout?: {
    value?: number;
    scriptPubKey?: {
      hex?: string;
      addresses?: string[];
    };
  };
}

export interface ElectrumXOutput {
  value?: number;
  n?: number;
  scriptPubKey?: {
    hex?: string;
    addresses?: string[];
    type?: string;
  };
  script_pubkey?: string;
  address?: string;
}

export interface ElectrumXMwebExtension {
  inputs?: Array<{ commitment: string }>;
  outputs?: Array<{ commitment: string; value?: number }>;
  kernel_offset?: number;
  kernel?: string;
}

export interface ElectrumXTransaction {
  txid?: string;
  hash?: string;
  version?: number;
  size?: number;
  vsize?: number;
  weight?: number;
  locktime?: number;
  vin?: ElectrumXInput[];
  vout?: ElectrumXOutput[];
  mweb_extension?: ElectrumXMwebExtension | null;
  fee?: number;
  hex?: string;
  blockhash?: string;
  blocktime?: number;
  time?: number;
  confirmations?: number;
  height?: number;
}

/** Normalized result of blockchain.headers.subscribe. */
export interface ChainTip {
  height: number;
  headerHex: string;
  difficulty?: number;
}

export interface ScripthashBalance {
  confirmed: number;
  unconfirmed: number;
}

export interface ScripthashHistoryEntry {
  tx_hash: string;
  height: number;
  fee?: number;
}
