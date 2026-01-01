'use client';

import { useSearchParams } from 'next/navigation';
import LatestTransactions from '@/components/LatestTransactions';
import LatestBlocks from '@/components/LatestBlocks';
import { useEffect, useState, Suspense } from 'react';
import { useElectrumExplorer } from '@/hooks/useElectrumExplorer';
import { parseBlockHeader, calculateDifficultyFromBits, calculateHashrate } from '@/lib/utils';

// Mark as dynamic to prevent static generation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface NetworkStats {
 blockHeight: number;
 hashrate: number;
}

function HomeContent() {
 const searchParams = useSearchParams();
 const network = (searchParams.get('network') || 'mainnet') as 'mainnet' | 'testnet';
 const [stats, setStats] = useState<NetworkStats | null>(null);
 const { connected, call, error: electrumError } = useElectrumExplorer({ network, autoConnect: true });

 useEffect(() => {
  const fetchStats = async () => {
   if (!connected) return;

   try {
    // Get current tip - blockchain.headers.subscribe returns an object with height and hex, or just a number
    const tip = await call('blockchain.headers.subscribe', []);
    const currentHeight = (tip && typeof tip === 'object' && 'height' in tip) 
      ? tip.height 
      : (typeof tip === 'number' ? tip : 0);
    
    if (!currentHeight || currentHeight === 0) {
     return;
    }

    // Get current block header to extract bits and calculate difficulty
    let difficulty = 0;
    let hashrate = 0;
    
    if (currentHeight > 0) {
     try {
      const headerHex = await call('blockchain.block.header', [currentHeight]);
      if (typeof headerHex === 'string' && headerHex.length >= 160) {
       const header = parseBlockHeader(headerHex.substring(0, 160));
       difficulty = calculateDifficultyFromBits(header.bits);
       // Calculate hashrate: Hashrate = Difficulty * (2^32) / Block Time
       // Cyberyen (Litecoin fork) has a 150 second (2.5 minute) block time
       const BLOCK_TIME_SECONDS = 150;
       hashrate = calculateHashrate(difficulty, BLOCK_TIME_SECONDS);
      }
     } catch (err) {
      if (process.env.NODE_ENV === 'development') {
       console.error('Error calculating difficulty:', err);
      }
     }
    }

    setStats({
     blockHeight: currentHeight,
     hashrate,
    });
   } catch (error) {
    if (process.env.NODE_ENV === 'development') {
     console.error('Error fetching stats:', error);
    }
   }
  };

  if (connected) {
   fetchStats();
   const interval = setInterval(fetchStats, 30000); // Update every 30 seconds
   return () => clearInterval(interval);
  }
 }, [connected, call, network]);

 return (
  <div className="space-y-6">
   {/* Header Section */}
   <div className="flex flex-col gap-2.5 rounded-2xl border border-white/14 px-5 py-4">
    <div className="flex items-center gap-3 font-medium text-lg">
     <h1 className="text-white">Explorer</h1>
    </div>
    <p className="text-neutral-200 text-sm">Real-time blockchain data</p>
   </div>

   {/* Network Stats Section */}
   {stats && (
    <div className="rounded-2xl border border-white/14 px-5 py-4">
     <h2 className="font-medium text-base mb-4">Network Stats</h2>
     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-white/14 bg-neutral-800/75 p-4">
       <div className="text-neutral-200 text-sm mb-2">Current Block Height</div>
       <div className="text-2xl font-bold text-white">{stats.blockHeight.toLocaleString()}</div>
      </div>
      <div className="rounded-2xl border border-white/14 bg-neutral-800/75 p-4">
       <div className="text-neutral-200 text-sm mb-2">Network Hashrate</div>
       <div className="text-2xl font-bold text-white">
        {(stats.hashrate / 1e9).toFixed(2)} GH/s
       </div>
      </div>
     </div>
    </div>
   )}

   {/* Latest Transactions and Latest Blocks */}
   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <LatestTransactions network={network} />
    <LatestBlocks network={network} />
   </div>
  </div>
 );
}

export default function Home() {
 return (
  <Suspense fallback={
   <div className="space-y-6">
    <div className="flex flex-col gap-2.5 rounded-2xl border border-white/14 px-5 py-4">
     <div className="flex items-center gap-3 font-medium text-lg">
      <h1 className="text-white">Explorer</h1>
     </div>
     <p className="text-neutral-200 text-sm">Loading...</p>
    </div>
   </div>
  }>
   <HomeContent />
  </Suspense>
 );
}

