// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function NotFound() {
 return (
  <div className="min-h-screen flex items-center justify-center bg-black">
   <div className="text-center p-8 rounded-2xl border border-white/14 bg-neutral-800/75 max-w-md">
    <h2 className="text-2xl font-bold mb-4 text-white">404 - Page Not Found</h2>
    <p className="text-neutral-200 mb-4">
     The page you are looking for does not exist.
    </p>
    <a
     href="/"
     className="inline-block px-4 py-2 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-600 transition-colors"
    >
     Go Home
    </a>
   </div>
  </div>
 );
}

