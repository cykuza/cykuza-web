import {
  dualServerPairs,
  dualVerifyBroadcast,
  dualVerifyRefresh,
  ElectrumVerifyError,
  type DualClient,
} from './dualVerify';

function mockClient(opts: {
  urlOk?: (url: string) => boolean;
  balance?: { confirmed: number; unconfirmed: number };
  balanceByUrl?: Record<string, { confirmed: number; unconfirmed: number }>;
  utxos?: Array<{ tx_hash: string; tx_pos: number; value: number }>;
  utxosByUrl?: Record<
    string,
    Array<{ tx_hash: string; tx_pos: number; value: number }>
  >;
  txid?: string;
  txidByUrl?: Record<string, string>;
  failBroadcast?: boolean;
}): () => DualClient {
  return () => {
    let connectedUrl = '';
    return {
      connect: async (url: string) => {
        if (opts.urlOk && !opts.urlOk(url)) {
          throw new Error(`connect failed: ${url}`);
        }
        connectedUrl = url;
      },
      disconnect: () => {
        connectedUrl = '';
      },
      serverVersion: async () => ['mock', '1.4'],
      getBalance: async () => {
        if (opts.balanceByUrl?.[connectedUrl]) {
          return opts.balanceByUrl[connectedUrl]!;
        }
        return opts.balance ?? { confirmed: 100, unconfirmed: 0 };
      },
      listUnspent: async () => {
        if (opts.utxosByUrl?.[connectedUrl]) {
          return opts.utxosByUrl[connectedUrl]!;
        }
        return opts.utxos ?? [{ tx_hash: 'aa', tx_pos: 0, value: 100 }];
      },
      broadcast: async () => {
        if (opts.failBroadcast) throw new Error('broadcast failed');
        if (opts.txidByUrl?.[connectedUrl]) {
          return opts.txidByUrl[connectedUrl]!;
        }
        return opts.txid ?? 'txid-agree';
      },
    };
  };
}

describe('dualServerPairs', () => {
  it('builds consecutive pairs plus wrap for 3+', () => {
    expect(dualServerPairs(['a'])).toEqual([]);
    expect(dualServerPairs(['a', 'b'])).toEqual([['a', 'b']]);
    expect(dualServerPairs(['a', 'b', 'c'])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
  });
});

describe('dualVerifyRefresh', () => {
  it('agrees when fingerprints match', async () => {
    const result = await dualVerifyRefresh(
      ['wss://a', 'wss://b'],
      'sh',
      { verifyEnabled: true, createClient: mockClient({}) }
    );
    expect(result.snapshot.balance.confirmed).toBe(100);
    expect(result.primaryUrl).toBe('wss://a');
  });

  it('fails closed on SERVERS_DISAGREE when balances differ', async () => {
    await expect(
      dualVerifyRefresh(['wss://a', 'wss://b'], 'sh', {
        verifyEnabled: true,
        createClient: mockClient({
          balanceByUrl: {
            'wss://a': { confirmed: 100, unconfirmed: 0 },
            'wss://b': { confirmed: 99, unconfirmed: 0 },
          },
        }),
      })
    ).rejects.toMatchObject({ code: 'SERVERS_DISAGREE' });
  });

  it('fails closed on VERIFY_FAILED when secondary cannot connect', async () => {
    await expect(
      dualVerifyRefresh(['wss://a', 'wss://b'], 'sh', {
        verifyEnabled: true,
        createClient: mockClient({
          urlOk: (url) => url === 'wss://a',
        }),
      })
    ).rejects.toBeInstanceOf(ElectrumVerifyError);

    try {
      await dualVerifyRefresh(['wss://a', 'wss://b'], 'sh', {
        verifyEnabled: true,
        createClient: mockClient({
          urlOk: (url) => url === 'wss://a',
        }),
      });
    } catch (err) {
      expect(err).toMatchObject({ code: 'VERIFY_FAILED' });
    }
  });

  it('single-path when verify disabled', async () => {
    const result = await dualVerifyRefresh(['wss://a', 'wss://b'], 'sh', {
      verifyEnabled: false,
      createClient: mockClient({
        balance: { confirmed: 42, unconfirmed: 1 },
      }),
    });
    expect(result.snapshot.balance.confirmed).toBe(42);
    expect(result.primaryUrl).toBe('wss://a');
  });
});

describe('dualVerifyBroadcast', () => {
  it('agrees on matching txids', async () => {
    const result = await dualVerifyBroadcast(['wss://a', 'wss://b'], 'deadbeef', {
      verifyEnabled: true,
      createClient: mockClient({ txid: 'same-txid' }),
    });
    expect(result.txid).toBe('same-txid');
  });

  it('fails closed when txids disagree', async () => {
    await expect(
      dualVerifyBroadcast(['wss://a', 'wss://b'], 'deadbeef', {
        verifyEnabled: true,
        createClient: mockClient({
          txidByUrl: {
            'wss://a': 'txid-a',
            'wss://b': 'txid-b',
          },
        }),
      })
    ).rejects.toMatchObject({ code: 'SERVERS_DISAGREE' });
  });
});
