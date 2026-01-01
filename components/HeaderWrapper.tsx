'use client';

import { Suspense } from 'react';
import Header from './Header';

export default function HeaderWrapper() {
 return (
  <Suspense fallback={
   <header className="bg-black border-b border-white/14 sticky top-0 z-50" suppressHydrationWarning>
    <div className="container mx-auto px-3 py-3 md:px-4 md:py-4">
     <div className="flex flex-row items-center justify-between gap-2 md:gap-4">
      <div className="flex items-center gap-2 md:gap-4">
       <div className="relative shrink-0">
        <button
         type="button"
         className="space-nowrap group flex select-none items-center justify-between gap-2.5 bg-neutral-800 px-3 md:px-4 font-medium text-sm text-white shadow-xs outline-hidden disabled:cursor-not-allowed disabled:opacity-50 border border-white/7 h-10 md:h-12 w-full transition-colors hover:bg-neutral-700/50 shrink-0 rounded-xl"
         disabled
        >
         <span className="text-sm leading-5 whitespace-nowrap">Mainnet</span>
         <svg 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24" 
          strokeWidth="1.5" 
          stroke="currentColor" 
          className="size-4 opacity-50 shrink-0"
         >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"></path>
         </svg>
        </button>
       </div>
       <form className="hidden md:block flex-initial w-96">
        <div className="flex gap-2">
         <input
          type="text"
          placeholder="Search by block height, hash, or address..."
          className="flex-1 rounded-xl border border-white/14 bg-neutral-800/75 text-white px-4 py-2 h-12 opacity-80 transition-all"
          disabled
         />
         <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition-all border border-white/14 bg-neutral-800/75 text-white h-12 opacity-80"
          disabled
         >
          Search
         </button>
        </div>
       </form>
      </div>
      <div className="flex items-center gap-2 md:gap-3.5">
       <button
        className="md:hidden inline-flex items-center justify-center rounded-xl px-2.5 text-sm font-medium transition-all border border-white/7 bg-neutral-800 text-white h-10 opacity-80 shrink-0"
        disabled
       >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
         <circle cx="11" cy="11" r="8"></circle>
         <path d="m21 21-4.35-4.35"></path>
        </svg>
       </button>
       <div className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 md:px-4 text-sm font-medium transition-all border border-white/7 bg-neutral-800 text-white h-10 md:h-12 opacity-80 shrink-0">
        <span className="hidden sm:inline">API</span>
        <span className="sm:hidden">
         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16"></path>
          <path d="M4 12h16"></path>
          <path d="M4 17h16"></path>
         </svg>
        </span>
       </div>
       <button
        className="inline-flex items-center justify-center gap-1.5 md:gap-2 whitespace-nowrap rounded-xl px-3 md:px-4 text-sm font-medium transition-all bg-white text-black h-10 md:h-12 opacity-80 relative shrink-0"
        disabled
       >
        <span className="hidden sm:inline">Wallet</span>
        <span className="sm:hidden">
         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path>
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path>
         </svg>
        </span>
       </button>
      </div>
     </div>
    </div>
   </header>
  }>
   <Header />
  </Suspense>
 );
}


