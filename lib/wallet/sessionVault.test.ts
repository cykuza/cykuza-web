import { encryptWithPassword } from './password';
import {
  openSessionVault,
  parseVaultPayload,
  sealSessionVault,
  serializeSessionVault,
  vaultPassphraseRequired,
  VaultOpenError,
} from './sessionVault';
import {
  mnemonicToWallet,
  seedFingerprintFromMnemonic,
  WrongBip39PassphraseError,
} from './crypto';
import { unlockFailedWithAttempts } from './unlockErrors';

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const FP32 = 'a'.repeat(32);

async function sealV1Pbkdf2(
  payload: { kind: 'mnemonic'; secret: string; seedFingerprint?: string },
  password: string,
  passphraseRequired: boolean
) {
  const enc = await encryptWithPassword(JSON.stringify(payload), password);
  return {
    version: 1 as const,
    passphraseRequired,
    encrypted: enc.encrypted,
    salt: enc.salt,
    iv: enc.iv,
    tag: enc.tag,
  };
}

describe('sessionVault', () => {
  it('seals new wallets as Argon2id v2', async () => {
    const payload = { kind: 'mnemonic' as const, secret: FIXTURE_MNEMONIC };
    const sealed = await sealSessionVault({
      payload,
      password: 'test-password-12',
      passphraseRequired: false,
    });
    expect(sealed.version).toBe(2);
    expect(sealed.kdf).toBe('argon2id');
    expect(sealed.passphraseRequired).toBe(false);

    const opened = await openSessionVault(serializeSessionVault(sealed), 'test-password-12');
    expect(opened.payload).toEqual(payload);
    expect(opened.passphraseRequired).toBe(false);
    expect(opened.needsMigrate).toBe(false);
  }, 60_000);

  it('round-trips passphrase wallet with 32-hex seedFingerprint', async () => {
    const fp = await seedFingerprintFromMnemonic(FIXTURE_MNEMONIC, 'correct-pp');
    const sealed = await sealSessionVault({
      payload: {
        kind: 'mnemonic',
        secret: FIXTURE_MNEMONIC,
        seedFingerprint: fp,
      },
      password: 'vault-pass-12',
      passphraseRequired: true,
    });
    expect(sealed.version).toBe(2);
    expect(sealed.passphraseRequired).toBe(true);
    expect(vaultPassphraseRequired(serializeSessionVault(sealed))).toBe(true);

    const opened = await openSessionVault(serializeSessionVault(sealed), 'vault-pass-12');
    expect(opened.payload.seedFingerprint).toBe(fp);
    expect(opened.passphraseRequired).toBe(true);
    expect(opened.needsMigrate).toBe(false);
  }, 60_000);

  it('rejects payload with passphrase key', () => {
    expect(() =>
      parseVaultPayload({
        kind: 'mnemonic',
        secret: FIXTURE_MNEMONIC,
        passphrase: 'never-store-me',
      })
    ).toThrow(/unexpected fields/);
  });

  it('sealSessionVault requires 32-hex seedFingerprint when passphraseRequired', async () => {
    await expect(
      sealSessionVault({
        payload: { kind: 'mnemonic', secret: FIXTURE_MNEMONIC },
        password: 'x'.repeat(12),
        passphraseRequired: true,
      })
    ).rejects.toThrow(/seedFingerprint/);

    await expect(
      sealSessionVault({
        payload: {
          kind: 'mnemonic',
          secret: FIXTURE_MNEMONIC,
          seedFingerprint: 'abcd',
        },
        password: 'x'.repeat(12),
        passphraseRequired: true,
      })
    ).rejects.toThrow(/seedFingerprint/);

    await expect(
      sealSessionVault({
        payload: {
          kind: 'mnemonic',
          secret: FIXTURE_MNEMONIC,
          seedFingerprint: FP32,
        },
        password: 'x'.repeat(12),
        passphraseRequired: false,
      })
    ).rejects.toThrow(/only allowed when passphraseRequired/);
  }, 60_000);

  it('opens legacy EncryptedData (raw secret string) as v0 needing migrate', async () => {
    const enc = await encryptWithPassword(FIXTURE_MNEMONIC, 'legacy-pass');
    const raw = JSON.stringify(enc);
    expect(vaultPassphraseRequired(raw)).toBe(false);

    const opened = await openSessionVault(raw, 'legacy-pass');
    expect(opened.needsMigrate).toBe(true);
    expect(opened.passphraseRequired).toBe(false);
    expect(opened.payload.kind).toBe('mnemonic');
    expect(opened.payload.secret).toBe(FIXTURE_MNEMONIC);
  });

  it('opens v1 PBKDF2 envelope and marks needsMigrate', async () => {
    const v1 = await sealV1Pbkdf2(
      { kind: 'mnemonic', secret: FIXTURE_MNEMONIC },
      'legacy-v1-pass',
      false
    );
    const opened = await openSessionVault(JSON.stringify(v1), 'legacy-v1-pass');
    expect(opened.needsMigrate).toBe(true);
    expect(opened.payload.secret).toBe(FIXTURE_MNEMONIC);
  });

  it('wrong password throws VaultOpenError', async () => {
    const sealed = await sealSessionVault({
      payload: { kind: 'mnemonic', secret: FIXTURE_MNEMONIC },
      password: 'right-password',
      passphraseRequired: false,
    });
    await expect(
      openSessionVault(serializeSessionVault(sealed), 'wrong-password')
    ).rejects.toBeInstanceOf(VaultOpenError);
  }, 60_000);
});

describe('unified unlock copy (oracle-safe)', () => {
  it('wrong password and wrong PP map to identical unlockFailedWithAttempts', async () => {
    const remaining = 4;
    const expected = unlockFailedWithAttempts(remaining);

    const fp = await seedFingerprintFromMnemonic(FIXTURE_MNEMONIC, 'correct-pp');
    const sealed = await sealSessionVault({
      payload: {
        kind: 'mnemonic',
        secret: FIXTURE_MNEMONIC,
        seedFingerprint: fp,
      },
      password: 'vault-pass-12',
      passphraseRequired: true,
    });
    const raw = serializeSessionVault(sealed);

    let wrongPasswordMsg: string | undefined;
    try {
      await openSessionVault(raw, 'bad-password');
    } catch (err) {
      expect(err).toBeInstanceOf(VaultOpenError);
      wrongPasswordMsg = unlockFailedWithAttempts(remaining);
    }

    let wrongPpMsg: string | undefined;
    const opened = await openSessionVault(raw, 'vault-pass-12');
    try {
      await mnemonicToWallet(
        opened.payload.secret,
        'wrong-pp',
        'mainnet',
        0,
        'bip84',
        opened.payload.seedFingerprint
      );
    } catch (err) {
      expect(err).toBeInstanceOf(WrongBip39PassphraseError);
      wrongPpMsg = unlockFailedWithAttempts(remaining);
    }

    expect(wrongPasswordMsg).toBe(expected);
    expect(wrongPpMsg).toBe(expected);
    expect(wrongPasswordMsg).toBe(wrongPpMsg);
  }, 60_000);
});
