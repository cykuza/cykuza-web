'use client';

export default function GlobalError({
 error,
 reset,
}: {
 error: Error & { digest?: string };
 reset: () => void;
}) {
 return (
  <html lang="en">
   <body className="bg-black text-white min-h-screen flex items-center justify-center">
    <div className="text-center p-8 bg-gray-900 rounded-lg max-w-md border-2 border-red-500">
     <h2 className="text-2xl font-bold mb-4 text-white">Application Error</h2>
     <p className="text-gray-400 mb-4">
      A critical error occurred. Please try refreshing the page.
     </p>
     {process.env.NODE_ENV === 'development' && error.message && (
      <p className="text-xs text-red-400 mb-4 font-mono break-all">{error.message}</p>
     )}
     <div className="flex gap-3 justify-center">
      <button
       onClick={reset}
       className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-600 transition-colors"
      >
       Try again
      </button>
      <button
       onClick={() => window.location.reload()}
       className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-600 transition-colors"
      >
       Reload Page
      </button>
     </div>
    </div>
   </body>
  </html>
 );
}









