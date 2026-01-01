import { z } from 'zod';

/**
 * Format satoshi to CY (Cyberyen)
 */
export function formatSatoshi(satoshi: number | string): string {
  const value = typeof satoshi === 'string' ? parseFloat(satoshi) : satoshi;
  return (value / 100000000).toFixed(8).replace(/\.?0+$/, '');
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format bytes to KB format (e.g., "0.599KB")
 */
export function formatBytesKB(bytes: number): string {
  if (bytes === 0) return '0KB';
  const kb = bytes / 1024;
  return `${kb.toFixed(3)}KB`;
}

/**
 * Format timestamp to human-readable date
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Format relative time (e.g., "2 hours ago", "1 min ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'min' : 'min'} ago`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(seconds / 86400);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/**
 * Validate block hash (64 hex characters)
 */
export const hashSchema = z.string().regex(/^[a-fA-F0-9]{64}$/, 'Invalid hash format');

/**
 * Validate transaction hash (64 hex characters)
 */
export const txHashSchema = z.string().regex(/^[a-fA-F0-9]{64}$/, 'Invalid transaction hash');

/**
 * Validate address format
 * Cyberyen addresses start with 'C' or 'Y' for mainnet, 'c' or 'y' for testnet
 * Basic format validation - actual validation happens in addressToScriptHash
 */
export const addressSchema = z.string()
  .min(26)
  .max(62)
  .refine((val) => /^[CcYy][a-zA-Z0-9]{25,61}$/.test(val), {
    message: 'Invalid address format'
  });

/**
 * Validate block height (non-negative integer)
 */
export const blockHeightSchema = z.number().int().nonnegative();

/**
 * Truncate hash for display
 */
export function truncateHash(hash: string | undefined | null, start: number = 8, end: number = 8): string {
  if (!hash) return '';
  if (hash.length <= start + end) return hash;
  return `${hash.substring(0, start)}...${hash.substring(hash.length - end)}`;
}

/**
 * Check if string is a valid hex
 */
export function isHex(str: string): boolean {
  return /^[a-fA-F0-9]+$/.test(str);
}

/**
 * Check if string looks like a block height (numeric)
 */
export function isBlockHeight(str: string): boolean {
  return /^\d+$/.test(str);
}

/**
 * Parse block header hex string and extract hash, timestamp, etc.
 * Block header is 80 bytes (160 hex chars):
 * - Version: 4 bytes (0-3) - little-endian
 * - Previous hash: 32 bytes (4-35) - stored in little-endian, display in big-endian
 * - Merkle root: 32 bytes (36-67) - stored in little-endian, display in big-endian
 * - Timestamp: 4 bytes (68-71) - little-endian
 * - Bits: 4 bytes (72-75) - little-endian
 * - Nonce: 4 bytes (76-79) - little-endian
 */
export function parseBlockHeader(headerHex: string): {
  hash: string;
  version: number;
  prevHash: string;
  merkleRoot: string;
  timestamp: number;
  bits: number;
  nonce: number;
} {
  if (!headerHex || headerHex.length < 160) {
    throw new Error('Invalid block header hex string');
  }

  // Convert hex to buffer
  const header = Buffer.from(headerHex, 'hex');
  
  if (header.length !== 80) {
    throw new Error(`Invalid header length: expected 80 bytes, got ${header.length}`);
  }
  
  // Parse fields (all little-endian)
  const version = header.readUInt32LE(0);
  
  // Previous hash and merkle root are stored in little-endian in the block
  // We need to reverse each 32-byte chunk to get big-endian representation
  const prevHashBytes = header.slice(4, 36);
  const prevHash = Buffer.from(prevHashBytes).reverse().toString('hex');
  
  const merkleRootBytes = header.slice(36, 68);
  const merkleRoot = Buffer.from(merkleRootBytes).reverse().toString('hex');
  
  const timestamp = header.readUInt32LE(68);
  const bits = header.readUInt32LE(72);
  const nonce = header.readUInt32LE(76);

  // Calculate block hash (double SHA256 of header, then reverse for display)
  // The hash is stored/displayed in big-endian format
  // Using require() is appropriate for Node.js built-in modules
  const crypto = require('crypto');
  const hash1 = crypto.createHash('sha256').update(header).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  // Reverse the hash to get big-endian representation
  const hash = Buffer.from(hash2).reverse().toString('hex');

  return {
    hash,
    version,
    prevHash,
    merkleRoot,
    timestamp,
    bits,
    nonce,
  };
}

/**
 * Calculate difficulty from bits field in block header
 * Bits format: 0x1d00ffff (exponent in first byte, mantissa in last 3 bytes)
 */
export function calculateDifficultyFromBits(bits: number): number {
  // Extract exponent (first byte) and mantissa (last 3 bytes)
  const exponent = bits >>> 24;
  const mantissa = bits & 0x007fffff;
  
  // Maximum target (genesis block difficulty = 1)
  // For Bitcoin/Litecoin: 0xffff0000 * 256^(0x1d - 3)
  const maxTarget = 0xffff0000 * Math.pow(256, 0x1d - 3);
  
  // Calculate target from bits
  let target: number;
  if (exponent <= 3) {
    target = mantissa >>> (8 * (3 - exponent));
  } else {
    target = mantissa * Math.pow(256, exponent - 3);
  }
  
  // Difficulty = maxTarget / target
  if (target === 0) return 0;
  return maxTarget / target;
}

/**
 * Calculate network hashrate from difficulty
 * Hashrate = Difficulty * (2^32) / Block Time
 * @param difficulty The network difficulty
 * @param blockTimeSeconds Block time in seconds (default: 150 for Cyberyen/Litecoin)
 */
export function calculateHashrate(difficulty: number, blockTimeSeconds: number = 150): number {
  if (difficulty <= 0 || blockTimeSeconds <= 0) return 0;
  return (difficulty * Math.pow(2, 32)) / blockTimeSeconds;
}

/**
 * Parse transaction count from block hex string
 * Transaction count is stored as a varint at byte 80 (after 80-byte header)
 */
export function parseTxCountFromBlockHex(blockHex: string): number {
  if (!blockHex || blockHex.length <= 160) {
    // Only header available, no transaction data
    return 0;
  }
  
  try {
    const blockBuffer = Buffer.from(blockHex, 'hex');
    // Transaction count varint starts at byte 80 (after 80-byte header)
    let offset = 80;
    if (offset >= blockBuffer.length) {
      return 0;
    }
    
    const firstByte = blockBuffer[offset];
    let txCount = 0;
    
    if (firstByte < 0xfd) {
      txCount = firstByte;
    } else if (firstByte === 0xfd) {
      if (offset + 3 <= blockBuffer.length) {
        txCount = blockBuffer.readUInt16LE(offset + 1);
      }
    } else if (firstByte === 0xfe) {
      if (offset + 5 <= blockBuffer.length) {
        txCount = blockBuffer.readUInt32LE(offset + 1);
      }
    } else {
      // 0xff - 64-bit, read as 32-bit for now
      if (offset + 9 <= blockBuffer.length) {
        txCount = blockBuffer.readUInt32LE(offset + 1);
      }
    }
    
    return txCount;
  } catch (error) {
    return 0;
  }
}

/**
 * Parse varint from buffer at offset
 * Returns { value: number, size: number } where size is bytes consumed
 */
function readVarint(buffer: Buffer, offset: number): { value: number; size: number } {
  if (offset >= buffer.length) {
    throw new Error('Buffer overflow reading varint');
  }
  
  const firstByte = buffer[offset];
  if (firstByte < 0xfd) {
    return { value: firstByte, size: 1 };
  } else if (firstByte === 0xfd) {
    if (offset + 3 > buffer.length) throw new Error('Buffer overflow reading varint');
    return { value: buffer.readUInt16LE(offset + 1), size: 3 };
  } else if (firstByte === 0xfe) {
    if (offset + 5 > buffer.length) throw new Error('Buffer overflow reading varint');
    return { value: buffer.readUInt32LE(offset + 1), size: 5 };
  } else {
    // 0xff - 64-bit, but we'll read as 32-bit for now
    if (offset + 9 > buffer.length) throw new Error('Buffer overflow reading varint');
    return { value: buffer.readUInt32LE(offset + 1), size: 9 };
  }
}

/**
 * Parse transaction hashes from full block hex
 * Returns array of transaction hashes (txids)
 */
export function parseTransactionHashesFromBlock(blockHex: string): string[] {
  if (!blockHex || blockHex.length <= 160) {
    // Only header available, no transactions
    return [];
  }

  try {
    const blockBuffer = Buffer.from(blockHex, 'hex');
    const txHashes: string[] = [];
    
    // Skip 80-byte header
    let offset = 80;
    
    // Read transaction count (varint)
    const txCountResult = readVarint(blockBuffer, offset);
    const txCount = txCountResult.value;
    offset += txCountResult.size;
    
    // Parse each transaction
    for (let i = 0; i < txCount && offset < blockBuffer.length; i++) {
      const txStartOffset = offset;
      
      // Read transaction version (4 bytes)
      if (offset + 4 > blockBuffer.length) break;
      offset += 4;
      
      // Read input count (varint)
      const inputCountResult = readVarint(blockBuffer, offset);
      offset += inputCountResult.size;
      
      // Skip all inputs
      for (let j = 0; j < inputCountResult.value && offset < blockBuffer.length; j++) {
        // Previous output hash (32 bytes) + index (4 bytes)
        if (offset + 36 > blockBuffer.length) break;
        offset += 36;
        
        // Script length (varint)
        const scriptLenResult = readVarint(blockBuffer, offset);
        offset += scriptLenResult.size;
        
        // Skip script
        if (offset + scriptLenResult.value > blockBuffer.length) break;
        offset += scriptLenResult.value;
        
        // Sequence (4 bytes)
        if (offset + 4 > blockBuffer.length) break;
        offset += 4;
      }
      
      // Read output count (varint)
      if (offset >= blockBuffer.length) break;
      const outputCountResult = readVarint(blockBuffer, offset);
      offset += outputCountResult.size;
      
      // Skip all outputs
      for (let j = 0; j < outputCountResult.value && offset < blockBuffer.length; j++) {
        // Value (8 bytes)
        if (offset + 8 > blockBuffer.length) break;
        offset += 8;
        
        // Script length (varint)
        const scriptLenResult = readVarint(blockBuffer, offset);
        offset += scriptLenResult.size;
        
        // Skip script
        if (offset + scriptLenResult.value > blockBuffer.length) break;
        offset += scriptLenResult.value;
      }
      
      // Locktime (4 bytes)
      if (offset + 4 > blockBuffer.length) break;
      offset += 4;
      
      // Calculate transaction hash (double SHA256 of transaction, then reverse)
      const txHex = blockHex.substring(txStartOffset * 2, offset * 2);
      const txBuffer = Buffer.from(txHex, 'hex');
      // Using require() is appropriate for Node.js built-in modules
      const crypto = require('crypto');
      const hash1 = crypto.createHash('sha256').update(txBuffer).digest();
      const hash2 = crypto.createHash('sha256').update(hash1).digest();
      const txid = Buffer.from(hash2).reverse().toString('hex');
      txHashes.push(txid);
    }
    
    return txHashes;
  } catch (error) {
    console.error('Error parsing transaction hashes from block:', error);
    return [];
  }
}

