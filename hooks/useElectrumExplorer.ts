'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ElectrumSession } from '@/lib/electrum/session';
import { ElectrumError, toElectrumError } from '@/lib/electrum/errors';
import { getElectrumServerUrls } from '@/lib/electrum/servers';
import { EXPLORER_PROFILE, type ElectrumNetwork } from '@/lib/electrum/types';

interface UseElectrumExplorerOptions {
  network: ElectrumNetwork;
  autoConnect?: boolean;
}

interface UseElectrumExplorerReturn {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  call: (method: string, params?: any[]) => Promise<any>;
  reconnect: () => Promise<void>;
}

/**
 * Explorer Electrum access — ready only when tip-derived tx_get is verified.
 */
export function useElectrumExplorer({
  network,
  autoConnect = true,
}: UseElectrumExplorerOptions): UseElectrumExplorerReturn {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<ElectrumSession | null>(null);
  const reconnectingRef = useRef(false);

  const disposeSession = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, []);

  const connect = useCallback(
    async (rotate = false) => {
      const urls = getElectrumServerUrls(network);
      if (urls.length === 0) {
        disposeSession();
        setConnected(false);
        setConnecting(false);
        setError(
          'No ElectrumX servers configured. Set NEXT_PUBLIC_ELECTRUMX_MAINNET or NEXT_PUBLIC_ELECTRUMX_TESTNET.'
        );
        return;
      }

      setConnecting(true);
      setError(null);

      disposeSession();

      const session = new ElectrumSession({
        urls,
        profile: EXPLORER_PROFILE,
        onConnectionLost: () => {
          if (reconnectingRef.current) return;
          reconnectingRef.current = true;
          setConnected(false);
          setConnecting(true);
          sessionRef.current
            ?.connect(true)
            .then(() => {
              setConnected(true);
              setConnecting(false);
              setError(null);
            })
            .catch((err) => {
              const e = toElectrumError(err);
              setError(e.message);
              setConnected(false);
              setConnecting(false);
            })
            .finally(() => {
              reconnectingRef.current = false;
            });
        },
      });

      sessionRef.current = session;

      try {
        await session.connect(rotate);
        setConnected(true);
        setConnecting(false);
        setError(null);
      } catch (err) {
        const e = toElectrumError(err);
        disposeSession();
        setConnected(false);
        setConnecting(false);
        setError(e.message);
        throw e;
      }
    },
    [network, disposeSession]
  );

  const reconnect = useCallback(async () => {
    setError(null);
    await connect(false);
  }, [connect]);

  const call = useCallback(
    async (method: string, params: any[] = []) => {
      if (!sessionRef.current?.connected) {
        await connect(false);
      }
      if (!sessionRef.current) {
        throw ElectrumError.transport('Not connected to Electrum server');
      }
      return sessionRef.current.call(method, params);
    },
    [connect]
  );

  useEffect(() => {
    if (!autoConnect) return;

    connect(false).catch(() => {
      // error state already set
    });

    return () => {
      disposeSession();
    };
  }, [autoConnect, connect, disposeSession]);

  return {
    connected,
    connecting,
    error,
    call,
    reconnect,
  };
}
