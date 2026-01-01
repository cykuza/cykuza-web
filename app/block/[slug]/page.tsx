'use client';

import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { formatTimestamp, formatBytes, truncateHash, isBlockHeight, formatSatoshi, parseBlockHeader, parseTxCountFromBlockHex } from '@/lib/utils';
import { parseBlock, ElectrumXTransaction, ElectrumXOutput } from '@/lib/parsers';
import { useElectrumExplorer } from '@/hooks/useElectrumExplorer';

interface BlockData {
 height: number;
 hash: string;
 prev_hash: string;
 merkle_root: string;
 timestamp: number;
 size: number;
 tx_count: number;
 hasMweb: boolean;
}

interface Transaction {
 txid: string;
 value: number;
 isMweb?: boolean;
}

/**
 * Count transactions in a block by querying transaction positions
 */
async function countTransactionsInBlock(
 call: (method: string, params?: any[]) => Promise<any>,
 height: number
): Promise<number> {
 let count = 0;
 const maxAttempts = 10000;
 const batchSize = 50;
 for (let startPos = 0; startPos < maxAttempts; startPos += batchSize) {
  const batchPromises = [];
  for (let i = 0; i < batchSize; i++) {
   const txPos = startPos + i;
   batchPromises.push(
    call('blockchain.transaction.id_from_pos', [height, txPos, false])
     .then(
      (txHash: any) => {
       if (typeof txHash === 'string' && txHash.length === 64 && /^[a-fA-F0-9]{64}$/.test(txHash)) {
        return true;
       }
       return false;
      },
      () => false
     )
   );
  }
  const batchResults = await Promise.all(batchPromises);
  const foundCount = batchResults.filter(Boolean).length;
  if (foundCount === 0) break;
  count += foundCount;
  if (foundCount < batchSize) break;
 }
 return count;
}

/**
 * Fetch and parse a block by height (client-side version)
 */
async function fetchBlockByHeight(
 call: (method: string, params?: any[]) => Promise<any>,
 height: number
): Promise<any> {
 const blockResponse = await call('blockchain.block.header', [height]);
 const result: any = { height, tx_count: 0 };

 if (typeof blockResponse === 'string') {
  const hexString = blockResponse;
  if (hexString.length >= 160) {
   const headerHex = hexString.substring(0, 160);
   const parsed = parseBlockHeader(headerHex);
   result.hash = parsed.hash;
   result.prev_hash = parsed.prevHash;
   result.merkle_root = parsed.merkleRoot;
   result.timestamp = parsed.timestamp;
   result.version = parsed.version;
   result.bits = parsed.bits;
   result.nonce = parsed.nonce;
   result.size = Math.floor(hexString.length / 2);
   
   if (hexString.length > 160) {
    const parsedCount = parseTxCountFromBlockHex(hexString);
    const actualCount = await countTransactionsInBlock(call, height);
    result.tx_count = actualCount > parsedCount ? actualCount : parsedCount;
   } else {
    result.tx_count = await countTransactionsInBlock(call, height);
   }
  }
 } else if (blockResponse && typeof blockResponse === 'object') {
  const blockObj = blockResponse as any;
  result.hash = blockObj.hash || blockObj.block_hash || '';
  result.prev_hash = blockObj.prev_hash || blockObj.previousblockhash || '';
  result.merkle_root = blockObj.merkle_root || blockObj.merkleroot || '';
  result.timestamp = blockObj.timestamp || blockObj.time || 0;
  result.version = blockObj.version || 1;
  result.bits = blockObj.bits || 0;
  result.nonce = blockObj.nonce || 0;
  result.size = blockObj.size || 0;
  result.mweb = blockObj.mweb;

  if (blockObj.hex && blockObj.hex.length >= 160) {
   const headerHex = blockObj.hex.substring(0, 160);
   const parsed = parseBlockHeader(headerHex);
   if (!result.hash) result.hash = parsed.hash;
   if (!result.prev_hash) result.prev_hash = parsed.prevHash;
   if (!result.merkle_root) result.merkle_root = parsed.merkleRoot;
   if (!result.timestamp) result.timestamp = parsed.timestamp;
  }

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
  
  const actualCount = await countTransactionsInBlock(call, height);
  result.tx_count = actualCount > parsedCount ? actualCount : parsedCount;
 }

 return result;
}

/**
 * Find block height by hash (client-side version)
 */
