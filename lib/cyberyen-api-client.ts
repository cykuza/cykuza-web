/**
 * Cyberyen Explorer API Client
 * 
 * A client-side library for accessing Cyberyen blockchain data.
 * Can be used in any JavaScript/TypeScript application (React, Vue, vanilla JS, Node.js, etc.)
 * 
 * This library connects directly to ElectrumX servers via WebSocket (WSS),
 * making it work perfectly on any platform including Vercel.
 * 
 * Usage:
 * ```typescript
 * import { CyberyenAPIClient } from '@/lib/cyberyen-api-client';
 * 
 * const client = new CyberyenAPIClient('wss://electrum-server:50004', 'mainnet');
 * await client.connect();
 * 
 * const block = await client.getBlock(123);
 * const tx = await client.getTransaction('abc123...');
 * const address = await client.getAddress('cy1q...');
 * ```
 */

import { ElectrumClient } from './wallet/electrum';
import { parseBlockHeader, parseTxCountFromBlockHex, calculateDifficultyFromBits, calculateHashrate } from './utils';
import { parseBlock, parseTransaction } from './parsers';
import { addressToScriptHash } from './wallet/crypto';

type NetworkType = 'mainnet' | 'testnet';

export interface BlockData {
  height: number;
  hash: string;
  prev_hash: string;
  merkle_root: string;
  timestamp: number;
  size: number;
  tx_count: number;
  hasMweb: boolean;
}

export interface TransactionData {
  txid: string;
  hash: string;
  version: number;
  size: number;
  inputs: any[];
  outputs: any[];
  fee?: number;
  isMweb: boolean;
}

export interface AddressData {
  address: string;
  balance: number;
  confirmed: number;
  unconfirmed: number;
  history: Array<{
    tx_hash: string;
    height: number;
    fee?: number;
  }>;
}

export class CyberyenAPIClient {
  private client: ElectrumClient;
  private network: NetworkType;
  private connected: boolean = false;

  constructor(serverUrl: string, network: NetworkType = 'mainnet') {
    this.client = new ElectrumClient();
    this.network = network;
    // Store server URL for reconnection
    (this.client as any).serverUrl = serverUrl;
  }

  /**
   * Connect to ElectrumX server
   */
  async connect(): Promise<void> {
    const serverUrl = (this.client as any).serverUrl;
    if (!serverUrl) {
      throw new Error('Server URL not provided');
    }
    await this.client.connect(serverUrl);
    this.connected = true;
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.client.disconnect();
    this.connected = false;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.client.connected;
  }

  /**
   * Get network statistics
   */
  async getNetworkStats(): Promise<{
    blockHeight: number;
    hashrate: number;
    difficulty?: number;
  }> {
    this.ensureConnected();
    
    const tip = await this.client.call('blockchain.headers.subscribe', []);
    const currentHeight = (tip && typeof tip === 'object' && 'height' in tip) 
      ? tip.height 
      : (typeof tip === 'number' ? tip : 0);
    
    let hashrate = 0;
    if (currentHeight > 0) {
      try {
        const headerHex = await this.client.call('blockchain.block.header', [currentHeight]);
        if (typeof headerHex === 'string' && headerHex.length >= 160) {
          const header = parseBlockHeader(headerHex.substring(0, 160));
          const difficulty = calculateDifficultyFromBits(header.bits);
          const BLOCK_TIME_SECONDS = 150;
          hashrate = calculateHashrate(difficulty, BLOCK_TIME_SECONDS);
        }
      } catch (err) {
        // Ignore errors
      }
    }

    return {
      blockHeight: currentHeight,
      hashrate,
    };
  }

  /**
   * Get block by height
   */
  async getBlock(height: number): Promise<BlockData> {
    this.ensureConnected();
    
    const blockResponse = await this.client.call('blockchain.block.header', [height]);
    const parsed = parseBlock(blockResponse, height);
    
    return {
      height: parsed.height,
      hash: parsed.hash,
      prev_hash: parsed.prev_hash,
      merkle_root: parsed.merkle_root,
      timestamp: parsed.timestamp,
      size: parsed.size,
      tx_count: parsed.tx_count,
      hasMweb: parsed.hasMweb,
    };
  }

  /**
   * Get block by hash
   */
  async getBlockByHash(hash: string, fromHeight?: number): Promise<BlockData> {
    this.ensureConnected();
    
    const height = await this.findBlockHeightByHash(hash, fromHeight);
    if (height === null) {
      throw new Error('Block not found');
    }
    
    return this.getBlock(height);
  }

  /**
   * Get transaction by hash
   */
  async getTransaction(hash: string): Promise<TransactionData> {
    this.ensureConnected();
    
    const txData = await this.client.call('blockchain.transaction.get', [hash, true]);
    const parsed = parseTransaction(txData, this.network);
    
    return {
      txid: parsed.txid,
      hash: parsed.hash,
      version: parsed.version,
      size: parsed.size,
      inputs: parsed.inputs,
      outputs: parsed.outputs,
      fee: parsed.fee,
      isMweb: parsed.isMweb,
    };
  }

