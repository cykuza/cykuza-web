import {
  mnemonicFingerprint,
  mnemonicToWallet,
  seedFingerprintFromMnemonic,
  seedFingerprintsMatch,
  WrongBip39PassphraseError,
  type DerivationPathId,
  type DerivedWallet,
} from './crypto';

const HINT_STORAGE_KEY = 'wallet_derivation_path_hints';

export interface PathProbeResult {
  confirmed: number;
  unconfirmed: number;
  /** Optional history length; >0 counts as on-chain evidence. */
  historyLen?: number;
}

/** Injected probe — receives a public address only, never the mnemonic. */
export type AddressProbe = (address: string) => Promise<PathProbeResult>;

export interface PathHintStore {
  get(fingerprint: string): DerivationPathId | null;
  set(fingerprint: string, pathId: DerivationPathId): void;
}

export interface PathEvidence {
  pathId: DerivationPathId;
  funded: boolean;
}

/**
 * Pure selection policy:
 * - only legacy funded → legacy-web
 * - only bip84 funded → bip84
 * - both empty → bip84 (new standard)
 * - both funded → legacy-web (preserve pre-W0 funds) + caller should warn
 */
export function selectDerivationPath(evidence: PathEvidence[]): {
  pathId: DerivationPathId;
  bothFunded: boolean;
} {
  const bip84 = evidence.find((e) => e.pathId === 'bip84');
  const legacy = evidence.find((e) => e.pathId === 'legacy-web');
  const bip84Funded = bip84?.funded === true;
  const legacyFunded = legacy?.funded === true;

  if (legacyFunded && bip84Funded) {
    return { pathId: 'legacy-web', bothFunded: true };
  }
  if (legacyFunded) {
    return { pathId: 'legacy-web', bothFunded: false };
  }
  if (bip84Funded) {
    return { pathId: 'bip84', bothFunded: false };
  }
  return { pathId: 'bip84', bothFunded: false };
}

export function isFunded(probe: PathProbeResult): boolean {
  if (probe.confirmed > 0 || probe.unconfirmed > 0) return true;
  if (typeof probe.historyLen === 'number' && probe.historyLen > 0) return true;
  return false;
}

function readHintsFromLocalStorage(): Record<string, DerivationPathId> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(HINT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, DerivationPathId> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === 'bip84' || v === 'legacy-web') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeHintsToLocalStorage(hints: Record<string, DerivationPathId>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HINT_STORAGE_KEY, JSON.stringify(hints));
}

/** Browser localStorage hint store (non-secret fingerprint → path id). */
export function createLocalStorageHintStore(): PathHintStore {
  return {
    get(fingerprint: string) {
      return readHintsFromLocalStorage()[fingerprint] ?? null;
    },
    set(fingerprint: string, pathId: DerivationPathId) {
      const hints = readHintsFromLocalStorage();
      hints[fingerprint] = pathId;
      writeHintsToLocalStorage(hints);
    },
  };
}

export class DerivationProbeRequiredError extends Error {
  constructor(
    message = 'Network required to restore this wallet securely. Connect to Electrum and try again.'
  ) {
    super(message);
    this.name = 'DerivationProbeRequiredError';
  }
}

export interface ResolveMnemonicOptions {
  mode: 'create' | 'restore';
  passphrase?: string;
  networkType?: 'mainnet' | 'testnet';
  accountIndex?: number;
  /** When set (passphrase wallets), seed fingerprint must match. */
  expectedSeedFingerprint?: string;
  /** Required for restore when no hint is stored. */
  probe?: AddressProbe;
  hintStore?: PathHintStore;
}

export interface ResolvedMnemonicWallet {
  wallet: DerivedWallet;
  pathId: DerivationPathId;
  bothFunded: boolean;
  usedHint: boolean;
}

/**
 * Create: always BIP84 leaf.
 * Restore: prefer stored hint; otherwise probe bip84 + legacy-web (fail-closed).
 */
export async function resolveMnemonicWallet(
  mnemonic: string,
  options: ResolveMnemonicOptions
): Promise<ResolvedMnemonicWallet> {
  const networkType = options.networkType ?? 'mainnet';
  const accountIndex = options.accountIndex ?? 0;
  const passphrase = options.passphrase ?? '';
  const hintStore = options.hintStore;
  const fingerprint = mnemonicFingerprint(mnemonic);

  if (options.mode === 'create') {
    const wallet = await mnemonicToWallet(
      mnemonic,
      passphrase,
      networkType,
      accountIndex,
      'bip84',
      options.expectedSeedFingerprint
    );
    hintStore?.set(fingerprint, 'bip84');
    return { wallet, pathId: 'bip84', bothFunded: false, usedHint: false };
  }

  const hinted = hintStore?.get(fingerprint) ?? null;
  if (hinted) {
    const wallet = await mnemonicToWallet(
      mnemonic,
      passphrase,
      networkType,
      accountIndex,
      hinted,
      options.expectedSeedFingerprint
    );
    return { wallet, pathId: hinted, bothFunded: false, usedHint: true };
  }

  if (!options.probe) {
    throw new DerivationProbeRequiredError();
  }

  // Seed fingerprint is path-independent — verify once before dual-path discovery.
  if (options.expectedSeedFingerprint) {
    const fp = await seedFingerprintFromMnemonic(mnemonic, passphrase);
    if (!seedFingerprintsMatch(fp, options.expectedSeedFingerprint)) {
      throw new WrongBip39PassphraseError();
    }
  }

  const candidates: DerivationPathId[] = ['bip84', 'legacy-web'];
  const derived: Partial<Record<DerivationPathId, DerivedWallet>> = {};
  const evidence: PathEvidence[] = [];

  try {
    for (const pathId of candidates) {
      const wallet = await mnemonicToWallet(
        mnemonic,
        passphrase,
        networkType,
        accountIndex,
        pathId
      );
      derived[pathId] = wallet;
      let funded = false;
      try {
        const probeResult = await options.probe(wallet.firstAddress);
        funded = isFunded(probeResult);
      } catch {
        throw new DerivationProbeRequiredError(
          'Unable to verify wallet addresses on the network. Connect to Electrum and try again.'
        );
      }
      evidence.push({ pathId, funded });
    }

    const { pathId, bothFunded } = selectDerivationPath(evidence);
    const wallet = derived[pathId]!;
    hintStore?.set(fingerprint, pathId);

    for (const id of candidates) {
      if (id === pathId) continue;
      const other = derived[id];
      if (other?.seed) other.seed.fill(0);
    }

    return { wallet, pathId, bothFunded, usedHint: false };
  } catch (err) {
    for (const id of candidates) {
      const other = derived[id];
      if (other?.seed) other.seed.fill(0);
    }
    throw err;
  }
}

/** Client probe via explorer `/api/address` (public address only). */
export function createExplorerAddressProbe(
  networkType: 'mainnet' | 'testnet',
  fetchImpl: typeof fetch = fetch
): AddressProbe {
  return async (address: string) => {
    const url = `/api/address?address=${encodeURIComponent(address)}&network=${networkType}`;
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(`Address probe failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      confirmed?: number;
      unconfirmed?: number;
      history?: unknown[];
    };
    return {
      confirmed: typeof data.confirmed === 'number' ? data.confirmed : 0,
      unconfirmed: typeof data.unconfirmed === 'number' ? data.unconfirmed : 0,
      historyLen: Array.isArray(data.history) ? data.history.length : 0,
    };
  };
}
