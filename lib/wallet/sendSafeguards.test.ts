import { assertSendSafeguards } from './sendSafeguards';
import { SendError } from './sendErrors';
import { addressConfirmSuffix } from './sendPolicy';
import { defaultDailySpendState } from './dailySpend';

const FIXTURE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('assertSendSafeguards', () => {
  let toAddress = '';

  beforeAll(async () => {
    const { mnemonicToWallet } = await import('./crypto');
    const w = await mnemonicToWallet(FIXTURE, '', 'mainnet', 0, 'bip84');
    toAddress = w.firstAddress;
    w.seed.fill(0);
  });

  const base = () => ({
    toAddress,
    networkType: 'mainnet' as const,
    toConfirmSuffix: addressConfirmSuffix(toAddress),
    totalSats: 10_000,
    confirmedBalanceSats: 100_000,
    dailySpendLimitSats: null as number | null,
    dailySpend: defaultDailySpendState(),
  });

  it('rejects missing or wrong suffix (pre-W4 UI-only path must fail in domain)', () => {
    expect(() =>
      assertSendSafeguards({ ...base(), toConfirmSuffix: '' })
    ).toThrow(SendError);
    expect(() =>
      assertSendSafeguards({ ...base(), toConfirmSuffix: 'xxxxxx' })
    ).toThrow(/confirmation does not match/);
  });

  it('requires allowSpendLimitOnce when daily limit exceeded', () => {
    expect(() =>
      assertSendSafeguards({
        ...base(),
        dailySpendLimitSats: 5_000,
        totalSats: 6_000,
      })
    ).toThrow(/Daily spend limit exceeded/);

    expect(() =>
      assertSendSafeguards({
        ...base(),
        dailySpendLimitSats: 5_000,
        totalSats: 6_000,
        allowSpendLimitOnce: true,
      })
    ).not.toThrow();
  });

  it('requires acknowledgeLargeSend when total > half balance', () => {
    expect(() =>
      assertSendSafeguards({
        ...base(),
        totalSats: 60_000,
        confirmedBalanceSats: 100_000,
      })
    ).toThrow(/Large send acknowledgment/);

    expect(() =>
      assertSendSafeguards({
        ...base(),
        totalSats: 60_000,
        confirmedBalanceSats: 100_000,
        acknowledgeLargeSend: true,
      })
    ).not.toThrow();
  });

  it('passes when suffix matches and no limit/large flags', () => {
    expect(() => assertSendSafeguards(base())).not.toThrow();
  });
});
