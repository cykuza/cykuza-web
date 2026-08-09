import Link from 'next/link';
import { EXTENSION_REPO_URL } from '@/lib/extensionLinks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function PrivacyPage() {
 return (
  <div className="max-w-4xl mx-auto space-y-6">
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
        Privacy
       </span>
      </li>
     </ol>
    </nav>
    <div className="flex items-center gap-3 font-medium text-lg">
     <h1 className="text-white">Privacy Policy</h1>
    </div>
    <p className="text-neutral-200 text-sm">
     Last updated: August 2026
    </p>
   </div>

   <div className="space-y-6">
    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Scope</h2>
     <p className="text-neutral-200">
      This policy covers the Cykuza browser extension and this website (Cyberyen explorer and web wallet).
     </p>
    </section>

    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">What we do not do</h2>
     <ul className="list-disc list-inside text-neutral-200 space-y-1">
      <li>We do not create user accounts</li>
      <li>We do not collect analytics or telemetry</li>
      <li>We do not sync vaults to the cloud</li>
      <li>We do not sell or share personal data</li>
     </ul>
    </section>

    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Browser extension</h2>
     <p className="text-neutral-200 mb-3">
      The extension is non-custodial. Encrypted vault ciphertext (Argon2id + AES-GCM) and local settings (network preference, optional custom Electrum endpoints, auto-lock, terms) stay in browser local storage on your device.
     </p>
     <p className="text-neutral-200 mb-3">
      Plaintext keys exist only in memory after unlock. There are no content scripts or dApp provider injection in v1.
     </p>
     <p className="text-neutral-200">
      The wallet talks to Electrum servers you configure (or build-time defaults in official builds). Custom server URLs remain on your device. A self-host guide ships inside the extension.
     </p>
    </section>

    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">This website</h2>
     <p className="text-neutral-200">
      Blockchain lookups and the web wallet run in your browser session as a non-custodial hot wallet. We do not add third-party analytics on this product surface.
     </p>
    </section>

    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Contact</h2>
     <p className="text-neutral-200">
      Questions or concerns: open an issue on{' '}
      <a
       href="https://github.com/cykuza/cykuza-web"
       target="_blank"
       rel="noopener noreferrer"
       className="text-white underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
       cykuza-web
      </a>
      {' '}or{' '}
      <a
       href={EXTENSION_REPO_URL}
       target="_blank"
       rel="noopener noreferrer"
       className="text-white underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
       cykuza-extension
      </a>
      .
     </p>
     <p className="text-neutral-200 text-sm mt-4">
      <Link href="/extension" className="text-white underline underline-offset-2 hover:opacity-80 transition-opacity">
       Back to Extension
      </Link>
     </p>
    </section>
   </div>
  </div>
 );
}
