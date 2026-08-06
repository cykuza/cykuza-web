import { pickQuizIndices, wordsMatch } from './quiz';

describe('pickQuizIndices', () => {
  it('picks distinct sorted indices for 12 and 24', () => {
    const twelve = pickQuizIndices(12, 3, () => 0.42);
    expect(twelve).toHaveLength(3);
    expect(new Set(twelve).size).toBe(3);
    expect([...twelve].sort((a, b) => a - b)).toEqual(twelve);
    twelve.forEach((i) => expect(i).toBeGreaterThanOrEqual(0));
    twelve.forEach((i) => expect(i).toBeLessThan(12));

    const twentyFour = pickQuizIndices(24, 3, () => 0.7);
    expect(twentyFour).toHaveLength(3);
    expect(new Set(twentyFour).size).toBe(3);
  });

  it('rejects requesting more indices than words', () => {
    expect(() => pickQuizIndices(2, 3)).toThrow(/more quiz indices/);
  });
});

describe('wordsMatch', () => {
  it('is case- and whitespace-insensitive', () => {
    expect(wordsMatch('Abandon', '  abandon ')).toBe(true);
    expect(wordsMatch('about', 'about')).toBe(true);
    expect(wordsMatch('about', 'above')).toBe(false);
  });
});
