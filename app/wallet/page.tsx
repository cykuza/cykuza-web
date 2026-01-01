'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useWalletOverlay } from '@/context/WalletOverlayContext';

// Mark as dynamic to prevent static generation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function WalletPage() {
 const router = useRouter();
 const { open } = useWalletOverlay();

 useEffect(() => {
  // Redirect to home and open the wallet overlay
  router.replace('/');
  // Small delay to ensure navigation completes before opening overlay
  const timer = setTimeout(() => {
   open();
  }, 100);
  return () => clearTimeout(timer);
 }, [router, open]);

 return null;
}