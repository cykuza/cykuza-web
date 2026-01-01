'use client';

import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import TxDetails, { TxInputsOutputs } from '@/components/TxDetails';
import { parseTransaction } from '@/lib/parsers';
import { txHashSchema, truncateHash, formatSatoshi, parseBlockHeader } from '@/lib/utils';
import { useElectrumExplorer } from '@/hooks/useElectrumExplorer';

export default function TransactionPage({ params }: { params: Promise<{ hash: string }> | { hash: string } }) {
 // Handle both Promise and direct object cases
 const resolvedParams = params instanceof Promise ? use(params) : params;
 const searchParams = useSearchParams();
 const network = (searchParams.get('network') || 'mainnet') as 'mainnet' | 'testnet';
 
 const [tx, setTx] = useState<any>(null);
 const [blockHeight, setBlockHeight] = useState<number | null>(null);
 const [blockHash, setBlockHash] = useState<string | null>(null);
 const [blockTimestamp, setBlockTimestamp] = useState<number | null>(null);
 const [currentHeight, setCurrentHeight] = useState<number | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const { connected, call, error: electrumError } = useElectrumExplorer({ network, autoConnect: true });

 useEffect(() => {
  const fetchTransaction = async () => {
   if (!connected) {
    setError('Not connected to ElectrumX server');
    return;
   }

   try {
    setLoading(true);
    setError(null);
    const hash = resolvedParams.hash;
    
    // Validate hash
    txHashSchema.parse(hash);

    // Fetch transaction data
    const txData = await call('blockchain.transaction.get', [hash, true]); // Always use verbose=true to get prevout data
    
    if (!txData || typeof txData !== 'object') {
     throw new Error('Invalid transaction data received');
    }

    // If verbose mode doesn't include prevout values, we need to fetch them
    // Check if inputs have values, and if not, try to fetch from previous transactions
    if (txData && typeof txData === 'object' && Array.isArray((txData as any).vin)) {
     const vin = (txData as any).vin;
     const inputPromises = vin.map(async (input: any, index: number) => {
      // If input already has value or prevout with value, skip
      if (input.value !== undefined && input.value !== null && input.value > 0) {
       return;
      }
      if (input.prevout?.value !== undefined && input.prevout?.value !== null && input.prevout.value > 0) {
       return;
      }
      
      // If this is a coinbase, skip
      if (input.coinbase !== undefined && input.coinbase !== null) {
       return;
      }
      
      // Try to get the previous transaction to fetch the output value
      const prevTxHash = input.txid || input.prevout_hash;
      const prevOutIndex = input.vout !== undefined ? input.vout : (input.prevout_n !== undefined ? input.prevout_n : undefined);
      
      if (prevTxHash && prevOutIndex !== undefined && prevOutIndex >= 0) {
       try {
        const prevTx = await call('blockchain.transaction.get', [prevTxHash, true]);
        
        if (prevTx && typeof prevTx === 'object') {
         const vout = (prevTx as any).vout || (prevTx as any).outputs;
         if (Array.isArray(vout) && vout[prevOutIndex] !== undefined) {
          const prevOutput = vout[prevOutIndex];
          // Add prevout data to the input
          if (!input.prevout) {
           input.prevout = {};
          }
          if (prevOutput.value !== undefined && prevOutput.value !== null) {
           input.prevout.value = prevOutput.value;
          }
          if (prevOutput.scriptPubKey) {
           input.prevout.scriptPubKey = prevOutput.scriptPubKey;
          }
         }
        }
       } catch (err) {
        // Silently fail - prevout data is optional
        if (process.env.NODE_ENV === 'development') {
         console.warn(`Failed to fetch prevout for input ${index} (tx: ${prevTxHash}, vout: ${prevOutIndex}):`, err);
        }
       }
      }
     });
     
     // Wait for all prevout fetches to complete
     await Promise.all(inputPromises);
    }
    
    const parsed = parseTransaction(txData, network);
    setTx(parsed);
    setError(null);
    setLoading(false); // Show transaction immediately
    
    // Fetch block height and current height in background (non-blocking)
    // ElectrumX may provide height directly, or we need to fetch it from blockhash
    if (txData.height !== undefined && txData.height !== null) {
     setBlockHeight(txData.height);
    }
    
    if (txData.blockhash) {
     setBlockHash(txData.blockhash);
     // Fetch block data asynchronously without blocking the UI
     (async () => {
      try {
       // Find block height by hash
       const tip = await call('blockchain.headers.subscribe', []);
       const currentTipHeight = (tip && typeof tip === 'object' && 'height' in tip) 
         ? tip.height 
         : (typeof tip === 'number' ? tip : 0);
       
       // Search recent blocks for the hash
       const searchRange = Math.min(200, currentTipHeight);
       for (let i = 0; i < searchRange; i++) {
        const testHeight = currentTipHeight - i;
        if (testHeight < 0) break;
        
        try {
         const headerHex = await call('blockchain.block.header', [testHeight]);
         const hexString = typeof headerHex === 'string' ? headerHex : headerHex?.hex || '';
         if (hexString.length >= 160) {
          const parsed = parseBlockHeader(hexString.substring(0, 160));
          if (parsed.hash.toLowerCase() === txData.blockhash.toLowerCase()) {
           setBlockHeight(testHeight);
           // Get timestamp from header
           setBlockTimestamp(parsed.timestamp);
           break;
          }
         }
        } catch {
         // Continue searching
        }
       }
      } catch {
       // Silently fail - block data is optional
      }
     })();
    }
    
    // Fetch current block height for confirmations
    (async () => {
     try {
      const tip = await call('blockchain.headers.subscribe', []);
      const currentTipHeight = (tip && typeof tip === 'object' && 'height' in tip) 
        ? tip.height 
        : (typeof tip === 'number' ? tip : 0);
      setCurrentHeight(currentTipHeight);
     } catch {
      // Silently fail - current height is optional
     }
    })();
   } catch (err) {
    const errorMessage = err instanceof Error 
     ? err.message
     : 'Unknown error';
    setError(errorMessage);
    if (process.env.NODE_ENV === 'development') {
     console.error('Error fetching transaction:', err);
    }
    setTx(null);
    setLoading(false);
   }
  };

  if (connected) {
   fetchTransaction();
  }
 }, [connected, call, resolvedParams.hash, network]);

 // Show electrum connection error
 useEffect(() => {
  if (electrumError) {
   setError(`ElectrumX connection error: ${electrumError}`);
  }
 }, [electrumError]);

 if (loading) {
  return (
   <div className="text-center py-12">
    <div className="text-neutral-200">Loading transaction...</div>
   </div>
  );
 }

 if (error || !tx) {
  return (
   <div className="text-center py-12">
    <div className="text-white rounded-xl border border-white/14 bg-neutral-800 p-4">Error: {error || 'Transaction not found'}</div>
   </div>
  );
 }

 return (
  <div className="flex w-full gap-2.5 max-lg:flex-col">
   <div className="flex min-w-96 flex-col gap-2.5 max-lg:min-w-full">
    {/* Breadcrumb */}
    <div className="flex flex-col gap-2.5 border border-white/14 rounded-2xl px-5 py-4">
     <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 break-words text-sm">
      <ol className="flex flex-wrap items-center gap-1.5">
       <li className="inline-flex items-center gap-1.5">
        <Link href="/" className="max-w-full truncate font-medium text-neutral-200 text-xs transition-colors hover:text-white">
         Explorer
        </Link>
       </li>
       {blockHeight !== null && (
        <>
         <li role="presentation" aria-hidden="true" className="text-neutral-200">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
           <path d="m9 18 6-6-6-6"></path>
          </svg>
         </li>
         <li className="inline-flex items-center gap-1.5">
          <Link href={`/block/${blockHeight}?network=${network}`} className="max-w-full truncate font-medium text-neutral-200 text-xs transition-colors hover:text-white">
           Block #{blockHeight}
          </Link>
         </li>
        </>
       )}
       <li role="presentation" aria-hidden="true" className="text-neutral-200">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
         <path d="m9 18 6-6-6-6"></path>
        </svg>
       </li>
       <li className="inline-flex items-center gap-1.5">
        <span className="max-w-full truncate font-medium text-neutral-200 text-xs pointer-events-none">
         Transaction
        </span>
       </li>
      </ol>
     </nav>
     <div className="flex items-center gap-3 font-medium text-lg">
      <h1 className="text-white">{resolvedParams.hash.substring(0, 10)}...</h1>
     </div>
    </div>

    {/* Details Section */}
    <TxDetails 
     tx={tx} 
     network={network} 
     blockHeight={blockHeight}
     blockHash={blockHash}
     blockTimestamp={blockTimestamp}
     currentHeight={currentHeight}
    />
   </div>

   {/* Inputs & Outputs Section */}
   <TxInputsOutputs tx={tx} network={network} />
  </div>
 );
}

