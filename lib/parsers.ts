import { formatSatoshi, parseBlockHeader } from './utils';
import * as bitcoin from 'bitcoinjs-lib';
import { getNetwork } from './cyberyenNetwork';

export interface MwebInput {
  type: 'mweb_input';
  commitment: string;
  confidential: boolean;
}

export interface MwebOutput {
  type: 'mweb_output';
  commitment: string;
  confidential: boolean;
  value?: number; // Only if revealed
}

export interface RegularInput {
  type: 'regular';
  prevout_hash: string;
  prevout_n: number;
  script_sig: string;
  sequence: number;
  value?: number;
  address?: string;
}

export interface RegularOutput {
  type: 'regular';
  value: number;
  script_pubkey: string;
  address?: string;
  scriptPubKeyType?: string; // Preserve scriptPubKey.type for MWEB detection
}

export type TxInput = RegularInput | MwebInput;
export type TxOutput = RegularOutput | MwebOutput;

export interface ParsedTransaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  inputs: TxInput[];
  outputs: TxOutput[];
  fee?: number;
  isMweb: boolean;
  mwebExtension?: {
    kernel_offset: string;
    outputs: MwebOutput[];
    inputs: MwebInput[];
  };
}

export interface ParsedBlock {
  height: number;
  hash: string;
  version: number;
  prev_hash: string;
  merkle_root: string;
  timestamp: number;
  bits: number;
  nonce: number;
  size: number;
  tx_count: number;
  hasMweb: boolean;
  mwebHeader?: {
    hash: string;
    kernel_offset: string;
    outputs_count: number;
    inputs_count: number;
    stealth_offset?: string;
    num_kernels?: number;
    kernel_root?: string;
    output_root?: string;
    leaf_root?: string;
    inputs?: string[];
    outputs?: string[];
    kernels?: string[];
  };
}

/**
 * Parse transaction from ElectrumX response
 */
/**
 * Extract address from scriptPubKey hex
 */
function extractAddressFromScript(scriptHex: string, networkType: string = 'mainnet'): string | undefined {
  if (!scriptHex) return undefined;
  
  try {
    const network = getNetwork(networkType as 'mainnet' | 'testnet');
    const script = Buffer.from(scriptHex, 'hex');
    return bitcoin.address.fromOutputScript(script, network);
  } catch (error) {
    // Script doesn't match a standard address format
    return undefined;
  }
}

// Type definitions for ElectrumX transaction data
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

interface ElectrumXMwebExtension {
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
}

