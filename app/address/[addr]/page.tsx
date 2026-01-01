'use client';

import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AddressQR from '@/components/AddressQR';
import { formatSatoshi, formatTimestamp, truncateHash, addressSchema } from '@/lib/utils';
import { addressToScriptHash } from '@/lib/wallet/crypto';
import { useElectrumExplorer } from '@/hooks/useElectrumExplorer';

interface AddressData {
 address: string;
 balance: number;
 confirmed: number;
 unconfirmed: number;
 history: Array<{
  tx_hash: string;
  height: number;
  fee?: number;
 }>;
 historyError?: string;
}

export default function AddressPage({ params }: { params: Promise<{ addr: string }> | { addr: string } }) {
 // Handle both Promise and direct object cases
 const resolvedParams = params instanceof Promise ? use(params) : params;
 const searchParams = useSearchParams();
 const network = (searchParams.get('network') || 'mainnet') as 'mainnet' | 'testnet';
 
 const [addressData, setAddressData] = useState<AddressData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [page, setPage] = useState(1);
 const pageSize = 20;
 const { connected, call, error: electrumError } = useElectrumExplorer({ network, autoConnect: true });

 useEffect(() => {
  const fetchAddress = async () => {
   if (!connected) {
    setError('Not connected to ElectrumX server');
    return;
   }

   try {
    setLoading(true);
    const addr = decodeURIComponent(resolvedParams.addr);
    
    // Validate address
    addressSchema.parse(addr);

    const scriptHash = addressToScriptHash(addr, network);

    // Get balance first (this usually works even for addresses with large history)
    let balance;
    try {
     balance = await call('blockchain.scripthash.get_balance', [scriptHash]);
    } catch (error) {
     if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching balance:', error);
     }
     throw new Error('Failed to fetch address balance');
    }

    // Try to get history, but handle "history too large" error gracefully
    let history: Array<{ tx_hash: string; height: number; fee?: number }> = [];
    let historyError: string | null = null;
    try {
     const historyResult = await call('blockchain.scripthash.get_history', [scriptHash]);
     if (Array.isArray(historyResult)) {
      history = historyResult.map((item: any) => ({
       tx_hash: item.tx_hash || item.txid || '',
       height: typeof item.height === 'number' ? item.height : (item.height || 0),
       fee: item.fee !== undefined ? item.fee : undefined,
      }));
     }
    } catch (error: unknown) {
     const errorMessage = (error instanceof Error ? error.message : String(error)) || String(error);
     if (errorMessage.includes('history too large') || errorMessage.includes('too large')) {
      historyError = 'This address has too many transactions to display. Please use a block explorer with pagination support.';
      // Try to get just mempool transactions as a fallback
      try {
       const mempool = await call('blockchain.scripthash.get_mempool', [scriptHash]);
       if (Array.isArray(mempool)) {
        history = mempool.map((item: any) => ({
         tx_hash: item.tx_hash || item.txid || '',
         height: typeof item.height === 'number' ? item.height : 0,
         fee: item.fee !== undefined ? item.fee : undefined,
        }));
       }
      } catch (mempoolError) {
       // If mempool also fails, just return empty history
       history = [];
      }
     } else {
      // For other errors, re-throw
      throw error;
     }
    }

    setAddressData({
     address: addr,
     balance: balance.confirmed + balance.unconfirmed,
     confirmed: balance.confirmed,
     unconfirmed: balance.unconfirmed,
     history: history,
     historyError: historyError || undefined,
    });
    setError(null);
   } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    // Check if it's a "history too large" error
    if (errorMessage.includes('history too large') || errorMessage.includes('too large')) {
     setError('This address has too many transactions to display. Please use a block explorer with pagination support.');
    } else {
     setError(errorMessage);
    }
    if (process.env.NODE_ENV === 'development') {
     console.error('Error fetching address:', err);
    }
   } finally {
    setLoading(false);
   }
  };

  if (connected) {
   fetchAddress();
  }
 }, [connected, call, resolvedParams.addr, network]);

 // Show electrum connection error
 useEffect(() => {
  if (electrumError) {
   setError(`ElectrumX connection error: ${electrumError}`);
  }
 }, [electrumError]);

 if (loading) {
  return (
   <div className="text-center py-12">
    <div className="text-neutral-200">Loading address...</div>
   </div>
  );
 }

 if (error || !addressData) {
  return (
   <div className="text-center py-12">
    <div className="text-white rounded-xl border border-white/14 bg-neutral-800 p-4">Error: {error || 'Address not found'}</div>
   </div>
  );
 }

 const paginatedHistory = addressData.history.slice(
  (page - 1) * pageSize,
  page * pageSize
 );

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
         Address
        </span>
       </li>
      </ol>
     </nav>
     <div className="flex items-center gap-3 font-medium text-lg">
      <h1 className="text-white">{addressData.address.substring(0, 10)}...</h1>
     </div>
    </div>

    {/* Address & Balance Section */}
    <div className="rounded-2xl border border-white/14 bg-neutral-800/75 px-5 py-6 overflow-hidden">
     <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-8">
      {/* QR Code */}
      <div className="flex-shrink-0 w-full lg:w-auto">
       <div className="flex justify-center lg:justify-start">
        <AddressQR address={addressData.address} size={160} />
       </div>
      </div>
      
      {/* Address & Balance Info */}
      <div className="flex-1 min-w-0 w-full lg:min-w-[200px] max-w-full">
       <div className="mb-4 w-full">
        <h2 className="font-medium text-base mb-2 text-neutral-200">Address</h2>
        <div 
         className="relative cursor-pointer break-all rounded-xl border border-white/14 bg-white/7 px-6 py-4 font-medium text-neutral-200 text-xs transition-colors hover:bg-white/10 flex items-center gap-2"
         onClick={() => {
          navigator.clipboard?.writeText(addressData.address);
         }}
         title="Click to copy address"
        >
         <span className="flex-1" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{addressData.address}</span>
         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline size-4 shrink-0">
          <path fill="currentColor" fillRule="evenodd" d="M7.556 4.222h8.66c1.24 0 1.688.13 2.14.371.453.243.808.598 1.05 1.05.243.453.372.901.372 2.14v8.661a1.111 1.111 0 1 0 2.222 0V7.698c0-1.981-.207-2.7-.593-3.425a4.04 4.04 0 0 0-1.68-1.68C19.002 2.207 18.283 2 16.302 2H7.556a1.111 1.111 0 1 0 0 2.222m8.578 2.594c-.452-.243-.9-.372-2.14-.372H5.561c-1.239 0-1.688.13-2.14.372a2.52 2.52 0 0 0-1.05 1.05c-.242.452-.371.9-.371 2.14v8.433c0 1.238.129 1.688.371 2.14a2.53 2.53 0 0 0 1.05 1.05c.452.242.901.371 2.14.371h8.433c1.238 0 1.688-.129 2.14-.371a2.53 2.53 0 0 0 1.05-1.05c.243-.452.372-.901.372-2.14v-8.433c0-1.24-.13-1.688-.372-2.14a2.52 2.52 0 0 0-1.05-1.05" clipRule="evenodd"></path>
         </svg>
        </div>
       </div>
       
       <div className="w-full min-w-0">
        <h2 className="font-medium text-base mb-3 text-neutral-200">Balance</h2>
        <div className="w-full rounded-2xl bg-transparent font-mono border-none p-0">
         <table className="w-full table-fixed">
          <tbody className="flex-col">
           <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
            <td className="py-4 text-neutral-200 w-32 sm:w-40">Total</td>
            <td className="py-4 pl-4 text-end min-w-0">
             <span className="text-xl sm:text-2xl font-bold text-white font-mono break-words inline-block max-w-full text-right" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }} title={`${formatSatoshi(addressData.balance)} CY`}>
              {formatSatoshi(addressData.balance)} CY
             </span>
            </td>
           </tr>
           <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
            <td className="py-4 text-neutral-200 w-32 sm:w-40">Confirmed</td>
            <td className="py-4 pl-4 text-end min-w-0">
             <span className="text-white font-medium font-mono break-words inline-block max-w-full text-right" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }} title={`${formatSatoshi(addressData.confirmed)} CY`}>
              {formatSatoshi(addressData.confirmed)} CY
             </span>
            </td>
           </tr>
           {addressData.unconfirmed !== 0 && (
            <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
             <td className="py-4 text-neutral-200 w-32 sm:w-40">Unconfirmed</td>
             <td className="py-4 pl-4 text-end min-w-0">
              <span className="text-white font-medium font-mono break-words inline-block max-w-full text-right" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }} title={`${formatSatoshi(addressData.unconfirmed)} CY`}>
               {formatSatoshi(addressData.unconfirmed)} CY
              </span>
             </td>
            </tr>
           )}
          </tbody>
         </table>
        </div>
       </div>
      </div>
     </div>
    </div>

    {/* Details Section */}
    <div className="rounded-2xl border border-white/14 bg-neutral-800/75 px-5 py-4">
     <h2 className="font-medium text-base mb-2">Details</h2>
     <div className="w-full rounded-2xl bg-transparent font-mono border-none p-0">
      <table className="w-full">
       <tbody className="flex-col">
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Transactions</td>
         <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          {addressData.history.length > 0 ? addressData.history.length : '0'}
         </td>
        </tr>
       </tbody>
      </table>
     </div>
    </div>
   </div>

   {/* Transactions Section */}
   <section className="flex w-full flex-col gap-2.5">
    <div className="rounded-2xl border border-white/14 bg-neutral-800/75 px-5 py-4 font-medium text-lg max-md:text-base">
     Transactions
    </div>
    {addressData.historyError && (
     <div className="mb-4 p-4 rounded-2xl border border-white/14 bg-neutral-800/75">
      <div className="text-neutral-200 font-semibold text-sm">⚠️ History Limit Reached</div>
      <div className="text-neutral-200 text-xs mt-1.5">{addressData.historyError}</div>
      {addressData.history.length > 0 && (
       <div className="text-neutral-200 text-xs mt-2">
        Showing {addressData.history.length} mempool transaction(s) only.
       </div>
      )}
     </div>
    )}
    {paginatedHistory.length === 0 ? (
     <div className="text-neutral-200 p-4 rounded-2xl bg-neutral-800/75">
      {addressData.historyError ? 'No mempool transactions available' : 'No transactions found'}
     </div>
    ) : (
     <div className="relative flex w-full flex-col gap-2.5">
      {paginatedHistory.map((item, index) => {
       const globalIndex = (page - 1) * pageSize + index;
       return (
        <Link
         key={`${item.tx_hash}-${globalIndex}`}
         href={`/tx/${item.tx_hash}?network=${network}`}
         className="flex w-full flex-col rounded-2xl bg-neutral-800/75 font-mono border border-white/14 hover:bg-neutral-700/30 transition-colors"
        >
         <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4">
          <div className="flex w-full sm:flex-1 items-center gap-2 min-w-0">
           <span className="text-neutral-400 text-xs min-w-[2.5rem] sm:min-w-[3rem]">#{globalIndex + 1}</span>
           <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-neutral-200 text-xs whitespace-nowrap">ID:</span>
            <span className="truncate text-xs text-neutral-100 hover:text-white" title={item.tx_hash}>
             {truncateHash(item.tx_hash, 5, 5)}
            </span>
           </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-1.5 sm:gap-3 w-full sm:w-auto">
           {item.fee !== undefined && (
            <div className="flex items-center gap-1.5">
             <span className="text-neutral-200 text-xs">Fee:</span>
             <span className="truncate font-medium text-white text-xs whitespace-nowrap">
              {formatSatoshi(item.fee)} CY
             </span>
            </div>
           )}
           {item.height > 0 && (
            <div className="flex items-center gap-1.5">
             <span className="text-neutral-200 text-xs">Block:</span>
             <Link
              href={`/block/${item.height}?network=${network}`}
              className="text-neutral-100 hover:text-white text-xs whitespace-nowrap"
              onClick={(e) => e.stopPropagation()}
             >
              {item.height}
             </Link>
            </div>
           )}
          </div>
         </div>
        </Link>
       );
      })}
     </div>
    )}

    {/* Pagination */}
    {addressData.history.length > pageSize && (
     <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3 px-4">
      <button
       onClick={() => setPage(p => Math.max(1, p - 1))}
       disabled={page === 1}
       className="w-full sm:w-auto px-4 py-2 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
      >
       Previous
      </button>
      <span className="px-4 py-2 text-neutral-200 text-sm whitespace-nowrap">
       Page {page} of {Math.ceil(addressData.history.length / pageSize)}
      </span>
      <button
       onClick={() => setPage(p => Math.min(Math.ceil(addressData.history.length / pageSize), p + 1))}
       disabled={page >= Math.ceil(addressData.history.length / pageSize)}
       className="w-full sm:w-auto px-4 py-2 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
      >
       Next
      </button>
     </div>
    )}
   </section>
  </div>
 );
}

