import { BIP32Factory, type BIP32Interface } from 'bip32';
import {
  mnemonicToSeed,
  validateMnemonic as scureValidateMnemonic,
} from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { getNetwork } from '../cyberyenNetwork';
import {
  generateSeedMnemonic,
  type WordCount,
} from './seedEntropy';
import { wipeBytes } from './wipeBytes';

// bitcoinjs-lib v7 requires an explicit ECC library.
bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);

export const CYBERYEN_COIN_TYPE = 802;
/** Canonical BIP84 receiving leaf (parity with cykuza-extension). */
export const DEFAULT_DERIVATION_PATH = `m/84'/${CYBERYEN_COIN_TYPE}'/0'/0/0`;

/** Default word count for newly generated mnemonics (256-bit entropy). */
export const MNEMONIC_WORD_COUNT: WordCount = 24;
export const MNEMONIC_WORD_COUNTS = [12, 24] as const;
export type { WordCount };

export type DerivationPathId = 'bip84' | 'legacy-web';

/** Stable message — vault opened; BIP39 passphrase did not match sealed seed fingerprint. */
export const WRONG_BIP39_PASSPHRASE = 'Wrong BIP39 passphrase';

export class WrongBip39PassphraseError extends Error {
  constructor() {
    super(WRONG_BIP39_PASSPHRASE);
    this.name = 'WrongBip39PassphraseError';
  }
}

export interface DerivedWallet {
  mnemonic: string;
  seed: Uint8Array;
  root: BIP32Interface;
  /** Node at the selected leaf path (private key for first receiving address). */
  accountNode: BIP32Interface;
  firstAddress: string;
  firstPrivKeyWIF: string;
  derivationPath: string;
  pathId: DerivationPathId;
}

export function getDerivationPath(accountIndex: number): string {
  return `m/84'/${CYBERYEN_COIN_TYPE}'/${accountIndex}'/0/0`;
}

/** Pre-W0 web bug: BIP84 leaf plus extra `/0/0` (m/84'/802'/i'/0/0/0/0). */
export function getLegacyWebDerivationPath(accountIndex: number): string {
  return `${getDerivationPath(accountIndex)}/0/0`;
}

export function pathForId(pathId: DerivationPathId, accountIndex = 0): string {
  return pathId === 'bip84'
    ? getDerivationPath(accountIndex)
    : getLegacyWebDerivationPath(accountIndex);
}

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().replace(/\s+/g, ' ');
}

/** Empty / whitespace → undefined (no passphrase wallet). */
export function normalizeOptionalPassphrase(
  passphrase: string | undefined | null
): string | undefined {
  if (passphrase === undefined || passphrase === null) return undefined;
  const trimmed = passphrase.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Accept valid BIP39 English mnemonics with 12 or 24 words only. */
export function validateMnemonic(mnemonic: string): boolean {
  const trimmed = normalizeMnemonic(mnemonic);
  if (!trimmed) return false;
  const words = trimmed.split(' ');
  if (words.length !== 12 && words.length !== 24) return false;
  return scureValidateMnemonic(trimmed, englishWordlist);
}

/** CSPRNG BIP39 mnemonic (default 24 words). */
export function generateMnemonic(wordCount: WordCount = MNEMONIC_WORD_COUNT): string {
  return generateSeedMnemonic({ mode: 'csprng', wordCount });
}

/**
 * Short non-secret preview fingerprint (first 8 hex of SHA256 of normalized mnemonic).
 * Does not log or return the mnemonic.
 */
export function mnemonicFingerprint(mnemonic: string): string {
  const normalized = normalizeMnemonic(mnemonic);
  const bytes = new TextEncoder().encode(normalized);
  const digest = bitcoin.crypto.sha256(bytes);
  return bytesToHex(Uint8Array.from(digest.subarray(0, 4)));
}

/** First 32 hex chars of SHA256(seed) — network-independent passphrase verifier (16 bytes). */
export function seedFingerprintFromBytes(seedBytes: Uint8Array): string {
  const digest = bitcoin.crypto.sha256(seedBytes);
  const hex = bytesToHex(Uint8Array.from(digest.subarray(0, 16)));
  wipeBytes(digest);
  return hex;
}

/**
 * Compare a computed fingerprint to a stored verifier.
 * Legacy seals may store 8 hex chars; new seals store 32.
 */
export function seedFingerprintsMatch(computed: string, expected: string): boolean {
  if (expected.length === 8) {
    return computed.slice(0, 8) === expected;
  }
  return computed === expected;
}

/**
 * Compute seed fingerprint for seal-time (passphrase wallets).
 * Wipes seed bytes before return.
 */
export async function seedFingerprintFromMnemonic(
  mnemonic: string,
  passphrase = ''
): Promise<string> {
  const normalized = normalizeMnemonic(mnemonic);
  const seedBytes = await mnemonicToSeed(normalized, passphrase);
  try {
    return seedFingerprintFromBytes(seedBytes);
  } finally {
    wipeBytes(seedBytes);
  }
}

/**
 * Assert derived seed matches expected fingerprint when passphrase wallets are sealed.
 */
export function assertSeedFingerprint(
  seedBytes: Uint8Array,
  expectedSeedFingerprint: string | undefined
): void {
  if (expectedSeedFingerprint === undefined) return;
  const fp = seedFingerprintFromBytes(seedBytes);
  if (!seedFingerprintsMatch(fp, expectedSeedFingerprint)) {
    throw new WrongBip39PassphraseError();
  }
}

export async function mnemonicToWallet(
  mnemonic: string,
  passphrase = '',
  networkType: 'mainnet' | 'testnet' = 'mainnet',
  accountIndex: number = 0,
  pathId: DerivationPathId = 'bip84',
  expectedSeedFingerprint?: string
): Promise<DerivedWallet> {
  const normalized = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalized)) {
    throw new Error('Invalid seed phrase. Please verify all words.');
  }
  const seed = await mnemonicToSeed(normalized, passphrase);
  try {
    assertSeedFingerprint(seed, expectedSeedFingerprint);
    const network = getNetwork(networkType);
    const root = bip32.fromSeed(seed, network);
    const derivationPath = pathForId(pathId, accountIndex);
    const leaf = root.derivePath(derivationPath);
    if (!leaf.privateKey) {
      throw new Error('Failed to derive private key');
    }
    const { address } = bitcoin.payments.p2wpkh({ pubkey: leaf.publicKey, network });
    if (!address) {
      throw new Error('Failed to derive address');
    }
    return {
      mnemonic: normalized,
      seed,
      root,
      accountNode: leaf,
      firstAddress: address,
      firstPrivKeyWIF: leaf.toWIF(),
      derivationPath,
      pathId,
    };
  } catch (err) {
    seed.fill(0);
    throw err;
  }
}

export function addressToScriptHash(
  address: string,
  networkType: 'mainnet' | 'testnet' = 'mainnet'
): string {
  const network = getNetwork(networkType);
  const payment = bitcoin.address.toOutputScript(address, network);
  const hash = bitcoin.crypto.sha256(payment);
  return Buffer.from(hash.reverse()).toString('hex');
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
