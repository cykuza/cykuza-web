'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useElectrumExplorer } from '@/hooks/useElectrumExplorer';
import { parseTxCountFromBlockHex } from '@/lib/utils';

interface Transaction {
 txid: string;
 value: number;
 fee?: number;
 timestamp?: number;
}

type NetworkType = 'mainnet' | 'testnet';

interface LatestTransactionsProps {
 network: NetworkType;
}

export default function LatestTransactions({ network }: LatestTransactionsProps) {
 const [transactions, setTransactions] = useState<Transaction[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const { connected, call, error: electrumError } = useElectrumExplorer({ network, autoConnect: true });

 useEffect(() => {
  let intervalId: NodeJS.Timeout;

  const fetchTransactions = async () => {
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

    // Collect unique transaction hashes from recent blocks
    const txSet = new Set<string>();
    const limit = 11;
    const maxBlocksToCheck = Math.min(limit * 2, 20);
    
    // Fetch blocks in parallel for better performance
    const blockPromises = [];
    for (let i = 0; i < maxBlocksToCheck && currentHeight - i >= 0; i++) {
     const height = currentHeight - i;
     blockPromises.push(
      (async () => {
       try {
        // Get block header to determine transaction count
        const blockData = await call('blockchain.block.header', [height]);
        
        // Parse block header to get tx_count
        let txCount = 0;
        if (typeof blockData === 'string' && blockData.length > 160) {
         txCount = parseTxCountFromBlockHex(blockData);
        }
        
        // If we couldn't get tx_count from block data, use a reasonable limit
        const maxTxPerBlock = txCount > 0 ? Math.min(txCount, 20) : 20;
        
        // Get transaction hashes in parallel for this block
        const txPromises = [];
        for (let txPos = 0; txPos < maxTxPerBlock; txPos++) {
         txPromises.push(
          call('blockchain.transaction.id_from_pos', [height, txPos, false])
           .then(
            (txHash: any) => {
             if (typeof txHash === 'string' && txHash.length === 64 && /^[a-fA-F0-9]{64}$/.test(txHash)) {
              return txHash;
             }
             return null;
            },
            () => null // Return null on error
           )
         );
        }
        
        const txHashes = await Promise.all(txPromises);
        return txHashes.filter((hash): hash is string => hash !== null);
       } catch (error) {
        if (process.env.NODE_ENV === 'development') {
         console.error(`Error fetching transactions for block ${height}:`, error);
        }
        return [];
       }
      })()
     );
    }

    // Wait for all blocks and collect transactions
    const blockResults = await Promise.all(blockPromises);
    for (const txHashes of blockResults) {
     for (const txHash of txHashes) {
      if (txSet.size >= limit) {
       break;
      }
      txSet.add(txHash);
     }
     if (txSet.size >= limit) {
      break;
     }
    }

    // Convert to array and limit results - match API format (just txid)
    const uniqueTransactions: Transaction[] = Array.from(txSet)
     .slice(0, limit)
     .map(txid => ({ txid, value: 0 })); // value: 0 as placeholder, component only displays txid

    setTransactions(uniqueTransactions);
    setError(null);
   } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMessage);
    if (process.env.NODE_ENV === 'development') {
     console.error('Error fetching transactions:', err);
    }
    setTransactions([]); // Clear transactions on error
   } finally {
    setLoading(false);
   }
  };

  // Initial fetch when connected
  if (connected) {
   fetchTransactions();
  }

  // Set up polling every 10 seconds
  intervalId = setInterval(() => {
   if (connected) {
    fetchTransactions();
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

 if (loading && transactions.length === 0) {
  return (
   <div className="rounded-xl border border-white/7 bg-neutral-800 p-6">
    <h2 className="text-xl font-bold mb-4 text-white border-b border-white/7 pb-2">Latest Transactions</h2>
    <div className="text-neutral-200">Loading...</div>
   </div>
  );
 }

 if (error) {
  return (
   <div className="rounded-xl border border-white/7 bg-neutral-800 p-6">
    <h2 className="text-xl font-bold mb-4 text-white border-b border-white/7 pb-2">Latest Transactions</h2>
    <div className="text-neutral-200">Error: {error}</div>
   </div>
  );
 }

 return (
  <div className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
   <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Latest Transactions</h2>
   <div className="overflow-x-auto">
    <table className="w-full text-sm">
     <thead>
      <tr className="border-b border-white/14">
       <th className="text-left py-2 px-2 text-neutral-200 font-semibold">TxID</th>
      </tr>
     </thead>
     <tbody>
      {transactions.length === 0 ? (
       <tr>
        <td colSpan={1} className="text-center py-4 text-neutral-200">
         <div className="space-y-2">
          <div>No recent transactions available</div>
          <div className="text-xs text-neutral-300">
           View transactions by clicking on blocks above
          </div>
         </div>
        </td>
       </tr>
      ) : (
       transactions.map((tx) => (
        <tr key={tx.txid} className="border-b border-white/14 hover:bg-neutral-700/50 transition-colors">
         <td className="py-2 px-2 max-w-0 text-white">
          <Link
           href={`/tx/${tx.txid}?network=${network}`}
           className="cyber-link font-mono text-xs truncate inline-block w-full"
           title={tx.txid}
          >
           {tx.txid}
          </Link>
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

