import { argon2id } from 'hash-wasm';
import { decryptWithPassword } from './password';
import { wipeBytes } from './wipeBytes';

export type SecretKind = 'mnemonic' | 'privateKey';

export interface VaultPayload {
  kind: SecretKind;
  secret: string;
  /**
   * Present when passphraseRequired — SHA256(BIP39 seed) as 32 hex chars (or legacy 8).
   * Used to distinguish wrong BIP39 passphrase after decrypt.
   */
  seedFingerprint?: string;
}

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/** Argon2id parameters — parity with cykuza-extension vault. */
export const VAULT_ARGON2 = {
  memorySize: 64 * 1024, // 64 MiB (hash-wasm units)
  iterations: 3,
  parallelism: 1,
  hashLength: KEY_LENGTH,
} as const;

/** W2 PBKDF2 envelope (still opened; migrated to v2 on unlock). */
export interface SessionVaultEnvelopeV1 {
  version: 1;
  passphraseRequired: boolean;
  encrypted: string;
  salt: string;
  iv: string;
  tag: string;
}

/** W3b Argon2id envelope — new seals. */
export interface SessionVaultEnvelopeV2 {
  version: 2;
  kdf: 'argon2id';
  passphraseRequired: boolean;
  encrypted: string;
  salt: string;
  iv: string;
  tag: string;
}

export type SessionVaultEnvelope = SessionVaultEnvelopeV1 | SessionVaultEnvelopeV2;

export class VaultOpenError extends Error {
  constructor(message = 'Invalid password or corrupted data') {
    super(message);
    this.name = 'VaultOpenError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEncryptedFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.encrypted === 'string' &&
    typeof value.salt === 'string' &&
    typeof value.iv === 'string' &&
    typeof value.tag === 'string'
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveArgon2Key(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const raw = await argon2id({
    password,
    salt,
    parallelism: VAULT_ARGON2.parallelism,
    iterations: VAULT_ARGON2.iterations,
    memorySize: VAULT_ARGON2.memorySize,
    hashLength: VAULT_ARGON2.hashLength,
    outputType: 'binary',
  });
  try {
    return crypto.subtle.importKey(
      'raw',
      toArrayBuffer(raw),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } finally {
    wipeBytes(raw);
  }
}

async function encryptWithArgon2(
  plaintext: string,
  password: string
): Promise<{ encrypted: string; salt: string; iv: string; tag: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveArgon2Key(password, salt);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    encoded
  );
  const encryptedArray = new Uint8Array(encrypted);
  const tag = encryptedArray.slice(-16);
  const ciphertext = encryptedArray.slice(0, -16);
  return {
    encrypted: toBase64(ciphertext),
    salt: toBase64(salt),
    iv: toBase64(iv),
    tag: toBase64(tag),
  };
}

async function decryptWithArgon2(
  enc: { encrypted: string; salt: string; iv: string; tag: string },
  password: string
): Promise<string> {
  const salt = fromBase64(enc.salt);
  const iv = fromBase64(enc.iv);
  const ciphertext = fromBase64(enc.encrypted);
  const tag = fromBase64(enc.tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  const key = await deriveArgon2Key(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(combined)
  );
  return new TextDecoder().decode(decrypted);
}

/** Whitelist parse — rejects foreign keys including `passphrase`. */
export function parseVaultPayload(raw: unknown): VaultPayload {
  if (!isRecord(raw)) {
    throw new Error('Invalid vault payload');
  }
  const allowed = new Set(['kind', 'secret', 'seedFingerprint']);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new Error('Invalid vault payload: unexpected fields');
    }
  }
  if (raw.kind !== 'mnemonic' && raw.kind !== 'privateKey') {
    throw new Error('Invalid vault payload kind');
  }
  if (typeof raw.secret !== 'string' || raw.secret.length === 0) {
    throw new Error('Invalid vault payload secret');
  }
  if (
    raw.seedFingerprint !== undefined &&
    (typeof raw.seedFingerprint !== 'string' ||
      !/^[0-9a-f]+$/i.test(raw.seedFingerprint))
  ) {
    throw new Error('Invalid vault payload fingerprint');
  }
  const payload: VaultPayload = {
    kind: raw.kind,
    secret: raw.secret,
  };
  if (typeof raw.seedFingerprint === 'string') {
    payload.seedFingerprint = raw.seedFingerprint.toLowerCase();
  }
  return payload;
}

function inferKindFromSecret(secret: string): SecretKind {
  const words = secret.trim().split(/\s+/).filter(Boolean);
  if (words.length === 12 || words.length === 24) return 'mnemonic';
  return 'privateKey';
}

/**
 * Detect passphraseRequired from stored JSON without decrypting.
 * Legacy EncryptedData (no version) → false.
 */
export function vaultPassphraseRequired(rawJson: string | null | undefined): boolean {
  if (!rawJson) return false;
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!isRecord(parsed)) return false;
    return (
      (parsed.version === 1 || parsed.version === 2) &&
      parsed.passphraseRequired === true
    );
  } catch {
    return false;
  }
}

