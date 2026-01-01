/**
 * Server-side ElectrumX client for API routes
 * Uses WebSocket (WSS/WS) connections to ElectrumX servers
 * Supports both connection reuse (non-serverless) and one-time connections (serverless)
 */

type NetworkType = 'mainnet' | 'testnet';

interface ElectrumRequest {
  id: number;
  method: string;
  params: any[];
}

interface ElectrumResponse {
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class ElectrumServerClient {
  private requestId = 0;
  private wsConnections = new Map<string, WebSocket>();
  private pendingRequests = new Map<number, PendingRequest>();
  private messageHandlers = new Map<string, (event: MessageEvent) => void>();

  private getServerUrl(network: NetworkType): string {
    const envVar = network === 'mainnet' 
      ? process.env.NEXT_PUBLIC_ELECTRUMX_MAINNET 
      : process.env.NEXT_PUBLIC_ELECTRUMX_TESTNET;
    
    if (!envVar || envVar.trim() === '') {
      return '';
    }
    
    // Handle comma-separated URLs (take the first one)
    const urls = envVar.split(',').map(s => s.trim()).filter(Boolean);
    return urls[0] || '';
  }

  /**
   * Check if we're in a serverless environment (Vercel, etc.)
   */
  private isServerless(): boolean {
    return !!(
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AZURE_FUNCTIONS_ENVIRONMENT
    );
  }

  /**
   * Call ElectrumX method via WebSocket (WSS/WS)
   * ElectrumX only supports WSS (WebSocket Secure) or SSL/TCP connections
   */
  async call(network: NetworkType, method: string, params: any[] = []): Promise<any> {
    const url = this.getServerUrl(network);
    
    // Validate URL is not empty
    if (!url || url.trim() === '') {
      const envVarName = network === 'mainnet' 
        ? 'NEXT_PUBLIC_ELECTRUMX_MAINNET' 
        : 'NEXT_PUBLIC_ELECTRUMX_TESTNET';
      throw new Error(
        `ElectrumX server URL is not configured. Please set ${envVarName} environment variable. ` +
        `Example: wss://your-server:50004`
      );
    }
    
    const id = ++this.requestId;

    const request: ElectrumRequest = {
      id,
      method,
      params,
    };

    // For WebSocket URLs - create connection for each request
    // In serverless, we create a new connection per request (no reuse)
    if (url.startsWith('wss://') || url.startsWith('ws://')) {
      if (this.isServerless()) {
        // In serverless, create a new connection for each request (no connection reuse)
        return this.callWebSocketOneTime(url, request);
      }

      // Use WebSocket with connection reuse for non-serverless
      return this.callWebSocket(url, request);
    }

    throw new Error(`Unsupported URL scheme: ${url}`);
  }

  /**
   * Setup a single message handler for a WebSocket connection
   * This prevents listener leaks by using one handler per connection
   */
  private setupMessageHandler(url: string, ws: WebSocket): void {
    // Always verify the handler is attached to the current WebSocket instance
    // The connection might have been recreated, so we need to reattach
    const existingHandler = this.messageHandlers.get(url);
    if (existingHandler) {
      // Remove old handler if it exists (in case connection was recreated)
      try {
        ws.removeEventListener('message', existingHandler);
      } catch (e) {
        // Ignore errors - handler might not be attached
      }
    }

    const messageHandler = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? event.data : event.data.toString();
        const parsed = JSON.parse(data);

        // ElectrumX can send notifications (no id) or responses (with id)
        // Only process responses that have an id field
        if (parsed.id === undefined || parsed.id === null) {
          // This is likely a notification (like blockchain.headers.subscribe updates)
          // Ignore it - it's not a response to our request
          return;
        }

        const response: ElectrumResponse = parsed;
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch (error) {
        // Log parse errors but don't reject all requests - might be a malformed message
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to parse WebSocket response:', error, 'Data:', typeof event.data === 'string' ? event.data.substring(0, 200) : 'non-string');
        }
      }
    };

    this.messageHandlers.set(url, messageHandler);
    ws.addEventListener('message', messageHandler);

