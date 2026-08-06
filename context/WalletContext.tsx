'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import {
  addressToScriptHash,
  validateMnemonic,
  hexToBytes,
  mnemonicToWallet,
  MNEMONIC_WORD_COUNT,
  normalizeOptionalPassphrase,
  seedFingerprintFromMnemonic,
  WrongBip39PassphraseError,
} from '@/lib/wallet/crypto';
import {
  resolveMnemonicWallet,
  createLocalStorageHintStore,
  createExplorerAddressProbe,
} from '@/lib/wallet/derivationResolve';
import {
  generateSeedMnemonic,
  type EntropyMode,
  type WordCount,
} from '@/lib/wallet/seedEntropy';
import { ElectrumClient, ElectrumStatus } from '@/lib/wallet/electrum';
import {
  buildAndSignTx,
  btcPerKbToSatsPerVbyte,
  cybToSats,
  planSpend,
} from '@/lib/wallet/transaction';
import {
  openSessionVault,
  sealSessionVault,
  serializeSessionVault,
  vaultPassphraseRequired,
  VaultOpenError,
  type VaultPayload,
} from '@/lib/wallet/sessionVault';
import {
  unlockFailedWithAttempts,
  UNLOCK_LOCKOUT,
} from '@/lib/wallet/unlockErrors';
import {
  DEFAULT_AUTO_LOCK_MS,
  attachLockOnHide,
  shouldLockOnHide,
} from '@/lib/wallet/sessionPolicy';
import { assertNewPassword } from '@/lib/wallet/passwordPolicy';
import {
  assertSendSafeguards,
  previewSendSafeguardFlags,
} from '@/lib/wallet/sendSafeguards';
import {
  addAddressBookEntry,
  removeAddressBookEntry,
  type AddressBookEntry,
} from '@/lib/wallet/addressBook';
import { recordSpend, normalizeDailySpendLimit } from '@/lib/wallet/dailySpend';
import {
  clearDailySpendStorage,
  readAddressBook,
  readDailySpend,
  readDailySpendLimitSats,
  writeAddressBook,
  writeDailySpend,
  writeDailySpendLimitSats,
} from '@/lib/wallet/sendPrefsStore';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { getNetwork } from '@/lib/cyberyenNetwork';
import { ElectrumSession } from '@/lib/electrum/session';
import { toElectrumError } from '@/lib/electrum/errors';
import { WALLET_PROFILE } from '@/lib/electrum/types';
import {
  assessElectrumTrust,
  assertElectrumTrustAllowsChainOps,
  electrumTrustBlocksChainOps,
  type ElectrumTrustLevel,
} from '@/lib/electrum/electrumTrust';
import {
  dualVerifyBroadcast,
  dualVerifyRefresh,
  ElectrumVerifyError,
} from '@/lib/electrum/dualVerify';
import {
  readVerifyWithSecondServer,
  writeVerifyWithSecondServer,
} from '@/lib/electrum/trustPrefs';

bitcoin.initEccLib(ecc);

export type WalletStage = 'idle' | 'import-method' | 'password-creation' | 'mnemonic-display' | 'mnemonic-input' | 'private-key-import' | 'created' | 'ready' | 'receive' | 'send' | 'error' | 'server-config' | 'private-key-view' | 'mnemonic-view' | 'address-book' | 'daily-spend';

const ENCRYPTED_DATA_KEY = 'wallet_encrypted_data';
const LAST_ACTIVITY_KEY = 'wallet_last_activity';
const ACCEPTED_TERMS_KEY = 'wallet_accepted_terms';
const UNLOCK_ATTEMPTS_KEY = 'wallet_unlock_attempts';
const LOCKOUT_UNTIL_KEY = 'wallet_lockout_until';
const MAX_UNLOCK_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

export interface TxRecord {
  txid: string;
  height: number;
  amount: number;
  timestamp?: number;
}

export interface CreateEntropyOptions {
  wordCount: WordCount;
  mode: EntropyMode;
  diceRolls?: string;
  hexEntropy?: string;
}

export interface SendOptions {
  includeFee?: boolean;
  /** Required — last 6 characters of recipient address. */
  toConfirmSuffix: string;
  allowSpendLimitOnce?: boolean;
  acknowledgeLargeSend?: boolean;
}

export interface WalletContextState {
  accepted: boolean;
  stage: WalletStage;
  status: ElectrumStatus;
  error?: string;
  server: string;
  servers: string[];
  address?: string;
  mnemonic?: string;
  balance: { confirmed: number; unconfirmed: number };
  history: TxRecord[];
  relayFee: number;
  feeRate: number;
  networkType: 'mainnet' | 'testnet';
  isLocked: boolean;
  requiresPassword: boolean;
  /** Readable while locked — BIP39 passphrase needed on unlock (envelope metadata). */
  passphraseRequired: boolean;
  passwordError?: string;
  /** True when create flow (not import) is on password-creation. */
  isCreateEntropyFlow: boolean;
  /** Active import method during create/import staging (null = create). */
  importType: 'mnemonic' | 'private-key' | null;
  addressBook: AddressBookEntry[];
  dailySpendLimitSats: number | null;
  /** Domain Electrum trust level (not UI-only). */
  electrumTrust: ElectrumTrustLevel;
  /** True when refresh/send must not proceed. */
  chainOpsBlocked: boolean;
  verifyWithSecondServer: boolean;
  createNewWallet: () => Promise<void>;
  importWallet: () => Promise<void>;
  importFromMnemonic: () => Promise<void>;
  setServer: (url: string) => void;
  setVerifyWithSecondServer: (enabled: boolean) => void;
  /** Optimistic reset of usable endpoint count (e.g. after Network retry). */
  resetElectrumUsableCount: () => void;
  setNetworkType: (network: 'mainnet' | 'testnet') => void;
  setFeeRate: (rate: number) => void;
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  send: (
    to: string,
    amountCyb: number,
    options: SendOptions
  ) => Promise<{ txid: string; fee: number }>;
  previewSendFlags: (
    to: string,
    amountCyb: number,
    includeFee?: boolean
  ) => Promise<{ spendLimitExceeded: boolean; largeSend: boolean; totalSats: number }>;
  getAddressBook: () => AddressBookEntry[];
  addToAddressBook: (entry: {
    label: string;
    address: string;
  }) => void;
  removeFromAddressBook: (address: string) => void;
  setDailySpendLimitSats: (limitSats: number | null) => void;
  acceptTerms: () => void;
  endSession: (expired?: boolean) => void;
  setPassword: (password: string) => Promise<void>;
  unlockWallet: (password: string, passphrase?: string) => Promise<void>;
  lockWallet: () => void;
  updateActivity: () => void;
  startPasswordCreation: () => void;
  confirmPassword: (
    password: string,
    entropy?: CreateEntropyOptions,
    passphrase?: string
  ) => Promise<void>;
  confirmMnemonic: () => Promise<void>;
  importFromPrivateKey: (privateKey: string, password: string) => Promise<void>;
  importMnemonicWithPassword: (
    mnemonic: string,
    password: string,
    passphrase?: string
  ) => Promise<void>;
  goBack: () => void;
  setStage: (stage: WalletStage) => void;
  clearPendingSecrets: () => void;
  setImportType: (type: 'mnemonic' | 'private-key' | null) => void;
  getCurrentPrivateKey: () => string | undefined;
  getMnemonic: () => string | undefined;
  getPendingMnemonic: () => string | undefined;
  getPendingPassword: () => string | undefined;
  getPendingCreateAddress: () => string | undefined;
  getUtxos: () => Promise<Array<{ txid: string; vout: number; value: number }>>;
}

