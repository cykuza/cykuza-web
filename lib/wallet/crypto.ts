import { BIP32Factory, BIP32Interface } from 'bip32';
import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { getNetwork } from '../cyberyenNetwork';

const bip32 = BIP32Factory(ecc);

export const CYBERYEN_COIN_TYPE = 802;
export const DEFAULT_DERIVATION_PATH = `m/84'/${CYBERYEN_COIN_TYPE}'/0'/0/0`;

export interface DerivedWallet {
  mnemonic: string;
  seed: Buffer;
  root: BIP32Interface;
  accountNode: BIP32Interface;
  firstAddress: string;
  firstPrivKeyWIF: string;
}

export interface AccountInfo {
  index: number;
  address: string;
  privateKeyWIF: string;
  derivationPath: string;
}

export function getDerivationPath(accountIndex: number): string {
  return `m/84'/${CYBERYEN_COIN_TYPE}'/${accountIndex}'/0/0`;
}

export async function deriveAccount(
  mnemonic: string,
  accountIndex: number,
  passphrase = '',
  networkType: 'mainnet' | 'testnet' = 'mainnet'
): Promise<AccountInfo> {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid seed phrase. Please verify all words.');
  }
  const seed = await bip39.mnemonicToSeed(mnemonic, passphrase);
  const network = getNetwork(networkType);
  const root = bip32.fromSeed(seed, network);
  const derivationPath = getDerivationPath(accountIndex);
  const accountNode = root.derivePath(derivationPath);
  const receiving = accountNode.derive(0).derive(0);
  const { address } = bitcoin.payments.p2wpkh({ pubkey: receiving.publicKey, network });
  if (!address) {
    throw new Error('Failed to derive address');
  }
  return {
    index: accountIndex,
    address,
    privateKeyWIF: receiving.toWIF(),
    derivationPath,
  };
}

export function generateMnemonic(strength: 128 | 160 | 192 | 224 | 256 = 128): string {
  return bip39.generateMnemonic(strength);
}

export async function mnemonicToWallet(
  mnemonic: string,
  passphrase = '',
  networkType: 'mainnet' | 'testnet' = 'mainnet',
  accountIndex: number = 0
): Promise<DerivedWallet> {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid seed phrase. Please verify all words.');
  }
  const seed = await bip39.mnemonicToSeed(mnemonic, passphrase);
  const network = getNetwork(networkType);
  const root = bip32.fromSeed(seed, network);
  const derivationPath = getDerivationPath(accountIndex);
  const accountNode = root.derivePath(derivationPath);
  const firstReceiving = accountNode.derive(0).derive(0);
  const { address } = bitcoin.payments.p2wpkh({ pubkey: firstReceiving.publicKey, network });
  if (!address) {
    throw new Error('Failed to derive address');
  }
  return {
    mnemonic,
    seed,
    root,
    accountNode,
    firstAddress: address,
    firstPrivKeyWIF: firstReceiving.toWIF(),
  };
}

export function addressToScriptHash(address: string, networkType: 'mainnet' | 'testnet' = 'mainnet'): string {
  const network = getNetwork(networkType);
  const payment = bitcoin.address.toOutputScript(address, network);
  const hash = bitcoin.crypto.sha256(payment);
  return Buffer.from(hash.reverse()).toString('hex');
}