export function parseTransaction(txData: ElectrumXTransaction, network: string = 'mainnet'): ParsedTransaction {
  // Detect MWEB transaction:
  // 1. ElectrumX returns mweb_extension field when verbose=true (if available)
  // 2. Output has type "witness_mweb_hogaddr" (MWEB output type indicator)
  let isMweb = false;
  if (txData.mweb_extension !== undefined && txData.mweb_extension !== null) {
    isMweb = true;
  } else if (txData.vout && Array.isArray(txData.vout)) {
    // Check if any output has MWEB type
    isMweb = txData.vout.some((out: ElectrumXOutput) => 
      out.scriptPubKey?.type === 'witness_mweb_hogaddr'
    );
  }
  const networkType = network as 'mainnet' | 'testnet';
  
  const inputs: TxInput[] = (txData.vin || []).map((input: ElectrumXInput, index: number) => {
    // Check if this is a coinbase transaction - only if coinbase field exists
    const isCoinbase = input.coinbase !== undefined && input.coinbase !== null;
    
    // For coinbase, prevout_hash should be empty, otherwise use the actual hash
    const prevoutHash = isCoinbase ? '' : (input.txid || input.prevout_hash || '');
    
    // Extract address from previous output if available
    let address = input.address;
    if (!address && input.prevout) {
      // If verbose response includes prevout, extract address from it
      const prevoutScript = input.prevout?.scriptPubKey?.hex || (typeof input.prevout?.scriptPubKey === 'string' ? input.prevout.scriptPubKey : undefined);
      if (prevoutScript) {
        address = extractAddressFromScript(prevoutScript, network);
      } else if (input.prevout?.scriptPubKey?.addresses) {
        address = input.prevout.scriptPubKey.addresses[0];
      }
    }
    
    // Also try to get value from prevout if available
    // Check multiple possible locations for the value
    let value = input.value;
    if ((value === undefined || value === null) && input.prevout?.value !== undefined && input.prevout?.value !== null) {
      value = input.prevout.value;
    }
    // Also check if value is in the input object directly (some ElectrumX formats)
    if ((value === undefined || value === null) && (input as any).prevout_value !== undefined) {
      value = (input as any).prevout_value;
    }
    
    // Convert value from CY to satoshis (ElectrumX returns values in CY)
    // Uniform conversion: always convert from CY to satoshis for consistency
    if (value !== undefined && value !== null) {
      value = Number(value) || 0;
      if (value > 0) {
        value = value * 100000000; // Convert CY to satoshis
      }
    }
    // Note: We keep value as undefined if not found, so fee calculation knows it's missing
    
    return {
      type: 'regular',
      prevout_hash: prevoutHash,
      prevout_n: input.vout || input.prevout_n || 0,
      script_sig: input.scriptSig?.hex || input.script_sig || '',
      sequence: input.sequence || 0xffffffff,
      value: value,
      address: address,
    };
  });

  const outputs: TxOutput[] = (txData.vout || []).map((output: ElectrumXOutput) => {
    // Extract address from scriptPubKey
    let address = output.address;
    
    // Try to get address from scriptPubKey.addresses array (verbose response)
    if (!address && output.scriptPubKey?.addresses && output.scriptPubKey.addresses.length > 0) {
      address = output.scriptPubKey.addresses[0];
    }
    
    // If still no address, try to extract from script hex
    if (!address) {
      const scriptHex = output.scriptPubKey?.hex || output.script_pubkey || '';
      address = extractAddressFromScript(scriptHex, network);
    }
    
    // Check if this is an MWEB output (for display purposes)
    const isMwebOutput = output.scriptPubKey?.type === 'witness_mweb_hogaddr';
    
    // Parse value - Uniform conversion: ElectrumX always returns values in CY (main unit)
    // We always convert CY to satoshis for consistent handling throughout the app
    let value = output.value;
    
    // Handle null/undefined values
    if (value === null || value === undefined) {
      value = 0;
    }
    
    // Convert to number first
    value = Number(value) || 0;
    
    // Uniform conversion: Always convert from CY to satoshis
    // This ensures consistent balance display regardless of transaction type or value size
    if (value > 0) {
      value = value * 100000000; // Convert CY to satoshis
    }
    
    return {
      type: 'regular',
      value: value,
      script_pubkey: output.scriptPubKey?.hex || output.script_pubkey || '',
      address: address,
      scriptPubKeyType: output.scriptPubKey?.type, // Preserve type for MWEB detection
    };
  });

  // Add MWEB inputs/outputs if present
  if (isMweb && txData.mweb_extension) {
    const mwebInputs: MwebInput[] = (txData.mweb_extension.inputs || []).map((input: { commitment: string }) => ({
      type: 'mweb_input',
      commitment: typeof input === 'string' ? input : (input?.commitment || String(input) || ''),
      confidential: true,
    }));
    
    const mwebOutputs: MwebOutput[] = (txData.mweb_extension.outputs || []).map((output: { commitment: string; value?: number }) => ({
      type: 'mweb_output',
      commitment: typeof output === 'string' ? output : (output?.commitment || String(output) || ''),
      confidential: !output.value,
      value: output.value,
    }));

    inputs.push(...mwebInputs);
    outputs.push(...mwebOutputs);
  }

  // Calculate fee if not provided by ElectrumX
  // Fee = sum of all input values - sum of all output values
  // Skip calculation for coinbase transactions (they create new coins, no fee)
  let calculatedFee: number | undefined = undefined;
  
  // If fee is provided by ElectrumX, convert from CY to satoshis (if needed)
  if (txData.fee !== undefined && txData.fee !== null) {
    const feeValue = Number(txData.fee) || 0;
    // ElectrumX typically returns fee in CY, so convert to satoshis
    // But check if it's already in satoshis (very large number) or CY (small number)
    if (feeValue > 0 && feeValue < 1000000) {
      // Likely in CY, convert to satoshis
      calculatedFee = feeValue * 100000000;
    } else {
      // Already in satoshis or 0
      calculatedFee = feeValue;
    }
  }
  
  // If fee still not set, calculate it from inputs and outputs
  if (calculatedFee === undefined || calculatedFee === null) {
    const hasCoinbase = inputs.some(input => input.type === 'regular' && (!input.prevout_hash || input.prevout_hash === ''));
    
    if (!hasCoinbase) {
      // Check if we have any input values at all
      const inputsWithValues = inputs.filter(input => 
        input.type === 'regular' && 
        input.value !== undefined && 
        input.value !== null && 
        input.value > 0
      );
      
      // Sum all regular input values (already in satoshis)
      const totalInputs = inputsWithValues.reduce((sum, input) => {
        // Type guard: inputsWithValues is already filtered to RegularInput
        if (input.type === 'regular') {
          return sum + (input.value || 0);
        }
        return sum;
      }, 0);
      
      // Sum all regular output values (already in satoshis)
      const totalOutputs = outputs
        .filter(output => output.type === 'regular')
        .reduce((sum, output) => {
          const value = output.value !== undefined && output.value !== null ? output.value : 0;
          return sum + value;
        }, 0);
      
      // Fee is the difference (inputs - outputs)
      // Only calculate if we have at least one input with a value
      if (inputsWithValues.length > 0 && totalInputs > 0) {
        calculatedFee = totalInputs - totalOutputs;
        // Fee should be positive (negative fees shouldn't happen in normal transactions)
        if (calculatedFee < 0) {
          // This shouldn't happen, but set to 0 if it does
          calculatedFee = 0;
        }
      } else {
        // No input values available - can't calculate fee
        // Leave as undefined so UI can show "N/A"
        calculatedFee = undefined;
      }
    } else {
      // Coinbase transaction - no fee
      calculatedFee = 0;
    }
  }

  return {
    txid: txData.txid || txData.hash || '',
    hash: txData.hash || txData.txid || '',
    version: txData.version || 1,
    size: txData.size || 0,
    vsize: txData.vsize || txData.size || 0,
    weight: txData.weight || (txData.size || 0) * 4,
    locktime: txData.locktime || 0,
    inputs,
    outputs,
    fee: calculatedFee,
    isMweb,
    // Only create mwebExtension if mweb_extension data is available from ElectrumX
    // If MWEB is detected by output type but no mweb_extension is provided, mwebExtension will be undefined
    mwebExtension: (isMweb && txData.mweb_extension) ? {
      kernel_offset: String(txData.mweb_extension.kernel_offset ?? ''),
      outputs: outputs.filter((o): o is MwebOutput => o.type === 'mweb_output'),
      inputs: inputs.filter((i): i is MwebInput => i.type === 'mweb_input'),
    } : undefined,
  };
}

