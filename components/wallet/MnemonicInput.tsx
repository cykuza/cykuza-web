'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { validateMnemonic, type WordCount } from '@/lib/wallet/crypto';

type Step = 'count' | 'words';

interface MnemonicInputProps {
  onConfirm: (mnemonic: string) => void;
  /** When on the word-entry step, parent header Back should return to count selection. */
  onInternalBack?: (handler: (() => void) | null) => void;
}

export const MnemonicInput = ({ onConfirm, onInternalBack }: MnemonicInputProps) => {
  const [step, setStep] = useState<Step>('count');
  const [wordCount, setWordCount] = useState<WordCount | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  const goToCountStep = useCallback(() => {
    setStep('count');
    setWords([]);
    setError(undefined);
  }, []);

  useEffect(() => {
    if (!onInternalBack) return;
    onInternalBack(step === 'words' ? goToCountStep : null);
    return () => onInternalBack(null);
  }, [step, goToCountStep, onInternalBack]);

  const handleContinueFromCount = () => {
    if (wordCount !== 12 && wordCount !== 24) return;
    setWords(Array(wordCount).fill(''));
    setError(undefined);
    setStep('words');
  };

  const handleWordChange = (index: number, value: string) => {
    const newWords = [...words];
    newWords[index] = value.toLowerCase().trim();
    setWords(newWords);
    setError(undefined);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);

    if (wordCount !== 12 && wordCount !== 24) {
      setError('Select 12 or 24 words first');
      return;
    }

    const trimmedWords = words.map((w) => w.trim()).filter((w) => w !== '');

    if (trimmedWords.length !== wordCount) {
      setError(`Please enter exactly ${wordCount} words`);
      return;
    }

    const mnemonic = trimmedWords.join(' ');
    if (!validateMnemonic(mnemonic)) {
      setError('Invalid mnemonic phrase. Please verify all words.');
      return;
    }

    onConfirm(mnemonic);
  };

  if (step === 'count') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Recovery phrase length</h2>
          <p className="text-sm text-neutral-200">
            Choose how many words your seed has. You will enter the words on the next screen.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {([12, 24] as WordCount[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setWordCount(n);
                setError(undefined);
              }}
              className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium border h-12 transition-all ${
                wordCount === n
                  ? 'border-white/40 bg-neutral-600 text-white'
                  : 'border-white/7 bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
              }`}
            >
              {n} words
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={wordCount !== 12 && wordCount !== 24}
          onClick={handleContinueFromCount}
          className="px-4 py-3 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all font-medium disabled:opacity-45 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    );
  }

  const midPoint = Math.ceil(words.length / 2);
  const leftColumn = words.slice(0, midPoint);
  const rightColumn = words.slice(midPoint);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Enter Your Recovery Phrase</h2>
        <p className="text-sm text-neutral-200">
          Enter all {wordCount} words in order
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 rounded-xl border border-red-100/50 bg-red-200/10 text-red-100 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            {leftColumn.map((word, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/14 bg-neutral-800/75"
              >
                <span className="text-xs text-neutral-400 font-mono w-6 flex-shrink-0">{index + 1}.</span>
                <input
                  type="text"
                  value={word}
                  onChange={(e) => handleWordChange(index, e.target.value)}
                  className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder:text-neutral-400"
                  placeholder={`Word ${index + 1}`}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {rightColumn.map((word, index) => {
              const actualIndex = midPoint + index;
              return (
                <div
                  key={actualIndex}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/14 bg-neutral-800/75"
                >
                  <span className="text-xs text-neutral-400 font-mono w-6 flex-shrink-0">{actualIndex + 1}.</span>
                  <input
                    type="text"
                    value={word}
                    onChange={(e) => handleWordChange(actualIndex, e.target.value)}
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder:text-neutral-400"
                    placeholder={`Word ${actualIndex + 1}`}
                    autoComplete="off"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          className="flex-1 px-4 py-3 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all font-medium"
        >
          Import
        </button>
      </form>
    </div>
  );
};
