'use client';

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

interface WalletOverlayContextState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const WalletOverlayContext = createContext<WalletOverlayContextState | undefined>(undefined);

export const WalletOverlayProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  const value = useMemo(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle]
  );

  return <WalletOverlayContext.Provider value={value}>{children}</WalletOverlayContext.Provider>;
};

export const useWalletOverlay = (): WalletOverlayContextState => {
  const ctx = useContext(WalletOverlayContext);
  if (!ctx) throw new Error('WalletOverlayContext missing');
  return ctx;
};



