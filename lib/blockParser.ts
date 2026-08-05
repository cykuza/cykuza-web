/**
 * Unified block parsing logic for ElectrumX
 * Handles both height and hash-based lookups with proper tx_count extraction
 */

import { getBlockHeaderHex, getChainTip, getTxidFromPos } from './electrum/rpc';
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
        getTxidFromPos(network, height, txPos).then(
          () => true,
          () => false // Transaction doesn't exist at this position
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
 * Fetch and parse a block by height.
 * ElectrumX serves the 80-byte header; transaction count is derived by probing
 * positions so MWEB transactions are included.
 */
export async function fetchBlockByHeight(
  network: NetworkType,
  height: number
): Promise<ParsedBlockData> {
  const blockHex = await getBlockHeaderHex(network, height);

  if (blockHex.length < 160) {
    throw new Error('Invalid block header hex length');
  }

  const parsed = parseBlockHeader(blockHex.substring(0, 160));
  const parsedCount = blockHex.length > 160 ? parseTxCountFromBlockHex(blockHex) : 0;
  const actualCount = await countTransactionsInBlock(network, height);

  return {
    height,
    hash: parsed.hash,
    prev_hash: parsed.prevHash,
    merkle_root: parsed.merkleRoot,
    timestamp: parsed.timestamp,
    version: parsed.version,
    bits: parsed.bits,
    nonce: parsed.nonce,
    size: Math.floor(blockHex.length / 2),
    tx_count: Math.max(actualCount, parsedCount),
    header_hex: blockHex,
  };
}

const HASH_SEARCH_BATCH_SIZE = 20;
const HASH_SEARCH_TIMEOUT_MS = 20_000;
const HASH_SEARCH_HINT_RANGE = 200;
const HASH_SEARCH_RECENT_LIMIT = 1000;

async function matchHeightByHash(
  network: NetworkType,
  hash: string,
  height: number
): Promise<number | null> {
  try {
    const headerHex = await getBlockHeaderHex(network, height);
    if (headerHex.length < 160) return null;
    const parsed = parseBlockHeader(headerHex.substring(0, 160));
    return parsed.hash.toLowerCase() === hash.toLowerCase() ? height : null;
  } catch {
    return null;
  }
}

/** Scan candidate heights in batches until the hash matches or the deadline passes. */
async function scanHeights(
  network: NetworkType,
  hash: string,
  heights: number[],
  deadline: number
): Promise<number | null> {
  for (let i = 0; i < heights.length; i += HASH_SEARCH_BATCH_SIZE) {
    if (Date.now() > deadline) return null;

    const batch = heights.slice(i, i + HASH_SEARCH_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((height) => matchHeightByHash(network, hash, height))
    );
    const found = results.find((height): height is number => height !== null);
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * Find block height by hash: probe around the caller's hint first, then walk
 * back from the tip. Bounded by a deadline so a miss cannot stall the request.
 */
export async function findBlockHeightByHash(
  network: NetworkType,
  hash: string,
  fromHeight?: number
): Promise<number | null> {
  const { height: currentHeight } = await getChainTip(network);
  const deadline = Date.now() + HASH_SEARCH_TIMEOUT_MS;

  if (fromHeight !== undefined && fromHeight !== null) {
    const hintHeights: number[] = [fromHeight];
    for (let offset = 1; offset <= HASH_SEARCH_HINT_RANGE; offset++) {
      if (fromHeight - offset >= 0) hintHeights.push(fromHeight - offset);
      if (fromHeight + offset <= currentHeight) hintHeights.push(fromHeight + offset);
    }

    const found = await scanHeights(network, hash, hintHeights, deadline);
    if (found !== null) return found;
  }

  const recentHeights: number[] = [];
  for (let offset = 0; offset < HASH_SEARCH_RECENT_LIMIT && currentHeight - offset >= 0; offset++) {
    recentHeights.push(currentHeight - offset);
  }

  return scanHeights(network, hash, recentHeights, deadline);
}
