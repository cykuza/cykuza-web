'use client';

import { useEffect } from 'react';

export default function Error({
 error,
 reset,
}: {
 error: Error & { digest?: string };
 reset: () => void;
}) {
 useEffect(() => {
 // Log error to console in development
 if (process.env.NODE_ENV === 'development') {
  console.error('Application error:', error);
 }
 }, [error]);

 return (
 <div className="min-h-screen flex items-center justify-center bg-black">
  <div className="text-center p-8 rounded-2xl border border-white/14 bg-neutral-800/75 max-w-md">
  <h2 className="text-2xl font-bold mb-4 text-white">Something went wrong</h2>
  <p className="text-neutral-200 mb-4">
   An unexpected error occurred. Please try refreshing the page.
  </p>
  {process.env.NODE_ENV === 'development' && error.message && (
   <p className="text-xs text-red-400 mb-4 font-mono">{error.message}</p>
  )}
  <div className="flex gap-3 justify-center">
   <button
   onClick={reset}
   className="px-4 py-2 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-600 transition-colors"
   >
   Try again
   </button>
   <button
   onClick={() => window.location.reload()}
   className="px-4 py-2 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-600 transition-colors"
   >
   Reload Page
   </button>
  </div>
  </div>
 </div>
 );
}

