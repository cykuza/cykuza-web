import {
  addressToScriptHash,
  generateMnemonic,
  getDerivationPath,
  getLegacyWebDerivationPath,
  mnemonicFingerprint,
  mnemonicToWallet,
  normalizeOptionalPassphrase,
  seedFingerprintFromMnemonic,
  seedFingerprintsMatch,
  validateMnemonic,
  WrongBip39PassphraseError,
  WRONG_BIP39_PASSPHRASE,
} from './crypto';

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('validateMnemonic / generateMnemonic', () => {
  it('accepts the BIP39 abandon fixture', () => {
    expect(validateMnemonic(FIXTURE_MNEMONIC)).toBe(true);
  });

  it('rejects empty, wrong length, and invalid phrases', () => {
    expect(validateMnemonic('')).toBe(false);
    expect(validateMnemonic('not a real mnemonic phrase at all')).toBe(false);
    // 15-word BIP39 can be checksum-valid but we only allow 12|24
    const fifteen =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    expect(fifteen.split(' ')).toHaveLength(15);
    expect(validateMnemonic(fifteen)).toBe(false);
  });

  it('generates a valid 24-word mnemonic by default', () => {
    const m = generateMnemonic();
    expect(m.split(' ')).toHaveLength(24);
    expect(validateMnemonic(m)).toBe(true);
  });

  it('generates a valid 12-word mnemonic when requested', () => {
    const m = generateMnemonic(12);
    expect(m.split(' ')).toHaveLength(12);
    expect(validateMnemonic(m)).toBe(true);
  });
});

describe('derivation paths', () => {
  it('exposes BIP84 leaf and legacy-web paths', () => {
    expect(getDerivationPath(0)).toBe("m/84'/802'/0'/0/0");
    expect(getLegacyWebDerivationPath(0)).toBe("m/84'/802'/0'/0/0/0/0");
  });

  it('derives different addresses for bip84 vs legacy-web', async () => {
    const bip84 = await mnemonicToWallet(FIXTURE_MNEMONIC, '', 'mainnet', 0, 'bip84');
    const legacy = await mnemonicToWallet(FIXTURE_MNEMONIC, '', 'mainnet', 0, 'legacy-web');
    expect(bip84.firstAddress).not.toBe(legacy.firstAddress);
    expect(bip84.derivationPath).toBe("m/84'/802'/0'/0/0");
    expect(legacy.derivationPath).toBe("m/84'/802'/0'/0/0/0/0");
    bip84.seed.fill(0);
    legacy.seed.fill(0);
  });

  it('produces a stable non-secret mnemonic fingerprint', () => {
    const a = mnemonicFingerprint(FIXTURE_MNEMONIC);
    const b = mnemonicFingerprint(`  ${FIXTURE_MNEMONIC}  `);
    expect(a).toHaveLength(8);
    expect(a).toBe(b);
  });

  it('computes scripthash for derived address', async () => {
    const w = await mnemonicToWallet(FIXTURE_MNEMONIC, '', 'mainnet', 0, 'bip84');
    const sh = addressToScriptHash(w.firstAddress, 'mainnet');
    expect(sh).toMatch(/^[0-9a-f]{64}$/);
    w.seed.fill(0);
  });
});

describe('BIP39 passphrase / seed fingerprint', () => {
  it('normalizeOptionalPassphrase treats empty as undefined', () => {
    expect(normalizeOptionalPassphrase(undefined)).toBeUndefined();
    expect(normalizeOptionalPassphrase('')).toBeUndefined();
    expect(normalizeOptionalPassphrase('   ')).toBeUndefined();
    expect(normalizeOptionalPassphrase(' secret ')).toBe('secret');
  });

  it('seedFingerprint matches and rejects wrong passphrase', async () => {
    const fp = await seedFingerprintFromMnemonic(FIXTURE_MNEMONIC, 'correct-pp');
    expect(fp).toMatch(/^[0-9a-f]{32}$/);

    const ok = await mnemonicToWallet(
      FIXTURE_MNEMONIC,
      'correct-pp',
      'mainnet',
      0,
      'bip84',
      fp
    );
    expect(ok.firstAddress.startsWith('cy1')).toBe(true);
    ok.seed.fill(0);

    expect(seedFingerprintsMatch(fp, fp.slice(0, 8))).toBe(true);

    await expect(
      mnemonicToWallet(FIXTURE_MNEMONIC, 'wrong-pp', 'mainnet', 0, 'bip84', fp)
    ).rejects.toBeInstanceOf(WrongBip39PassphraseError);

    await expect(
      mnemonicToWallet(FIXTURE_MNEMONIC, 'wrong-pp', 'mainnet', 0, 'bip84', fp)
    ).rejects.toThrow(WRONG_BIP39_PASSPHRASE);
  });

  it('different passphrases derive different addresses', async () => {
    const a = await mnemonicToWallet(FIXTURE_MNEMONIC, 'alpha', 'mainnet', 0, 'bip84');
    const b = await mnemonicToWallet(FIXTURE_MNEMONIC, 'bravo', 'mainnet', 0, 'bip84');
    expect(a.firstAddress).not.toBe(b.firstAddress);
    a.seed.fill(0);
    b.seed.fill(0);
  });
});
