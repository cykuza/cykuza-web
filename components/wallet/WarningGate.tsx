'use client';

import { useState, MouseEvent } from 'react';
import { useWallet } from '@/context/WalletContext';

export const WarningGate = () => {
 const { accepted, acceptTerms } = useWallet();
 const [open, setOpen] = useState(!accepted);

 const handleAgree = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  acceptTerms();
  setOpen(false);
 };

 if (!open && accepted) return null;

 return (
  <div 
   className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 overflow-y-auto" 
   role="dialog" 
   aria-modal="true" 
   aria-labelledby="warning-title"
  >
   <div className="rounded-xl border border-white/14 bg-black/80 max-w-xl w-full p-4 sm:p-6 relative my-auto">
    {/* Header */}
    <div className="mb-4 sm:mb-5">
     <h2 className="text-lg sm:text-xl font-bold text-white" id="warning-title">
      Critical security warning
     </h2>
    </div>
    
    {/* Content - Scrollable on very small screens */}
    <div className="text-sm sm:text-base leading-6 text-neutral-200 space-y-3 sm:space-y-4 max-h-[60vh] sm:max-h-none overflow-y-auto pr-1">
     <p className="text-neutral-200">
      This wallet is fully in-browser and stores keys only in volatile memory
      during your session. Closing the page erases your seed
      phrase and wallet. You are solely responsible for backing up your seed
      phrase offline and verifying transaction details.
     </p>
     <ul className="list-disc ml-5 sm:ml-6 space-y-2 text-neutral-300">
      <li>Do not reuse this session for long-term storage.</li>
      <li>Only connect to Electrum servers you trust and verify TLS (wss://).</li>
      <li>Never share or paste your seed phrase anywhere else.</li>
      <li>Ensure you are on the correct site; this app blocks iframing to reduce phishing.</li>
     </ul>
    </div>
    
    {/* Actions */}
    <div className="mt-6 sm:mt-8 flex justify-end">
     <button
      type="button"
      className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-medium transition-colors disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-11 sm:h-12 w-full sm:w-auto"
      onClick={handleAgree}
     >
      I understand and accept
     </button>
    </div>
   </div>
  </div>
 );
};



