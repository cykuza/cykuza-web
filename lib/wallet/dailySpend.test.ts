import {
  defaultDailySpendState,
  localDayKey,
  normalizeDailySpend,
  recordSpend,
  remainingSatsToday,
  wouldExceedLimit,
} from './dailySpend';

describe('dailySpend', () => {
  it('never exceeds when limit is null or <= 0', () => {
    const state = defaultDailySpendState();
    expect(wouldExceedLimit(null, state, 1e12)).toBe(false);
    expect(wouldExceedLimit(0, state, 1)).toBe(false);
    expect(remainingSatsToday(null, state)).toBeNull();
  });

  it('detects exceed and records spend on the same day', () => {
    const now = Date.now();
    let state = { dayKey: localDayKey(now), usedSats: 100 };
    expect(wouldExceedLimit(150, state, 40, now)).toBe(false);
    expect(wouldExceedLimit(150, state, 51, now)).toBe(true);
    state = recordSpend(state, 50, now);
    expect(state.usedSats).toBe(150);
  });

  it('resets used sats after day rollover', () => {
    const yesterday = {
      dayKey: '2000-01-01',
      usedSats: 999_999,
    };
    const today = normalizeDailySpend(yesterday);
    expect(today.dayKey).toBe(localDayKey());
    expect(today.usedSats).toBe(0);
  });
});
