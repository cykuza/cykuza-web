'use client';

import React, { useState } from 'react';
import { useWallet } from '@/context/WalletContext';

export const ServerConfigView: React.FC = () => {
  const {
    setServer,
    connect,
    status,
    servers,
    server,
    verifyWithSecondServer,
    setVerifyWithSecondServer,
    resetElectrumUsableCount,
  } = useWallet();
  const [serverUrl, setServerUrl] = useState('');
  const [message, setMessage] = useState<string>();

  const configuredCount =
    servers.length > 0 ? servers.length : server ? 1 : 0;

  const handleConnect = async () => {
    setMessage(undefined);
    if (!serverUrl.trim()) {
      setMessage('Please enter a server URL');
      return;
    }
    try {
      setServer(serverUrl.trim());
      resetElectrumUsableCount();
      await connect();
      setMessage('Connected. Dual verify runs on Refresh/Send when two endpoints are configured.');
      setServerUrl('');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleRetryTrust = async () => {
    setMessage(undefined);
    try {
      resetElectrumUsableCount();
      await connect();
      setMessage('Reconnected.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  return (
    <div className="flex size-full flex-col gap-6 px-6 py-5 max-standard:min-h-screen">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-neutral-200">Add / connect endpoint</label>
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

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-neutral-600 bg-neutral-700"
              checked={verifyWithSecondServer}
              onChange={(e) => setVerifyWithSecondServer(e.target.checked)}
            />
            <span className="text-sm text-neutral-200">
              Verify with second server
              <span className="block text-xs text-neutral-400 mt-1">
                Default on. Required when two or more endpoints are configured — compares balance/UTXO fingerprints and broadcast txids.
              </span>
            </span>
          </label>

          <button
            onClick={handleConnect}
            className="rounded-xl border border-white/7 bg-neutral-800 text-white px-4 py-2 hover:border-white/14 transition-all"
          >
            {status === 'connecting' ? 'Checking…' : 'Connect & verify'}
          </button>
          {configuredCount >= 2 && (
            <button
              type="button"
              onClick={handleRetryTrust}
              className="rounded-xl border border-white/7 bg-neutral-900 text-neutral-200 px-4 py-2 hover:border-white/14 transition-all text-sm"
            >
              Retry dual-server reachability
            </button>
          )}
          {message && <p className="text-sm text-neutral-200">{message}</p>}
        </div>
      </div>
    </div>
  );
};
