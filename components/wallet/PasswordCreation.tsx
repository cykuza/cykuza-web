'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MNEMONIC_WORD_COUNT } from '@/lib/wallet/crypto';
import {
  diceMinFor,
  hexMinBytes,
  type EntropyMode,
  type WordCount,
} from '@/lib/wallet/seedEntropy';
import { evaluateNewPassword } from '@/lib/wallet/passwordPolicy';

export interface CreateEntropyOptions {
  wordCount: WordCount;
  mode: EntropyMode;
  diceRolls?: string;
  hexEntropy?: string;
}

interface PasswordCreationProps {
  onConfirm: (
    password: string,
    entropy?: CreateEntropyOptions,
    passphrase?: string
  ) => void;
  onBack?: () => void;
  /** When true, show seed length / entropy mode controls (new wallet create). */
  showEntropyOptions?: boolean;
  /** When true, optional BIP39 passphrase (create + mnemonic import). */
  allowPassphrase?: boolean;
}

function hexByteCount(hex: string): number | null {
  const cleaned = hex.trim().toLowerCase().replace(/^0x/, '');
  if (cleaned.length === 0) return 0;
  if (cleaned.length % 2 !== 0 || !/^[0-9a-f]+$/.test(cleaned)) return null;
  return cleaned.length / 2;
}

function userEntropyReady(
  mode: EntropyMode,
  wordCount: WordCount,
  diceRolls: string,
  hexEntropy: string
): boolean {
  if (mode === 'csprng') return true;
  const hasDice = diceRolls.length > 0;
  const hasHex = hexEntropy.trim().length > 0;
  if (!hasDice && !hasHex) return false;

  if (hasDice) {
    if (!/^[1-6]+$/.test(diceRolls) || diceRolls.length < diceMinFor(mode, wordCount)) {
      return false;
    }
  }
  if (hasHex) {
    const bytes = hexByteCount(hexEntropy);
    if (bytes === null || bytes < hexMinBytes(mode, wordCount)) {
      return false;
    }
  }
  return true;
}