async function findBlockHeightByHash(
 call: (method: string, params?: any[]) => Promise<any>,
 hash: string,
 fromHeight?: number
): Promise<number | null> {
 const tip = await call('blockchain.headers.subscribe', []);
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
     const headerHex = await call('blockchain.block.header', [testHeight]);
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
     const headerHex = await call('blockchain.block.header', [testHeight]);
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

export default function BlockPage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
 // Handle both Promise and direct object cases
 const resolvedParams = params instanceof Promise ? use(params) : params;
 const searchParams = useSearchParams();
 const network = (searchParams.get('network') || 'mainnet') as 'mainnet' | 'testnet';
 
 const [block, setBlock] = useState<BlockData | null>(null);
 const [transactions, setTransactions] = useState<Transaction[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const { connected, call, error: electrumError } = useElectrumExplorer({ network, autoConnect: true });

 useEffect(() => {
  const fetchBlock = async () => {
   if (!connected) {
    setError('Not connected to ElectrumX server');
    return;
   }

   try {
    setLoading(true);
    const slug = resolvedParams.slug;
    const fromHeight = searchParams.get('fromHeight');
    
    let blockHeight: number | null = null;
    
    if (isBlockHeight(slug)) {
     blockHeight = parseInt(slug, 10);
    } else {
     // Find height by hash
     const fromHeightNum = fromHeight ? parseInt(fromHeight, 10) : undefined;
     blockHeight = await findBlockHeightByHash(call, slug, fromHeightNum);
     if (blockHeight === null) {
      throw new Error('Block not found. The hash might be from a very old block or the block might not exist.');
     }
    }
    
    const blockData = await fetchBlockByHeight(call, blockHeight);
    const parsed = parseBlock(blockData, blockHeight);
    setBlock(parsed);
    setError(null);
   } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
    if (process.env.NODE_ENV === 'development') {
     console.error('Error fetching block:', err);
    }
   } finally {
    setLoading(false);
   }
  };

  if (connected) {
   fetchBlock();
  }
 }, [connected, call, resolvedParams.slug, network, searchParams]);

 useEffect(() => {
  if (!block || !block.height || !connected) return;

  const fetchTransactions = async () => {
   try {
    const maxTxToCheck = block.tx_count || 100;
    const txHashPromises = [];
    for (let txPos = 0; txPos < maxTxToCheck; txPos++) {
     txHashPromises.push(
      call('blockchain.transaction.id_from_pos', [block.height, txPos, false])
       .then(
        (txHash: any) => {
         if (typeof txHash === 'string' && txHash.length === 64 && /^[a-fA-F0-9]{64}$/.test(txHash)) {
          return txHash;
         }
         return null;
        },
        () => null
       )
     );
    }

    const txHashes = await Promise.all(txHashPromises);
    const validTxHashes = txHashes.filter((hash): hash is string => hash !== null);

    if (validTxHashes.length === 0) {
     setTransactions([]);
     return;
    }

    // Fetch all transaction details in parallel
    const txDetailPromises = validTxHashes.map((txid) =>
     call('blockchain.transaction.get', [txid, true])
      .then(
       (txData: unknown) => {
        if (!txData || typeof txData !== 'object') {
         return { txid, value: 0, isMweb: false };
        }

        const tx = txData as ElectrumXTransaction;
        let isMweb = false;
        if (tx.mweb_extension !== undefined && tx.mweb_extension !== null) {
         isMweb = true;
        } else if (tx.vout && Array.isArray(tx.vout)) {
         isMweb = tx.vout.some((out: ElectrumXOutput) => 
          out.scriptPubKey?.type === 'witness_mweb_hogaddr'
         );
        }

        // Calculate sent value (outputs to recipients, excluding change)
        const calculateSentValue = (): number => {
         const inputAddresses = new Set<string>();
         if (tx.vin && Array.isArray(tx.vin)) {
          tx.vin.forEach((input: any) => {
           if (input.prevout?.scriptPubKey?.addresses && Array.isArray(input.prevout.scriptPubKey.addresses)) {
            input.prevout.scriptPubKey.addresses.forEach((addr: string) => {
             if (addr) inputAddresses.add(addr);
            });
           }
           if (input.prevout?.addresses && Array.isArray(input.prevout.addresses)) {
            input.prevout.addresses.forEach((addr: string) => {
             if (addr) inputAddresses.add(addr);
            });
           }
          });
         }

         const outputs = tx.vout || [];
         if (!Array.isArray(outputs) || outputs.length === 0) return 0;
         if (inputAddresses.size === 0) {
          const firstOutput = outputs[0];
          const value = firstOutput?.value || 0;
          return value > 0 ? Math.floor(value * 100000000) : 0;
         }

         let sentValue = 0;
         outputs.forEach((out: ElectrumXOutput) => {
          const outputAddresses: string[] = [];
          if (out.scriptPubKey?.addresses && Array.isArray(out.scriptPubKey.addresses)) {
           outputAddresses.push(...out.scriptPubKey.addresses);
          }
          if (out.address) {
           outputAddresses.push(out.address);
          }

          const isChange = outputAddresses.some(addr => inputAddresses.has(addr));
          if (!isChange) {
           const value = out.value || 0;
           sentValue += value * 100000000;
          }
         });

         if (sentValue === 0 && outputs.length > 0) {
          const firstOutput = outputs[0];
          const value = firstOutput?.value || 0;
          return value > 0 ? Math.floor(value * 100000000) : 0;
         }

         return Math.floor(sentValue);
        };

        const totalValue = calculateSentValue();

        return { txid, value: totalValue, isMweb };
       },
       () => ({ txid, value: 0, isMweb: false })
      )
    );

    const txList: Transaction[] = await Promise.all(txDetailPromises);
    setTransactions(txList);
   } catch (err) {
    if (process.env.NODE_ENV === 'development') {
     console.error('Error fetching transactions:', err);
    }
    setTransactions([]);
   }
  };

  fetchTransactions();
 }, [block, network, connected, call]);

 // Show electrum connection error
 useEffect(() => {
  if (electrumError) {
   setError(`ElectrumX connection error: ${electrumError}`);
  }
 }, [electrumError]);

 if (loading) {
  return (
   <div className="text-center py-12">
    <div className="text-neutral-200">Loading block...</div>
   </div>
  );
 }

 if (error || !block) {
  return (
   <div className="text-center py-12">
    <div className="text-white rounded-xl border border-white/14 bg-neutral-800 p-4">Error: {error || 'Block not found'}</div>
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
       <li role="presentation" aria-hidden="true" className="text-neutral-200">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
         <path d="m9 18 6-6-6-6"></path>
        </svg>
       </li>
       <li className="inline-flex items-center gap-1.5">
        <span className="max-w-full truncate font-medium text-neutral-200 text-xs pointer-events-none">
         Block #{block.height}
        </span>
       </li>
      </ol>
     </nav>
     <div className="flex items-center gap-3 font-medium text-lg">
      <h1 className="text-white">Block #{block.height}</h1>
     </div>
    </div>

    {/* Block Info */}
    <div className="rounded-2xl border border-white/14 bg-neutral-800/75 px-5 py-4">
     <h2 className="font-medium text-base mb-2">Block info</h2>
     <div className="w-full rounded-2xl bg-transparent font-mono border-none p-0">
      <table className="w-full">
       <tbody className="flex-col">
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Height</td>
         <td title={block.height.toString()} className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          {block.height}
         </td>
        </tr>
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Block hash</td>
         <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          <div className="flex w-min max-w-full cursor-pointer select-none items-center gap-2">
           <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={block.hash}>
            {truncateHash(block.hash, 5, 5)}
           </span>
          </div>
         </td>
        </tr>
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Timestamp</td>
         <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          <div>{formatTimestamp(block.timestamp)}</div>
         </td>
        </tr>
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Size</td>
         <td title={formatBytes(block.size)} className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          {formatBytes(block.size)}
         </td>
        </tr>
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Merkle root</td>
         <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          <div className="flex w-min max-w-full cursor-pointer select-none items-center gap-2">
           <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={block.merkle_root}>
            {truncateHash(block.merkle_root, 5, 5)}
           </span>
          </div>
         </td>
        </tr>
        {block.prev_hash && block.height > 0 && (
         <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
          <td className="py-4 text-neutral-200">Previous hash</td>
          <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
           <Link
            href={`/block/${block.prev_hash}?network=${network}&fromHeight=${block.height - 1}`}
            className="max-w-full truncate text-neutral-100 hover:text-white"
           >
            {truncateHash(block.prev_hash, 5, 5)}
           </Link>
          </td>
         </tr>
        )}
       </tbody>
      </table>
     </div>
    </div>

   </div>

   {/* Transactions */}
   <section className="flex w-full flex-col gap-2.5">
    <div className="rounded-2xl border border-white/14 bg-neutral-800/75 px-5 py-4 font-medium text-lg max-md:text-base">
     {block.tx_count} {block.tx_count === 1 ? 'transaction' : 'transactions'}
    </div>
    {transactions.length === 0 ? (
     <div className="text-neutral-200 p-4 rounded-2xl bg-neutral-800/75">Loading transactions...</div>
    ) : (
     <div className="relative flex w-full flex-col gap-2.5">
      {transactions.map((tx, index) => (
       <Link
        key={tx.txid}
        href={`/tx/${tx.txid}?network=${network}`}
        className="flex w-full flex-col rounded-2xl border border-white/14 bg-neutral-800/75 font-mono hover:bg-neutral-700/30 transition-colors"
       >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4">
         <div className="flex w-full sm:flex-1 items-center gap-2 min-w-0">
          <span className="text-neutral-400 text-xs min-w-[2.5rem] sm:min-w-[3rem]">#{index}</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
           <span className="text-neutral-200 text-xs whitespace-nowrap">ID:</span>
           <span className="truncate text-xs text-neutral-100 hover:text-white" title={tx.txid}>
            {truncateHash(tx.txid, 5, 5)}
           </span>
          </div>
         </div>
         <div className="flex flex-col sm:flex-row items-start sm:items-end gap-1.5 sm:gap-3 w-full sm:w-auto">
          {tx.value > 0 && !tx.isMweb && (
           <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-white text-xs whitespace-nowrap">
             {formatSatoshi(tx.value)} CY
            </span>
           </div>
          )}
          {tx.isMweb && (
           <span className="text-xs text-neutral-200">MWEB</span>
          )}
         </div>
        </div>
       </Link>
      ))}
     </div>
    )}
   </section>
  </div>
 );
}

