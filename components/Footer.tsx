'use client';

import { useElectrumStatus } from '@/hooks/useElectrumStatus';

export default function Footer() {
 const status = useElectrumStatus();

 return (
  <footer className="bg-black border-t border-white/14 mt-auto">
   <div className="container mx-auto px-4 py-6 md:py-8">
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
     {/* GitHub Icon */}
     <a
      href="https://github.com/cykuza/cykuza-web"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
      aria-label="GitHub Repository"
     >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
       <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path>
       <path d="M9 18c-4.51 2-5-2-7-2"></path>
      </svg>
     </a>

     {/* Powered by Electrum with Status */}
     <div className="flex items-center gap-2 text-xs text-neutral-400">
      <span
       className={`${
         status === 'ready'
          ? 'text-white'
          : status === 'connecting'
          ? 'text-yellow-400'
          : status === 'error'
          ? 'text-red-400'
          : 'text-neutral-500'
       } transition-all duration-300`}
       style={status === 'ready' ? {
         textShadow: '0 0 8px rgba(255, 255, 255, 0.8), 0 0 12px rgba(255, 255, 255, 0.6), 0 0 16px rgba(255, 255, 255, 0.4)'
       } : {}}
      >
       {status === 'ready'
        ? 'Connected'
        : status === 'connecting'
        ? 'Connecting...'
        : status === 'error'
        ? 'Error'
        : 'Disconnected'}
      </span>
     </div>
    </div>
   </div>
  </footer>
 );
}
