import {
  chainFingerprint,
  chainFingerprintCanonical,
} from './fingerprint';

const balance = { confirmed: 100_000, unconfirmed: 500 };

const utxosA = [
  { txid: 'bbbb', vout: 1, value: 30_000 },
  { txid: 'aaaa', vout: 0, value: 70_000 },
];

const utxosShuffled = [
  { txid: 'aaaa', vout: 0, value: 70_000 },
  { txid: 'bbbb', vout: 1, value: 30_000 },
];

describe('chainFingerprint', () => {
  it('is stable under UTXO shuffle', () => {
    expect(chainFingerprint(balance, utxosA)).toBe(
      chainFingerprint(balance, utxosShuffled)
    );
    expect(chainFingerprintCanonical(balance, utxosA)).toBe(
      chainFingerprintCanonical(balance, utxosShuffled)
    );
  });

  it('differs when value or vout changes', () => {
    const base = chainFingerprint(balance, utxosA);
    expect(
      chainFingerprint(balance, [
        { txid: 'aaaa', vout: 0, value: 70_001 },
        { txid: 'bbbb', vout: 1, value: 30_000 },
      ])
    ).not.toBe(base);
    expect(
      chainFingerprint(balance, [
        { txid: 'aaaa', vout: 1, value: 70_000 },
        { txid: 'bbbb', vout: 1, value: 30_000 },
      ])
    ).not.toBe(base);
  });

  it('differs when balance changes', () => {
    const base = chainFingerprint(balance, utxosA);
    expect(
      chainFingerprint({ confirmed: 99_999, unconfirmed: 500 }, utxosA)
    ).not.toBe(base);
    expect(
      chainFingerprint({ confirmed: 100_000, unconfirmed: 0 }, utxosA)
    ).not.toBe(base);
  });

  it('handles empty UTXO set', () => {
    const fp = chainFingerprint({ confirmed: 0, unconfirmed: 0 }, []);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(chainFingerprintCanonical({ confirmed: 0, unconfirmed: 0 }, [])).toBe(
      'c=0;u=0;utxo='
    );
  });
});
