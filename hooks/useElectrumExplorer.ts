'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ElectrumClient } from '@/lib/wallet/electrum';
import { CircuitBreaker } from '@/lib/electrum/circuit';
import {
  callWithIndexingFailover,
  connectWithCapabilities,
} from '@/lib/electrum/connect';
import {
  indexingUnavailableMessage,
  isIndexingUnavailable,
} from '@/lib/electrum/errors';
import { getElectrumServerUrls, ElectrumNetwork } from '@/lib/electrum/servers';

type NetworkType = ElectrumNetwork;

interface UseElectrumExplorerOptions {
  network: NetworkType;
  autoConnect?: boolean;
}

interface UseElectrumExplorerReturn {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  call: (method: string, params?: any[]) => Promise<any>;
  reconnect: () => Promise<void>;
  /** True when tip-derived transaction.get probe succeeded */
  hasTxGet: boolean;
}

const EXPLORER_REQUIRED = ['transport', 'headers', 'tx_get'] as const;

/**
 * Client-side hook for explorer data.
 * Ready only when transport + tip-derived tx_get capability are confirmed.
 */
export function useElectrumExplorer({
  network,
  autoConnect = true,
}: UseElectrumExplorerOptions): UseElectrumExplorerReturn {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTxGet, setHasTxGet] = useState(false);

  const clientRef = useRef<ElectrumClient | null>(null);
  const urlRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReconnectingRef = useRef(false);
  const currentServerIndexRef = useRef(0);
  const circuitRef = useRef(new CircuitBreaker());
  const connectRef = useRef<(tryNext?: boolean) => Promise<void>>(async () => {});

  const connect = useCallback(
    async (tryNextServer = false): Promise<void> => {
      if (isReconnectingRef.current && tryNextServer === false) {
        return;
      }

      const servers = getElectrumServerUrls(network);
      if (servers.length === 0) {
        setError(
          'No ElectrumX servers configured. Please set NEXT_PUBLIC_ELECTRUMX_MAINNET or NEXT_PUBLIC_ELECTRUMX_TESTNET environment variable.'
        );
        setConnected(false);
        setHasTxGet(false);
        setConnecting(false);
        return;
      }

      setConnecting(true);
      setError(null);

      if (clientRef.current) {
        try {
          const prev = clientRef.current;
          if ((prev as any).healthCheckInterval) {
            clearInterval((prev as any).healthCheckInterval);
          }
          prev.disconnect();
        } catch {
          // ignore
        }
        clientRef.current = null;
        urlRef.current = null;
      }

      const startIndex = tryNextServer
        ? (currentServerIndexRef.current + 1) % servers.length
        : currentServerIndexRef.current;

      try {
        const result = await connectWithCapabilities({
          urls: servers,
          startIndex,
          required: EXPLORER_REQUIRED,
          circuit: circuitRef.current,
        });

        clientRef.current = result.client;
        urlRef.current = result.url;
        currentServerIndexRef.current = result.index;
        setHasTxGet(result.capabilities.has('tx_get'));
        setConnected(true);
        setConnecting(false);
        setError(null);

        const client = result.client;
        const healthCheckInterval = setInterval(() => {
          if (!client.connected && !isReconnectingRef.current) {
            clearInterval(healthCheckInterval);
            isReconnectingRef.current = true;
            setConnected(false);
            setHasTxGet(false);
            setConnecting(true);
            reconnectTimeoutRef.current = setTimeout(async () => {
              try {
                await connectRef.current(true);
              } catch {
                setError('All Electrum servers unavailable');
                setConnected(false);
                setHasTxGet(false);
                setConnecting(false);
              } finally {
                isReconnectingRef.current = false;
              }
            }, 2000);
          }
        }, 5000);

        (client as any).healthCheckInterval = healthCheckInterval;
      } catch (err: any) {
        const message = err?.message || 'Failed to connect to any Electrum server';
        setError(
          isIndexingUnavailable(err) ? indexingUnavailableMessage() : message
        );
        setConnected(false);
        setHasTxGet(false);
        setConnecting(false);
        throw err;
      }
    },
    [network]
  );

  connectRef.current = connect;

  const reconnect = useCallback(async () => {
    if (clientRef.current) {
      try {
        const client = clientRef.current;
        if ((client as any).healthCheckInterval) {
          clearInterval((client as any).healthCheckInterval);
        }
        client.disconnect();
      } catch {
        // ignore
      }
      clientRef.current = null;
      urlRef.current = null;
    }
    setConnected(false);
    setHasTxGet(false);
    setError(null);
    await connect(false);
  }, [connect]);

  const call = useCallback(
    async (method: string, params: any[] = []): Promise<any> => {
      if (!clientRef.current || !clientRef.current.connected) {
        if (!isReconnectingRef.current) {
          await connect(false);
        }
        if (!clientRef.current || !clientRef.current.connected) {
          throw new Error('Not connected to Electrum server');
        }
      }

      const client = clientRef.current;
      const url = urlRef.current || client.serverUrl || '';

      return callWithIndexingFailover({
        url,
        circuit: circuitRef.current,
        call: () => client.call(method, params),
        onIndexingFailover: async () => {
          await connect(true);
          if (!clientRef.current?.connected) {
            throw new Error(indexingUnavailableMessage());
          }
          return clientRef.current.call(method, params);
        },
      });
    },
    [connect]
  );

  useEffect(() => {
    if (autoConnect) {
      connect(false).catch(() => {
        // error state already set
      });
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (clientRef.current) {
        try {
          const client = clientRef.current;
          if ((client as any).healthCheckInterval) {
            clearInterval((client as any).healthCheckInterval);
          }
          client.disconnect();
        } catch {
          // ignore
        }
        clientRef.current = null;
        urlRef.current = null;
      }
    };
  }, [autoConnect, connect]);

  useEffect(() => {
    if (autoConnect && clientRef.current) {
      connect(false).catch(() => {
        // error state already set
      });
    }
  }, [network, autoConnect, connect]);

  return {
    connected,
    connecting,
    error,
    call,
    reconnect,
    hasTxGet,
  };
}
