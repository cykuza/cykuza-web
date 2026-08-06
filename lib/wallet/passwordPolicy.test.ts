import {
  assertNewPassword,
  evaluateNewPassword,
  MIN_PASSWORD_LENGTH,
  passwordStrength,
} from './passwordPolicy';

describe('passwordPolicy', () => {
  it('exports MIN_PASSWORD_LENGTH of 12', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
  });

  it('rejects trimmed length under 12', () => {
    const short = evaluateNewPassword('short');
    expect(short.ok).toBe(false);
    expect(short.error).toMatch(/at least 12/);

    const eleven = evaluateNewPassword('a'.repeat(11));
    expect(eleven.ok).toBe(false);

    const assertFail = assertNewPassword('12345678901');
    expect(assertFail.ok).toBe(false);
  });

  it('accepts length 12 without requiring character classes', () => {
    const ok = evaluateNewPassword('a'.repeat(12));
    expect(ok.ok).toBe(true);
    expect(ok.strength).toBe('Weak'); // only one class
    expect(assertNewPassword('a'.repeat(12)).ok).toBe(true);
  });

  it('strength meter uses classes but never flips ok', () => {
    expect(passwordStrength(12, 1)).toBe('Weak');
    expect(passwordStrength(12, 2)).toBe('OK');
    expect(passwordStrength(12, 4)).toBe('Strong');
    expect(passwordStrength(11, 4)).toBe('Weak');

    const mixed = evaluateNewPassword('Abcdef1!xyz0');
    expect(mixed.ok).toBe(true);
    expect(mixed.strength).toBe('Strong');
  });
});
