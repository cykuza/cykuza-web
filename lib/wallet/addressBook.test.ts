import {
  addAddressBookEntry,
  MAX_ADDRESS_BOOK_ENTRIES,
  normalizeAddressBook,
  removeAddressBookEntry,
} from './addressBook';

describe('addressBook', () => {
  it('normalizes and dedupes entries', async () => {
    const { mnemonicToWallet } = await import('./crypto');
    const w = await mnemonicToWallet(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      '',
      'mainnet',
      0,
      'bip84'
    );
    const book = normalizeAddressBook([
      { label: 'A', address: w.firstAddress, network: 'mainnet' },
      { label: 'B', address: w.firstAddress, network: 'mainnet' },
      { label: '', address: w.firstAddress, network: 'mainnet' },
    ]);
    expect(book).toHaveLength(1);
    expect(book[0]!.label).toBe('A');
    w.seed.fill(0);
  });

  it('add and remove round-trip', async () => {
    const { mnemonicToWallet } = await import('./crypto');
    const w = await mnemonicToWallet(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      '',
      'mainnet',
      0,
      'bip84'
    );
    let book = addAddressBookEntry([], {
      label: 'Friend',
      address: w.firstAddress,
      network: 'mainnet',
    });
    expect(book).toHaveLength(1);
    book = removeAddressBookEntry(book, 'mainnet', w.firstAddress);
    expect(book).toHaveLength(0);
    expect(MAX_ADDRESS_BOOK_ENTRIES).toBe(50);
    w.seed.fill(0);
  });
});
