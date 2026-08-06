import {
  assessElectrumTrust,
  assertElectrumTrustAllowsChainOps,
  electrumTrustBlocksChainOps,
  electrumTrustMessage,
  ElectrumTrustBlockedError,
} from './electrumTrust';
import { readVerifyWithSecondServer, writeVerifyWithSecondServer } from './trustPrefs';
import { trustBanner } from './trustBanner';

describe('assessElectrumTrust', () => {
  it('returns unconfigured / single / verified / verify_off / degraded', () => {
    expect(
      assessElectrumTrust({
        configuredCount: 0,
        permittedCount: 0,
        verifyEnabled: true,
      })
    ).toBe('unconfigured');
    expect(
      assessElectrumTrust({
        configuredCount: 1,
        permittedCount: 1,
        verifyEnabled: false,
      })
    ).toBe('single');
    expect(
      assessElectrumTrust({
        configuredCount: 2,
        permittedCount: 2,
        verifyEnabled: true,
      })
    ).toBe('verified');
    expect(
      assessElectrumTrust({
        configuredCount: 2,
        permittedCount: 2,
        verifyEnabled: false,
      })
    ).toBe('verify_off');
    expect(
      assessElectrumTrust({
        configuredCount: 2,
        permittedCount: 1,
        verifyEnabled: true,
      })
    ).toBe('degraded');
  });
});

describe('electrumTrustBlocksChainOps', () => {
  it('blocks degraded and verify_off only', () => {
    expect(electrumTrustBlocksChainOps('degraded')).toBe(true);
    expect(electrumTrustBlocksChainOps('verify_off')).toBe(true);
    expect(electrumTrustBlocksChainOps('verified')).toBe(false);
    expect(electrumTrustBlocksChainOps('single')).toBe(false);
    expect(electrumTrustBlocksChainOps('unconfigured')).toBe(false);
  });
});

describe('assertElectrumTrustAllowsChainOps', () => {
  it('throws ElectrumTrustBlockedError with web-tuned message', () => {
    expect(() => assertElectrumTrustAllowsChainOps('degraded')).toThrow(
      ElectrumTrustBlockedError
    );
    expect(electrumTrustMessage('degraded')).toMatch(/reachable/i);
    expect(electrumTrustMessage('verify_off')).toMatch(/Verify with second server/);
  });
});

describe('trustBanner', () => {
  it('maps danger / warn / null from domain level', () => {
    expect(trustBanner('verified')).toBeNull();
    expect(trustBanner('single')?.tone).toBe('warn');
    expect(trustBanner('degraded')?.tone).toBe('danger');
    expect(trustBanner('verify_off')?.tone).toBe('danger');
    expect(trustBanner('unconfigured')?.tone).toBe('danger');
  });
});

describe('verifyWithSecondServer pref', () => {
  it('defaults on when missing; persists boolean', () => {
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    expect(readVerifyWithSecondServer(storage)).toBe(true);
    writeVerifyWithSecondServer(false, storage);
    expect(readVerifyWithSecondServer(storage)).toBe(false);
    writeVerifyWithSecondServer(true, storage);
    expect(readVerifyWithSecondServer(storage)).toBe(true);
  });
});
