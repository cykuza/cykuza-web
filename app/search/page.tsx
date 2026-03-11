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

  const redirect = async () => {
   if (isBlockHeight(trimmedQuery)) {
    router.push(`/block/${trimmedQuery}?network=${network}`);
    return;
   }
   if (isHex(trimmedQuery) && trimmedQuery.length === 64) {
    // Same shape as txid and block hash — try block API first, then tx
    try {
     const blockRes = await fetch(
      `/api/block?hash=${encodeURIComponent(trimmedQuery)}&network=${network}`
     );
     if (blockRes.ok) {
      router.push(`/block/${trimmedQuery}?network=${network}`);
     } else if (blockRes.status === 404) {
      router.push(`/tx/${trimmedQuery}?network=${network}`);
     } else {
      router.push(`/block/${trimmedQuery}?network=${network}`);
     }
    } catch {
     router.push(`/block/${trimmedQuery}?network=${network}`);
    }
    return;
   }
   router.push(`/address/${encodeURIComponent(trimmedQuery)}?network=${network}`);
  };

  redirect();
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

