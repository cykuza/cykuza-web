import { assertValidAddress, isValidAddress } from './address';
import { SendError } from './sendErrors';

const FIXTURE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('address', () => {
  it('accepts a derived mainnet cy1 address', async () => {
    const { mnemonicToWallet } = await import('./crypto');
    const w = await mnemonicToWallet(FIXTURE, '', 'mainnet', 0, 'bip84');
    expect(isValidAddress(w.firstAddress, 'mainnet')).toBe(true);
    expect(() => assertValidAddress(w.firstAddress, 'mainnet')).not.toThrow();
    expect(isValidAddress(w.firstAddress, 'testnet')).toBe(false);
    w.seed.fill(0);
  });

  it('rejects empty and wrong-network addresses', () => {
    expect(isValidAddress('', 'mainnet')).toBe(false);
    expect(isValidAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'mainnet')).toBe(
      false
    );
    expect(() => assertValidAddress('not-an-address', 'mainnet')).toThrow(
      SendError
    );
  });
});
