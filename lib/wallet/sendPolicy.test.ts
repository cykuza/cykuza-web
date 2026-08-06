import {
  ADDRESS_CONFIRM_SUFFIX_LENGTH,
  addressConfirmSuffix,
  isLargeSend,
  matchesAddressConfirmSuffix,
} from './sendPolicy';

describe('sendPolicy', () => {
  it('takes last 6 characters for confirm suffix', () => {
    expect(ADDRESS_CONFIRM_SUFFIX_LENGTH).toBe(6);
    const addr = 'cy1qabcdefghijklmnop';
    expect(addressConfirmSuffix(addr)).toBe(addr.slice(-6));
    expect(addressConfirmSuffix(addr)).toHaveLength(6);
  });

  it('matches suffix exactly (case-sensitive length gate)', () => {
    const addr = 'cy1qabcdefghijklmnopqr';
    const suffix = addressConfirmSuffix(addr);
    expect(matchesAddressConfirmSuffix(addr, suffix)).toBe(true);
    expect(matchesAddressConfirmSuffix(addr, suffix.slice(0, 5))).toBe(false);
    expect(matchesAddressConfirmSuffix(addr, 'xxxxxx')).toBe(false);
  });

  it('isLargeSend is strict greater than half balance', () => {
    expect(isLargeSend(50_000, 100_000)).toBe(false);
    expect(isLargeSend(50_001, 100_000)).toBe(true);
    expect(isLargeSend(1, 0)).toBe(false);
  });
});
