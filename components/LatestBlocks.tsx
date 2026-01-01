'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatRelativeTime, truncateHash, formatBytesKB, parseBlockHeader, parseTxCountFromBlockHex } from '@/lib/utils';
import { useElectrumExplorer } from '@/hooks/useElectrumExplorer';

interface Block {
 height: number;
 hash: string;
 timestamp: number;
 tx_count: number;
 size: number;
 hasMweb?: boolean;
}

type NetworkType = 'mainnet' | 'testnet';

interface LatestBlocksProps {
 network: NetworkType;
}

/**
 * Count transactions in a block by querying transaction positions
 * This method correctly counts all transactions including MWEB ones
 */
async function countTransactionsInBlock(
 call: (method: string, params?: any[]) => Promise<any>,
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
    call('blockchain.transaction.id_from_pos', [height, txPos, false])
     .then(
      (txHash: any) => {
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
 * Fetch and parse a block by height (client-side version)
 */
async function fetchBlockByHeight(
 call: (method: string, params?: any[]) => Promise<any>,
 height: number
): Promise<Block> {
 // Fetch block data from ElectrumX
 const blockResponse = await call('blockchain.block.header', [height]);

 // Initialize result with height
 const result: Partial<Block> = {
  height,
  tx_count: 0,
  hash: '',
  timestamp: 0,
  size: 0,
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
   result.timestamp = parsed.timestamp;
   result.size = Math.floor(hexString.length / 2);
   
   // If we have more than just the header, try to parse tx_count from hex
   // But also count actual transactions to ensure accuracy (especially for MWEB blocks)
   if (hexString.length > 160) {
    const parsedCount = parseTxCountFromBlockHex(hexString);
    // Count actual transactions to get accurate count including MWEB
    const actualCount = await countTransactionsInBlock(call, height);
    // Use actual count if it's higher (more accurate), otherwise use parsed
    result.tx_count = actualCount > parsedCount ? actualCount : parsedCount;
   } else {
    // Only header available, count actual transactions
    result.tx_count = await countTransactionsInBlock(call, height);
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
   timestamp?: number;
   time?: number;
   size?: number;
   tx_count?: number;
   nTx?: number;
   tx?: unknown[];
   mweb?: unknown;
  };

  // Extract fields
  result.hash = blockObj.hash || blockObj.block_hash || '';
  result.timestamp = blockObj.timestamp || blockObj.time || 0;
  result.size = blockObj.size || 0;
  result.hasMweb = blockObj.mweb !== undefined && blockObj.mweb !== null;

  // If we have hex but missing header fields, parse from hex
  if (blockObj.hex && blockObj.hex.length >= 160) {
   const headerHex = blockObj.hex.substring(0, 160);
   const parsed = parseBlockHeader(headerHex);
   
   // Use parsed values if object values are missing
   if (!result.hash) result.hash = parsed.hash;
   if (!result.timestamp) result.timestamp = parsed.timestamp;
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
  const actualCount = await countTransactionsInBlock(call, height);
  // Use the higher count (actual count is more reliable for MWEB blocks)
  result.tx_count = actualCount > parsedCount ? actualCount : parsedCount;
 } else {
  throw new Error('Invalid block response format');
 }

 // Ensure all required fields are set
 return {
  height: result.height!,
  hash: result.hash || '',
  timestamp: result.timestamp || 0,
  size: result.size || 80,
  tx_count: result.tx_count || 0,
  hasMweb: result.hasMweb || false,
 };
}

export default function LatestBlocks({ network }: LatestBlocksProps) {
 const [blocks, setBlocks] = useState<Block[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const { connected, call, error: electrumError } = useElectrumExplorer({ network, autoConnect: true });

 useEffect(() => {
  let intervalId: NodeJS.Timeout;

  const fetchBlocks = async () => {
   if (!connected) {
    setError('Not connected to ElectrumX server');
    return;
   }

   try {
    setLoading(true);
    setError(null);
    
    // Get current tip - blockchain.headers.subscribe returns an object with height and hex, or just a number
    const tip = await call('blockchain.headers.subscribe', []);
    const currentHeight = (tip && typeof tip === 'object' && 'height' in tip) 
      ? tip.height 
      : (typeof tip === 'number' ? tip : 0);
    
    if (!currentHeight || currentHeight === 0) {
     throw new Error('Failed to get current block height');
    }

    // Fetch blocks in parallel for better performance
    const limit = 11;
    const blockPromises = [];
    for (let i = 0; i < limit && currentHeight - i >= 0; i++) {
     const height = currentHeight - i;
     blockPromises.push(
      (async () => {
       try {
        // Use unified block parser (client-side version)
        const parsed = await fetchBlockByHeight(call, height);
        return parsed;
       } catch (error) {
        // Skip if block not found
        if (process.env.NODE_ENV === 'development') {
         console.error(`Error fetching block ${height}:`, error);
        }
        return null;
       }
      })()
     );
    }

    // Wait for all blocks to be fetched in parallel
    const blockResults = await Promise.all(blockPromises);
    const validBlocks = blockResults.filter((block): block is Block => block !== null);
    
    // Sort by height descending (newest first)
    validBlocks.sort((a, b) => b.height - a.height);
    
    setBlocks(validBlocks);
    setError(null);
   } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMessage);
    if (process.env.NODE_ENV === 'development') {
     console.error('Error fetching blocks:', err);
    }
    setBlocks([]); // Clear blocks on error
   } finally {
    setLoading(false);
   }
  };

  // Initial fetch when connected
  if (connected) {
   fetchBlocks();
  }

  // Set up polling every 10 seconds
  intervalId = setInterval(() => {
   if (connected) {
    fetchBlocks();
   }
  }, 10000);

  // Cleanup
  return () => {
   clearInterval(intervalId);
  };
 }, [connected, call, network]);

 // Show electrum connection error
 useEffect(() => {
  if (electrumError) {
   setError(`ElectrumX connection error: ${electrumError}`);
  }
 }, [electrumError]);

 if (loading && blocks.length === 0) {
  return (
   <div className="rounded-xl border border-white/7 bg-neutral-800 p-6 ">
    <h2 className="text-xl font-bold mb-4 text-white border-b border-white/7 pb-2">Latest Blocks</h2>
    <div className="text-neutral-200">Loading...</div>
   </div>
  );
 }

 if (error) {
  return (
   <div className="rounded-xl border border-white/7 bg-neutral-800 p-6 ">
    <h2 className="text-xl font-bold mb-4 text-white border-b border-white/7 pb-2">Latest Blocks</h2>
    <div className="text-neutral-200">Error: {error}</div>
   </div>
  );
 }

 return (
  <div className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
   <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Latest Blocks</h2>
   <div className="overflow-x-auto">
    <table className="w-full text-sm">
     <thead>
      <tr className="border-b border-white/14">
       <th className="text-left py-2 px-2 text-neutral-200 font-semibold">Block</th>
       <th className="hidden md:table-cell text-left py-2 px-2 text-neutral-200 font-semibold">Hash</th>
       <th className="text-right py-2 px-2 text-neutral-200 font-semibold">Time</th>
       <th className="text-right py-2 px-2 text-neutral-200 font-semibold">Tx</th>
       <th className="text-right py-2 px-2 text-neutral-200 font-semibold">Size</th>
      </tr>
     </thead>
     <tbody>
      {blocks.length === 0 ? (
       <tr>
        <td colSpan={5} className="text-center py-4 text-neutral-200">
         No blocks found
        </td>
       </tr>
      ) : (
       blocks.map((block) => (
        <tr key={block.height || `block-${block.hash || Math.random()}`} className="border-b border-white/14 hover:bg-neutral-700/50 transition-colors">
         <td className="py-2 px-2 text-white">
          <Link
           href={`/block/${block.height}?network=${network}`}
           className="cyber-link"
          >
           {block.height}
          </Link>
         </td>
         <td className="hidden md:table-cell py-2 px-2">
          <Link
           href={`/block/${block.height}?network=${network}`}
           className="cyber-link font-mono text-xs"
          >
           {truncateHash(block.hash, 3, 3)}
          </Link>
          {block.hasMweb && (
           <span className="ml-2 text-xs text-neutral-200 border border-white/14 rounded px-1">MWEB</span>
          )}
         </td>
         <td className="text-right py-2 px-2 text-neutral-200 text-xs">
          {formatRelativeTime(block.timestamp)}
         </td>
         <td className="text-right py-2 px-2 text-white">
          {block.tx_count}
         </td>
         <td className="text-right py-2 px-2 text-neutral-200">
          {formatBytesKB(block.size)}
         </td>
        </tr>
       ))
      )}
     </tbody>
    </table>
   </div>
  </div>
 );
}

