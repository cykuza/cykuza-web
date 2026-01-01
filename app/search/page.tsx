'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isBlockHeight, isHex } from '@/lib/utils';

// Mark as dynamic to prevent static generation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function SearchContent() {
 const router = useRouter();
 const searchParams = useSearchParams();
 const query = searchParams.get('q');
 const network = (searchParams.get('network') || 'mainnet') as 'mainnet' | 'testnet';

 useEffect(() => {
  if (!query) {
   router.push('/');
   return;
  }

  const trimmedQuery = query.trim();

  // Determine type and redirect
  if (isBlockHeight(trimmedQuery)) {
   router.push(`/block/${trimmedQuery}?network=${network}`);
  } else if (isHex(trimmedQuery) && trimmedQuery.length === 64) {
   // Could be block hash or tx hash - try transaction first
   router.push(`/tx/${trimmedQuery}?network=${network}`);
  } else {
   // Assume address
   router.push(`/address/${trimmedQuery}?network=${network}`);
  }
 }, [query, network, router]);

 return (
  <div className="text-center py-12">
   <div className="text-neutral-200">Redirecting...</div>
  </div>
 );
}

export default function SearchPage() {
 return (
  <Suspense fallback={
   <div className="text-center py-12">
    <div className="text-neutral-200">Loading...</div>
   </div>
  }>
   <SearchContent />
  </Suspense>
 );
}

