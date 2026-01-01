'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ElectrumClient } from '@/lib/wallet/electrum';

type NetworkType = 'mainnet' | 'testnet';

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
}

/**
 * Client-side hook for connecting to ElectrumX servers for explorer data
 * Uses WebSocket (WSS) connections that work perfectly on Vercel
 */
export function useElectrumExplorer({
  network,
  autoConnect = true,
}: UseElectrumExplorerOptions): UseElectrumExplorerReturn {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<ElectrumClient | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReconnectingRef = useRef(false);
  const currentServerIndexRef = useRef(0);

  // Get server list from environment variables
  const getServers = useCallback((): string[] => {
    const envVar = network === 'mainnet'
      ? process.env.NEXT_PUBLIC_ELECTRUMX_MAINNET
      : process.env.NEXT_PUBLIC_ELECTRUMX_TESTNET;

    if (!envVar || envVar.trim() === '') {
      return [];
    }

    // Support comma-separated list or single server
    return envVar.split(',').map(s => s.trim()).filter(Boolean);
  }, [network]);

  // Connect to ElectrumX server
  const connect = useCallback(async (tryNextServer = false): Promise<void> => {
    if (isReconnectingRef.current) {
      return; // Already reconnecting
    }

    const servers = getServers();
    if (servers.length === 0) {
      setError('No ElectrumX servers configured. Please set NEXT_PUBLIC_ELECTRUMX_MAINNET or NEXT_PUBLIC_ELECTRUMX_TESTNET environment variable.');
      setConnected(false);
      setConnecting(false);
      return;
    }

    setConnecting(true);
    setError(null);

    const startIndex = tryNextServer
      ? (currentServerIndexRef.current + 1) % servers.length
      : currentServerIndexRef.current;

    // Try each server in order
    let lastError: Error | null = null;
    for (let i = 0; i < servers.length; i++) {
      const serverIndex = (startIndex + i) % servers.length;
      const serverUrl = servers[serverIndex];

      // Disconnect previous client if exists
      if (clientRef.current) {
        try {
          clientRef.current.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
        clientRef.current = null;
      }

      const client = new ElectrumClient();
      try {
        // Set a connection timeout
        const connectPromise = client.connect(serverUrl);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 10000)
        );

        await Promise.race([connectPromise, timeoutPromise]);

        // Verify server version
        const version = await client.serverVersion();
        const protocol = parseFloat(version[1]);
        if (Number.isNaN(protocol) || protocol < 1.4) {
          throw new Error('Electrum server protocol too old. Require >=1.4');
        }

        // Successfully connected
        clientRef.current = client;
        currentServerIndexRef.current = serverIndex;
        setConnected(true);
        setConnecting(false);
        setError(null);

        // Set up reconnection monitoring
        const healthCheckInterval = setInterval(() => {
          if (!client.connected && !isReconnectingRef.current) {
            clearInterval(healthCheckInterval);
            isReconnectingRef.current = true;
            setConnected(false);
            setConnecting(true);
            reconnectTimeoutRef.current = setTimeout(async () => {
              try {
                await connect(true); // Try next server
              } catch (err) {
                setError('All Electrum servers unavailable');
                setConnected(false);
                setConnecting(false);
              } finally {
                isReconnectingRef.current = false;
              }
            }, 2000);
          }
        }, 5000);

        // Store interval ID for cleanup
        (client as any).healthCheckInterval = healthCheckInterval;

        return; // Successfully connected
      } catch (err: any) {
        lastError = err;
        try {
          client.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
        // Continue to next server
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Failed to connect to ${serverUrl}:`, err.message);
        }
      }
    }

    // All servers failed
    setError(lastError?.message || 'Failed to connect to any Electrum server');
    setConnected(false);
    setConnecting(false);
  }, [getServers]);

  // Reconnect function
  const reconnect = useCallback(async () => {
    if (clientRef.current) {
      try {
        clientRef.current.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      clientRef.current = null;
    }
    setConnected(false);
    setError(null);
    await connect(false);
  }, [connect]);

  // Call ElectrumX method
  const call = useCallback(async (method: string, params: any[] = []): Promise<any> => {
    if (!clientRef.current || !clientRef.current.connected) {
      // Try to reconnect if not connected
      if (!isReconnectingRef.current) {
        await connect(false);
      }
      if (!clientRef.current || !clientRef.current.connected) {
        throw new Error('Not connected to Electrum server');
      }
    }

    // Use the public call method
    return clientRef.current.call(method, params);
  }, [connect]);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connect(false);
    }

    // Cleanup on unmount
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
        } catch (e) {
          // Ignore disconnect errors
        }
        clientRef.current = null;
      }
    };
  }, [autoConnect, connect]);

  // Reconnect when network changes
  useEffect(() => {
    if (autoConnect && clientRef.current) {
      connect(false);
    }
  }, [network, autoConnect, connect]);

  return {
    connected,
    connecting,
    error,
    call,
    reconnect,
  };
}

