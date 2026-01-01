'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, ReactNode } from 'react';
import { WalletProvider, useWallet } from '@/context/WalletContext';
import { WalletOverlayProvider, useWalletOverlay } from '@/context/WalletOverlayContext';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';

// Frame guard to prevent iframe embedding (security)
const FrameGuard = ({ children }: { children: ReactNode }) => {
 useEffect(() => {
  if (typeof window !== 'undefined' && window.top !== window.self) {
   // Clear body and create safe message element
   const body = document.body;
   while (body.firstChild) {
    body.removeChild(body.firstChild);
   }
   const message = document.createElement('div');
   message.style.cssText = 'padding:2rem;font-family:monospace;color:#fff;background:#000';
   message.textContent = 'Embedding blocked for security.';
   body.appendChild(message);
  }
 }, []);
 return <>{children}</>;
};

// Idle timeout watcher for wallet sessions
const IdleWatcher = ({ children }: { children: ReactNode }) => {
 const { endSession } = useWallet();
 const { isOpen } = useWalletOverlay();
 useIdleTimeout(() => {
  // Only end session if wallet overlay is open
  if (isOpen) {
   endSession(true);
  }
 });
 return <>{children}</>;
};

const WalletProviders = ({ children }: { children: ReactNode }) => {
 return (
  <WalletProvider>
   <WalletOverlayProvider>
    <FrameGuard>
     <IdleWatcher>{children}</IdleWatcher>
    </FrameGuard>
   </WalletOverlayProvider>
  </WalletProvider>
 );
};

export function Providers({ children }: { children: ReactNode }) {
 const [queryClient] = useState(
  () =>
   new QueryClient({
    defaultOptions: {
     queries: {
      staleTime: 10000, // 10 seconds
      refetchOnWindowFocus: false,
      retry: 1,
     },
    },
   })
 );

 return (
  <QueryClientProvider client={queryClient}>
   <WalletProviders>
    {children}
   </WalletProviders>
  </QueryClientProvider>
 );
}
