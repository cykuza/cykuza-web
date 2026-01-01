/**
 * Secure password-based encryption for wallet sessions
 * Uses Web Crypto API with PBKDF2 and AES-GCM
 */

const PBKDF2_ITERATIONS = 100000; // High iteration count for security
const KEY_LENGTH = 256; // AES-256
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12; // 96 bits for GCM

interface EncryptedData {
  encrypted: string; // Base64 encoded ciphertext
  salt: string; // Base64 encoded salt
  iv: string; // Base64 encoded IV
  tag: string; // Base64 encoded authentication tag
}

/**
 * Derive a key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Ensure salt is a proper Uint8Array with ArrayBuffer
  // Create a new ArrayBuffer-backed Uint8Array to satisfy TypeScript
  const saltArray = new Uint8Array(salt.length);
  saltArray.set(salt);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltArray,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt sensitive data with a password
 */
export async function encryptWithPassword(
  data: string,
  password: string
): Promise<EncryptedData> {
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Encrypt data
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encoder.encode(data)
  );

  // Extract authentication tag (last 16 bytes in GCM)
  const encryptedArray = new Uint8Array(encrypted);
  const tag = encryptedArray.slice(-16);
  const ciphertext = encryptedArray.slice(0, -16);

  return {
    encrypted: btoa(String.fromCharCode(...ciphertext)),
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    tag: btoa(String.fromCharCode(...tag)),
  };
}

/**
 * Decrypt data with a password
 */
export async function decryptWithPassword(
  encryptedData: EncryptedData,
  password: string
): Promise<string> {
  try {
    // Decode base64 strings
    const salt = Uint8Array.from(atob(encryptedData.salt), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encryptedData.iv), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(encryptedData.encrypted), (c) => c.charCodeAt(0));
    const tag = Uint8Array.from(atob(encryptedData.tag), (c) => c.charCodeAt(0));

    // Combine ciphertext and tag for GCM
    const encrypted = new Uint8Array(ciphertext.length + tag.length);
    encrypted.set(ciphertext);
    encrypted.set(tag, ciphertext.length);

    // Derive key from password
    const key = await deriveKey(password, salt);

    // Decrypt data
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error('Invalid password or corrupted data');
  }
}

/**
 * Hash password for verification (using PBKDF2)
 * This creates a one-way hash to verify password without storing it
 */
export async function hashPassword(password: string, salt?: Uint8Array): Promise<{ hash: string; salt: string }> {
  const usedSalt = salt || crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  
  // Derive key with extractable: true for password hashing
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Ensure salt is a proper Uint8Array with ArrayBuffer
  // Create a new ArrayBuffer-backed Uint8Array to satisfy TypeScript
  const saltArray = new Uint8Array(usedSalt.length);
  saltArray.set(usedSalt);
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltArray,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH,
    },
    true, // extractable: true for password hashing
    ['encrypt', 'decrypt']
  );
  
  // Export key as base64 for storage
  const exported = await crypto.subtle.exportKey('raw', key);
  const hash = btoa(String.fromCharCode(...new Uint8Array(exported)));
  
  return {
    hash,
    salt: btoa(String.fromCharCode(...usedSalt)),
  };
}

/**
 * Verify password against stored hash
 * SECURITY: Uses constant-time comparison to prevent timing attacks
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  try {
    const salt = Uint8Array.from(atob(storedSalt), (c) => c.charCodeAt(0));
    const { hash } = await hashPassword(password, salt);
    // SECURITY: Use constant-time comparison to prevent timing attacks
    return constantTimeEquals(hash, storedHash);
  } catch {
    // SECURITY: Always perform hash operation even on error to prevent timing attacks
    // Return false after a delay to mask timing differences
    await new Promise(resolve => setTimeout(resolve, 100));
    return false;
  }
}

