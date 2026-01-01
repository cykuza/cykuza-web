'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import { mnemonicToWallet, generateMnemonic, addressToScriptHash } from '@/lib/wallet/crypto';
import * as bip39 from 'bip39';
import { ElectrumClient, ElectrumStatus } from '@/lib/wallet/electrum';
import { buildAndSignTx, btcPerKbToSatsPerVbyte, cybToSats } from '@/lib/wallet/transaction';
import { encryptWithPassword, decryptWithPassword, hashPassword, verifyPassword } from '@/lib/wallet/password';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { getNetwork } from '@/lib/cyberyenNetwork';

export type WalletStage = 'idle' | 'import-method' | 'password-creation' | 'mnemonic-display' | 'mnemonic-input' | 'private-key-import' | 'created' | 'ready' | 'receive' | 'send' | 'error' | 'server-config' | 'private-key-view' | 'mnemonic-view';

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const ENCRYPTED_DATA_KEY = 'wallet_encrypted_data';
const PASSWORD_HASH_KEY = 'wallet_password_hash';
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

export interface WalletContextState {
  accepted: boolean;
  stage: WalletStage;
  status: ElectrumStatus;
  error?: string;
  server: string;
  servers: string[];
  address?: string;
  mnemonic?: string;
  pendingMnemonic?: string;
  pendingPassword?: string;
  balance: { confirmed: number; unconfirmed: number };
  history: TxRecord[];
  relayFee: number;
  feeRate: number;
  networkType: 'mainnet' | 'testnet';
  isLocked: boolean;
  requiresPassword: boolean;
  passwordError?: string;
  createNewWallet: () => Promise<void>;
  importWallet: () => Promise<void>;
  importFromMnemonic: () => Promise<void>;
  setServer: (url: string) => void;
  setNetworkType: (network: 'mainnet' | 'testnet') => void;
  setFeeRate: (rate: number) => void;
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  send: (to: string, amountCyb: number, includeFee?: boolean) => Promise<{ txid: string; fee: number }>;
  acceptTerms: () => void;
  endSession: (expired?: boolean) => void;
  setPassword: (password: string) => Promise<void>;
  unlockWallet: (password: string) => Promise<void>;
  lockWallet: () => void;
  updateActivity: () => void;
  startPasswordCreation: () => void;
  confirmPassword: (password: string) => Promise<void>;
  confirmMnemonic: () => Promise<void>;
  importFromPrivateKey: (privateKey: string, password: string) => Promise<void>;
  importMnemonicWithPassword: (mnemonic: string, password: string) => Promise<void>;
  goBack: () => void;
  setStage: (stage: WalletStage) => void;
  setPendingMnemonic: (mnemonic: string | null) => void;
  setImportType: (type: 'mnemonic' | 'private-key' | null) => void;
  getCurrentPrivateKey: () => string | undefined;
  getMnemonic: () => string | undefined; // SECURITY: Secure getter for mnemonic/private key
  getUtxos: () => Promise<Array<{ txid: string; vout: number; value: number }>>;
}

