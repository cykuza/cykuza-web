import { ECPairFactory } from 'ecpair';
import ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { mnemonicToWallet } from './crypto';
import {
  btcPerKbToSatsPerVbyte,
  buildAndSignTx,
  cybToSats,
  DUST_THRESHOLD,
  estimateFee,
  estimateVBytes,
  satsToCyb,
} from './transaction';
import { getNetwork } from '../cyberyenNetwork';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('units', () => {
  it('converts CY ↔ sats', () => {
    expect(cybToSats(1)).toBe(100_000_000);
    expect(satsToCyb(50_000_000)).toBe(0.5);
  });
});

describe('btcPerKbToSatsPerVbyte', () => {
  it('converts and floors up to integer sats/vB', () => {
    expect(btcPerKbToSatsPerVbyte(0.0001)).toBe(10);
    expect(btcPerKbToSatsPerVbyte(0.001)).toBe(100);
  });

  it('enforces minimum 1 for zero / negative / NaN', () => {
    expect(btcPerKbToSatsPerVbyte(0)).toBe(1);
    expect(btcPerKbToSatsPerVbyte(-1)).toBe(1);
    expect(btcPerKbToSatsPerVbyte(Number.NaN)).toBe(1);
  });
});

describe('estimateVBytes', () => {
  it('matches P2WPKH heuristic 10 + 68*in + 31*out', () => {
    expect(estimateVBytes(1, 2)).toBe(Math.ceil(10 + 68 + 62));
    expect(estimateVBytes(2, 1)).toBe(Math.ceil(10 + 136 + 31));
  });
});

describe('estimateFee / buildAndSignTx', () => {
  it('estimates fee for a single-input spend', () => {
    const utxos = [{ txid: 'a'.repeat(64), vout: 0, value: 100_000 }];
    const est = estimateFee({
      amountSats: 50_000,
      feeRate: 10,
      utxos,
      includeFee: false,
    });
    expect(est.estimatedFee).toBe(estimateVBytes(1, 2) * 10);
    expect(est.actualAmountSats).toBe(50_000);
  });

  it('builds and signs a valid PSBT hex', async () => {
    const derived = await mnemonicToWallet(FIXTURE_MNEMONIC, '', 'mainnet', 0, 'bip84');
    const network = getNetwork('mainnet');
    const keyPair = ECPair.fromWIF(derived.firstPrivKeyWIF, network);
    const utxos = [{ txid: 'ab'.repeat(32), vout: 0, value: 200_000 }];

    const { hex, fee } = buildAndSignTx({
      toAddress: derived.firstAddress,
      amountSats: 50_000,
      feeRate: 10,
      fromAddress: derived.firstAddress,
      keyPair,
      utxos,
      networkType: 'mainnet',
      includeFee: false,
    });

    expect(hex).toMatch(/^[0-9a-f]+$/i);
    expect(fee).toBeGreaterThan(0);
    expect(fee).toBeLessThan(200_000);
    expect(DUST_THRESHOLD).toBe(546);
    derived.seed.fill(0);
  });
});
