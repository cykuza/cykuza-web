import Link from 'next/link';
import { ChromeIcon, FirefoxIcon } from '@/components/BrowserBrandIcons';
import {
 EXTENSION_CHROME_URL,
 EXTENSION_FIREFOX_URL,
 EXTENSION_REPO_URL,
} from '@/lib/extensionLinks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ctaClassName =
 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition-all border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-12 opacity-80 hover:opacity-100';

export default function ExtensionPage() {
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
        Extension
       </span>
      </li>
     </ol>
    </nav>
    <div className="flex items-center gap-3 font-medium text-lg">
     <h1 className="text-white">Cykuza Extension</h1>
    </div>
    <p className="text-neutral-200 text-sm">
     Non-custodial Cyberyen wallet for Chrome and Firefox — vault on your device, no accounts, no telemetry.
    </p>
   </div>

   <div className="space-y-6">
    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Get the extension</h2>
     <div className="flex flex-col sm:flex-row gap-3">
      <a
       href={EXTENSION_CHROME_URL}
       target="_blank"
       rel="noopener noreferrer"
       className={ctaClassName}
      >
       <ChromeIcon size={18} />
       Chrome
      </a>
      <a
       href={EXTENSION_FIREFOX_URL}
       target="_blank"
       rel="noopener noreferrer"
       className={ctaClassName}
      >
       <FirefoxIcon size={18} />
       Firefox
      </a>
      <a
       href={EXTENSION_REPO_URL}
       target="_blank"
       rel="noopener noreferrer"
       className={ctaClassName}
      >
       Source on GitHub
      </a>
     </div>
     <p className="text-neutral-200 text-sm mt-4">
      Install from the Chrome Web Store or Firefox Add-ons. Source builds are also available on GitHub.
     </p>
    </section>

    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Cykuza clients</h2>
     <p className="text-neutral-200">
      Cykuza Web (this site) is the explorer and browser hot wallet. The extension is a separate Manifest V3 client in the same ecosystem. Use whichever fits your threat model.
     </p>
    </section>

    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Privacy model</h2>
     <ul className="list-disc list-inside text-neutral-200 space-y-1">
      <li>No accounts</li>
      <li>No telemetry</li>
      <li>No cloud sync</li>
      <li>Encrypted vault (Argon2id + AES-GCM) in local extension storage</li>
      <li>Keys only in memory while unlocked</li>
      <li>Self-host Electrum guide included in the extension</li>
     </ul>
     <p className="text-neutral-200 text-sm mt-4">
      <Link href="/privacy" className="text-white underline underline-offset-2 hover:opacity-80 transition-opacity">
       Read the full Privacy Policy
      </Link>
     </p>
    </section>

    <section className="rounded-2xl border border-white/14 bg-neutral-800/75 p-6">
     <h2 className="text-xl font-bold mb-4 text-white border-b border-white/14 pb-2">Self-host Electrum</h2>
     <p className="text-neutral-200">
      Prefer your own Electrum? Open the self-host guide from inside the extension after install. We do not publish production Electrum hostnames in this site&apos;s source.
     </p>
    </section>
   </div>
  </div>
 );
}
