/**
 * Pick `count` distinct random word indices in [0, wordCount).
 * Stable for a given call — callers should memoize once on mount.
 */
export function pickQuizIndices(
  wordCount: number,
  count: number,
  random: () => number = Math.random
): number[] {
  if (count > wordCount) {
    throw new Error('Cannot pick more quiz indices than words');
  }
  const pool = Array.from({ length: wordCount }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

/** Case- and whitespace-insensitive word compare. */
export function wordsMatch(expected: string, actual: string): boolean {
  return expected.trim().toLowerCase() === actual.trim().toLowerCase();
}
