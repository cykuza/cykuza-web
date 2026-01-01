/**
 * Unified block parsing logic for ElectrumX
 * Handles both height and hash-based lookups with proper tx_count extraction
 */

import { callElectrumX } from './electrumServer';
import { parseBlockHeader, parseTxCountFromBlockHex } from './utils';
import type { NetworkType } from './cyberyenNetwork';

export interface ParsedBlockData {
  height: number;
  hash: string;
  prev_hash: string;
  merkle_root: string;
  timestamp: number;
  version: number;
  bits: number;
  nonce: number;
  size: number;
  tx_count: number;
  header_hex?: string;
  mweb?: unknown;
}

/**
 * Count transactions in a block by querying transaction positions
 * This method correctly counts all transactions including MWEB ones
 */
async function countTransactionsInBlock(
  network: NetworkType,
  height: number
): Promise<number> {
  // Try to get transaction count by querying positions until we get an error
  // This is the most reliable way to count all transactions including MWEB
  let count = 0;
  const maxAttempts = 10000; // Safety limit
  
  // Query in batches for better performance
  const batchSize = 50;
  for (let startPos = 0; startPos < maxAttempts; startPos += batchSize) {
    const batchPromises = [];
    for (let i = 0; i < batchSize; i++) {
      const txPos = startPos + i;
      batchPromises.push(
        callElectrumX(
          network,
          'blockchain.transaction.id_from_pos',
          [height, txPos, false]
        ).then(
          (txHash) => {
            // If we get a valid hash, transaction exists
            if (typeof txHash === 'string' && txHash.length === 64 && /^[a-fA-F0-9]{64}$/.test(txHash)) {
              return true;
            }
            return false;
          },
          () => false // Return false on error (transaction doesn't exist at this position)
        )
      );
    }
    
    const batchResults = await Promise.all(batchPromises);
    const foundCount = batchResults.filter(Boolean).length;
    
    if (foundCount === 0) {
      // No more transactions found in this batch, we're done
      break;
    }
    
    count += foundCount;
    
    // If we got fewer results than the batch size, we've reached the end
    if (foundCount < batchSize) {
      break;
    }
  }
  
  return count;
}

/**
 * Fetch and parse a block by height
 */
export async function fetchBlockByHeight(
  network: NetworkType,
  height: number
): Promise<ParsedBlockData> {
  // Fetch block data from ElectrumX
  const blockResponse = await callElectrumX(
    network,
    'blockchain.block.header',
    [height]
  );

  // Initialize result with height
  const result: Partial<ParsedBlockData> = {
    height,
    tx_count: 0,
  };

  // Handle different response types from ElectrumX
  if (typeof blockResponse === 'string') {
    // Response is hex string (header or full block)
    const hexString = blockResponse;
    
    if (hexString.length >= 160) {
      // Parse header (first 80 bytes = 160 hex chars)
      const headerHex = hexString.substring(0, 160);
      const parsed = parseBlockHeader(headerHex);
      
      result.hash = parsed.hash;
      result.prev_hash = parsed.prevHash;
      result.merkle_root = parsed.merkleRoot;
      result.timestamp = parsed.timestamp;
      result.version = parsed.version;
      result.bits = parsed.bits;
      result.nonce = parsed.nonce;
      result.header_hex = hexString;
      
      // Calculate size
      result.size = Math.floor(hexString.length / 2);
      
      // If we have more than just the header, try to parse tx_count from hex
      // But also count actual transactions to ensure accuracy (especially for MWEB blocks)
      if (hexString.length > 160) {
        const parsedCount = parseTxCountFromBlockHex(hexString);
        // Count actual transactions to get accurate count including MWEB
        const actualCount = await countTransactionsInBlock(network, height);
        // Use actual count if it's higher (more accurate), otherwise use parsed
        result.tx_count = actualCount > parsedCount ? actualCount : parsedCount;
      } else {
        // Only header available, count actual transactions
        result.tx_count = await countTransactionsInBlock(network, height);
      }
    } else {
      throw new Error('Invalid block header hex length');
    }
  } else if (blockResponse && typeof blockResponse === 'object') {
    // Response is an object
    const blockObj = blockResponse as {
      hex?: string;
      hash?: string;
      block_hash?: string;
      prev_hash?: string;
      previousblockhash?: string;
      merkle_root?: string;
      merkleroot?: string;
      timestamp?: number;
      time?: number;
      version?: number;
      bits?: number;
      nonce?: number;
      size?: number;
      tx_count?: number;
      nTx?: number;
      tx?: unknown[];
      mweb?: unknown;
    };

    // Extract other fields first
    result.hash = blockObj.hash || blockObj.block_hash || '';
    result.prev_hash = blockObj.prev_hash || blockObj.previousblockhash || '';
    result.merkle_root = blockObj.merkle_root || blockObj.merkleroot || '';
    result.timestamp = blockObj.timestamp || blockObj.time || 0;
    result.version = blockObj.version || 1;
    result.bits = blockObj.bits || 0;
    result.nonce = blockObj.nonce || 0;
    result.size = blockObj.size || 0;
    result.mweb = blockObj.mweb;
    result.header_hex = blockObj.hex;

    // If we have hex but missing header fields, parse from hex
    if (blockObj.hex && blockObj.hex.length >= 160) {
      const headerHex = blockObj.hex.substring(0, 160);
      const parsed = parseBlockHeader(headerHex);
      
      // Use parsed values if object values are missing
      if (!result.hash) result.hash = parsed.hash;
      if (!result.prev_hash) result.prev_hash = parsed.prevHash;
      if (!result.merkle_root) result.merkle_root = parsed.merkleRoot;
      if (!result.timestamp) result.timestamp = parsed.timestamp;
      if (!result.version || result.version === 1) result.version = parsed.version;
      if (!result.bits) result.bits = parsed.bits;
      if (!result.nonce) result.nonce = parsed.nonce;
    }

    // For tx_count: Try to get from object first, but always verify by counting
    // This ensures we count MWEB transactions correctly
    let parsedCount = 0;
    if (blockObj.tx_count !== undefined && blockObj.tx_count !== null) {
      parsedCount = blockObj.tx_count;
    } else if (blockObj.nTx !== undefined && blockObj.nTx !== null) {
      parsedCount = blockObj.nTx;
    } else if (Array.isArray(blockObj.tx)) {
      parsedCount = blockObj.tx.length;
    } else if (blockObj.hex && blockObj.hex.length > 160) {
      parsedCount = parseTxCountFromBlockHex(blockObj.hex);
    }
    
    // Count actual transactions to ensure accuracy (especially for MWEB blocks)
    const actualCount = await countTransactionsInBlock(network, height);
    // Use the higher count (actual count is more reliable for MWEB blocks)
    result.tx_count = actualCount > parsedCount ? actualCount : parsedCount;
  } else {
    throw new Error('Invalid block response format');
  }

  // Ensure all required fields are set
  return {
    height: result.height!,
    hash: result.hash || '',
    prev_hash: result.prev_hash || '',
    merkle_root: result.merkle_root || '',
    timestamp: result.timestamp || 0,
    version: result.version || 1,
    bits: result.bits || 0,
    nonce: result.nonce || 0,
    size: result.size || 80,
    tx_count: result.tx_count || 0,
    header_hex: result.header_hex,
    mweb: result.mweb,
  };
}

