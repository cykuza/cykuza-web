'use client';

import { useEffect, ReactNode } from 'react';
import { WalletProvider } from '@/context/WalletContext';
import { WalletOverlayProvider } from '@/context/WalletOverlayContext';

/** Block iframe embedding (clickjacking). */
const FrameGuard = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.top !== window.self) {
      const body = document.body;
      while (body.firstChild) {
        body.removeChild(body.firstChild);
      }
      const message = document.createElement('div');
      message.style.cssText =
        'padding:2rem;font-family:monospace;color:#fff;background:#000';
      message.textContent = 'Embedding blocked for security.';
      body.appendChild(message);
    }
  }, []);
  return <>{children}</>;
};

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <WalletOverlayProvider>
        <FrameGuard>{children}</FrameGuard>
      </WalletOverlayProvider>
    </WalletProvider>
  );
}
