// Wallet transaction building and signing
// SECURITY: All operations are client-side only, no server exposure

import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import ecc from '@bitcoinerlab/secp256k1';
import { getNetwork } from '../cyberyenNetwork';

const ECPair = ECPairFactory(ecc);

// Define the validator once
const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer,
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

export interface SpendTarget {
  toAddress: string;
  amountSats: number;
  feeRate: number; // sats per vbyte
  fromAddress: string;
  keyPair: ECPairInterface;
  utxos: Array<{ txid: string; vout: number; value: number }>;
  networkType: 'mainnet' | 'testnet';
  includeFee?: boolean; // If true, fee is deducted from amountSats. If false, fee is deducted from balance separately.
}

function estimateVBytes(inputCount: number, outputCount: number): number {
  // Rough estimate for P2WPKH: 68 vbytes per input, 31 per output, 10 overhead
  return Math.ceil(10 + inputCount * 68 + outputCount * 31);
}

/**
 * Estimate transaction fee without building the transaction
 */
export function estimateFee(params: {
  amountSats: number;
  feeRate: number;
  utxos: Array<{ txid: string; vout: number; value: number }>;
  includeFee?: boolean;
}): { estimatedFee: number; actualAmountSats: number; totalNeeded: number } {
  const { amountSats, feeRate, utxos, includeFee = false } = params;
  
  if (!utxos.length || amountSats <= 0) {
    return { estimatedFee: 0, actualAmountSats: 0, totalNeeded: 0 };
  }
  
  // Estimate transaction size iteratively
  // We need to estimate how many inputs we'll need
  let totalIn = 0;
  let inputCount = 0;
  let estimatedFee = 0;
  
  for (const utxo of utxos) {
    totalIn += utxo.value;
    inputCount++;
    
    // Estimate fee with current input count
    // If includeFee is true: 1 output (to recipient), change might be 0
    // If includeFee is false: 2 outputs (to recipient + change)
    const outputCount = includeFee ? 1 : 2;
    const estimatedVSize = estimateVBytes(inputCount, outputCount);
    estimatedFee = Math.ceil(estimatedVSize * feeRate);
    
    // Calculate what we need
    // If includeFee is true: we need amountSats total (fee is deducted from amount)
    // If includeFee is false: we need amountSats + fee
    const totalNeeded = includeFee ? amountSats : (amountSats + estimatedFee);
    
    if (totalIn >= totalNeeded) {
      break;
    }
  }
  
  // Final calculation
  // If includeFee is true, the actual amount sent is reduced by the fee
  const actualAmountSats = includeFee ? Math.max(0, amountSats - estimatedFee) : amountSats;
  const totalNeeded = includeFee ? amountSats : (amountSats + estimatedFee);
  
  return {
    estimatedFee,
    actualAmountSats,
    totalNeeded,
  };
}

export function buildAndSignTx(params: SpendTarget): { hex: string; fee: number } {
  const { toAddress, amountSats, feeRate, fromAddress, keyPair, utxos, networkType, includeFee = false } = params;
  if (amountSats <= 0) throw new Error('Amount must be positive');
  if (!utxos.length) throw new Error('No funds available');

  const network = getNetwork(networkType);
  const psbt = new bitcoin.Psbt({ network });
  const payment = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
  const script = payment.output;
  if (!script) throw new Error('Unable to derive script for signing');

  // Select UTXOs needed for the transaction
  let totalIn = 0;
  const selectedUtxos: Array<{ txid: string; vout: number; value: number }> = [];
  
  // If includeFee is true, we need to send (amountSats - fee), so recipient gets amountSats total
  // If includeFee is false, we send amountSats, and fee is deducted separately
  const targetAmount = includeFee ? amountSats : amountSats;
  
  // Estimate fee first to know how much we need
  let estimatedVSize = estimateVBytes(1, includeFee ? 1 : 2); // Start with 1 input estimate
  let estimatedFee = Math.ceil(estimatedVSize * feeRate);
  const totalNeeded = includeFee ? targetAmount : (targetAmount + estimatedFee);
  
  // Select UTXOs until we have enough
  for (const utxo of utxos) {
    selectedUtxos.push(utxo);
    totalIn += utxo.value;
    
    // Recalculate fee with actual input count
    estimatedVSize = estimateVBytes(selectedUtxos.length, includeFee ? 1 : 2);
    estimatedFee = Math.ceil(estimatedVSize * feeRate);
    const recalculatedNeeded = includeFee ? targetAmount : (targetAmount + estimatedFee);
    
    if (totalIn >= recalculatedNeeded) {
      break;
    }
  }
  
  // Final fee calculation
  estimatedVSize = estimateVBytes(selectedUtxos.length, includeFee ? 1 : 2);
  estimatedFee = Math.ceil(estimatedVSize * feeRate);
  
  // Calculate actual amount to send
  // If includeFee is true: send (amountSats - fee) so recipient receives amountSats
  // If includeFee is false: send amountSats, fee is deducted from change
  const actualAmountSats = includeFee ? Math.max(0, amountSats - estimatedFee) : amountSats;
  
  if (actualAmountSats <= 0 && includeFee) {
    throw new Error('Amount is too small to cover the transaction fee');
  }
  
  // Add inputs
  selectedUtxos.forEach((u) => {
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: {
        script,
        value: u.value,
      },
    });
  });

  // Calculate change
  const change = totalIn - actualAmountSats - estimatedFee;

  if (change < 0) {
    throw new Error('Insufficient balance for amount + fee');
  }

  // Add outputs
  psbt.addOutput({ address: toAddress, value: actualAmountSats });
  if (change > 546) {
    psbt.addOutput({ address: fromAddress, value: change });
  }

  // Sign all inputs
  selectedUtxos.forEach((_, idx) => {
    psbt.signInput(idx, keyPair);
    psbt.validateSignaturesOfInput(idx, validator);
  });
  psbt.finalizeAllInputs();

  // Calculate actual fee from the built transaction
  const fee = totalIn - psbt.extractTransaction().outs.reduce((sum, o) => sum + o.value, 0);

  return { hex: psbt.extractTransaction().toHex(), fee };
}

export function cybToSats(amount: number): number {
  return Math.floor(amount * 1e8);
}

export function satsToCyb(sats: number): number {
  return sats / 1e8;
}

export function btcPerKbToSatsPerVbyte(rate: number): number {
  // Electrum returns CY per kb (same scale as BTC). Convert to sat/vbyte
  return Math.max(Math.ceil((rate * 1e8) / 1000), 1);
}