/**
 * Find block height by hash with optimized search
 */
export async function findBlockHeightByHash(
  network: NetworkType,
  hash: string,
  fromHeight?: number
): Promise<number | null> {
  const tip = await callElectrumX(network, 'blockchain.headers.subscribe', []);
  const currentHeight = tip.height || 0;
  
  const searchStartTime = Date.now();
  const maxSearchTime = 20000; // 20 second timeout
  
  // If fromHeight is provided, search around it first
  if (fromHeight !== undefined && fromHeight !== null) {
    const searchRange = 200; // Search ±200 blocks around hint
    const heightsToCheck: number[] = [];
    
    // Build list of heights to check (expanding from hint)
    for (let offset = 0; offset <= searchRange; offset++) {
      if (Date.now() - searchStartTime > maxSearchTime) break;
      
      if (offset === 0) {
        heightsToCheck.push(fromHeight);
      } else {
        if (fromHeight - offset >= 0) heightsToCheck.push(fromHeight - offset);
        if (fromHeight + offset <= currentHeight) heightsToCheck.push(fromHeight + offset);
      }
    }
    
    // Search in parallel batches
    const batchSize = 20;
    for (let i = 0; i < heightsToCheck.length; i += batchSize) {
      if (Date.now() - searchStartTime > maxSearchTime) break;
      
      const batch = heightsToCheck.slice(i, i + batchSize);
      const promises = batch.map(async (testHeight) => {
        try {
          const headerHex = await callElectrumX(
            network,
            'blockchain.block.header',
            [testHeight]
          );
          const hexString = typeof headerHex === 'string' ? headerHex : headerHex?.hex || '';
          if (hexString.length >= 160) {
            const parsed = parseBlockHeader(hexString.substring(0, 160));
            if (parsed.hash.toLowerCase() === hash.toLowerCase()) {
              return testHeight;
            }
          }
        } catch {
          // Continue
        }
        return null;
      });
      
      const results = await Promise.all(promises);
      const found = results.find(h => h !== null);
      if (found !== null && found !== undefined) {
        return found;
      }
    }
  }
  
  // If not found, search recent blocks (last 1000)
  if (Date.now() - searchStartTime < maxSearchTime) {
    const recentLimit = 1000;
    const batchSize = 20;
    
    for (let batchStart = 0; batchStart < recentLimit && currentHeight - batchStart >= 0; batchStart += batchSize) {
      if (Date.now() - searchStartTime > maxSearchTime) break;
      
      const batch = [];
      for (let i = 0; i < batchSize && (currentHeight - batchStart - i) >= 0; i++) {
        batch.push(currentHeight - batchStart - i);
      }
      
      const promises = batch.map(async (testHeight) => {
        try {
          const headerHex = await callElectrumX(
            network,
            'blockchain.block.header',
            [testHeight]
          );
          const hexString = typeof headerHex === 'string' ? headerHex : headerHex?.hex || '';
          if (hexString.length >= 160) {
            const parsed = parseBlockHeader(hexString.substring(0, 160));
            if (parsed.hash.toLowerCase() === hash.toLowerCase()) {
              return testHeight;
            }
          }
        } catch {
          // Continue
        }
        return null;
      });
      
      const results = await Promise.all(promises);
      const found = results.find(h => h !== null);
      if (found !== null && found !== undefined) {
        return found;
      }
    }
  }
  
  return null;
}

