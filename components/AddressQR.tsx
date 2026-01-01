'use client';

import { QRCodeSVG } from 'qrcode.react';

interface AddressQRProps {
 address: string;
 size?: number;
}

export default function AddressQR({ address, size = 200 }: AddressQRProps) {
 return (
  <div className="flex flex-col items-center p-4 bg-white rounded-xl border border-white/14">
   <QRCodeSVG value={address} size={size} />
  </div>
 );
}