// Get default server from environment or use fallback
const getDefaultServer = (network: 'mainnet' | 'testnet'): string => {
  if (typeof window !== 'undefined') {
    // Try to get from environment variables (if available in client)
    const envMainnet = process.env.NEXT_PUBLIC_ELECTRUMX_MAINNET;
    const envTestnet = process.env.NEXT_PUBLIC_ELECTRUMX_TESTNET;
    
    if (network === 'mainnet' && envMainnet) {
      return envMainnet.split(',')[0]?.trim() || '';
    }
    if (network === 'testnet' && envTestnet) {
      return envTestnet.split(',')[0]?.trim() || '';
    }
  }
  
  // Fallback defaults
  return network === 'mainnet' 
    ? ''
    : '';
};

const DEFAULT_SERVERS_MAINNET: string[] = [];

const DEFAULT_SERVERS_TESTNET: string[] = [];

const ECPair = ECPairFactory(ecc);

const WalletContext = createContext<WalletContextState | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accepted, setAccepted] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(ACCEPTED_TERMS_KEY) === 'true';
    }
    return false;
  });
  const [stage, setStage] = useState<WalletStage>('idle');
  const [status, setStatus] = useState<ElectrumStatus>('disconnected');
  const [networkType, setNetworkTypeState] = useState<'mainnet' | 'testnet'>('mainnet');
  const [server, setServerState] = useState<string>(() => getDefaultServer('mainnet'));
  const [servers, setServersState] = useState<string[]>(() => {
    // Get servers from environment or use defaults
    if (typeof window !== 'undefined') {
      const envMainnet = process.env.NEXT_PUBLIC_ELECTRUMX_MAINNET;
      const envTestnet = process.env.NEXT_PUBLIC_ELECTRUMX_TESTNET;
      
      if (envMainnet && networkType === 'mainnet') {
        // Support comma-separated list or single server
        return envMainnet.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (envTestnet && networkType === 'testnet') {
        return envTestnet.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return networkType === 'mainnet' ? DEFAULT_SERVERS_MAINNET : DEFAULT_SERVERS_TESTNET;
  });
  const [error, setError] = useState<string>();
  const [address, setAddress] = useState<string>();
  // CRITICAL SECURITY: Do NOT store mnemonic/private key in React state
  // It's stored in mnemonicRef to prevent exposure in React DevTools/state snapshots
  const [balance, setBalance] = useState({ confirmed: 0, unconfirmed: 0 });
  const [history, setHistory] = useState<TxRecord[]>([]);
  const [relayFee, setRelayFee] = useState(1000);
  const [feeRate, setFeeRate] = useState(10);
  const [isLocked, setIsLocked] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [passphraseRequired, setPassphraseRequired] = useState(() => {
    if (typeof window !== 'undefined') {
      return vaultPassphraseRequired(sessionStorage.getItem(ENCRYPTED_DATA_KEY));
    }
    return false;
  });
  const [passwordError, setPasswordError] = useState<string>();
  const [importType, setImportType] = useState<'mnemonic' | 'private-key' | null>(null);
  const [addressBook, setAddressBookState] = useState<AddressBookEntry[]>(() => {
    if (typeof window !== 'undefined') return readAddressBook();
    return [];
  });
  const [dailySpendLimitSats, setDailySpendLimitState] = useState<number | null>(() => {
    if (typeof window !== 'undefined') return readDailySpendLimitSats();
    return null;
  });
  const [verifyWithSecondServer, setVerifyWithSecondServerState] = useState(() => {
    if (typeof window !== 'undefined') return readVerifyWithSecondServer();
    return true;
  });
  /** Reachable/usable WSS count for assessElectrumTrust (web permittedCount). */
  const [usableEndpointCount, setUsableEndpointCount] = useState(0);
  const [unlockAttempts, setUnlockAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  const walletRef = useRef<ECPairInterface | undefined>(undefined);
  const scripthashRef = useRef<string | undefined>(undefined);
  const mnemonicRef = useRef<string | undefined>(undefined); // Store mnemonic/private key in ref, not state
  // Create/import staging secrets — refs only (never published on context value)
  const pendingMnemonicRef = useRef<string | undefined>(undefined);
  const pendingPasswordRef = useRef<string | undefined>(undefined);
  const pendingPassphraseRef = useRef<string | undefined>(undefined);
  const pendingCreateAddressRef = useRef<string | undefined>(undefined);
  /** Kept while unlocked so setPassword can re-seal passphrase wallets without the PP. */
  const seedFingerprintRef = useRef<string | undefined>(undefined);
  const passphraseRequiredRef = useRef(false);
  const electrumRef = useRef<ElectrumClient | null>(null);
  const sessionRef = useRef<ElectrumSession | null>(null);
  const activityTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const sessionCheckIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const connectRef = useRef<((tryNextServer?: boolean) => Promise<void>) | null>(null);
  const justCreatedOrImportedRef = useRef(false); // Track if wallet was just created/imported
  const isReconnectingRef = useRef(false);
  const lockWalletRef = useRef<() => void>(() => {});
  /** Eager lock flag for connect/send — avoids waiting on React state flush after unlock. */
  const isLockedRef = useRef(isLocked);

  /** Connect once wallet material is in refs; uses connectRef (ready after first paint). */
  const connectAfterWalletReady = useCallback(async () => {
    if (!walletRef.current || !scripthashRef.current || isLockedRef.current) return;
    const run = connectRef.current;
    if (!run) return;
    try {
      await run();
    } catch {
      // connect already set status/error
    }
  }, []);

  const configuredServers = useMemo(() => {
    if (servers.length > 0) return servers.filter(Boolean);
    if (server.trim()) return [server.trim()];
    return [] as string[];
  }, [servers, server]);

  const electrumTrust = useMemo(
    () =>
      assessElectrumTrust({
        configuredCount: configuredServers.length,
        // 0 = uninitialized → treat as configured (optimistic); VERIFY_FAILED sets 1.
        permittedCount:
          usableEndpointCount === 0
            ? configuredServers.length
            : Math.min(usableEndpointCount, configuredServers.length),
        verifyEnabled: verifyWithSecondServer,
      }),
    [configuredServers.length, usableEndpointCount, verifyWithSecondServer]
  );

  const chainOpsBlocked = electrumTrustBlocksChainOps(electrumTrust);

  const resolvePermittedCount = useCallback(
    (configured: number) =>
      usableEndpointCount === 0
        ? configured
        : Math.min(usableEndpointCount, configured),
    [usableEndpointCount]
  );

  // Keep usable count aligned with configured list when the list changes (optimistic).
  // VERIFY_FAILED may lower it until the user edits servers / retries via reset.
  const configuredCountRef = useRef(configuredServers.length);
  useEffect(() => {
    if (configuredServers.length !== configuredCountRef.current) {
      configuredCountRef.current = configuredServers.length;
      setUsableEndpointCount(configuredServers.length);
    }
  }, [configuredServers.length]);

  const clearPendingSecrets = useCallback(() => {
    pendingMnemonicRef.current = undefined;
    pendingPasswordRef.current = undefined;
    pendingPassphraseRef.current = undefined;
    pendingCreateAddressRef.current = undefined;
  }, []);

  const persistVault = useCallback(
    async (payload: VaultPayload, password: string, ppRequired: boolean) => {
      const envelope = await sealSessionVault({
        payload,
        password,
        passphraseRequired: ppRequired,
      });
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(ENCRYPTED_DATA_KEY, serializeSessionVault(envelope));
        sessionStorage.removeItem('wallet_password_hash'); // legacy pre-W3 key
        sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      }
      passphraseRequiredRef.current = ppRequired;
      seedFingerprintRef.current = payload.seedFingerprint;
      setPassphraseRequired(ppRequired);
    },
    []
  );

  const disposeElectrum = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    electrumRef.current = null;
  }, []);

  const resetState = useCallback(() => {
    setStage('idle');
    setStatus('disconnected');
    setError(undefined);
    setAddress(undefined);
    setBalance({ confirmed: 0, unconfirmed: 0 });
    setHistory([]);
    setRelayFee(1000);
    setFeeRate(10);
    setIsLocked(false);
    setRequiresPassword(false);
    setPassphraseRequired(false);
    setPasswordError(undefined);
    clearPendingSecrets();
    justCreatedOrImportedRef.current = false;
    walletRef.current = undefined;
    scripthashRef.current = undefined;
    // SECURITY: Clear sensitive data from refs
    mnemonicRef.current = undefined;
    seedFingerprintRef.current = undefined;
    passphraseRequiredRef.current = false;

    isReconnectingRef.current = false;
    disposeElectrum();
    
    // Clear encrypted data from sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(ENCRYPTED_DATA_KEY);
      sessionStorage.removeItem('wallet_password_hash'); // legacy pre-W3 key
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);
      sessionStorage.removeItem(UNLOCK_ATTEMPTS_KEY);
      sessionStorage.removeItem(LOCKOUT_UNTIL_KEY);
      clearDailySpendStorage();
      // Note: We keep ACCEPTED_TERMS_KEY and address book / daily limit prefs
    }
    
    // Clear activity timeout
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
      activityTimeoutRef.current = undefined;
    }
  }, [disposeElectrum, clearPendingSecrets]);

  // Check if wallet is locked (has encrypted data) and restore state
  // Only run this on initial mount, not after wallet creation/import or stage changes
  useEffect(() => {
    if (typeof window !== 'undefined' && !justCreatedOrImportedRef.current) {
      const hasEncryptedData = sessionStorage.getItem(ENCRYPTED_DATA_KEY);
      const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY);
      const storedAttempts = sessionStorage.getItem(UNLOCK_ATTEMPTS_KEY);
      const storedLockout = sessionStorage.getItem(LOCKOUT_UNTIL_KEY);
      
      // Restore unlock attempts and lockout state
      if (storedAttempts) {
        setUnlockAttempts(parseInt(storedAttempts, 10));
      }
      if (storedLockout) {
        const lockoutTime = parseInt(storedLockout, 10);
        if (Date.now() < lockoutTime) {
          setLockoutUntil(lockoutTime);
        } else {
          // Lockout expired, clear it
          sessionStorage.removeItem(LOCKOUT_UNTIL_KEY);
          sessionStorage.removeItem(UNLOCK_ATTEMPTS_KEY);
          setUnlockAttempts(0);
          setLockoutUntil(null);
        }
      }
      
      if (hasEncryptedData) {
        setPassphraseRequired(vaultPassphraseRequired(hasEncryptedData));
        // Check if session has timed out
        const timeSinceActivity = lastActivity
          ? Date.now() - parseInt(lastActivity, 10)
          : DEFAULT_AUTO_LOCK_MS + 1;
        const isSessionExpired = timeSinceActivity > DEFAULT_AUTO_LOCK_MS;
        
        if (isSessionExpired) {
          // Session expired - wallet is locked
          setIsLocked(true);
        } else {
          // Session still active - but wallet needs to be unlocked by user
          // Don't auto-unlock, require user to enter password for security
          setIsLocked(true);
        }
        
        // Set stage to 'ready' so the wallet knows it exists, but it's locked
        // This prevents showing the create/import screen when wallet data exists
        if (stage === 'idle') {
          setStage('ready');
        }
      }
    }
  }, []); // Only run once on initial mount

  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  // Session timeout check
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkSessionTimeout = () => {
      const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY);
      if (!lastActivity) return;

      const timeSinceActivity = Date.now() - parseInt(lastActivity, 10);
      if (
        timeSinceActivity > DEFAULT_AUTO_LOCK_MS &&
        !isLocked &&
        (stage === 'ready' || stage === 'created')
      ) {
        lockWalletRef.current();
      }
    };

    sessionCheckIntervalRef.current = setInterval(checkSessionTimeout, 1000);

    return () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
      }
    };
  }, [isLocked, stage]);

  const updateActivity = useCallback(() => {
    if (typeof window !== 'undefined' && !isLocked) {
      sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      
      activityTimeoutRef.current = setTimeout(() => {
        if (!isLocked && (stage === 'ready' || stage === 'created')) {
          lockWalletRef.current();
        }
      }, DEFAULT_AUTO_LOCK_MS);
    }
  }, [isLocked, stage]);

  // Track user activity
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => {
      if (!isLocked) {
        updateActivity();
      }
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isLocked, updateActivity]);

  // Best-effort lock when tab/page hides (idle timer remains primary)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    return attachLockOnHide({
      target: document,
      shouldLock: () =>
        shouldLockOnHide({
          hasVault: !!sessionStorage.getItem(ENCRYPTED_DATA_KEY),
          isLocked,
        }),
      lock: () => lockWalletRef.current(),
    });
  }, [isLocked]);

  const acceptTerms = useCallback(() => {
    setAccepted(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ACCEPTED_TERMS_KEY, 'true');
    }
  }, []);

  const setNetworkType = useCallback((network: 'mainnet' | 'testnet') => {
    setNetworkTypeState(network);
    
    // Update servers list when network changes
    let newServers: string[] = [];
    if (typeof window !== 'undefined') {
      const envMainnet = process.env.NEXT_PUBLIC_ELECTRUMX_MAINNET;
      const envTestnet = process.env.NEXT_PUBLIC_ELECTRUMX_TESTNET;
      
      if (network === 'mainnet' && envMainnet) {
        newServers = envMainnet.split(',').map(s => s.trim()).filter(Boolean);
      } else if (network === 'testnet' && envTestnet) {
        newServers = envTestnet.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    
    if (newServers.length === 0) {
      newServers = network === 'mainnet' ? DEFAULT_SERVERS_MAINNET : DEFAULT_SERVERS_TESTNET;
    }
    
    setServersState(newServers);
    setServerState(newServers[0] || getDefaultServer(network));
    sessionStorage.setItem('cyberyen-network', network);
    
    // Disconnect and reset if connected
    disposeElectrum();
    setStatus('disconnected');
    isReconnectingRef.current = false;
    
    // Reset wallet state when network changes
    resetState();
  }, [resetState, disposeElectrum]);

  const setServer = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setServerState(trimmed);
    setServersState((prev) => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
  }, []);

  const setVerifyWithSecondServer = useCallback((enabled: boolean) => {
    writeVerifyWithSecondServer(enabled);
    setVerifyWithSecondServerState(enabled);
    // Allow retry after toggling (clears sticky degraded from VERIFY_FAILED).
    setUsableEndpointCount(configuredCountRef.current);
  }, []);

  const resetElectrumUsableCount = useCallback(() => {
    setUsableEndpointCount(configuredCountRef.current);
  }, []);

  const initWallet = useCallback(async (
    mnemonicInput: string,
    password: string,
    mode: 'create' | 'restore' = 'create',
    passphrase?: string
  ) => {
    const pp = normalizeOptionalPassphrase(passphrase);
    try {
      const passphraseRequiredFlag = pp !== undefined;
      let seedFingerprint: string | undefined;
      if (passphraseRequiredFlag) {
        seedFingerprint = await seedFingerprintFromMnemonic(mnemonicInput.trim(), pp);
      }

      const resolved = await resolveMnemonicWallet(mnemonicInput.trim(), {
        mode,
        networkType,
        passphrase: pp ?? '',
        expectedSeedFingerprint: seedFingerprint,
        probe: mode === 'restore' ? createExplorerAddressProbe(networkType) : undefined,
        hintStore: createLocalStorageHintStore(),
      });
      const derived = resolved.wallet;
      const network = getNetwork(networkType);
      const keyPair = ECPair.fromWIF(derived.firstPrivKeyWIF, network);
      walletRef.current = keyPair;
      scripthashRef.current = addressToScriptHash(derived.firstAddress, networkType);

      const payload: VaultPayload = {
        kind: 'mnemonic',
        secret: derived.mnemonic,
        ...(seedFingerprint ? { seedFingerprint } : {}),
      };
      await persistVault(payload, password, passphraseRequiredFlag);

      // SECURITY: Store mnemonic in ref, not state (prevents exposure in React DevTools)
      mnemonicRef.current = derived.mnemonic;
      setAddress(derived.firstAddress);
      derived.seed.fill(0);

      if (resolved.bothFunded) {
        setError(
          'Both standard and legacy derivation addresses have history. Using the legacy web path so existing funds remain accessible.'
        );
      }

      justCreatedOrImportedRef.current = true; // Mark that we just created wallet
      setStage('ready');
      clearPendingSecrets();
      isLockedRef.current = false;
      setIsLocked(false); // Wallet is unlocked after creation
      setRequiresPassword(false);

      updateActivity();
      await connectAfterWalletReady();
    } catch (err: any) {
      pendingPassphraseRef.current = undefined;
      setError(err.message || 'Failed to initialize wallet');
      throw err;
    }
  }, [networkType, updateActivity, clearPendingSecrets, persistVault, connectAfterWalletReady]);

  const startPasswordCreation = useCallback(() => {
    setStage('password-creation');
    setError(undefined);
  }, []);

  const goBack = useCallback(() => {
    if (stage === 'mnemonic-display') {
      clearPendingSecrets();
      setStage('password-creation');
    } else if (stage === 'mnemonic-input') {
      setStage('password-creation');
    } else if (stage === 'private-key-import') {
      setStage('password-creation');
    } else if (stage === 'password-creation') {
      if (importType) {
        setStage('import-method');
        clearPendingSecrets();
      } else {
        setStage('idle');
        clearPendingSecrets();
        setImportType(null);
        setError(undefined);
      }
    } else if (stage === 'import-method') {
      setStage('idle');
      setImportType(null);
      setError(undefined);
    }
  }, [stage, importType, clearPendingSecrets]);

  const confirmPassword = useCallback(async (
    password: string,
    entropy?: CreateEntropyOptions,
    passphrase?: string
  ) => {
    try {
      const policy = assertNewPassword(password);
      if (!policy.ok) {
        throw new Error(policy.error);
      }
      pendingPasswordRef.current = password;
      pendingPassphraseRef.current = normalizeOptionalPassphrase(passphrase);
      if (importType === 'mnemonic') {
        setStage('mnemonic-input');
      } else if (importType === 'private-key') {
        pendingPassphraseRef.current = undefined;
        setStage('private-key-import');
      } else {
        const wordCount = entropy?.wordCount ?? MNEMONIC_WORD_COUNT;
        const mode = entropy?.mode ?? 'csprng';
        const m = generateSeedMnemonic({
          wordCount,
          mode,
          diceRolls: entropy?.diceRolls,
          hexEntropy: entropy?.hexEntropy,
        });
        pendingMnemonicRef.current = m;
        try {
          const pp = pendingPassphraseRef.current ?? '';
          const preview = await mnemonicToWallet(m, pp, networkType, 0, 'bip84');
          pendingCreateAddressRef.current = preview.firstAddress;
          preview.seed.fill(0);
        } catch {
          pendingCreateAddressRef.current = undefined;
        }
        setStage('mnemonic-display');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate wallet');
      throw err;
    }
  }, [importType, networkType]);

  const confirmMnemonic = useCallback(async () => {
    const mnemonic = pendingMnemonicRef.current;
    const password = pendingPasswordRef.current;
    const passphrase = pendingPassphraseRef.current;
    if (!mnemonic || !password) {
      throw new Error('Missing mnemonic or password');
    }
    await initWallet(mnemonic, password, 'create', passphrase);
  }, [initWallet]);

  const createNewWallet = useCallback(async () => {
    setImportType(null);
    clearPendingSecrets();
    setStage('password-creation');
  }, [clearPendingSecrets]);

  const importWallet = useCallback(async () => {
    // Show import method selection
    setStage('import-method');
    setError(undefined);
  }, []);

  const importFromMnemonic = useCallback(async () => {
    // Go to password creation first, then mnemonic input
    setImportType('mnemonic');
    setStage('password-creation');
    setError(undefined);
  }, []);

  const importMnemonicWithPassword = useCallback(async (
    mnemonic: string,
    password: string,
    passphrase?: string
  ) => {
    try {
      const policy = assertNewPassword(password);
      if (!policy.ok) {
        throw new Error(policy.error);
      }
      const trimmed = mnemonic.trim();
      if (!validateMnemonic(trimmed)) {
        throw new Error('Invalid mnemonic phrase. Please verify all words.');
      }
      const pp = normalizeOptionalPassphrase(
        passphrase !== undefined ? passphrase : pendingPassphraseRef.current
      );
      await initWallet(trimmed, password, 'restore', pp);
    } catch (err: any) {
      setError(err.message || 'Failed to import mnemonic');
      throw err;
    }
  }, [initWallet]);

  const importFromPrivateKey = useCallback(async (privateKey: string, password: string) => {
    try {
      const policy = assertNewPassword(password);
      if (!policy.ok) {
        throw new Error(policy.error);
      }
      if (normalizeOptionalPassphrase(pendingPassphraseRef.current)) {
        throw new Error('BIP39 passphrase is not supported for private-key import');
      }
      const network = getNetwork(networkType);
      const trimmed = privateKey.trim();
      
      // Try to import from WIF format
      // ECPair.fromWIF will throw an error if the format is invalid
      let keyPair: ECPairInterface;
      try {
        keyPair = ECPair.fromWIF(trimmed, network);
      } catch (wifError: any) {
        // If WIF fails, try to parse as hex and create keypair
        try {
          const privateKeyBytes = hexToBytes(trimmed);
          if (privateKeyBytes.length !== 32) {
            throw new Error('Invalid private key length. Hex keys must be 64 characters (32 bytes).');
          }
          keyPair = ECPair.fromPrivateKey(privateKeyBytes, { network, compressed: true });
        } catch (hexError: any) {
          throw new Error(`Invalid private key format: ${wifError.message || 'Not a valid WIF or hex format'}`);
        }
      }
      
      const { address } = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
      
      if (!address) {
        throw new Error('Failed to derive address from private key');
      }

      walletRef.current = keyPair;
      scripthashRef.current = addressToScriptHash(address, networkType);
      
      await persistVault(
        { kind: 'privateKey', secret: trimmed },
        password,
        false
      );
      
      // SECURITY: Store private key in ref, not state (prevents exposure in React DevTools)
      mnemonicRef.current = trimmed;
      setAddress(address);
      justCreatedOrImportedRef.current = true; // Mark that we just imported wallet
      setStage('ready');
      clearPendingSecrets();
      isLockedRef.current = false;
      setIsLocked(false); // Wallet is unlocked after import
      setRequiresPassword(false);
      
      updateActivity();
      await connectAfterWalletReady();
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to import private key. Make sure it is in WIF format or hex format.';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [networkType, updateActivity, clearPendingSecrets, persistVault, connectAfterWalletReady]);

  const refresh = useCallback(async (client?: ElectrumClient) => {
    if (!scripthashRef.current) return;

    const urls = configuredServers.length > 0
      ? configuredServers
      : ([server].filter(Boolean) as string[]);
    const trust = assessElectrumTrust({
      configuredCount: urls.length,
      permittedCount: resolvePermittedCount(urls.length),
      verifyEnabled: verifyWithSecondServer,
    });

    try {
      assertElectrumTrustAllowsChainOps(trust);

      const useDual = verifyWithSecondServer && urls.length >= 2;
      let balanceSnap = { confirmed: 0, unconfirmed: 0 };

      if (useDual) {
        try {
          const { snapshot } = await dualVerifyRefresh(urls, scripthashRef.current, {
            verifyEnabled: true,
          });
          balanceSnap = snapshot.balance;
          setUsableEndpointCount(urls.length);
        } catch (err) {
          if (err instanceof ElectrumVerifyError && err.code === 'VERIFY_FAILED') {
            setUsableEndpointCount(1);
          }
          throw err;
        }
      } else {
        const active = client ?? electrumRef.current;
        if (!active) return;
        balanceSnap = await active.getBalance(scripthashRef.current);
      }

      setBalance({ confirmed: balanceSnap.confirmed, unconfirmed: balanceSnap.unconfirmed });

      const active = client ?? electrumRef.current;
      if (!active) return;

      const hist = await active.getHistory(scripthashRef.current);
      const canEnrich = sessionRef.current?.has('tx_get') ?? false;

      const detailed = await Promise.all(
        hist.slice(-20).map(async (h) => {
          if (!canEnrich) {
            return { txid: h.tx_hash, height: h.height, amount: 0 } as TxRecord;
          }
          try {
            const tx = await active.getTransaction(h.tx_hash);
            return {
              txid: h.tx_hash,
              height: h.height,
              amount: 0,
              timestamp: (tx as any)?.blocktime,
            } as TxRecord;
          } catch {
            return { txid: h.tx_hash, height: h.height, amount: 0 } as TxRecord;
          }
        })
      );
      setHistory(detailed);
      setError(undefined);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to refresh';
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }, [configuredServers, server, resolvePermittedCount, verifyWithSecondServer]);

  const connect = useCallback(async (tryNextServer = false) => {
    if (isLockedRef.current) {
      throw new Error('Wallet is locked. Please unlock first.');
    }
    if (!walletRef.current || !scripthashRef.current) {
      throw new Error('Wallet not ready');
    }

    const serversToTry = servers.length > 0 ? servers : [server].filter(Boolean);
    if (serversToTry.length === 0) {
      setStatus('error');
      setError('No Electrum servers configured');
      throw new Error('No Electrum servers configured');
    }

    setStatus('connecting');
    setError(undefined);

    try {
      let session = sessionRef.current;
      const urlsKey = serversToTry.join(',');
      const sessionUrlsKey = session?.serverUrls.join(',') ?? null;

      // Recreate only when absent or server list changed; rotate on the same session.
      if (!session || sessionUrlsKey !== urlsKey) {
        disposeElectrum();
        session = new ElectrumSession({
          urls: serversToTry,
          profile: WALLET_PROFILE,
          scripthash: scripthashRef.current,
          onConnectionLost: () => {
            if (
              isReconnectingRef.current ||
              isLockedRef.current ||
              !walletRef.current ||
              !scripthashRef.current
            ) {
              return;
            }
            isReconnectingRef.current = true;
            setStatus('connecting');
            connectRef.current?.(true)
              .catch(() => {
                setStatus('error');
                setError('All Electrum servers unavailable');
              })
              .finally(() => {
                isReconnectingRef.current = false;
              });
          },
        });
        sessionRef.current = session;
      }

      await session.connect(tryNextServer);

      const client = session.electrum;
      if (!client) {
        throw new Error('Electrum session connected without client');
      }

      const [relay, estimate] = await Promise.all([
        client.relayFee(),
        client.estimateFee(6),
      ]);
      setRelayFee(relay);
      setFeeRate(btcPerKbToSatsPerVbyte(estimate));

      electrumRef.current = client;
      setServerState(session.currentUrl || serversToTry[0]);
      setStatus('ready');
      setError(undefined);

      if (stage !== 'ready') {
        setStage('ready');
      }

      await refresh(client);
      await client.subscribeScripthash(scripthashRef.current, async () => {
        await refresh(client);
      });

      updateActivity();
    } catch (err: unknown) {
      disposeElectrum();
      const e = toElectrumError(err);
      setStatus('error');
      setError(e.message);
      throw e;
    }
  }, [servers, server, updateActivity, stage, refresh, disposeElectrum]);

  // Store connect function in ref after it's defined
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const getUtxos = useCallback(async (): Promise<Array<{ txid: string; vout: number; value: number }>> => {
    if (isLocked) {
      throw new Error('Wallet is locked. Please unlock first.');
    }
    if (!electrumRef.current || !scripthashRef.current) {
      throw new Error('Wallet not ready');
    }
    const client = electrumRef.current;
    const utxos = await client.listUnspent(scripthashRef.current);
    return utxos.map((u) => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value }));
  }, [isLocked]);

  const send = useCallback(async (
    to: string,
    amountCyb: number,
    options: SendOptions
  ) => {
    if (isLocked) {
      throw new Error('Wallet is locked. Please unlock first.');
    }
    if (!walletRef.current || !scripthashRef.current || !address) {
      throw new Error('Wallet not ready');
    }

    const urls = configuredServers.length > 0
      ? configuredServers
      : ([server].filter(Boolean) as string[]);
    const trust = assessElectrumTrust({
      configuredCount: urls.length,
      permittedCount: resolvePermittedCount(urls.length),
      verifyEnabled: verifyWithSecondServer,
    });
    assertElectrumTrustAllowsChainOps(trust);

    const includeFee = options.includeFee ?? false;
    const useDual = verifyWithSecondServer && urls.length >= 2;
    let spendable: Array<{ txid: string; vout: number; value: number }>;

    if (useDual) {
      try {
        const { snapshot } = await dualVerifyRefresh(urls, scripthashRef.current, {
          verifyEnabled: true,
        });
        setBalance({
          confirmed: snapshot.balance.confirmed,
          unconfirmed: snapshot.balance.unconfirmed,
        });
        setUsableEndpointCount(urls.length);
        spendable = snapshot.utxos;
      } catch (err) {
        if (err instanceof ElectrumVerifyError && err.code === 'VERIFY_FAILED') {
          setUsableEndpointCount(1);
        }
        throw err;
      }
    } else {
      if (!electrumRef.current) {
        throw new Error('Wallet not ready');
      }
      const utxos = await electrumRef.current.listUnspent(scripthashRef.current);
      spendable = utxos.map((u) => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value }));
    }

    const amountSats = cybToSats(amountCyb);

    const plan = planSpend({
      amountSats,
      feeRate,
      utxos: spendable,
      includeFee,
    });

    const limit = readDailySpendLimitSats();
    const daily = readDailySpend();
    assertSendSafeguards({
      toAddress: to.trim(),
      networkType,
      toConfirmSuffix: options.toConfirmSuffix,
      totalSats: plan.totalSats,
      confirmedBalanceSats: balance.confirmed,
      dailySpendLimitSats: limit,
      dailySpend: daily,
      allowSpendLimitOnce: options.allowSpendLimitOnce,
      acknowledgeLargeSend: options.acknowledgeLargeSend,
    });

    const { hex, fee } = buildAndSignTx({
      toAddress: to.trim(),
      amountSats,
      feeRate,
      fromAddress: address,
      keyPair: walletRef.current,
      utxos: spendable,
      networkType,
      includeFee,
    });

    let txid: string;
    try {
      const broadcast = await dualVerifyBroadcast(urls, hex, {
        verifyEnabled: verifyWithSecondServer,
      });
      txid = broadcast.txid;
      if (useDual) {
        setUsableEndpointCount(urls.length);
      }
    } catch (err) {
      if (err instanceof ElectrumVerifyError && err.code === 'VERIFY_FAILED') {
        setUsableEndpointCount(1);
      }
      throw err;
    }

    try {
      const next = recordSpend(readDailySpend(), plan.outputSats + fee);
      writeDailySpend(next);
    } catch {
      // Best-effort — must not flip broadcast success
    }

    await refresh(electrumRef.current ?? undefined);
    updateActivity();
    return { txid, fee };
  }, [
    feeRate,
    address,
    refresh,
    networkType,
    isLocked,
    updateActivity,
    balance.confirmed,
    configuredServers,
    server,
    resolvePermittedCount,
    verifyWithSecondServer,
  ]);

  const previewSendFlags = useCallback(async (
    to: string,
    amountCyb: number,
    includeFee: boolean = false
  ) => {
    if (isLocked || !electrumRef.current || !scripthashRef.current) {
      return { spendLimitExceeded: false, largeSend: false, totalSats: 0 };
    }
    const client = electrumRef.current;
    const utxos = await client.listUnspent(scripthashRef.current);
    const spendable = utxos.map((u) => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value }));
    const plan = planSpend({
      amountSats: cybToSats(amountCyb),
      feeRate,
      utxos: spendable,
      includeFee,
    });
    const flags = previewSendSafeguardFlags({
      totalSats: plan.totalSats,
      confirmedBalanceSats: balance.confirmed,
      dailySpendLimitSats: readDailySpendLimitSats(),
      dailySpend: readDailySpend(),
    });
    return { ...flags, totalSats: plan.totalSats };
  }, [isLocked, feeRate, balance.confirmed]);

  const getAddressBook = useCallback(() => readAddressBook(), []);

  const addToAddressBook = useCallback((entry: { label: string; address: string }) => {
    const next = addAddressBookEntry(readAddressBook(), {
      ...entry,
      network: networkType,
    });
    writeAddressBook(next);
    setAddressBookState(next);
  }, [networkType]);

  const removeFromAddressBook = useCallback((addr: string) => {
    const next = removeAddressBookEntry(readAddressBook(), networkType, addr);
    writeAddressBook(next);
    setAddressBookState(next);
  }, [networkType]);

  const setDailySpendLimitSatsFn = useCallback((limitSats: number | null) => {
    const normalized = normalizeDailySpendLimit(limitSats);
    writeDailySpendLimitSats(normalized);
    setDailySpendLimitState(normalized);
  }, []);

  const endSession = useCallback((expired = false) => {
    resetState();
    if (expired) {
      alert('Session timed out. Reload to continue.');
      window.location.href = '/';
    }
  }, [resetState]);


  const setPassword = useCallback(async (password: string) => {
    if (!mnemonicRef.current) {
      throw new Error('No wallet data to protect');
    }

    try {
      const policy = assertNewPassword(password);
      if (!policy.ok) {
        throw new Error(policy.error);
      }
      const secret = mnemonicRef.current;
      const isMnemonic = validateMnemonic(secret);
      const ppRequired = isMnemonic && passphraseRequiredRef.current;
      const payload: VaultPayload = isMnemonic
        ? {
            kind: 'mnemonic',
            secret,
            ...(ppRequired && seedFingerprintRef.current
              ? { seedFingerprint: seedFingerprintRef.current }
              : {}),
          }
        : { kind: 'privateKey', secret };

      if (ppRequired && !payload.seedFingerprint) {
        throw new Error('Cannot re-seal passphrase wallet without seed fingerprint');
      }

      await persistVault(payload, password, ppRequired && isMnemonic);
      
      setRequiresPassword(false);
      isLockedRef.current = false;
      setIsLocked(false);
      updateActivity();
      await connectAfterWalletReady();
    } catch (err: any) {
      throw new Error(err.message || 'Failed to set password');
    }
  }, [updateActivity, persistVault, connectAfterWalletReady]);

  const unlockWallet = useCallback(async (password: string, passphrase?: string) => {
    if (typeof window === 'undefined') {
      throw new Error('Cannot unlock in server environment');
    }

    // Check lockout status
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingMinutes = Math.ceil((lockoutUntil - Date.now()) / (60 * 1000));
      throw new Error(
        `Too many failed attempts. Please wait ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''} before trying again.`
      );
    }

    const encryptedDataStr = sessionStorage.getItem(ENCRYPTED_DATA_KEY);

    if (!encryptedDataStr) {
      throw new Error('No encrypted wallet data found');
    }

    const failUnlock = (_reason?: string): never => {
      const newAttempts = unlockAttempts + 1;
      setUnlockAttempts(newAttempts);
      sessionStorage.setItem(UNLOCK_ATTEMPTS_KEY, newAttempts.toString());

      if (newAttempts >= MAX_UNLOCK_ATTEMPTS) {
        const lockoutTime = Date.now() + LOCKOUT_DURATION;
        setLockoutUntil(lockoutTime);
        sessionStorage.setItem(LOCKOUT_UNTIL_KEY, lockoutTime.toString());
        setPasswordError(UNLOCK_LOCKOUT);
        throw new Error(UNLOCK_LOCKOUT);
      }

      const msg = unlockFailedWithAttempts(MAX_UNLOCK_ATTEMPTS - newAttempts);
      setPasswordError(msg);
      throw new Error(msg);
    };

    let opened;
    try {
      opened = await openSessionVault(encryptedDataStr, password);
    } catch (err) {
      if (err instanceof VaultOpenError) {
        failUnlock('auth');
      }
      throw err;
    }

    const { payload, passphraseRequired: vaultNeedsPp, needsMigrate } = opened;
    const pp = normalizeOptionalPassphrase(passphrase);

    try {
      if (vaultNeedsPp) {
        if (!pp) {
          failUnlock('missing_pp');
        }
        if (payload.kind !== 'mnemonic') {
          failUnlock('pp_on_private_key');
        }
      }

      const network = getNetwork(networkType);
      let keyPair: ECPairInterface;
      let address: string;

      if (payload.kind === 'mnemonic' || validateMnemonic(payload.secret.trim())) {
        const trimmed = payload.secret.trim();
        if (!validateMnemonic(trimmed)) {
          failUnlock('invalid_secret');
        }

        const expectedFp = vaultNeedsPp ? payload.seedFingerprint : undefined;
        try {
          const resolved = await resolveMnemonicWallet(trimmed, {
            mode: 'restore',
            networkType,
            passphrase: pp ?? '',
            expectedSeedFingerprint: expectedFp,
            probe: createExplorerAddressProbe(networkType),
            hintStore: createLocalStorageHintStore(),
          });
          const derived = resolved.wallet;
          keyPair = ECPair.fromWIF(derived.firstPrivKeyWIF, network);
          address = derived.firstAddress;
          mnemonicRef.current = derived.mnemonic;
          derived.seed.fill(0);
          if (resolved.bothFunded) {
            setError(
              'Both standard and legacy derivation addresses have history. Using the legacy web path so existing funds remain accessible.'
            );
          }
        } catch (err) {
          if (err instanceof WrongBip39PassphraseError) {
            failUnlock('wrong_pp');
          }
          throw err;
        }
      } else {
        const trimmed = payload.secret.trim();
        try {
          keyPair = ECPair.fromWIF(trimmed, network);
        } catch (wifError: any) {
          try {
            const privateKeyBytes = hexToBytes(trimmed);
            if (privateKeyBytes.length !== 32) {
              throw new Error('Invalid private key length. Hex keys must be 64 characters (32 bytes).');
            }
            keyPair = ECPair.fromPrivateKey(privateKeyBytes, { network, compressed: true });
          } catch (hexError: any) {
            throw new Error(
              `Invalid wallet data format: ${wifError.message || 'Not a valid mnemonic, WIF, or hex format'}`
            );
          }
        }

        const payment = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
        if (!payment.address) {
          throw new Error('Failed to derive address from private key');
        }
        address = payment.address;
        mnemonicRef.current = trimmed;
      }

      // Success — reset attempts and lockout
      setUnlockAttempts(0);
      setLockoutUntil(null);
      sessionStorage.removeItem(UNLOCK_ATTEMPTS_KEY);
      sessionStorage.removeItem(LOCKOUT_UNTIL_KEY);

      passphraseRequiredRef.current = vaultNeedsPp;
      seedFingerprintRef.current = payload.seedFingerprint;
      setPassphraseRequired(vaultNeedsPp);

      // Migrate pre-v2 envelopes → Argon2id v2 on successful unlock
      if (needsMigrate) {
        await persistVault(
          {
            kind: payload.kind,
            secret: payload.secret,
            ...(vaultNeedsPp && payload.seedFingerprint
              ? { seedFingerprint: payload.seedFingerprint }
              : {}),
          },
          password,
          vaultNeedsPp
        );
      }

      const scripthash = addressToScriptHash(address, networkType);
      walletRef.current = keyPair;
      scripthashRef.current = scripthash;
      setAddress(address);
      
      isLockedRef.current = false;
      setIsLocked(false);
      setPasswordError(undefined);
      updateActivity();
      await connectAfterWalletReady();
    } finally {
      // Never retain unlock passphrase
      // (caller may clear UI fields; we do not store it)
    }
  }, [networkType, updateActivity, unlockAttempts, lockoutUntil, persistVault, connectAfterWalletReady]);

  const lockWallet = useCallback(() => {
    // Clear sensitive data from memory
    walletRef.current = undefined;
    scripthashRef.current = undefined;
    mnemonicRef.current = undefined; // SECURITY: Clear mnemonic/private key from ref
    setAddress(undefined);
    setBalance({ confirmed: 0, unconfirmed: 0 });
    setHistory([]);
    
    // Disconnect electrum but keep encrypted data
    disposeElectrum();
    setStatus('disconnected');
    
    isLockedRef.current = true;
    setIsLocked(true);
    setPasswordError(undefined);
    
    // Clear activity tracking
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
      activityTimeoutRef.current = undefined;
    }
  }, [disposeElectrum]);

  useEffect(() => {
    lockWalletRef.current = lockWallet;
  }, [lockWallet]);

  const getCurrentPrivateKey = useCallback((): string | undefined => {
    if (isLocked || !walletRef.current) {
      return undefined;
    }
    try {
      return walletRef.current.toWIF();
    } catch (err) {
      return undefined;
    }
  }, [isLocked]);

  // SECURITY: Secure getter for mnemonic/private key - only returns when wallet is unlocked
  const getMnemonic = useCallback((): string | undefined => {
    if (isLocked) {
      return undefined;
    }
    return mnemonicRef.current;
  }, [isLocked]);

  const getPendingMnemonic = useCallback(() => pendingMnemonicRef.current, []);
  const getPendingPassword = useCallback(() => pendingPasswordRef.current, []);
  const getPendingCreateAddress = useCallback(() => pendingCreateAddressRef.current, []);

  const value = useMemo<WalletContextState>(() => ({
    accepted,
    stage,
    status,
    error,
    server,
    servers: servers.length > 0 ? servers : (networkType === 'mainnet' ? DEFAULT_SERVERS_MAINNET : DEFAULT_SERVERS_TESTNET),
    address,
    // SECURITY: Do not expose mnemonic in context value - use getMnemonic() function instead
    mnemonic: undefined,
    balance,
    history,
    relayFee,
    feeRate,
    networkType,
    isLocked,
    requiresPassword,
    passphraseRequired,
    passwordError,
    isCreateEntropyFlow: stage === 'password-creation' && importType === null,
    importType,
    addressBook,
    dailySpendLimitSats,
    electrumTrust,
    chainOpsBlocked,
    verifyWithSecondServer,
    createNewWallet,
    importWallet,
    importFromMnemonic,
    setServer,
    setVerifyWithSecondServer,
    resetElectrumUsableCount,
    setNetworkType,
    setFeeRate: (rate: number) => setFeeRate(rate),
    connect,
    refresh,
    send,
    previewSendFlags,
    getAddressBook,
    addToAddressBook,
    removeFromAddressBook,
    setDailySpendLimitSats: setDailySpendLimitSatsFn,
    acceptTerms,
    endSession,
    setPassword,
    unlockWallet,
    lockWallet,
    updateActivity,
    startPasswordCreation,
    confirmPassword,
    confirmMnemonic,
    importFromPrivateKey,
    importMnemonicWithPassword,
    goBack,
    clearPendingSecrets,
    setStage,
    setImportType: (type: 'mnemonic' | 'private-key' | null) => setImportType(type),
    getCurrentPrivateKey,
    getMnemonic,
    getPendingMnemonic,
    getPendingPassword,
    getPendingCreateAddress,
    getUtxos,
  }), [accepted, address, addressBook, acceptTerms, balance, chainOpsBlocked, connect, createNewWallet, dailySpendLimitSats, electrumTrust, endSession, error, feeRate, history, importWallet, importFromMnemonic, importMnemonicWithPassword, importType, isLocked, lockWallet, networkType, passphraseRequired, passwordError, previewSendFlags, refresh, relayFee, requiresPassword, resetElectrumUsableCount, send, server, setNetworkType, setPassword, setServer, setVerifyWithSecondServer, setFeeRate, servers, stage, status, unlockWallet, updateActivity, startPasswordCreation, confirmPassword, confirmMnemonic, importFromPrivateKey, goBack, clearPendingSecrets, getCurrentPrivateKey, getMnemonic, getPendingMnemonic, getPendingPassword, getPendingCreateAddress, getUtxos, getAddressBook, addToAddressBook, removeFromAddressBook, setDailySpendLimitSatsFn, verifyWithSecondServer]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = (): WalletContextState => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('WalletContext missing');
  return ctx;
};







