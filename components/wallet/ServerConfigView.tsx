'use client';

import React, { useState } from 'react';
import { useWallet } from '@/context/WalletContext';

interface ServerConfigViewProps {
  onBack: () => void;
  onClose: () => void;
}

export const ServerConfigView: React.FC<ServerConfigViewProps> = ({ onBack, onClose }) => {
  const { setServer, connect, status } = useWallet();
  const [serverUrl, setServerUrl] = useState('');
  const [message, setMessage] = useState<string>();

  const handleConnect = async () => {
    setMessage(undefined);
    if (!serverUrl.trim()) {
      setMessage('Please enter a server URL');
      return;
    }
    try {
      setServer(serverUrl.trim());
      await connect();
      setMessage('Connected and verified Electrum server.');
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <div className="flex size-full flex-col gap-6 px-6 py-5 max-standard:min-h-screen">
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-neutral-200">Electrum server</label>
            <input
              className="p-2 rounded-xl border border-white/7 bg-neutral-800 text-white focus:outline-none focus:border-white/14 font-mono"
              placeholder="wss://yourserver:50004"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-neutral-200">
              Use TLS-secured endpoints you trust. Avoid unsecured ws:// to reduce MITM risk.
            </p>
          </div>
          <button
            onClick={handleConnect}
            className="rounded-xl border border-white/7 bg-neutral-800 text-white px-4 py-2 hover:border-white/14 transition-all"
          >
            {status === 'connecting' ? 'Checking…' : 'Connect & verify'}
          </button>
          {message && <p className="text-sm text-neutral-200">{message}</p>}
        </div>
      </div>
    </div>
  );
};