  /**
   * Get address information
   */
  async getAddress(address: string): Promise<AddressData> {
    this.ensureConnected();
    
    const scriptHash = addressToScriptHash(address, this.network);
    
    const balance = await this.client.call('blockchain.scripthash.get_balance', [scriptHash]);
    
    let history: any[] = [];
    try {
      const historyResult = await this.client.call('blockchain.scripthash.get_history', [scriptHash]);
      history = Array.isArray(historyResult) ? historyResult.map((item: any) => ({
        tx_hash: item.tx_hash || item.txid || '',
        height: typeof item.height === 'number' ? item.height : (item.height || 0),
        fee: item.fee !== undefined ? item.fee : undefined,
      })) : [];
    } catch (error: any) {
      const errorMessage = error?.message || '';
      if (errorMessage.includes('history too large') || errorMessage.includes('too large')) {
        // Try mempool as fallback
        try {
          const mempool = await this.client.call('blockchain.scripthash.get_mempool', [scriptHash]);
          history = Array.isArray(mempool) ? mempool.map((item: any) => ({
            tx_hash: item.tx_hash || item.txid || '',
            height: 0, // Mempool transactions have height 0
            fee: item.fee !== undefined ? item.fee : undefined,
          })) : [];
        } catch {
          history = [];
        }
      }
    }

    return {
      address,
      balance: balance.confirmed + balance.unconfirmed,
      confirmed: balance.confirmed,
      unconfirmed: balance.unconfirmed,
      history,
    };
  }

  /**
   * Get latest blocks
   */
  async getLatestBlocks(limit: number = 11): Promise<BlockData[]> {
    this.ensureConnected();
    
    const tip = await this.client.call('blockchain.headers.subscribe', []);
    const currentHeight = (tip && typeof tip === 'object' && 'height' in tip) 
      ? tip.height 
      : (typeof tip === 'number' ? tip : 0);
    
    const blocks: BlockData[] = [];
    for (let i = 0; i < limit && currentHeight - i >= 0; i++) {
      try {
        const block = await this.getBlock(currentHeight - i);
        blocks.push(block);
      } catch {
        // Skip if block not found
      }
    }
    
    return blocks;
  }

  /**
   * Get latest transactions
   */
  async getLatestTransactions(limit: number = 11): Promise<TransactionData[]> {
    this.ensureConnected();
    
    const tip = await this.client.call('blockchain.headers.subscribe', []);
    const currentHeight = (tip && typeof tip === 'object' && 'height' in tip) 
      ? tip.height 
      : (typeof tip === 'number' ? tip : 0);
    
    const txSet = new Set<string>();
    const maxBlocksToCheck = Math.min(limit * 2, 20);
    
    // Collect transaction hashes from recent blocks
    for (let i = 0; i < maxBlocksToCheck && currentHeight - i >= 0; i++) {
      const height = currentHeight - i;
      try {
        const blockData = await this.client.call('blockchain.block.header', [height]);
        let txCount = 0;
        if (typeof blockData === 'string' && blockData.length > 160) {
          txCount = parseTxCountFromBlockHex(blockData);
        }
        const maxTxPerBlock = txCount > 0 ? Math.min(txCount, 20) : 20;
        
        for (let txPos = 0; txPos < maxTxPerBlock && txSet.size < limit; txPos++) {
          try {
            const txHash = await this.client.call('blockchain.transaction.id_from_pos', [height, txPos, false]);
            if (typeof txHash === 'string' && txHash.length === 64 && /^[a-fA-F0-9]{64}$/.test(txHash)) {
              txSet.add(txHash);
            }
          } catch {
            // Continue
          }
        }
      } catch {
        // Continue
      }
      
      if (txSet.size >= limit) break;
    }

    // Fetch transaction details
    const transactions: TransactionData[] = [];
    for (const txHash of Array.from(txSet).slice(0, limit)) {
      try {
        const tx = await this.getTransaction(txHash);
        transactions.push(tx);
      } catch {
        // Skip
      }
    }

    return transactions;
  }

  /**
   * Find block height by hash
   */
  private async findBlockHeightByHash(hash: string, fromHeight?: number): Promise<number | null> {
    const tip = await this.client.call('blockchain.headers.subscribe', []);
    const currentHeight = (tip && typeof tip === 'object' && 'height' in tip) 
      ? tip.height 
      : (typeof tip === 'number' ? tip : 0);
    
    const searchStartTime = Date.now();
    const maxSearchTime = 20000;

    if (fromHeight !== undefined && fromHeight !== null) {
      const searchRange = 200;
      const heightsToCheck: number[] = [];
      
      for (let offset = 0; offset <= searchRange; offset++) {
        if (Date.now() - searchStartTime > maxSearchTime) break;
        if (offset === 0) {
          heightsToCheck.push(fromHeight);
        } else {
          if (fromHeight - offset >= 0) heightsToCheck.push(fromHeight - offset);
          if (fromHeight + offset <= currentHeight) heightsToCheck.push(fromHeight + offset);
        }
      }
      
      const batchSize = 20;
      for (let i = 0; i < heightsToCheck.length; i += batchSize) {
        if (Date.now() - searchStartTime > maxSearchTime) break;
        const batch = heightsToCheck.slice(i, i + batchSize);
        const promises = batch.map(async (testHeight) => {
          try {
            const headerHex = await this.client.call('blockchain.block.header', [testHeight]);
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
    
    // Search recent blocks
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
            const headerHex = await this.client.call('blockchain.block.header', [testHeight]);
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

  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new Error('Not connected to ElectrumX server. Call connect() first.');
    }
  }
}