/**
 * Parse block from ElectrumX response or Cyberyen node response
 * MWEB data is embedded within the block structure
 */
interface ElectrumXBlock {
  hex?: string;
  height?: number;
  hash?: string;
  block_hash?: string;
  prev_hash?: string;
  previousblockhash?: string;
  merkle_root?: string;
  merkleroot?: string;
  timestamp?: number;
  time?: number;
  bits?: number;
  nonce?: number;
  version?: number;
  size?: number;
  tx_count?: number;
  nTx?: number;
  tx?: unknown[];
  mweb?: {
    hash?: string;
    kernel_offset?: string;
    num_txos?: number;
    stealth_offset?: string;
    num_kernels?: number;
    kernel_root?: string;
    output_root?: string;
    leaf_root?: string;
    inputs?: string[] | unknown[];
    outputs?: string[] | unknown[];
    kernels?: string[];
    height?: number;
  };
}

export function parseBlock(blockData: ElectrumXBlock | string, height?: number): ParsedBlock {
  // Handle string input (hex block data)
  if (typeof blockData === 'string') {
    // Parse hex string to block header
    const header = parseBlockHeader(blockData);
    return {
      height: height ?? 0,
      hash: header.hash,
      version: header.version,
      prev_hash: header.prevHash,
      merkle_root: header.merkleRoot,
      timestamp: header.timestamp,
      bits: header.bits,
      nonce: header.nonce,
      size: blockData.length / 2, // Hex string length / 2 = bytes
      tx_count: 0, // Cannot determine from hex string alone
      hasMweb: false,
    };
  }
  
  // Handle object input
  // MWEB data is in the 'mweb' object within the block
  const mwebData = blockData.mweb;
  const hasMweb = mwebData !== undefined && mwebData !== null;
  
  return {
    height: height || blockData.height || mwebData?.height || 0,
    hash: blockData.hash || blockData.block_hash || '',
    version: blockData.version || 1,
    prev_hash: blockData.prev_hash || blockData.previousblockhash || '',
    merkle_root: blockData.merkle_root || blockData.merkleroot || '',
    timestamp: blockData.timestamp || blockData.time || 0,
    bits: blockData.bits || 0,
    nonce: blockData.nonce || 0,
    size: blockData.size || 0,
    // Preserve tx_count if explicitly set (even if 0), otherwise try fallbacks
    tx_count: blockData.tx_count !== undefined && blockData.tx_count !== null 
      ? blockData.tx_count 
      : (blockData.nTx !== undefined && blockData.nTx !== null 
          ? blockData.nTx 
          : (blockData.tx ? blockData.tx.length : 0)),
    hasMweb,
    mwebHeader: hasMweb ? {
      hash: mwebData.hash || '',
      kernel_offset: mwebData.kernel_offset || '',
      outputs_count: mwebData.num_txos || mwebData.outputs?.length || 0,
      inputs_count: mwebData.inputs?.length || 0,
      // Additional MWEB fields from the block structure
      stealth_offset: mwebData.stealth_offset,
      num_kernels: mwebData.num_kernels,
      kernel_root: mwebData.kernel_root,
      output_root: mwebData.output_root,
      leaf_root: mwebData.leaf_root,
      inputs: Array.isArray(mwebData.inputs) ? (mwebData.inputs as string[]) : undefined,
      outputs: Array.isArray(mwebData.outputs) ? (mwebData.outputs as string[]) : undefined,
      kernels: Array.isArray(mwebData.kernels) ? mwebData.kernels : undefined,
    } : undefined,
  };
}

/**
 * Calculate total output value (excluding confidential MWEB outputs)
 */
export function calculateTotalOutputValue(outputs: TxOutput[]): number {
  return outputs
    .filter((o): o is RegularOutput => o.type === 'regular')
    .reduce((sum, output) => sum + (output.value || 0), 0);
}

/**
 * Check if transaction has confidential data
 */
export function hasConfidentialData(tx: ParsedTransaction): boolean {
  return tx.isMweb && (
    tx.inputs.some(i => i.type === 'mweb_input') ||
    tx.outputs.some(o => o.type === 'mweb_output' && o.confidential)
  );
}

