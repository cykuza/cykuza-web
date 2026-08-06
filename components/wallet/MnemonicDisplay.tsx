'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeMnemonic, validateMnemonic } from '@/lib/wallet/crypto';
import { pickQuizIndices, wordsMatch } from '@/lib/wallet/quiz';

interface MnemonicDisplayProps {
  mnemonic: string;
  address?: string;
  onConfirm: () => void;
  /** When on the quiz step, parent header Back should return to the backup screen. */
  onInternalBack?: (handler: (() => void) | null) => void;
}

type Step = 'backup' | 'quiz';

const QUIZ_COUNT = 3;
const CLIPBOARD_CLEAR_MS = 60_000;

function isSupportedWordCount(n: number): n is 12 | 24 {
  return n === 12 || n === 24;
}

function splitMnemonicWords(mnemonic: string): string[] {
  return normalizeMnemonic(mnemonic).split(' ').filter(Boolean);
}

/**
 * Two-step create backup: show phrase once, then quiz with seeds hidden.
 * Words are read from the parent-owned pending mnemonic (prop).
 */
export const MnemonicDisplay = ({
  mnemonic,
  address,
  onConfirm,
  onInternalBack,
}: MnemonicDisplayProps) => {
  const [step, setStep] = useState<Step>('backup');
  const [saved, setSaved] = useState(false);
  const [hotWalletAck, setHotWalletAck] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const clipboardClearTimerRef = useRef<number | null>(null);

  const list = useMemo(() => splitMnemonicWords(mnemonic), [mnemonic]);
  const phrase = useMemo(() => list.join(' '), [list]);
  const mnemonicValid =
    isSupportedWordCount(list.length) && validateMnemonic(phrase);

  const quizIndicesRef = useRef<number[] | null>(null);
  if (mnemonicValid && quizIndicesRef.current === null) {
    quizIndicesRef.current = pickQuizIndices(list.length, QUIZ_COUNT);
  }
  if (!mnemonicValid) {
    quizIndicesRef.current = null;
  }
  const quizIndices = quizIndicesRef.current ?? [];

  const clearClipboard = useCallback(() => {
    if (clipboardClearTimerRef.current !== null) {
      window.clearTimeout(clipboardClearTimerRef.current);
      clipboardClearTimerRef.current = null;
    }
    setCopied(false);
    void navigator.clipboard?.writeText('').catch(() => undefined);
  }, []);

  const goToBackup = useCallback(() => {
    setStep('backup');
    setAnswers({});
    setError(undefined);
  }, []);

  useEffect(() => {
    if (!onInternalBack) return;
    onInternalBack(step === 'quiz' ? goToBackup : null);
    return () => onInternalBack(null);
  }, [step, goToBackup, onInternalBack]);

  useEffect(() => {
    return () => {
      clearClipboard();
    };
  }, [clearClipboard]);

  const midPoint = Math.ceil(list.length / 2);
  const leftColumn = list.slice(0, midPoint);
  const rightColumn = list.slice(midPoint);

  const quizOk =
    quizIndices.length === QUIZ_COUNT &&
    quizIndices.every((idx) => wordsMatch(list[idx] ?? '', answers[idx] ?? ''));

  const handleCopy = async () => {
    if (!mnemonicValid || step !== 'backup') {
      setError('Recovery phrase is missing or invalid.');
      return;
    }
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      if (clipboardClearTimerRef.current !== null) {
        window.clearTimeout(clipboardClearTimerRef.current);
      }
      clipboardClearTimerRef.current = window.setTimeout(() => {
        void navigator.clipboard.writeText('').catch(() => undefined);
        setCopied(false);
        clipboardClearTimerRef.current = null;
      }, CLIPBOARD_CLEAR_MS);
    } catch {
      setError('Unable to copy to clipboard');
    }
  };

  const goToQuiz = () => {
    setError(undefined);
    if (!mnemonicValid) {
      setError('Recovery phrase is missing or invalid. Go back and create the wallet again.');
      return;
    }
    if (!saved) {
      setError('Confirm that you have backed up your seed phrase.');
      return;
    }
    if (!hotWalletAck) {
      setError('Confirm that you understand this is a hot wallet.');
      return;
    }
    if (quizIndices.length !== QUIZ_COUNT) {
      setError('Unable to start confirmation quiz.');
      return;
    }
    // Seeds leave the screen; wipe clipboard so paste cannot bypass the quiz.
    clearClipboard();
    setAnswers({});
    setStep('quiz');
  };

  const finish = () => {
    setError(undefined);
    if (!mnemonicValid) {
      setError('Recovery phrase is missing or invalid. Go back and create the wallet again.');
      return;
    }
    if (step !== 'quiz') {
      setError('Confirm your recovery phrase before continuing.');
      return;
    }
    if (!quizOk) {
      setError('Fill in the correct quiz words before continuing.');
      return;
    }
    clearClipboard();
    setAnswers({});
    onConfirm();
  };

  if (!mnemonicValid) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-4">Your Recovery Phrase</h2>
          <div className="p-3 rounded-xl border border-red-100/50 bg-red-200/10 text-red-100 text-sm">
            Recovery phrase is missing or invalid. Go back and create the wallet again.
          </div>
        </div>
      </div>
    );
  }

  const wordLabel = list.length === 24 ? '24 words' : '12 words';

  if (step === 'quiz') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-4">Confirm Recovery Phrase</h2>
          <div className="p-4 rounded-xl border border-yellow-200/20 bg-yellow-200/10 space-y-2">
            <p className="text-sm text-neutral-200 leading-relaxed">
              Enter the requested words from your offline backup. Your seed is no longer shown on this screen.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-300">Confirm a few words to continue:</p>
          {quizIndices.map((idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <label htmlFor={`quiz-word-${idx}`} className="text-xs text-neutral-400">
                Word #{idx + 1}
              </label>
              <input
                id={`quiz-word-${idx}`}
                type="text"
                value={answers[idx] ?? ''}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [idx]: e.target.value }))
                }
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="h-11 px-4 rounded-xl border border-white/14 bg-neutral-800/75 text-sm text-white outline-none focus:border-white/30"
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-xl border border-red-100/50 bg-red-200/10 text-red-100 text-sm">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={finish}
          disabled={!quizOk}
          className="flex-1 px-4 py-3 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create wallet
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Your Recovery Phrase</h2>
        <div className="p-4 rounded-xl border border-yellow-200/20 bg-yellow-200/10 mb-4 space-y-2">
          <p className="text-sm text-neutral-200 leading-relaxed">
            Write these {wordLabel} down and store them offline. They will not be shown again after you continue.
            Anyone with this phrase can spend your funds.
          </p>
          <p className="text-sm text-neutral-300 leading-relaxed">
            This is a hot wallet: the browser process holds keys while unlocked, and Electrum servers can see your address.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          {leftColumn.map((word, index) => (
            <div
              key={`L-${index}`}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/14 bg-neutral-800/75"
            >
              <span className="text-xs text-neutral-400 font-mono w-6 flex-shrink-0">{index + 1}.</span>
              <span className="text-sm text-white font-medium">{word}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {rightColumn.map((word, index) => (
            <div
              key={`R-${midPoint + index}`}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/14 bg-neutral-800/75"
            >
              <span className="text-xs text-neutral-400 font-mono w-6 flex-shrink-0">{midPoint + index + 1}.</span>
              <span className="text-sm text-white font-medium">{word}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleCopy()}
        className="px-4 py-2 rounded-xl border border-white/14 bg-neutral-800/75 text-white text-sm hover:bg-neutral-700 transition-all"
      >
        {copied ? 'Copied (clears in 60s)' : 'Copy seed phrase'}
      </button>

      {address && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-400">Your first receive address (for verification):</p>
          <p className="text-xs font-mono text-neutral-200 break-all">{address}</p>
        </div>
      )}

      <div className="flex items-start gap-3">
        <input
          id="saved"
          type="checkbox"
          checked={saved}
          onChange={(e) => {
            setSaved(e.target.checked);
            setError(undefined);
          }}
          className="mt-1 w-4 h-4 rounded border-white/14 bg-neutral-800/75 text-white focus:ring-2 focus:ring-white/20"
        />
        <label htmlFor="saved" className="text-sm text-neutral-200 cursor-pointer">
          I have written down my seed phrase and stored it safely.
        </label>
      </div>

      <div className="flex items-start gap-3">
        <input
          id="hotWalletAck"
          type="checkbox"
          checked={hotWalletAck}
          onChange={(e) => {
            setHotWalletAck(e.target.checked);
            setError(undefined);
          }}
          className="mt-1 w-4 h-4 rounded border-white/14 bg-neutral-800/75 text-white focus:ring-2 focus:ring-white/20"
        />
        <label htmlFor="hotWalletAck" className="text-sm text-neutral-200 cursor-pointer">
          I understand this is a hot wallet and Electrum can see my address.
        </label>
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-red-100/50 bg-red-200/10 text-red-100 text-sm">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={goToQuiz}
        disabled={!saved || !hotWalletAck}
        className="flex-1 px-4 py-3 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
};
