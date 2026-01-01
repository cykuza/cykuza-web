'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useWallet } from '@/context/WalletContext';

export const ReceiveView = () => {
  const { address, networkType } = useWallet();

  // No need to check stage - the parent component (WalletOverlay) handles stage management
  // This component only renders when stage === 'receive'

  const copyAddress = () => {
    if (address) {
      navigator.clipboard?.writeText(address);
    }
  };

  // Show error if address is not available
  if (!address) {
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
          <p className="text-red-400 text-sm">Wallet address not available</p>
          <p className="text-neutral-200 text-xs text-center">
            Please ensure your wallet is properly initialized
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">

      {/* Content */}
      <div className="pt-7">
        <div className="relative flex w-full flex-col items-center justify-center rounded-2xl border border-white/7 bg-neutral-800 px-4 py-10 pb-5">
          {/* QR Code */}
          <div>
            <QRCodeSVG value={address} size={250} />
          </div>

          {/* Address */}
          <div className="relative mt-4 cursor-pointer break-all rounded-xl border border-white/14 bg-white/7 px-6 py-4 font-medium text-neutral-200 text-xs transition-colors hover:bg-white/10 flex items-center gap-2" onClick={copyAddress}>
            <span className="flex-1">{address}</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline size-4 shrink-0">
              <path fill="currentColor" fillRule="evenodd" d="M7.556 4.222h8.66c1.24 0 1.688.13 2.14.371.453.243.808.598 1.05 1.05.243.453.372.901.372 2.14v8.661a1.111 1.111 0 1 0 2.222 0V7.698c0-1.981-.207-2.7-.593-3.425a4.04 4.04 0 0 0-1.68-1.68C19.002 2.207 18.283 2 16.302 2H7.556a1.111 1.111 0 1 0 0 2.222m8.578 2.594c-.452-.243-.9-.372-2.14-.372H5.561c-1.239 0-1.688.13-2.14.372a2.52 2.52 0 0 0-1.05 1.05c-.242.452-.371.9-.371 2.14v8.433c0 1.238.129 1.688.371 2.14a2.53 2.53 0 0 0 1.05 1.05c.452.242.901.371 2.14.371h8.433c1.238 0 1.688-.129 2.14-.371a2.53 2.53 0 0 0 1.05-1.05c.243-.452.372-.901.372-2.14v-8.433c0-1.24-.13-1.688-.372-2.14a2.52 2.52 0 0 0-1.05-1.05" clipRule="evenodd"></path>
            </svg>
          </div>

          {/* Message */}
          <div className="mt-4 px-5 text-center text-neutral-200 text-xs">
            Scan this QR or copy the address below to receive <span className="text-white">Cyberyen {networkType === 'mainnet' ? 'Mainnet' : 'Testnet'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

