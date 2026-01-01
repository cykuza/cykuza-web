import type { Metadata } from 'next';
import { ReactNode } from 'react';
import './globals.css';
import HeaderWrapper from '@/components/HeaderWrapper';
import Footer from '@/components/Footer';
import WalletOverlay from '@/components/WalletOverlay';
import { Providers } from './providers';

export const metadata: Metadata = {
 title: '|C¥|kuza — Cyberyen Explorer & Wallet',
 description: 'Blockchain explorer and non-custodial wallet for Cyberyen',
 icons: {
  icon: [
   { url: '/icon.png', sizes: '192/192', type: 'image/png' },
   { url: '/icon.ico', sizes: '32/32' },
  ],
  apple: [
   { url: '/apple-icon.png', sizes: '180/180', type: 'image/png' },
  ],
 },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const viewport = {
 width: 'device-width',
 initialScale: 1,
 maximumScale: 1,
};

export default function RootLayout({
 children,
}: {
 children: ReactNode;
}) {
 return (
  <html lang="en">
   <body className="bg-black text-white min-h-screen flex flex-col">
    <Providers>
     <HeaderWrapper />
     <main className="container mx-auto px-4 py-8 flex-1">
      {children}
     </main>
     <Footer />
     <WalletOverlay />
    </Providers>
   </body>
  </html>
 );
}
