'use client';

import { useState } from 'react';

interface MnemonicDisplayProps {
  mnemonic: string;
  onConfirm: () => void;
}

export const MnemonicDisplay = ({ mnemonic, onConfirm }: MnemonicDisplayProps) => {
  const [saved, setSaved] = useState(false);
  const words = mnemonic.split(' ');

  // Split words into two columns
  const midPoint = Math.ceil(words.length / 2);
  const leftColumn = words.slice(0, midPoint);
  const rightColumn = words.slice(midPoint);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Your Recovery Phrase</h2>
        <div className="p-4 rounded-xl border border-yellow-200/20 bg-yellow-200/10 mb-4">
          <p className="text-sm text-neutral-200 leading-relaxed">
            Mnemonics gives you complete control over your wallet - this data should not fall into the wrong hands. Don&apos;t share them with others.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Left Column */}
        <div className="flex flex-col gap-2">
          {leftColumn.map((word, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/14 bg-neutral-800/75"
            >
              <span className="text-xs text-neutral-400 font-mono w-6 flex-shrink-0">{index + 1}.</span>
              <span className="text-sm text-white font-medium">{word}</span>
            </div>
          ))}
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-2">
          {rightColumn.map((word, index) => (
            <div
              key={midPoint + index}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/14 bg-neutral-800/75"
            >
              <span className="text-xs text-neutral-400 font-mono w-6 flex-shrink-0">{midPoint + index + 1}.</span>
              <span className="text-sm text-white font-medium">{word}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <input
          id="saved"
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-1 w-4 h-4 rounded border-white/14 bg-neutral-800/75 text-white focus:ring-2 focus:ring-white/20"
        />
        <label htmlFor="saved" className="text-sm text-neutral-200 cursor-pointer">
          I saved the recovery mnemonic
        </label>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!saved}
          className="flex-1 px-4 py-3 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create
        </button>
      </div>
    </div>
  );
};