export const PasswordCreation: React.FC<PasswordCreationProps> = ({
  onConfirm,
  onBack,
  showEntropyOptions = false,
  allowPassphrase = false,
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string>();
  const [wordCount, setWordCount] = useState<WordCount>(MNEMONIC_WORD_COUNT);
  const [entropyMode, setEntropyMode] = useState<EntropyMode>('csprng');
  const [diceRolls, setDiceRolls] = useState('');
  const [hexEntropy, setHexEntropy] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  useEffect(() => {
    return () => {
      setPassword('');
      setConfirmPassword('');
      setDiceRolls('');
      setHexEntropy('');
      setPassphrase('');
      setPassphraseConfirm('');
    };
  }, []);

  const entropyReady = useMemo(
    () =>
      !showEntropyOptions ||
      userEntropyReady(entropyMode, wordCount, diceRolls, hexEntropy),
    [showEntropyOptions, entropyMode, wordCount, diceRolls, hexEntropy]
  );

  const diceNeed = diceMinFor(entropyMode, wordCount);
  const hexNeed = hexMinBytes(entropyMode, wordCount);
  const hexBytes = hexByteCount(hexEntropy);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    const policy = evaluateNewPassword(password);
    if (!policy.ok) {
      setError(policy.error);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!understood) {
      setError('Please confirm that you understand the password cannot be recovered');
      return;
    }

    if (showEntropyOptions && !entropyReady) {
      setError('Provide enough dice rolls and/or hex entropy for the selected mode');
      return;
    }

    let normalizedPassphrase: string | undefined;
    if (allowPassphrase && usePassphrase) {
      if (!passphrase.trim()) {
        setError('Enter a BIP39 passphrase, or turn the option off.');
        return;
      }
      if (passphrase !== passphraseConfirm) {
        setError('BIP39 passphrases do not match.');
        return;
      }
      if (passphrase === password) {
        setError('BIP39 passphrase must differ from the vault password.');
        return;
      }
      normalizedPassphrase = passphrase;
    }

    const entropy: CreateEntropyOptions | undefined = showEntropyOptions
      ? {
          wordCount,
          mode: entropyMode,
          ...(entropyMode !== 'csprng' && diceRolls ? { diceRolls } : {}),
          ...(entropyMode !== 'csprng' && hexEntropy.trim()
            ? { hexEntropy: hexEntropy.trim() }
            : {}),
        }
      : undefined;

    onConfirm(password, entropy, normalizedPassphrase);
    setDiceRolls('');
    setHexEntropy('');
    setPassphrase('');
    setPassphraseConfirm('');
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Create Password</h2>
        {showEntropyOptions && (
          <p className="text-sm text-neutral-300 leading-relaxed">
            Hot wallet: keys live in this browser session while unlocked. Electrum can see your address.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 rounded-xl border border-red-100/50 bg-red-200/10 text-red-100 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium text-neutral-200">
            Password
          </label>
          <div className="flex w-full flex-col justify-center gap-2 rounded-xl border border-white/7 bg-neutral-700 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7 h-12 px-5">
            <div className="flex w-full items-center justify-between gap-2">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(undefined);
                }}
                className="h-auto w-full truncate bg-transparent text-sm text-white outline-none focus:outline-none placeholder:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-20 max-mobile:text-base"
                placeholder="Enter your password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="inline-flex items-center justify-center bg-transparent p-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-4 stroke-2 text-neutral-200">
                  {showPassword ? (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </>
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-neutral-200">
            Confirm password
          </label>
          <div className="flex w-full flex-col justify-center gap-2 rounded-xl border border-white/7 bg-neutral-700 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7 h-12 px-5">
            <div className="flex w-full items-center justify-between gap-2">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(undefined);
                }}
                className="h-auto w-full truncate bg-transparent text-sm text-white outline-none focus:outline-none placeholder:text-neutral-200"
                placeholder="Confirm your password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="inline-flex items-center justify-center bg-transparent p-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-4 stroke-2 text-neutral-200">
                  {showConfirmPassword ? (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </>
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {allowPassphrase && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <input
                id="usePassphrase"
                type="checkbox"
                checked={usePassphrase}
                onChange={(e) => {
                  setUsePassphrase(e.target.checked);
                  if (!e.target.checked) {
                    setPassphrase('');
                    setPassphraseConfirm('');
                  }
                  setError(undefined);
                }}
                className="mt-1 w-4 h-4 rounded border-white/14 bg-neutral-800/75 text-white focus:ring-2 focus:ring-white/20"
              />
              <label htmlFor="usePassphrase" className="text-sm text-neutral-200 cursor-pointer">
                Use BIP39 passphrase
              </label>
            </div>
            {usePassphrase && (
              <>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Optional 25th word. Not your vault password. If you lose it, funds are unrecoverable even with the seed backup.
                </p>
                <div className="flex flex-col gap-2">
                  <label htmlFor="bip39Passphrase" className="text-sm font-medium text-neutral-200">
                    BIP39 passphrase
                  </label>
                  <div className="flex w-full flex-col justify-center gap-2 rounded-xl border border-white/7 bg-neutral-700 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7 h-12 px-5">
                    <div className="flex w-full items-center justify-between gap-2">
                      <input
                        id="bip39Passphrase"
                        type={showPassphrase ? 'text' : 'password'}
                        value={passphrase}
                        onChange={(e) => {
                          setPassphrase(e.target.value);
                          setError(undefined);
                        }}
                        className="h-auto w-full truncate bg-transparent text-sm text-white outline-none focus:outline-none placeholder:text-neutral-200"
                        placeholder="BIP39 passphrase"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="inline-flex items-center justify-center bg-transparent p-0"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-4 stroke-2 text-neutral-200">
                          {showPassphrase ? (
                            <>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </>
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                          )}
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="bip39PassphraseConfirm" className="text-sm font-medium text-neutral-200">
                    Confirm BIP39 passphrase
                  </label>
                  <div className="flex w-full flex-col justify-center gap-2 rounded-xl border border-white/7 bg-neutral-700 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7 h-12 px-5">
                    <input
                      id="bip39PassphraseConfirm"
                      type={showPassphrase ? 'text' : 'password'}
                      value={passphraseConfirm}
                      onChange={(e) => {
                        setPassphraseConfirm(e.target.value);
                        setError(undefined);
                      }}
                      className="h-auto w-full truncate bg-transparent text-sm text-white outline-none focus:outline-none placeholder:text-neutral-200"
                      placeholder="Confirm BIP39 passphrase"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {showEntropyOptions && (
          <div className="flex flex-col gap-3 rounded-xl border border-white/10 p-3">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-neutral-200">Recovery phrase length</p>
              <p className="text-xs text-neutral-400 leading-relaxed">
                24 words (256-bit) is the default. Choose 12 words only if you need a shorter seed.
              </p>
              <div className="flex gap-2">
                {([12, 24] as WordCount[]).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setWordCount(n);
                      setError(undefined);
                    }}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm border ${
                      wordCount === n
                        ? 'border-white/40 bg-neutral-600 text-white'
                        : 'border-white/14 bg-neutral-800/75 text-neutral-300'
                    }`}
                  >
                    {n} words
                    {n === MNEMONIC_WORD_COUNT ? ' (default)' : ''}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-left text-sm text-neutral-200 hover:text-white"
            >
              {showAdvanced ? 'Hide' : 'Show'} advanced entropy options
            </button>
            {showAdvanced ? (
              <>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Default entropy is browser CSPRNG. Mixed and user modes let you contribute dice rolls and/or hex entropy.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {(['csprng', 'mixed', 'user'] as EntropyMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setEntropyMode(m);
                        setError(undefined);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs border ${
                        entropyMode === m
                          ? 'border-white/40 bg-neutral-600 text-white'
                          : 'border-white/14 bg-neutral-800/75 text-neutral-300'
                      }`}
                    >
                      {m === 'csprng' ? 'CSPRNG' : m === 'mixed' ? 'Mixed' : 'User only'}
                    </button>
                  ))}
                </div>
                {entropyMode !== 'csprng' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-neutral-400">
                        Dice rolls (1–6), need ≥{diceNeed}
                        {diceRolls ? ` · ${diceRolls.length}` : ''}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={diceRolls}
                        onChange={(e) => {
                          setDiceRolls(e.target.value.replace(/[^1-6]/g, ''));
                          setError(undefined);
                        }}
                        className="h-11 px-3 rounded-xl border border-white/14 bg-neutral-800/75 text-sm text-white outline-none"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-neutral-400">
                        Hex entropy, need ≥{hexNeed} bytes
                        {hexBytes !== null ? ` · ${hexBytes}` : ''}
                      </label>
                      <input
                        type="text"
                        value={hexEntropy}
                        onChange={(e) => {
                          setHexEntropy(e.target.value);
                          setError(undefined);
                        }}
                        className="h-11 px-3 rounded-xl border border-white/14 bg-neutral-800/75 text-sm text-white outline-none font-mono"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="text-xs text-neutral-400">
                {entropyMode === 'csprng'
                  ? `Using ${wordCount}-word seed with browser CSPRNG entropy.`
                  : `Using ${wordCount}-word seed · entropy mode: ${entropyMode}. Expand to edit dice/hex.`}
              </p>
            )}
          </div>
        )}

        <div className="flex items-start gap-3">
          <input
            id="understood"
            type="checkbox"
            checked={understood}
            onChange={(e) => {
              setUnderstood(e.target.checked);
              setError(undefined);
            }}
            className="mt-1 w-4 h-4 rounded border-white/14 bg-neutral-800/75 text-white focus:ring-2 focus:ring-white/20"
          />
          <label htmlFor="understood" className="text-sm text-neutral-200 cursor-pointer">
            I understand that the password cannot be recovered
          </label>
        </div>

        <div className="flex gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-3 rounded-xl border border-white/14 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 transition-all font-medium"
            >
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={showEntropyOptions && !entropyReady}
            className="flex-1 px-4 py-3 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </form>
    </div>
  );
};
