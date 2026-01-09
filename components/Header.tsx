'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { isBlockHeight, isHex } from '@/lib/utils';
import { useWalletOverlay } from '@/context/WalletOverlayContext';
import { useWallet } from '@/context/WalletContext';

type NetworkType = 'mainnet' | 'testnet';

export default function Header() {
 const router = useRouter();
 const searchParams = useSearchParams();
 const { open: openWallet } = useWalletOverlay();
 const { stage, isLocked } = useWallet();
 const [searchQuery, setSearchQuery] = useState('');
 const [isMounted, setIsMounted] = useState(false);
 const [showMobileSearch, setShowMobileSearch] = useState(false);
 const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);
 const networkDropdownRef = useRef<HTMLDivElement>(null);
 
 // Always start with 'mainnet' to ensure consistent SSR/client hydration
 const [network, setNetwork] = useState<NetworkType>('mainnet');
 
 // Check if wallet session is active
 const isSessionActive = stage === 'ready' && !isLocked;

 // Set mounted state to avoid hydration mismatch
 useEffect(() => {
  setIsMounted(true);
 }, []);

 // Update network from URL params or sessionStorage (client-only after mount)
 useEffect(() => {
  if (!isMounted) return;
  
  const networkParam = searchParams.get('network') as NetworkType;
  if (networkParam && ['mainnet', 'testnet'].includes(networkParam)) {
   setNetwork(networkParam);
  } else {
   // Try to get from sessionStorage (in-memory only, resets on refresh)
   if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('cyberyen-network');
    if (stored && ['mainnet', 'testnet'].includes(stored)) {
     setNetwork(stored as NetworkType);
    }
   }
  }
 }, [searchParams, isMounted]);

 const handleNetworkChange = (newNetwork: NetworkType) => {
  setNetwork(newNetwork);
  setShowNetworkDropdown(false);
  if (typeof window !== 'undefined') {
   sessionStorage.setItem('cyberyen-network', newNetwork);
  }
  // Update URL without navigation
  const params = new URLSearchParams(searchParams.toString());
  params.set('network', newNetwork);
  router.push(`?${params.toString()}`, { scroll: false });
 };

 // Close dropdown when clicking outside
 useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
   if (networkDropdownRef.current && !networkDropdownRef.current.contains(event.target as Node)) {
    setShowNetworkDropdown(false);
   }
  };

  if (showNetworkDropdown) {
   document.addEventListener('mousedown', handleClickOutside);
  }

  return () => {
   document.removeEventListener('mousedown', handleClickOutside);
  };
 }, [showNetworkDropdown]);

 const handleSearch = (e: React.FormEvent) => {
  e.preventDefault();
  if (!searchQuery.trim()) return;

  const query = searchQuery.trim();

  // Determine type and route
  if (isBlockHeight(query)) {
   router.push(`/block/${query}?network=${network}`);
  } else if (isHex(query) && query.length === 64) {
   // Could be block hash or tx hash - try transaction first
   router.push(`/tx/${query}?network=${network}`);
  } else {
   // Assume address
   router.push(`/address/${query}?network=${network}`);
  }
  
  // Close mobile search after navigation
  setShowMobileSearch(false);
 };

 return (
  <>
   <header className="bg-black border-b border-white/14 sticky top-0 z-50" suppressHydrationWarning>
    <div className="container mx-auto px-3 py-3 md:px-4 md:py-4">
     <div className="flex flex-row items-center justify-between gap-2 md:gap-4">
      {/* Left side: Network selector (visible on mobile), Search bar (desktop only) */}
      <div className="flex items-center gap-2 md:gap-4">
       {/* Network Selector - Always visible */}
       <div className="relative shrink-0" ref={networkDropdownRef}>
        <button
         type="button"
                role="combobox"
                aria-expanded={showNetworkDropdown}
                aria-controls="network-dropdown"
         aria-autocomplete="none"
         data-state={showNetworkDropdown ? 'open' : 'closed'}
         className={`space-nowrap group flex select-none items-center justify-between gap-2.5 bg-neutral-800 px-3 md:px-4 font-medium text-sm text-white shadow-xs outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-white border border-white/7 h-10 md:h-12 w-full transition-colors hover:bg-neutral-700/50 shrink-0 ${
          showNetworkDropdown ? 'rounded-t-xl' : 'rounded-xl'
         }`}
         onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
        >
         <span style={{ pointerEvents: 'none' }} className="text-sm leading-5 whitespace-nowrap" suppressHydrationWarning>
          {network === 'mainnet' ? 'Mainnet' : 'Testnet'}
         </span>
         <svg 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24" 
          strokeWidth="1.5" 
          stroke="currentColor" 
          aria-hidden="true" 
          data-slot="icon" 
          className="size-4 opacity-50 transition-transform duration-150 group-data-[state=open]:rotate-180 shrink-0"
         >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"></path>
         </svg>
        </button>

        {/* Hidden select for accessibility */}
        <select
         aria-hidden="true"
         tabIndex={-1}
         className="absolute border-0 w-px h-px p-0 -m-px overflow-hidden clip-[rect(0,0,0,0)] whitespace-nowrap"
         style={{ position: 'absolute', overflow: 'hidden', clip: 'rect(0px, 0px, 0px, 0px)' }}
        >
         <option value="mainnet">Mainnet</option>
         <option value="testnet">Testnet</option>
        </select>

        {/* Dropdown List */}
        {showNetworkDropdown && (
         <div className="absolute top-full left-0 right-0 z-[70] rounded-b-xl border-t-0 border border-white/14 bg-neutral-800 shadow-lg overflow-hidden min-w-[120px]">
          <div className="flex flex-col">
           <button
            type="button"
            onClick={() => handleNetworkChange('mainnet')}
            className={`flex items-center justify-between px-3 md:px-4 py-3 text-sm font-medium transition-colors ${
             network === 'mainnet'
               ? 'bg-neutral-700 text-white'
               : 'text-neutral-200 hover:bg-neutral-700/50'
            }`}
           >
            <span className="text-sm leading-5">Mainnet</span>
           </button>
           
           <button
            type="button"
            onClick={() => handleNetworkChange('testnet')}
            className={`flex items-center justify-between px-3 md:px-4 py-3 text-sm font-medium transition-colors rounded-b-xl ${
             network === 'testnet'
               ? 'bg-neutral-700 text-white'
               : 'text-neutral-200 hover:bg-neutral-700/50'
            }`}
           >
            <span className="text-sm leading-5">Testnet</span>
           </button>
          </div>
         </div>
        )}
       </div>

       {/* Desktop Search Bar */}
       <form onSubmit={handleSearch} className="hidden md:block flex-initial w-96">
        <div className="flex gap-2">
         <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by block height, hash, or address..."
          className="flex-1 rounded-xl border border-white/14 bg-neutral-800/75 text-white px-4 py-2 h-12 opacity-80 hover:opacity-100 focus:outline-none focus:border-white/20 transition-all"
         />
         <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition-all border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-600 h-12 opacity-80 hover:opacity-100"
         >
          Search
         </button>
        </div>
       </form>
      </div>

      {/* Right side: Search button (mobile), API and Wallet buttons */}
      <div className="flex items-center gap-2 md:gap-3.5">
       {/* Mobile Search Button */}
       <button
        onClick={() => setShowMobileSearch(!showMobileSearch)}
        className="md:hidden inline-flex items-center justify-center rounded-xl px-2.5 text-sm font-medium transition-all border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-10 opacity-80 hover:opacity-100 shrink-0"
        aria-label="Search"
       >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
         <circle cx="11" cy="11" r="8"></circle>
         <path d="m21 21-4.35-4.35"></path>
        </svg>
       </button>
       
       <Link
        href="/api-docs"
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 md:px-4 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-10 md:h-12 opacity-80 hover:opacity-100 shrink-0"
       >
        <span className="hidden sm:inline">API</span>
        <span className="sm:hidden">
         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2"></path>
          <path d="M16 21h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"></path>
         </svg>
        </span>
       </Link>
       <button
        onClick={openWallet}
        className="inline-flex items-center justify-center gap-1.5 md:gap-2 whitespace-nowrap rounded-xl px-3 md:px-4 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-45 bg-white text-black hover:bg-neutral-100 h-10 md:h-12 opacity-80 hover:opacity-100 relative shrink-0"
       >
        <span className="hidden sm:inline">Wallet</span>
        <span className="sm:hidden">
         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path>
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path>
         </svg>
        </span>
        {isSessionActive && (
         <span className="absolute top-0.5 right-0.5 md:top-1 md:right-1 w-2 h-2 md:w-2.5 md:h-2.5 bg-green-100 rounded-full border border-white shadow-sm" />
        )}
       </button>
      </div>
     </div>
    </div>
   </header>

   {/* Mobile Search Overlay - Elegant slide-down popup */}
   {showMobileSearch && (
    <div className="fixed inset-x-0 top-[73px] md:hidden z-[60] bg-black border-b border-white/14 shadow-lg">
     <div className="container mx-auto px-3 py-4">
      <form onSubmit={handleSearch} className="w-full">
       <div className="flex gap-2">
        <input
         type="text"
         value={searchQuery}
         onChange={(e) => setSearchQuery(e.target.value)}
         placeholder="Search by block height, hash, or address..."
         className="flex-1 rounded-xl border border-white/14 bg-neutral-800/75 text-white px-4 py-2 text-sm h-10 opacity-80 hover:opacity-100 focus:outline-none focus:border-white/20 transition-all"
         autoFocus
        />
        <button
         type="submit"
         className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-all border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-600 h-10 opacity-80 hover:opacity-100 shrink-0"
        >
         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
         </svg>
        </button>
        <button
         type="button"
         onClick={() => setShowMobileSearch(false)}
         className="inline-flex items-center justify-center rounded-xl px-3 text-sm font-medium transition-all border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-600 h-10 opacity-80 hover:opacity-100 shrink-0"
         aria-label="Close search"
        >
         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18"></path>
          <path d="m6 6 12 12"></path>
         </svg>
        </button>
       </div>
      </form>
     </div>
    </div>
   )}
  </>
 );
}