    // Increase max listeners to prevent warnings (we manage listeners properly)
    // Type guard for Node.js EventEmitter methods
    if (ws && typeof (ws as any).setMaxListeners === 'function') {
      (ws as any).setMaxListeners(20);
    }
  }

  /**
   * Call ElectrumX via WebSocket with connection reuse (for non-serverless environments)
   * Uses native WebSocket API (Node.js 18+) similar to browser WebSocket
   * Uses a single message handler per connection to prevent listener leaks
   */
  private async callWebSocket(url: string, request: ElectrumRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      // Create timeout for this request
      const timeout = setTimeout(() => {
        const pending = this.pendingRequests.get(request.id);
        if (pending) {
          this.pendingRequests.delete(request.id);
          // Check if connection is still alive
          const ws = this.wsConnections.get(url);
          if (ws && ws.readyState !== WebSocket.OPEN) {
            // Connection is dead, clean it up
            this.wsConnections.delete(url);
            const handler = this.messageHandlers.get(url);
            if (handler && ws) {
              ws.removeEventListener('message', handler);
            }
            this.messageHandlers.delete(url);
          }
          pending.reject(new Error('Request timeout: No response received'));
        }
      }, 15000); // 15 second timeout

      // Store the promise handlers
      this.pendingRequests.set(request.id, {
        resolve: (value: any) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
      });

      // Reuse existing connection if available
      let ws = this.wsConnections.get(url);

      const connect = () => {
        try {
          // Validate URL before creating WebSocket
          if (!url || url.trim() === '') {
            const pending = this.pendingRequests.get(request.id);
            if (pending) {
              this.pendingRequests.delete(request.id);
              pending.reject(new Error('Invalid WebSocket URL: URL is empty'));
            }
            return;
          }
          
          // Validate URL format
          try {
            new URL(url);
          } catch (urlError) {
            const pending = this.pendingRequests.get(request.id);
            if (pending) {
              this.pendingRequests.delete(request.id);
              pending.reject(new Error(`Invalid WebSocket URL format: ${url}. Error: ${urlError instanceof Error ? urlError.message : 'Unknown error'}`));
            }
            return;
          }
          
          // Use native WebSocket (Node.js 18+ has it globally)
          if (typeof WebSocket === 'undefined') {
            const pending = this.pendingRequests.get(request.id);
            if (pending) {
              this.pendingRequests.delete(request.id);
              pending.reject(new Error('WebSocket is not available. Node.js 18+ is required for WebSocket support.'));
            }
            return;
          }

          ws = new WebSocket(url);

          const connectionTimeout = setTimeout(() => {
            if (ws && ws.readyState !== WebSocket.OPEN) {
              ws.close();
              this.wsConnections.delete(url);
              const pending = this.pendingRequests.get(request.id);
              if (pending) {
                this.pendingRequests.delete(request.id);
                pending.reject(new Error('WebSocket connection timeout'));
              }
            }
          }, 10000);

          ws.addEventListener('open', () => {
            clearTimeout(connectionTimeout);
            this.wsConnections.set(url, ws!);
            this.setupMessageHandler(url, ws!);
            try {
              ws!.send(JSON.stringify(request));
            } catch (error) {
              const pending = this.pendingRequests.get(request.id);
              if (pending) {
                this.pendingRequests.delete(request.id);
                pending.reject(new Error(`Failed to send request: ${error instanceof Error ? error.message : 'Unknown error'}`));
              }
            }
          }, { once: true });

          ws.addEventListener('error', (error: Event) => {
            clearTimeout(connectionTimeout);
            this.wsConnections.delete(url);
            const handler = this.messageHandlers.get(url);
            if (handler && ws) {
              ws.removeEventListener('message', handler);
            }
            this.messageHandlers.delete(url);
            const pending = this.pendingRequests.get(request.id);
            if (pending) {
              this.pendingRequests.delete(request.id);
              pending.reject(new Error(`WebSocket error: ${error.type}`));
            }
          }, { once: true });

          ws.addEventListener('close', () => {
            this.wsConnections.delete(url);
            const handler = this.messageHandlers.get(url);
            if (handler && ws) {
              ws.removeEventListener('message', handler);
            }
            this.messageHandlers.delete(url);
            // Reject all pending requests for this connection
            const pending = Array.from(this.pendingRequests.entries());
            pending.forEach(([id, handlers]) => {
              this.pendingRequests.delete(id);
              handlers.reject(new Error('WebSocket connection closed'));
            });
          }, { once: true });
        } catch (error) {
          const pending = this.pendingRequests.get(request.id);
          if (pending) {
            this.pendingRequests.delete(request.id);
            pending.reject(new Error(`Failed to create WebSocket connection: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        }
      };

      if (ws && ws.readyState === WebSocket.OPEN) {
        // Reuse existing connection - always ensure message handler is set up
        // (handler might not be attached if connection was recreated)
        this.setupMessageHandler(url, ws);
        // Verify connection is still valid before sending
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(request));
          } catch (error) {
            // Send failed, connection might be dead
            this.wsConnections.delete(url);
            const handler = this.messageHandlers.get(url);
            if (handler) {
              ws.removeEventListener('message', handler);
            }
            this.messageHandlers.delete(url);
            connect();
          }
        } else {
          // Connection closed, create new one
          this.wsConnections.delete(url);
          connect();
        }
      } else if (ws && ws.readyState === WebSocket.CONNECTING) {
        // Connection is still opening, wait for it
        ws.addEventListener('open', () => {
          this.setupMessageHandler(url, ws!);
          try {
            ws!.send(JSON.stringify(request));
          } catch (error) {
            const pending = this.pendingRequests.get(request.id);
            if (pending) {
              this.pendingRequests.delete(request.id);
              pending.reject(new Error(`Failed to send request: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
          }
        }, { once: true });
      } else {
        // No connection or connection closed, create new one
        if (ws) {
          this.wsConnections.delete(url);
        }
        connect();
      }
    });
  }

  /**
   * Call ElectrumX via WebSocket with one-time connection (for serverless)
   * Creates a new connection for each request and closes it after response
   */
  private async callWebSocketOneTime(url: string, request: ElectrumRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout: No response received'));
      }, 10000); // 10 second timeout for serverless

      let ws: WebSocket | null = null;
      let messageHandler: ((event: MessageEvent) => void) | null = null;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (messageHandler && ws) {
          ws.removeEventListener('message', messageHandler);
        }
        if (ws) {
          try {
            ws.close();
          } catch (e) {
            // Ignore close errors
          }
        }
      };

      try {
        ws = new WebSocket(url);
      } catch (error) {
        cleanup();
        reject(new Error(`Failed to create WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`));
        return;
      }

      messageHandler = (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string' ? event.data : event.data.toString();
          const parsed = JSON.parse(data);

          // Only process responses that match our request ID
          if (parsed.id === request.id) {
            cleanup();
            if (parsed.error) {
              reject(new Error(parsed.error.message || 'Electrum error'));
            } else {
              resolve(parsed.result);
            }
          }
        } catch (error) {
          // Ignore parse errors for non-matching messages
        }
      };

      ws.addEventListener('message', messageHandler);
      ws.addEventListener('error', (err) => {
        cleanup();
        reject(new Error(`WebSocket error: ${err instanceof Error ? err.message : 'Unknown error'}`));
      });
      ws.addEventListener('close', () => {
        cleanup();
      });

      ws.addEventListener('open', () => {
        try {
          ws!.send(JSON.stringify(request));
        } catch (error) {
          cleanup();
          reject(new Error(`Failed to send request: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }, { once: true });
    });
  }
}

// Singleton instance
let serverClientInstance: ElectrumServerClient | null = null;

export function getElectrumServerClient(): ElectrumServerClient {
  if (!serverClientInstance) {
    serverClientInstance = new ElectrumServerClient();
  }
  return serverClientInstance;
}

/**
 * Helper function for API routes
 */
export async function callElectrumX(
  network: NetworkType,
  method: string,
  params: any[] = []
): Promise<any> {
  const client = getElectrumServerClient();
  return client.call(network, method, params);
}
