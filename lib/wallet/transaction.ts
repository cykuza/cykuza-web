// Wallet transaction building and signing
// SECURITY: All operations are client-side only, no server exposure

import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory, type ECPairInterface } from 'ecpair';
import ecc from '@bitcoinerlab/secp256k1';
import { getNetwork } from '../cyberyenNetwork';

// bitcoinjs-lib v7 requires an explicit ECC library for signing helpers.
bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);

/** Dust threshold for change outputs (legacy P2PKH dust). */
export const DUST_THRESHOLD = 546;

const validator = (
  pubkey: Uint8Array,
  msghash: Uint8Array,
  signature: Uint8Array
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

export function estimateVBytes(inputCount: number, outputCount: number): number {
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

  let totalIn = 0;
  let inputCount = 0;
  let estimatedFee = 0;

  for (const utxo of utxos) {
    totalIn += utxo.value;
    inputCount++;

    const outputCount = includeFee ? 1 : 2;
    const estimatedVSize = estimateVBytes(inputCount, outputCount);
    estimatedFee = Math.ceil(estimatedVSize * feeRate);

    const totalNeeded = includeFee ? amountSats : amountSats + estimatedFee;

    if (totalIn >= totalNeeded) {
      break;
    }
  }

  const actualAmountSats = includeFee ? Math.max(0, amountSats - estimatedFee) : amountSats;
  const totalNeeded = includeFee ? amountSats : amountSats + estimatedFee;

  return {
    estimatedFee,
    actualAmountSats,
    totalNeeded,
  };
}

export interface SpendPlanParams {
  amountSats: number;
  feeRate: number;
  utxos: Array<{ txid: string; vout: number; value: number }>;
  includeFee?: boolean;
}

export interface SpendPlan {
  selectedUtxos: Array<{ txid: string; vout: number; value: number }>;
  totalIn: number;
  fee: number;
  /** Amount paid to recipient. */
  outputSats: number;
  /** Sats leaving the wallet (output + fee). Used for daily spend / large-send. */
  totalSats: number;
  change: number;
}

/**
 * Coin-select + fee plan without signing. Same economics as buildAndSignTx.
 */
export function planSpend(params: SpendPlanParams): SpendPlan {
  const { amountSats, feeRate, utxos, includeFee = false } = params;
  if (amountSats <= 0) throw new Error('Amount must be positive');
  if (!utxos.length) throw new Error('No funds available');

  let totalIn = 0;
  const selectedUtxos: Array<{ txid: string; vout: number; value: number }> = [];
  const targetAmount = amountSats;

  let estimatedVSize = estimateVBytes(1, includeFee ? 1 : 2);
  let estimatedFee = Math.ceil(estimatedVSize * feeRate);

  for (const utxo of utxos) {
    selectedUtxos.push(utxo);
    totalIn += utxo.value;

    estimatedVSize = estimateVBytes(selectedUtxos.length, includeFee ? 1 : 2);
    estimatedFee = Math.ceil(estimatedVSize * feeRate);
    const recalculatedNeeded = includeFee ? targetAmount : targetAmount + estimatedFee;

    if (totalIn >= recalculatedNeeded) {
      break;
    }
  }

  estimatedVSize = estimateVBytes(selectedUtxos.length, includeFee ? 1 : 2);
  estimatedFee = Math.ceil(estimatedVSize * feeRate);

  const outputSats = includeFee ? Math.max(0, amountSats - estimatedFee) : amountSats;

  if (outputSats <= 0 && includeFee) {
    throw new Error('Amount is too small to cover the transaction fee');
  }

  let change = totalIn - outputSats - estimatedFee;
  if (change < 0) {
    throw new Error('Insufficient balance for amount + fee');
  }

  // Dust change is added to fee (matches buildAndSignTx omitting dust change output)
  let fee = estimatedFee;
  if (change > 0 && change <= DUST_THRESHOLD) {
    fee += change;
    change = 0;
  }

  const totalSats = outputSats + fee;

  return {
    selectedUtxos,
    totalIn,
    fee,
    outputSats,
    totalSats,
    change,
  };
}

export function buildAndSignTx(params: SpendTarget): { hex: string; fee: number } {
  const {
    toAddress,
    amountSats,
    feeRate,
    fromAddress,
    keyPair,
    utxos,
    networkType,
    includeFee = false,
  } = params;

  const plan = planSpend({ amountSats, feeRate, utxos, includeFee });

  const network = getNetwork(networkType);
  const psbt = new bitcoin.Psbt({ network });
  const payment = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
  const script = payment.output;
  if (!script) throw new Error('Unable to derive script for signing');

  plan.selectedUtxos.forEach((u) => {
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: {
        script,
        value: BigInt(u.value),
      },
    });
  });

  psbt.addOutput({ address: toAddress, value: BigInt(plan.outputSats) });
  if (plan.change > DUST_THRESHOLD) {
    psbt.addOutput({ address: fromAddress, value: BigInt(plan.change) });
  }

  plan.selectedUtxos.forEach((_, idx) => {
    psbt.signInput(idx, keyPair);
    psbt.validateSignaturesOfInput(idx, validator);
  });
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();
  const fee = plan.totalIn - tx.outs.reduce((sum, o) => sum + Number(o.value), 0);

  return { hex: tx.toHex(), fee };
}

export function cybToSats(amount: number): number {
  return Math.floor(amount * 1e8);
}

export function satsToCyb(sats: number): number {
  return sats / 1e8;
}

export function btcPerKbToSatsPerVbyte(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  return Math.max(Math.ceil((rate * 1e8) / 1000), 1);
}
