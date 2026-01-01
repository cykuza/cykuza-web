// Client-side Electrum client over WebSocket for wallet use
// NOTE: Requires servers that expose Electrum protocol over secure WebSockets.
// SECURITY: All wallet operations are client-side only, no server logging

export type ElectrumStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

type ResolveReject = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

type SubscriptionHandler = (params: any[]) => void;

export class ElectrumClient {
  private ws?: WebSocket;
  private id = 0;
  private pending = new Map<number, ResolveReject>();
  private subscriptions = new Map<string, SubscriptionHandler>();
  private url: string | null = null;

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(url: string): Promise<void> {
    if (!url.startsWith('wss://')) {
      throw new Error('Use wss:// Electrum endpoints to avoid MITM.');
    }
    this.url = url;
    this.id = 0;
    this.pending.clear();
    this.subscriptions.clear();

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      const handleOpen = () => resolve();
      const handleError = (err: Event) => reject(err);
      this.ws?.addEventListener('open', handleOpen, { once: true });
      this.ws?.addEventListener('error', handleError, { once: true });
      this.ws?.addEventListener('message', this.onMessage);
      this.ws?.addEventListener('close', () => this.reset());
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.reset();
  }

  private reset() {
    this.pending.forEach(({ reject }) => reject(new Error('Disconnected')));
    this.pending.clear();
    this.subscriptions.clear();
  }

  private onMessage = (event: MessageEvent) => {
    try {
      const payload = JSON.parse(event.data as string);
      if (payload.id !== undefined && this.pending.has(payload.id)) {
        const { resolve, reject } = this.pending.get(payload.id)!;
        this.pending.delete(payload.id);
        if (payload.error) {
          reject(new Error(payload.error.message || 'Electrum error'));
        } else {
          resolve(payload.result);
        }
      } else if (payload.method && payload.params) {
        const handler = this.subscriptions.get(payload.method);
        if (handler) handler(payload.params);
      }
    } catch (err) {
      // SECURITY: Only log parse errors, never wallet data
      // eslint-disable-next-line no-console
      console.error('Electrum parse error');
    }
  };

  private send(method: string, params: any[] = []): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Not connected to Electrum server'));
    }
    const id = ++this.id;
    const payload = { id, method, params, jsonrpc: '2.0' };
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Electrum request timed out'));
        }
      }, 12000);
    });
  }

  serverVersion(): Promise<[string, string]> {
    return this.send('server.version', ['cykuza', '1.4']);
  }

  ping(): Promise<null> {
    return this.send('server.ping');
  }

  relayFee(): Promise<number> {
    return this.send('blockchain.relayfee');
  }

  estimateFee(blocks = 6): Promise<number> {
    return this.send('blockchain.estimatefee', [blocks]);
  }

  getBalance(scripthash: string): Promise<{ confirmed: number; unconfirmed: number }> {
    return this.send('blockchain.scripthash.get_balance', [scripthash]);
  }

  getHistory(scripthash: string): Promise<Array<{ tx_hash: string; height: number }>> {
    return this.send('blockchain.scripthash.get_history', [scripthash]);
  }

  listUnspent(scripthash: string): Promise<Array<{ tx_hash: string; tx_pos: number; height: number; value: number }>> {
    return this.send('blockchain.scripthash.listunspent', [scripthash]);
  }

  getTransaction(txid: string): Promise<string> {
    return this.send('blockchain.transaction.get', [txid, true]);
  }

  broadcast(raw: string): Promise<string> {
    return this.send('blockchain.transaction.broadcast', [raw]);
  }

  subscribeScripthash(scripthash: string, handler: SubscriptionHandler) {
    this.subscriptions.set('blockchain.scripthash.subscribe', handler);
    return this.send('blockchain.scripthash.subscribe', [scripthash]);
  }

  /**
   * Public method to call any ElectrumX RPC method
   * Used by explorer components that need generic ElectrumX access
   */
  call(method: string, params: any[] = []): Promise<any> {
    return this.send(method, params);
  }
}
