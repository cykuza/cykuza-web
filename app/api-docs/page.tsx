import Link from 'next/link';

// Mark as dynamic to prevent static generation issues
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function ApiDocsPage() {
 return (
  <div className="max-w-4xl mx-auto space-y-6">
   {/* Breadcrumb */}
   <div className="flex flex-col gap-2.5 rounded-2xl border border-white/14 px-5 py-4">
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 break-words text-sm">
     <ol className="flex flex-wrap items-center gap-1.5">
      <li className="inline-flex items-center gap-1.5">
       <Link href="/" className="max-w-full truncate font-medium text-neutral-200 text-xs transition-colors hover:text-white">
        Explorer
       </Link>
      </li>
      <li role="presentation" aria-hidden="true" className="text-neutral-200">
       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="m9 18 6-6-6-6"></path>
       </svg>
      </li>
      <li className="inline-flex items-center gap-1.5">
       <span className="max-w-full truncate font-medium text-neutral-200 text-xs pointer-events-none">
        API
       </span>
      </li>
     </ol>
    </nav>
    <div className="flex items-center gap-3 font-medium text-lg">
     <h1 className="text-white">API Documentation</h1>
    </div>
    <p className="text-neutral-200 text-sm">
     Learn how to use the Cyberyen Explorer API to fetch blockchain data
    </p>
   </div>

   <div className="space-y-6">
    {/* Rate Limiting */}
    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Rate Limiting</h2>
     <p className="text-neutral-200 mb-2">
      All API endpoints are rate-limited to 10 requests per minute per IP address.
      Rate limit information is included in response headers:
     </p>
     <ul className="list-disc list-inside text-neutral-200 space-y-1">
      <li><code className="bg-neutral-800/75 px-2 py-1 rounded-xl border border-white/14">X-RateLimit-Remaining</code>: Number of requests remaining</li>
      <li>If rate limit is exceeded, a 429 status code is returned with <code className="bg-neutral-800/75 px-2 py-1 rounded-xl border border-white/14">Retry-After</code> header</li>
     </ul>
    </section>

    {/* Get Block */}
    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Get Block</h2>
     <p className="text-neutral-200 mb-2">Fetch block data by height or hash.</p>
     <div className="bg-neutral-800/75 p-4 rounded-2xl border border-white/14 mb-2">
      <code className="text-green-400">
       GET /api/block?height=123&network=mainnet
      </code>
      <br />
      <code className="text-green-400">
       GET /api/block?hash=abc123...&network=mainnet
      </code>
     </div>
     <h3 className="text-lg font-semibold mt-4 mb-2 text-white">Parameters</h3>
     <ul className="list-disc list-inside text-neutral-200 space-y-1">
      <li><code className="bg-neutral-800/75 px-2 py-1 rounded-xl border border-white/14">height</code> (optional): Block height (integer)</li>
      <li><code className="bg-neutral-800/75 px-2 py-1 rounded-xl border border-white/14">hash</code> (optional): Block hash (64 hex characters)</li>
      <li><code className="bg-neutral-800/75 px-2 py-1 rounded-xl border border-white/14">network</code> (optional): Network type - mainnet, testnet, or mweb (default: mainnet)</li>
     </ul>
     <h3 className="text-lg font-semibold mt-4 mb-2 text-white">Response</h3>
     <pre className="bg-neutral-800/75 p-4 rounded-2xl border border-white/14 overflow-x-auto text-sm text-neutral-200">
{`{
 "height": 123,
 "hash": "abc123...",
 "prev_hash": "def456...",
 "merkle_root": "ghi789...",
 "timestamp": 1234567890,
 "size": 1234567,
 "tx_count": 42,
 "hasMweb": false,
 "mwebHeader": { ... }
}`}
     </pre>
    </section>

    {/* Get Transaction */}
    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Get Transaction</h2>
     <p className="text-neutral-200 mb-2">Fetch transaction data by hash.</p>
     <div className="bg-neutral-800/75 p-4 rounded-2xl border border-white/14 mb-2">
      <code className="text-green-400">
       GET /api/tx?hash=abc123...&network=mainnet&verbose=true
      </code>
     </div>
     <h3 className="text-lg font-semibold mt-4 mb-2 text-white">Parameters</h3>
     <ul className="list-disc list-inside text-neutral-200 space-y-1">
      <li><code className="bg-neutral-800/75 px-2 py-1 rounded-xl border border-white/14">hash</code> (required): Transaction hash (64 hex characters)</li>
      <li><code className="bg-neutral-800/75 px-2 py-1 rounded-xl border border-white/14">network</code> (optional): Network type (default: mainnet)</li>
      <li><code className="bg-neutral-800/75 px-2 py-1 rounded-xl border border-white/14">verbose</code> (optional): Return detailed transaction data (default: false)</li>
     </ul>
     <h3 className="text-lg font-semibold mt-4 mb-2 text-white">Response</h3>
     <pre className="bg-neutral-800/75 p-4 rounded-2xl border border-white/14 overflow-x-auto text-sm text-neutral-200">
{`{
 "txid": "abc123...",
 "hash": "abc123...",
 "version": 1,
 "size": 250,
 "vsize": 250,
 "weight": 1000,
 "locktime": 0,
 "inputs": [ ... ],
 "outputs": [ ... ],
 "fee": 1000,
 "isMweb": false,
 "mwebExtension": { ... }
}`}
     </pre>
    </section>

    {/* Get Address */}
    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Get Address</h2>
     <p className="text-neutral-200 mb-2">Fetch address balance and transaction history.</p>
     <div className="bg-neutral-800/75 p-4 rounded-2xl border border-white/14 mb-2">
      <code className="text-green-400">
       GET /api/address?address=LYb...&network=mainnet
      </code>
     </div>
     <h3 className="text-lg font-semibold mt-4 mb-2 text-white">Parameters</h3>
     <ul className="list-disc list-inside text-neutral-200 space-y-1">
      <li><code className="bg-neutral-800/75 px-2 py-1 rounded-xl border border-white/14">address</code> (required): Cyberyen address</li>
      <li><code className="bg-neutral-800/75 px-2 py-1 rounded-xl border border-white/14">network</code> (optional): Network type (default: mainnet)</li>
     </ul>
     <h3 className="text-lg font-semibold mt-4 mb-2 text-white">Response</h3>
     <pre className="bg-neutral-800/75 p-4 rounded-2xl border border-white/14 overflow-x-auto text-sm text-neutral-200">
{`{
 "address": "LYb...",
 "balance": 100000000,
 "confirmed": 100000000,
 "unconfirmed": 0,
 "history": [ ... ]
}`}
     </pre>
    </section>

    {/* Network Stats */}
    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Network Stats</h2>
     <p className="text-neutral-200 mb-2">Get current network statistics.</p>
     <div className="bg-neutral-800/75 p-4 rounded-2xl border border-white/14 mb-2">
      <code className="text-green-400">
       GET /api/network-stats?network=mainnet
      </code>
     </div>
     <h3 className="text-lg font-semibold mt-4 mb-2 text-white">Response</h3>
     <pre className="bg-neutral-800/75 p-4 rounded-2xl border border-white/14 overflow-x-auto text-sm text-neutral-200">
{`{
 "network": "mainnet",
 "blockHeight": 123456,
 "blockHash": "abc123...",
 "difficulty": 1234567.89,
 "hashrate": 1234567890,
 "mwebUsagePercentage": 15.5,
 "timestamp": 1234567890123
}`}
     </pre>
    </section>

    {/* Latest Blocks */}
    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Latest Blocks</h2>
     <p className="text-neutral-200 mb-2">Get the most recent blocks.</p>
     <div className="bg-neutral-800/75 p-4 rounded-2xl border border-white/14 mb-2">
      <code className="text-green-400">
       GET /api/latest-blocks?network=mainnet&limit=11
      </code>
     </div>
    </section>

    {/* Latest Transactions */}
    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Latest Transactions</h2>
     <p className="text-neutral-200 mb-2">Get the most recent transactions.</p>
     <div className="bg-neutral-800/75 p-4 rounded-2xl border border-white/14 mb-2">
      <code className="text-green-400">
       GET /api/latest-transactions?network=mainnet&limit=11
      </code>
     </div>
    </section>
   </div>
  </div>
 );
}




