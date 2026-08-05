/**
 * Server-side ElectrumX client for API routes.
 * Multi-URL failover with shared circuit breaker and tip-aware indexing errors.
 */

import { getSharedCircuitBreaker } from './electrum/circuit';
import {
  electrumEnvVarName,
  getElectrumServerUrls,
  type ElectrumNetwork,
} from './electrum/servers';
import {
  indexingUnavailableMessage,
  isIndexingUnavailable,
  errorMessage,
} from './electrum/errors';
import { probeTxGetCapability } from './electrum/probe';

type NetworkType = ElectrumNetwork;

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

const TX_GET_METHODS = new Set([
  'blockchain.transaction.get',
  'blockchain.transaction.get_merkle',
]);

class ElectrumServerClient {
  private requestId = 0;
  private wsConnections = new Map<string, WebSocket>();
  private pendingRequests = new Map<number, PendingRequest>();
  private messageHandlers = new Map<string, (event: MessageEvent) => void>();
  private probedTxGet = new Set<string>();

  private getServerUrls(network: NetworkType): string[] {
    return getElectrumServerUrls(network);
  }

  private isServerless(): boolean {
    return !!(
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AZURE_FUNCTIONS_ENVIRONMENT
    );
  }

  /**
   * Call ElectrumX with failover across configured URLs.
   * Indexing failures open the circuit and advance to the next backend.
   */
  async call(network: NetworkType, method: string, params: any[] = []): Promise<any> {
    const urls = this.getServerUrls(network);

    if (urls.length === 0) {
      const envVarName = electrumEnvVarName(network);
      throw new Error(
        `ElectrumX server URL is not configured. Please set ${envVarName} environment variable. ` +
          `Example: wss://your-server:50004`
      );
    }

    const circuit = getSharedCircuitBreaker();
    let lastError: Error | null = null;
    let attempted = 0;
    const needsTxGet = TX_GET_METHODS.has(method);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (!circuit.allow(url)) {
        continue;
      }
      attempted++;

      if (!(url.startsWith('wss://') || url.startsWith('ws://'))) {
        lastError = new Error(`Unsupported URL scheme: ${url}`);
        circuit.recordFailure(url);
        continue;
      }

      try {
        if (needsTxGet && !this.probedTxGet.has(url)) {
          await this.ensureTxGetCapability(url);
          this.probedTxGet.add(url);
        }

        const id = ++this.requestId;
        const request: ElectrumRequest = { id, method, params };
        const result = this.isServerless()
          ? await this.callWebSocketOneTime(url, request)
          : await this.callWebSocket(url, request);

        circuit.recordSuccess(url);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(errorMessage(err));
        this.probedTxGet.delete(url);

        if (isIndexingUnavailable(err)) {
          circuit.open(url);
          continue;
        }

        circuit.recordFailure(url);
      }
    }

    if (attempted === 0) {
      throw new Error(
        'All Electrum backends temporarily unavailable (circuit open). Retry shortly.'
      );
    }

    if (lastError && isIndexingUnavailable(lastError)) {
      throw new Error(indexingUnavailableMessage());
    }

