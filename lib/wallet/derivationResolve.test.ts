import {
  DerivationProbeRequiredError,
  isFunded,
  resolveMnemonicWallet,
  selectDerivationPath,
  type PathHintStore,
  type PathProbeResult,
} from './derivationResolve';
import type { DerivationPathId } from './crypto';

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function memoryHintStore(): PathHintStore & { map: Map<string, DerivationPathId> } {
  const map = new Map<string, DerivationPathId>();
  return {
    map,
    get: (fp) => map.get(fp) ?? null,
    set: (fp, id) => {
      map.set(fp, id);
    },
  };
}

describe('selectDerivationPath', () => {
  it('prefers legacy when only legacy is funded', () => {
    expect(
      selectDerivationPath([
        { pathId: 'bip84', funded: false },
        { pathId: 'legacy-web', funded: true },
      ])
    ).toEqual({ pathId: 'legacy-web', bothFunded: false });
  });

  it('prefers bip84 when only bip84 is funded', () => {
    expect(
      selectDerivationPath([
        { pathId: 'bip84', funded: true },
        { pathId: 'legacy-web', funded: false },
      ])
    ).toEqual({ pathId: 'bip84', bothFunded: false });
  });

  it('defaults to bip84 when both empty', () => {
    expect(
      selectDerivationPath([
        { pathId: 'bip84', funded: false },
        { pathId: 'legacy-web', funded: false },
      ])
    ).toEqual({ pathId: 'bip84', bothFunded: false });
  });

  it('prefers legacy when both funded', () => {
    expect(
      selectDerivationPath([
        { pathId: 'bip84', funded: true },
        { pathId: 'legacy-web', funded: true },
      ])
    ).toEqual({ pathId: 'legacy-web', bothFunded: true });
  });
});

describe('isFunded', () => {
  it('treats balance or history as evidence', () => {
    expect(isFunded({ confirmed: 1, unconfirmed: 0 })).toBe(true);
    expect(isFunded({ confirmed: 0, unconfirmed: 1 })).toBe(true);
    expect(isFunded({ confirmed: 0, unconfirmed: 0, historyLen: 2 })).toBe(true);
    expect(isFunded({ confirmed: 0, unconfirmed: 0, historyLen: 0 })).toBe(false);
  });
});

describe('resolveMnemonicWallet', () => {
  it('create always uses bip84 and stores hint', async () => {
    const hints = memoryHintStore();
    const resolved = await resolveMnemonicWallet(FIXTURE_MNEMONIC, {
      mode: 'create',
      hintStore: hints,
    });
    expect(resolved.pathId).toBe('bip84');
    expect(resolved.wallet.derivationPath).toBe("m/84'/802'/0'/0/0");
    expect([...hints.map.values()]).toEqual(['bip84']);
    resolved.wallet.seed.fill(0);
  });

  it('restore without hint or probe fails closed', async () => {
    await expect(
      resolveMnemonicWallet(FIXTURE_MNEMONIC, { mode: 'restore' })
    ).rejects.toBeInstanceOf(DerivationProbeRequiredError);
  });

  it('restore uses stored hint without probing', async () => {
    const hints = memoryHintStore();
    const created = await resolveMnemonicWallet(FIXTURE_MNEMONIC, {
      mode: 'create',
      hintStore: hints,
    });
    created.wallet.seed.fill(0);

    // Force legacy hint as if user previously restored on legacy path
    const fp = [...hints.map.keys()][0]!;
    hints.set(fp, 'legacy-web');

    const restored = await resolveMnemonicWallet(FIXTURE_MNEMONIC, {
      mode: 'restore',
      hintStore: hints,
    });
    expect(restored.usedHint).toBe(true);
    expect(restored.pathId).toBe('legacy-web');
    expect(restored.wallet.derivationPath).toBe("m/84'/802'/0'/0/0/0/0");
    restored.wallet.seed.fill(0);
  });

  it('restore probes and selects legacy when only legacy is funded', async () => {
    const hints = memoryHintStore();
    const funded = new Set<string>();

    const resolved = await resolveMnemonicWallet(FIXTURE_MNEMONIC, {
      mode: 'restore',
      hintStore: hints,
      probe: async (address) => {
        // First call is bip84, second is legacy — mark legacy by capturing both
        if (funded.size === 0) {
          funded.add(address); // bip84 address — leave unfunded
          return { confirmed: 0, unconfirmed: 0, historyLen: 0 };
        }
        return { confirmed: 1000, unconfirmed: 0, historyLen: 1 };
      },
    });

    expect(resolved.pathId).toBe('legacy-web');
    expect(resolved.bothFunded).toBe(false);
    expect(hints.map.size).toBe(1);
    resolved.wallet.seed.fill(0);
  });

  it('restore fails closed when probe throws', async () => {
    await expect(
      resolveMnemonicWallet(FIXTURE_MNEMONIC, {
        mode: 'restore',
        probe: async () => {
          throw new Error('network down');
        },
      })
    ).rejects.toBeInstanceOf(DerivationProbeRequiredError);
  });

  it('restore selects bip84 when both empty', async () => {
    const empty: PathProbeResult = { confirmed: 0, unconfirmed: 0, historyLen: 0 };
    const resolved = await resolveMnemonicWallet(FIXTURE_MNEMONIC, {
      mode: 'restore',
      probe: async () => empty,
    });
    expect(resolved.pathId).toBe('bip84');
    resolved.wallet.seed.fill(0);
  });
});