// Get default server from environment or use fallback
const getDefaultServer = (network: 'mainnet' | 'testnet'): string => {
  if (typeof window !== 'undefined') {
    // Try to get from environment variables (if available in client)
    const envMainnet = process.env.NEXT_PUBLIC_ELECTRUMX_MAINNET;
    const envTestnet = process.env.NEXT_PUBLIC_ELECTRUMX_TESTNET;
    
    if (network === 'mainnet' && envMainnet) {
      return envMainnet;
    }
    if (network === 'testnet' && envTestnet) {
      return envTestnet;
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
  const [currentServerIndex, setCurrentServerIndex] = useState(0);
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
  const [passwordError, setPasswordError] = useState<string>();
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);
  const [importType, setImportType] = useState<'mnemonic' | 'private-key' | null>(null);
  const [unlockAttempts, setUnlockAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  const walletRef = useRef<ECPairInterface>();
  const scripthashRef = useRef<string>();
  const mnemonicRef = useRef<string>(); // Store mnemonic/private key in ref, not state
  const electrumRef = useRef<ElectrumClient | null>(null);
  const activityTimeoutRef = useRef<NodeJS.Timeout>();
  const sessionCheckIntervalRef = useRef<NodeJS.Timeout>();
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  const justCreatedOrImportedRef = useRef(false); // Track if wallet was just created/imported
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const isReconnectingRef = useRef(false);

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
    setPasswordError(undefined);
    setPendingPassword(null);
    setPendingMnemonic(null);
    justCreatedOrImportedRef.current = false;
    walletRef.current = undefined;
    scripthashRef.current = undefined;
    // SECURITY: Clear sensitive data from refs
    mnemonicRef.current = undefined;
    
    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    isReconnectingRef.current = false;
    
    // Clear health check interval if exists
    if (electrumRef.current && (electrumRef.current as any).healthCheckInterval) {
      clearInterval((electrumRef.current as any).healthCheckInterval);
    }
    
    electrumRef.current?.disconnect();
    electrumRef.current = null;
    
    // Clear encrypted data from sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(ENCRYPTED_DATA_KEY);
      sessionStorage.removeItem(PASSWORD_HASH_KEY);
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);
      sessionStorage.removeItem(UNLOCK_ATTEMPTS_KEY);
      sessionStorage.removeItem(LOCKOUT_UNTIL_KEY);
      // Note: We keep ACCEPTED_TERMS_KEY so user doesn't have to accept again
    }
    
    // Clear activity timeout
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
      activityTimeoutRef.current = undefined;
    }
  }, []);

  // Check if wallet is locked (has encrypted data) and restore state
  // Only run this on initial mount, not after wallet creation/import or stage changes
  useEffect(() => {
    if (typeof window !== 'undefined' && !justCreatedOrImportedRef.current) {
      const hasEncryptedData = sessionStorage.getItem(ENCRYPTED_DATA_KEY);
      const hasPasswordHash = sessionStorage.getItem(PASSWORD_HASH_KEY);
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
      
      if (hasEncryptedData && hasPasswordHash) {
        // Check if session has timed out
        const timeSinceActivity = lastActivity ? Date.now() - parseInt(lastActivity, 10) : SESSION_TIMEOUT_MS + 1;
        const isSessionExpired = timeSinceActivity > SESSION_TIMEOUT_MS;
        
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

  // Auto-connect when wallet becomes ready
  useEffect(() => {
    if (stage === 'ready' && walletRef.current && scripthashRef.current && !electrumRef.current && !isLocked && connectRef.current) {
      // Auto-connect to default server
      const attemptConnect = async () => {
        try {
          if (connectRef.current) {
            await connectRef.current();
          }
        } catch (err) {
          // Connection errors are non-fatal, wallet is still usable
          if (process.env.NODE_ENV === 'development') {
            console.error('Auto-connect failed:', err);
          }
        }
      };
      // Small delay to ensure everything is set up
      const timeoutId = setTimeout(attemptConnect, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [stage, isLocked]);

  // Session timeout check
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkSessionTimeout = () => {
      const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY);
      if (!lastActivity) return;

      const timeSinceActivity = Date.now() - parseInt(lastActivity, 10);
      if (timeSinceActivity > SESSION_TIMEOUT_MS && !isLocked && (stage === 'ready' || stage === 'created')) {
        lockWallet();
      }
    };

    sessionCheckIntervalRef.current = setInterval(checkSessionTimeout, 1000); // Check every second

    return () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
      }
    };
  }, [isLocked, stage]);

  const updateActivity = useCallback(() => {
    if (typeof window !== 'undefined' && !isLocked) {
      sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      
      // Reset timeout
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      
      activityTimeoutRef.current = setTimeout(() => {
        if (!isLocked && (stage === 'ready' || stage === 'created')) {
          lockWallet();
        }
      }, SESSION_TIMEOUT_MS);
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
    setCurrentServerIndex(0);
    sessionStorage.setItem('cyberyen-network', network);
    
    // Disconnect and reset if connected
    if (electrumRef.current) {
      electrumRef.current.disconnect();
      electrumRef.current = null;
      setStatus('disconnected');
    }
    
    // Clear any pending reconnection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    isReconnectingRef.current = false;
    
    // Reset wallet state when network changes
    resetState();
  }, [resetState]);

  const setServer = useCallback((url: string) => {
    setServerState(url);
  }, []);

  const initWallet = useCallback(async (mnemonicInput: string, password: string) => {
    try {
      const derived = await mnemonicToWallet(mnemonicInput.trim(), '', networkType);
      const network = getNetwork(networkType);
      const keyPair = ECPair.fromWIF(derived.firstPrivKeyWIF, network);
      walletRef.current = keyPair;
      scripthashRef.current = addressToScriptHash(derived.firstAddress, networkType);
      
      // Immediately encrypt mnemonic with the password
      const encrypted = await encryptWithPassword(derived.mnemonic, password);
      const { hash, salt } = await hashPassword(password);
      
      // Store encrypted data and password hash
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(ENCRYPTED_DATA_KEY, JSON.stringify(encrypted));
        sessionStorage.setItem(PASSWORD_HASH_KEY, JSON.stringify({ hash, salt }));
        sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      }
      
      // SECURITY: Store mnemonic in ref, not state (prevents exposure in React DevTools)
      mnemonicRef.current = derived.mnemonic;
      setAddress(derived.firstAddress);
      
      justCreatedOrImportedRef.current = true; // Mark that we just created wallet
      setStage('ready');
      setPendingPassword(null);
      setPendingMnemonic(null);
      setIsLocked(false); // Wallet is unlocked after creation
      setRequiresPassword(false);
      
      updateActivity();
      
      // Auto-connect to default server will happen after connect is defined
      // We'll trigger it via a separate effect or after wallet is ready
    } catch (err: any) {
      setError(err.message || 'Failed to initialize wallet');
      throw err;
    }
  }, [networkType, updateActivity]);

  const startPasswordCreation = useCallback(() => {
    setStage('password-creation');
    setError(undefined);
  }, []);

  const goBack = useCallback(() => {
    if (stage === 'mnemonic-display') {
      setStage('password-creation');
      // Keep pending password and mnemonic for going back
    } else if (stage === 'mnemonic-input') {
      setStage('password-creation');
      // Keep pending password for going back
    } else if (stage === 'private-key-import') {
      setStage('password-creation');
      // Keep pending password for going back
    } else if (stage === 'password-creation') {
      // Check if we came from import method or create
      if (importType) {
        setStage('import-method');
      } else if (pendingMnemonic) {
        setStage('idle');
        setPendingPassword(null);
        setPendingMnemonic(null);
        setError(undefined);
      } else {
        setStage('idle');
        setPendingPassword(null);
        setPendingMnemonic(null);
        setImportType(null);
        setError(undefined);
      }
    } else if (stage === 'import-method') {
      setStage('idle');
      setImportType(null);
      setError(undefined);
    }
  }, [stage, pendingMnemonic, importType]);

  const confirmPassword = useCallback(async (password: string) => {
    try {
      setPendingPassword(password);
      // Check import type to determine next step
      if (importType === 'mnemonic') {
        // This is for mnemonic import - go to mnemonic input
        setStage('mnemonic-input');
      } else if (importType === 'private-key') {
        // This is for private key import - go to private key input
        setStage('private-key-import');
      } else if (pendingMnemonic) {
        // This is for new wallet creation - show mnemonic display
        setStage('mnemonic-display');
      } else {
        // This is for new wallet creation - generate mnemonic
        const m = generateMnemonic();
        setPendingMnemonic(m);
        setStage('mnemonic-display');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate wallet');
      throw err;
    }
  }, [pendingMnemonic, importType]);

  const confirmMnemonic = useCallback(async () => {
    if (!pendingMnemonic || !pendingPassword) {
      throw new Error('Missing mnemonic or password');
    }
    await initWallet(pendingMnemonic, pendingPassword);
    // Auto-connect will be handled by useEffect when stage becomes 'ready'
  }, [pendingMnemonic, pendingPassword, initWallet]);

  const createNewWallet = useCallback(async () => {
    setStage('password-creation');
  }, []);

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

  const importMnemonicWithPassword = useCallback(async (mnemonic: string, password: string) => {
    try {
      // Validate mnemonic format
      const trimmed = mnemonic.trim();
      const wordCount = trimmed.split(' ').filter(w => w.trim() !== '').length;
      if (!trimmed || wordCount !== 12) {
        throw new Error('Invalid mnemonic phrase. Must be exactly 12 words.');
      }
      // Import the wallet with the mnemonic and password
      await initWallet(trimmed, password);
    } catch (err: any) {
      setError(err.message || 'Failed to import mnemonic');
      throw err;
    }
  }, [initWallet]);

  const importFromPrivateKey = useCallback(async (privateKey: string, password: string) => {
    try {
      const network = getNetwork(networkType);
      const trimmed = privateKey.trim();
      
      // Try to import from WIF format
      // ECPair.fromWIF will throw an error if the format is invalid
      let keyPair: ECPairInterface;
      try {
        keyPair = ECPair.fromWIF(trimmed, network);
      } catch (wifError: any) {
        // If WIF fails, try to parse as hex and create keypair
        // This allows importing raw private keys in hex format
        try {
          const privateKeyBuffer = Buffer.from(trimmed, 'hex');
          if (privateKeyBuffer.length !== 32) {
            throw new Error('Invalid private key length. Hex keys must be 64 characters (32 bytes).');
          }
          keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network, compressed: true });
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
      
      // For private key import, we don't have a mnemonic, so we'll store the private key encrypted
      // Note: We'll store the WIF/hex as the "mnemonic" for consistency, but it's actually a private key
      const encrypted = await encryptWithPassword(trimmed, password);
      const { hash, salt } = await hashPassword(password);
      
      // Store encrypted data and password hash
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(ENCRYPTED_DATA_KEY, JSON.stringify(encrypted));
        sessionStorage.setItem(PASSWORD_HASH_KEY, JSON.stringify({ hash, salt }));
        sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      }
      
      // SECURITY: Store private key in ref, not state (prevents exposure in React DevTools)
      mnemonicRef.current = trimmed;
      setAddress(address);
      justCreatedOrImportedRef.current = true; // Mark that we just imported wallet
      setStage('ready');
      setPendingPassword(null);
      setPendingMnemonic(null);
      setIsLocked(false); // Wallet is unlocked after import
      setRequiresPassword(false);
      
      updateActivity();
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to import private key. Make sure it is in WIF format or hex format.';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [networkType, updateActivity]);

  const connect = useCallback(async (tryNextServer = false) => {
    if (isLocked) {
      throw new Error('Wallet is locked. Please unlock first.');
    }
    if (!walletRef.current || !scripthashRef.current) {
      throw new Error('Wallet not ready');
    }

    // Get list of servers to try
    const serversToTry = servers.length > 0 ? servers : [server];
    const startIndex = tryNextServer ? (currentServerIndex + 1) % serversToTry.length : currentServerIndex;
    
    setStatus('connecting');
    setError(undefined);

    // Try each server in order
    let lastError: Error | null = null;
    for (let i = 0; i < serversToTry.length; i++) {
      const serverIndex = (startIndex + i) % serversToTry.length;
      const serverToTry = serversToTry[serverIndex];
      
      const client = new ElectrumClient();
      try {
        // Set a connection timeout
        const connectPromise = client.connect(serverToTry);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 10000)
        );
        
        await Promise.race([connectPromise, timeoutPromise]);
        
        const version = await client.serverVersion();
        const protocol = parseFloat(version[1]);
        if (Number.isNaN(protocol) || protocol < 1.4) {
          throw new Error('Electrum server protocol too old. Require >=1.4');
        }
        
        const [relay, estimate] = await Promise.all([client.relayFee(), client.estimateFee(6)]);
        setRelayFee(relay);
        setFeeRate(btcPerKbToSatsPerVbyte(estimate));
        
        // Disconnect old client if exists
        if (electrumRef.current) {
          electrumRef.current.disconnect();
        }
        
        electrumRef.current = client;
        setServerState(serverToTry);
        setCurrentServerIndex(serverIndex);
        setStatus('ready');
        setError(undefined);
        
        // Only update stage if we're not already in ready state
        if (stage !== 'ready') {
          setStage('ready');
        }
        
        await refresh(client);
        await client.subscribeScripthash(scripthashRef.current, async () => {
          await refresh(client);
        });
        
        // Set up reconnection monitoring
        // Check connection health periodically and reconnect if needed
        const healthCheckInterval = setInterval(() => {
          if (!client.connected && !isReconnectingRef.current && walletRef.current && scripthashRef.current && !isLocked) {
            clearInterval(healthCheckInterval);
            isReconnectingRef.current = true;
            setStatus('connecting');
            reconnectTimeoutRef.current = setTimeout(async () => {
              try {
                await connect(true); // Try next server
              } catch (err) {
                // If all servers fail, set error status
                setStatus('error');
                setError('All Electrum servers unavailable');
              } finally {
                isReconnectingRef.current = false;
              }
            }, 2000);
          }
        }, 5000);
        
        // Store interval ID for cleanup
        (client as any).healthCheckInterval = healthCheckInterval;
        
        updateActivity();
        return; // Successfully connected
      } catch (err: any) {
        lastError = err;
        client.disconnect();
        // Continue to next server
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Failed to connect to ${serverToTry}:`, err.message);
        }
      }
    }
    
    // All servers failed
    setStatus('error');
    setError(lastError?.message || 'Failed to connect to all Electrum servers');
    throw lastError || new Error('Failed to connect to all Electrum servers');
  }, [servers, server, currentServerIndex, isLocked, updateActivity, stage]);

  // Store connect function in ref after it's defined
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const refresh = useCallback(async (client?: ElectrumClient) => {
    const active = client ?? electrumRef.current;
    if (!active || !scripthashRef.current) return;
    try {
      const [bal, hist] = await Promise.all([
        active.getBalance(scripthashRef.current),
        active.getHistory(scripthashRef.current)
      ]);
      const newBalance = { confirmed: bal.confirmed, unconfirmed: bal.unconfirmed };
      setBalance(newBalance);
      
      const detailed = await Promise.all(
        hist.slice(-20).map(async (h) => {
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
    } catch (err: any) {
      setError(err.message || 'Failed to refresh');
    }
  }, []);

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

  const send = useCallback(async (to: string, amountCyb: number, includeFee: boolean = false) => {
    if (isLocked) {
      throw new Error('Wallet is locked. Please unlock first.');
    }
    if (!electrumRef.current || !walletRef.current || !scripthashRef.current || !address) {
      throw new Error('Wallet not ready');
    }
    const client = electrumRef.current;
    const utxos = await client.listUnspent(scripthashRef.current);
    const spendable = utxos.map((u) => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value }));
    const { hex, fee } = buildAndSignTx({
      toAddress: to,
      amountSats: cybToSats(amountCyb),
      feeRate,
      fromAddress: address,
      keyPair: walletRef.current,
      utxos: spendable,
      networkType,
      includeFee,
    });
    const txid = await client.broadcast(hex);
    await refresh(client);
    updateActivity();
    return { txid, fee };
  }, [feeRate, address, refresh, networkType, isLocked, updateActivity]);

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
      // Encrypt mnemonic/private key with password
      const encrypted = await encryptWithPassword(mnemonicRef.current, password);
      
      // Hash password for verification
      const { hash, salt } = await hashPassword(password);
      
      // Store encrypted data and password hash in sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(ENCRYPTED_DATA_KEY, JSON.stringify(encrypted));
        sessionStorage.setItem(PASSWORD_HASH_KEY, JSON.stringify({ hash, salt }));
        sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      }
      
      setRequiresPassword(false);
      setIsLocked(false);
      updateActivity();
    } catch (err: any) {
      throw new Error(err.message || 'Failed to set password');
    }
  }, [updateActivity]);

  const unlockWallet = useCallback(async (password: string) => {
    if (typeof window === 'undefined') {
      throw new Error('Cannot unlock in server environment');
    }

    // Check lockout status
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingMinutes = Math.ceil((lockoutUntil - Date.now()) / (60 * 1000));
      throw new Error(`Too many failed attempts. Please wait ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''} before trying again.`);
    }

    const encryptedDataStr = sessionStorage.getItem(ENCRYPTED_DATA_KEY);
    const passwordHashStr = sessionStorage.getItem(PASSWORD_HASH_KEY);

    if (!encryptedDataStr || !passwordHashStr) {
      throw new Error('No encrypted wallet data found');
    }

    try {
      // SECURITY: Validate JSON before parsing to prevent injection
      let passwordHashData: { hash: string; salt: string };
      try {
        passwordHashData = JSON.parse(passwordHashStr);
        if (!passwordHashData || typeof passwordHashData !== 'object' || 
            typeof passwordHashData.hash !== 'string' || 
            typeof passwordHashData.salt !== 'string') {
          throw new Error('Invalid password hash format');
        }
      } catch (parseError) {
        throw new Error('Corrupted wallet data');
      }
      
      // Verify password
      const { hash, salt } = passwordHashData;
      const isValid = await verifyPassword(password, hash, salt);
      
      if (!isValid) {
        // Increment unlock attempts
        const newAttempts = unlockAttempts + 1;
        setUnlockAttempts(newAttempts);
        
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(UNLOCK_ATTEMPTS_KEY, newAttempts.toString());
        }
        
        if (newAttempts >= MAX_UNLOCK_ATTEMPTS) {
          const lockoutTime = Date.now() + LOCKOUT_DURATION;
          setLockoutUntil(lockoutTime);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(LOCKOUT_UNTIL_KEY, lockoutTime.toString());
          }
          throw new Error(`Too many failed attempts. Please wait 15 minutes before trying again.`);
        }
        
        throw new Error(`Invalid password. ${MAX_UNLOCK_ATTEMPTS - newAttempts} attempt${MAX_UNLOCK_ATTEMPTS - newAttempts !== 1 ? 's' : ''} remaining.`);
      }
      
      // Password is valid - reset attempts and lockout
      setUnlockAttempts(0);
      setLockoutUntil(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(UNLOCK_ATTEMPTS_KEY);
        sessionStorage.removeItem(LOCKOUT_UNTIL_KEY);
      }

      // SECURITY: Validate JSON before parsing
      let encryptedData: any;
      try {
        encryptedData = JSON.parse(encryptedDataStr);
        if (!encryptedData || typeof encryptedData !== 'object' ||
            typeof encryptedData.encrypted !== 'string' ||
            typeof encryptedData.salt !== 'string' ||
            typeof encryptedData.iv !== 'string' ||
            typeof encryptedData.tag !== 'string') {
          throw new Error('Invalid encrypted data format');
        }
      } catch (parseError) {
        throw new Error('Corrupted wallet data');
      }
      
      // Decrypt the stored data (could be mnemonic or private key)
      const decryptedData = await decryptWithPassword(encryptedData, password);
      const network = getNetwork(networkType);
      
      // Check if it's a mnemonic or a private key
      // Use bip39.validateMnemonic to properly detect mnemonics
      const trimmed = decryptedData.trim();
      const isMnemonic = bip39.validateMnemonic(trimmed);
      
      let keyPair: ECPairInterface;
      let address: string;
      
      if (isMnemonic) {
        // Restore from mnemonic
        const derived = await mnemonicToWallet(trimmed, '', networkType, 0);
        keyPair = ECPair.fromWIF(derived.firstPrivKeyWIF, network);
        address = derived.firstAddress;
        // SECURITY: Store mnemonic in ref, not state
        mnemonicRef.current = derived.mnemonic;
        // Clear sensitive data from derived object immediately
        (derived as any).mnemonic = undefined;
        (derived as any).seed = undefined;
        (derived as any).root = undefined;
        (derived as any).accountNode = undefined;
      } else {
        // Restore from private key (WIF or hex)
        try {
          keyPair = ECPair.fromWIF(trimmed, network);
        } catch (wifError: any) {
          // If WIF fails, try hex format
          try {
            const privateKeyBuffer = Buffer.from(trimmed, 'hex');
            if (privateKeyBuffer.length !== 32) {
              throw new Error('Invalid private key length. Hex keys must be 64 characters (32 bytes).');
            }
            keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network, compressed: true });
          } catch (hexError: any) {
            throw new Error(`Invalid wallet data format: ${wifError.message || 'Not a valid mnemonic, WIF, or hex format'}`);
          }
        }
        
        const payment = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
        if (!payment.address) {
          throw new Error('Failed to derive address from private key');
        }
        address = payment.address;
        // SECURITY: Store private key in ref, not state
        mnemonicRef.current = trimmed;
      }
      
      const scripthash = addressToScriptHash(address, networkType);
      walletRef.current = keyPair;
      scripthashRef.current = scripthash;
      setAddress(address);
      
      setIsLocked(false);
      setPasswordError(undefined);
      updateActivity();
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to unlock wallet';
      setPasswordError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [networkType, updateActivity, unlockAttempts, lockoutUntil]);

  const lockWallet = useCallback(() => {
    // Clear sensitive data from memory
    walletRef.current = undefined;
    scripthashRef.current = undefined;
    mnemonicRef.current = undefined; // SECURITY: Clear mnemonic/private key from ref
    setAddress(undefined);
    setBalance({ confirmed: 0, unconfirmed: 0 });
    setHistory([]);
    
    // Disconnect electrum but keep encrypted data
    electrumRef.current?.disconnect();
    electrumRef.current = null;
    setStatus('disconnected');
    
    setIsLocked(true);
    setPasswordError(undefined);
    
    // Clear activity tracking
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
      activityTimeoutRef.current = undefined;
    }
  }, []);

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

  const value = useMemo<WalletContextState>(() => ({
    accepted,
    stage,
    status,
    error,
    server,
    servers: servers.length > 0 ? servers : (networkType === 'mainnet' ? DEFAULT_SERVERS_MAINNET : DEFAULT_SERVERS_TESTNET),
    address,
    // SECURITY: Do not expose mnemonic in context value - use getMnemonic() function instead
    mnemonic: undefined, // Removed for security - use getMnemonic() if needed
    pendingMnemonic: pendingMnemonic || undefined,
    pendingPassword: pendingPassword || undefined,
    balance,
    history,
    relayFee,
    feeRate,
    networkType,
    isLocked,
    requiresPassword,
    passwordError,
    createNewWallet,
    importWallet,
    importFromMnemonic,
    setServer,
    setNetworkType,
    setFeeRate: (rate: number) => setFeeRate(rate),
    connect,
    refresh,
    send,
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
    setPendingMnemonic: (mnemonic: string | null) => setPendingMnemonic(mnemonic),
    setStage,
    setImportType: (type: 'mnemonic' | 'private-key' | null) => setImportType(type),
    getCurrentPrivateKey,
    getMnemonic,
    getUtxos,
  }), [accepted, address, balance, connect, createNewWallet, endSession, error, feeRate, history, importWallet, importFromMnemonic, importMnemonicWithPassword, isLocked, lockWallet, networkType, passwordError, pendingMnemonic, pendingPassword, refresh, relayFee, requiresPassword, send, setNetworkType, setPassword, setServer, setFeeRate, servers, stage, status, unlockWallet, updateActivity, startPasswordCreation, confirmPassword, confirmMnemonic, importFromPrivateKey, goBack, getCurrentPrivateKey, getMnemonic, getUtxos]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = (): WalletContextState => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('WalletContext missing');
  return ctx;
};







