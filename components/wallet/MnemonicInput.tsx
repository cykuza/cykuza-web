'use client';

import { useState, FormEvent } from 'react';

interface MnemonicInputProps {
  onConfirm: (mnemonic: string) => void;
}

export const MnemonicInput = ({ onConfirm }: MnemonicInputProps) => {
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [error, setError] = useState<string>();

  const handleWordChange = (index: number, value: string) => {
    const newWords = [...words];
    newWords[index] = value.toLowerCase().trim();
    setWords(newWords);
    setError(undefined);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);

    const trimmedWords = words.filter(w => w.trim() !== '');
    
    if (trimmedWords.length !== 12) {
      setError('Please enter exactly 12 words');
      return;
    }

    const mnemonic = trimmedWords.join(' ');
    onConfirm(mnemonic);
  };

  // Split words into two columns
  const midPoint = Math.ceil(words.length / 2);
  const leftColumn = words.slice(0, midPoint);
  const rightColumn = words.slice(midPoint);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Enter Your Recovery Phrase</h2>
        <p className="text-sm text-neutral-200">Enter your 12 word seed phrase</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 rounded-xl border border-red-100/50 bg-red-200/10 text-red-100 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Left Column */}
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

          {/* Right Column */}
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

        <div className="flex gap-3">
          <button
            type="submit"
            className="flex-1 px-4 py-3 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all font-medium"
          >
            Import
          </button>
        </div>
      </form>
    </div>
  );
};