export interface SealSessionVaultOpts {
  payload: VaultPayload;
  password: string;
  passphraseRequired: boolean;
}

/**
 * Seal vault payload with Argon2id (v2). Requires 32-hex seedFingerprint when passphraseRequired.
 */
export async function sealSessionVault(
  opts: SealSessionVaultOpts
): Promise<SessionVaultEnvelopeV2> {
  const { payload, password, passphraseRequired } = opts;
  if (passphraseRequired) {
    const fp = payload.seedFingerprint;
    if (!fp || !/^[0-9a-f]{32}$/.test(fp)) {
      throw new Error('passphraseRequired vaults need a 32-hex seedFingerprint');
    }
  } else if (payload.seedFingerprint) {
    throw new Error('seedFingerprint only allowed when passphraseRequired');
  }

  const plaintext = JSON.stringify(payload);
  const enc = await encryptWithArgon2(plaintext, password);
  return {
    version: 2,
    kdf: 'argon2id',
    passphraseRequired,
    encrypted: enc.encrypted,
    salt: enc.salt,
    iv: enc.iv,
    tag: enc.tag,
  };
}

export interface OpenSessionVaultResult {
  payload: VaultPayload;
  passphraseRequired: boolean;
  /** True when opened v0 EncryptedData or v1 PBKDF2 — reseal to v2 Argon2. */
  needsMigrate: boolean;
}

/**
 * Open vault with password (decrypt-first). Throws VaultOpenError on auth failure.
 * - v2: Argon2id + AES-GCM
 * - v1: PBKDF2 (W2) structured payload
 * - no version: PBKDF2 raw secret string (pre-W2)
 */
export async function openSessionVault(
  rawJson: string,
  password: string
): Promise<OpenSessionVaultResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new VaultOpenError('Corrupted wallet data');
  }
  if (!isRecord(parsed) || !isEncryptedFields(parsed)) {
    throw new VaultOpenError('Corrupted wallet data');
  }

  const enc = {
    encrypted: parsed.encrypted as string,
    salt: parsed.salt as string,
    iv: parsed.iv as string,
    tag: parsed.tag as string,
  };

  const isV2 = parsed.version === 2;
  const isV1 = parsed.version === 1;

  let plaintext: string;
  try {
    if (isV2) {
      if (parsed.kdf !== 'argon2id') {
        throw new VaultOpenError('Corrupted wallet data');
      }
      plaintext = await decryptWithArgon2(enc, password);
    } else {
      plaintext = await decryptWithPassword(enc, password);
    }
  } catch (err) {
    if (err instanceof VaultOpenError) throw err;
    throw new VaultOpenError();
  }

  if (isV2 || isV1) {
    let json: unknown;
    try {
      json = JSON.parse(plaintext);
    } catch {
      throw new VaultOpenError('Corrupted wallet data');
    }
    const payload = parseVaultPayload(json);
    const passphraseRequired = parsed.passphraseRequired === true;
    if (passphraseRequired && !payload.seedFingerprint) {
      throw new VaultOpenError('Corrupted wallet data');
    }
    return {
      payload,
      passphraseRequired,
      needsMigrate: isV1,
    };
  }

  // Legacy v0: plaintext is raw mnemonic or private key string
  const secret = plaintext;
  const payload: VaultPayload = {
    kind: inferKindFromSecret(secret),
    secret,
  };
  return { payload, passphraseRequired: false, needsMigrate: true };
}

/** Serialize envelope for sessionStorage. */
export function serializeSessionVault(envelope: SessionVaultEnvelope): string {
  return JSON.stringify(envelope);
}