    throw lastError || new Error('Failed to call ElectrumX on all configured servers');
  }

  private async ensureTxGetCapability(url: string): Promise<void> {
    const call = async (method: string, params: unknown[] = []) => {
      const id = ++this.requestId;
      const request: ElectrumRequest = {
        id,
        method,
        params: params as any[],
      };
      return this.isServerless()
        ? this.callWebSocketOneTime(url, request)
        : this.callWebSocket(url, request);
    };

    await probeTxGetCapability(call);
  }

  private setupMessageHandler(url: string, ws: WebSocket): void {
    const existingHandler = this.messageHandlers.get(url);
    if (existingHandler) {
      try {
        ws.removeEventListener('message', existingHandler);
      } catch {
        // ignore
      }
    }

    const messageHandler = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? event.data : event.data.toString();
        const parsed = JSON.parse(data);

        if (parsed.id === undefined || parsed.id === null) {
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
        if (process.env.NODE_ENV === 'development') {
          console.error(
            'Failed to parse WebSocket response:',
            error,
            'Data:',
            typeof event.data === 'string' ? event.data.substring(0, 200) : 'non-string'
          );
        }
      }
    };

    this.messageHandlers.set(url, messageHandler);
    ws.addEventListener('message', messageHandler);

    if (ws && typeof (ws as any).setMaxListeners === 'function') {
      (ws as any).setMaxListeners(20);
    }
  }

  private async callWebSocket(url: string, request: ElectrumRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pendingRequests.get(request.id);
        if (pending) {
          this.pendingRequests.delete(request.id);
          const ws = this.wsConnections.get(url);
          if (ws && ws.readyState !== WebSocket.OPEN) {
            this.wsConnections.delete(url);
            const handler = this.messageHandlers.get(url);
            if (handler && ws) {
              ws.removeEventListener('message', handler);
            }
            this.messageHandlers.delete(url);
          }
          pending.reject(new Error('Request timeout: No response received'));
        }
      }, 15000);

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

      let ws = this.wsConnections.get(url);

      const connect = () => {
        try {
          if (!url || url.trim() === '') {
            const pending = this.pendingRequests.get(request.id);
            if (pending) {
              this.pendingRequests.delete(request.id);
              pending.reject(new Error('Invalid WebSocket URL: URL is empty'));
            }
            return;
          }

          try {
            new URL(url);
          } catch (urlError) {
            const pending = this.pendingRequests.get(request.id);
            if (pending) {
              this.pendingRequests.delete(request.id);
              pending.reject(
                new Error(
                  `Invalid WebSocket URL format: ${url}. Error: ${urlError instanceof Error ? urlError.message : 'Unknown error'}`
                )
              );
            }
            return;
          }

          if (typeof WebSocket === 'undefined') {
            const pending = this.pendingRequests.get(request.id);
            if (pending) {
              this.pendingRequests.delete(request.id);
              pending.reject(
                new Error(
                  'WebSocket is not available. Node.js 18+ is required for WebSocket support.'
                )
              );
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

          ws.addEventListener(
            'open',
            () => {
              clearTimeout(connectionTimeout);
              this.wsConnections.set(url, ws!);
              this.setupMessageHandler(url, ws!);
              try {
                ws!.send(JSON.stringify(request));
              } catch (error) {
                const pending = this.pendingRequests.get(request.id);
                if (pending) {
                  this.pendingRequests.delete(request.id);
                  pending.reject(
                    new Error(
                      `Failed to send request: ${error instanceof Error ? error.message : 'Unknown error'}`
                    )
                  );
                }
              }
            },
            { once: true }
          );

          ws.addEventListener(
            'error',
            (error: Event) => {
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
            },
            { once: true }
          );

          ws.addEventListener(
            'close',
            () => {
              this.wsConnections.delete(url);
              const handler = this.messageHandlers.get(url);
              if (handler && ws) {
                ws.removeEventListener('message', handler);
              }
              this.messageHandlers.delete(url);
              const pending = Array.from(this.pendingRequests.entries());
              pending.forEach(([id, handlers]) => {
                this.pendingRequests.delete(id);
                handlers.reject(new Error('WebSocket connection closed'));
              });
            },
            { once: true }
          );
        } catch (error) {
          const pending = this.pendingRequests.get(request.id);
          if (pending) {
            this.pendingRequests.delete(request.id);
            pending.reject(
              new Error(
                `Failed to create WebSocket connection: ${error instanceof Error ? error.message : 'Unknown error'}`
              )
            );
          }
        }
      };

      if (ws && ws.readyState === WebSocket.OPEN) {
        this.setupMessageHandler(url, ws);
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(request));
          } catch {
            this.wsConnections.delete(url);
            const handler = this.messageHandlers.get(url);
            if (handler) {
              ws.removeEventListener('message', handler);
            }
            this.messageHandlers.delete(url);
            connect();
          }
        } else {
          this.wsConnections.delete(url);
          connect();
        }
      } else if (ws && ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener(
          'open',
          () => {
            this.setupMessageHandler(url, ws!);
            try {
              ws!.send(JSON.stringify(request));
            } catch (error) {
              const pending = this.pendingRequests.get(request.id);
              if (pending) {
                this.pendingRequests.delete(request.id);
                pending.reject(
                  new Error(
                    `Failed to send request: ${error instanceof Error ? error.message : 'Unknown error'}`
                  )
                );
              }
            }
          },
          { once: true }
        );
      } else {
        if (ws) {
          this.wsConnections.delete(url);
        }
        connect();
      }
    });
  }

  private async callWebSocketOneTime(url: string, request: ElectrumRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout: No response received'));
      }, 10000);

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
          } catch {
            // ignore
          }
        }
      };

      try {
        ws = new WebSocket(url);
      } catch (error) {
        cleanup();
        reject(
          new Error(
            `Failed to create WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        );
        return;
      }

      messageHandler = (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string' ? event.data : event.data.toString();
          const parsed = JSON.parse(data);

          if (parsed.id === request.id) {
            cleanup();
            if (parsed.error) {
              reject(new Error(parsed.error.message || 'Electrum error'));
            } else {
              resolve(parsed.result);
            }
          }
        } catch {
          // ignore parse errors for non-matching messages
        }
      };

      ws.addEventListener('message', messageHandler);
      ws.addEventListener('error', (err) => {
        cleanup();
        reject(
          new Error(
            `WebSocket error: ${err instanceof Error ? err.message : 'Unknown error'}`
          )
        );
      });
      ws.addEventListener('close', () => {
        cleanup();
      });

      ws.addEventListener(
        'open',
        () => {
          try {
            ws!.send(JSON.stringify(request));
          } catch (error) {
            cleanup();
            reject(
              new Error(
                `Failed to send request: ${error instanceof Error ? error.message : 'Unknown error'}`
              )
            );
          }
        },
        { once: true }
      );
    });
  }
}

let serverClientInstance: ElectrumServerClient | null = null;

export function getElectrumServerClient(): ElectrumServerClient {
  if (!serverClientInstance) {
    serverClientInstance = new ElectrumServerClient();
  }
  return serverClientInstance;
}

export async function callElectrumX(
  network: NetworkType,
  method: string,
  params: any[] = []
): Promise<any> {
  const client = getElectrumServerClient();
  return client.call(network, method, params);
}
