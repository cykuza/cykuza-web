'use client';

import React, { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import * as bip39 from 'bip39';

interface MnemonicViewProps {
  onBack: () => void;
  onClose: () => void;
}

export const MnemonicView: React.FC<MnemonicViewProps> = ({ onBack, onClose }) => {
  const { getMnemonic, unlockWallet, passwordError } = useWallet();
  const [passwordConfirmed, setPasswordConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>();

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    try {
      // Verify password by attempting to unlock (this will throw if password is wrong)
      await unlockWallet(password);
      setPasswordConfirmed(true);
      setError(undefined);
    } catch (err: any) {
      const errorMsg = err.message || passwordError || 'Invalid password';
      setError(errorMsg);
    }
  };

  // Always show password confirmation first
  if (!passwordConfirmed) {
    return (
      <div className="flex size-full flex-col gap-6 px-6 py-5 max-standard:min-h-screen">
        <form className="w-full" onSubmit={handlePasswordSubmit}>
          <div className="flex w-full flex-col justify-center gap-2 rounded-xl border border-white/7 bg-neutral-700 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7 h-12 px-5">
            <div className="flex w-full items-center justify-between gap-2">
              <input
                autoComplete="off"
                className="h-auto w-full truncate bg-transparent text-sm text-white outline-none focus:outline-none placeholder:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-20 max-mobile:text-base"
                placeholder="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(undefined);
                }}
              />
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 bg-transparent m-0 space-y-0 p-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon" className="stroke-2 text-neutral-200">
                    {showPassword ? (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"></path>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path>
                      </>
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"></path>
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {error && (
            <p className="text-red-400 text-sm mt-2">{error}</p>
          )}
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-12 mt-6 w-full"
            disabled={!password.trim()}
          >
            Continue
          </button>
        </form>
      </div>
    );
  }

  // SECURITY: Get mnemonic securely from ref (not exposed in React state)
  const mnemonic = getMnemonic();

  // Show mnemonic
  if (!mnemonic) {
    return (
      <div className="flex size-full flex-col gap-6 px-6 py-5 max-standard:min-h-screen">
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
          <p className="text-red-400 text-sm">Mnemonic not available</p>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }
  
  // Check if the stored value is actually a valid mnemonic
  // (For private key imports, the private key is stored in mnemonic ref)
  const isValidMnemonic = bip39.validateMnemonic(mnemonic);
  
  // If not a valid mnemonic, show error message
  if (!isValidMnemonic) {
    return (
      <div className="flex size-full flex-col gap-6 px-6 py-5 max-standard:min-h-screen">
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
          <p className="text-red-400 text-sm">Mnemonic not available</p>
          <p className="text-neutral-200 text-xs text-center">
            This wallet was imported from a private key. Mnemonics are only available for wallets created from seed phrases.
          </p>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const words = mnemonic.split(' ');

  return (
    <div className="flex size-full flex-col gap-6 px-6 py-5 max-standard:min-h-screen">
      {/* Content */}
      <div className="flex h-full w-full flex-col gap-4">
        {/* Warning Box */}
        <div className="flex items-center gap-2.5 rounded-xl border p-4 font-medium text-white/75 text-xs border-yellow-200 bg-yellow-200/10 [&_svg]:text-yellow-200">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 22 20" className="shrink-0 size-5">
            <path fill="currentColor" d="M0 5c0-2.761 2.455-5 5.484-5h10.968c3.028 0 5.483 2.239 5.483 5v10c0 2.761-2.455 5-5.483 5H5.484C2.455 20 0 17.761 0 15zm5.484-3c-1.817 0-3.29 1.343-3.29 3v10c0 1.657 1.473 3 3.29 3h10.968c1.817 0 3.29-1.343 3.29-3V5c0-1.657-1.473-3-3.29-3z"></path>
            <path fill="currentColor" d="M10.979 5c.605 0 1.097.448 1.097 1v4c0 .552-.492 1-1.097 1-.606 0-1.097-.448-1.097-1V6c0-.552.491-1 1.097-1M9.87 14c0-.552.491-1 1.097-1h.01c.606 0 1.098.448 1.098 1s-.492 1-1.097 1h-.011c-.606 0-1.097-.448-1.097-1"></path>
          </svg>
          Write these 12 words in the correct order and keep them in a secure place.
        </div>

        {/* Mnemonic Words Grid */}
        <div 
          className="relative w-full cursor-pointer rounded-xl border border-white/7 bg-neutral-800 px-4 py-5 transition-colors hover:bg-neutral-700"
          onClick={() => navigator.clipboard?.writeText(mnemonic)}
        >
          <div className="grid w-full grid-cols-2 gap-x-5 gap-y-6 text-sm">
            {words.map((word, index) => (
              <div key={index} className="flex items-center gap-1.5 text-left text-sm">
                <span className="block min-w-[2rem] text-neutral-200 font-mono text-right">{index + 1}.</span>
                <p className="w-full flex-1 font-medium">{word}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-2 flex flex-col gap-2">
          <button
            onClick={() => {
              if (mnemonic) {
                navigator.clipboard?.writeText(mnemonic);
              }
            }}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 bg-white text-black hover:bg-neutral-100 disabled:text-neutral-600 h-12"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <path fill="currentColor" fillRule="evenodd" d="M7.556 4.222h8.66c1.24 0 1.688.13 2.14.371.453.243.808.598 1.05 1.05.243.453.372.901.372 2.14v8.661a1.111 1.111 0 1 0 2.222 0V7.698c0-1.981-.207-2.7-.593-3.425a4.04 4.04 0 0 0-1.68-1.68C19.002 2.207 18.283 2 16.302 2H7.556a1.111 1.111 0 1 0 0 2.222m8.578 2.594c-.452-.243-.9-.372-2.14-.372H5.561c-1.239 0-1.688.13-2.14.372a2.52 2.52 0 0 0-1.05 1.05c-.242.452-.371.9-.371 2.14v8.433c0 1.238.129 1.688.371 2.14a2.53 2.53 0 0 0 1.05 1.05c.452.242.901.371 2.14.371h8.433c1.238 0 1.688-.129 2.14-.371a2.53 2.53 0 0 0 1.05-1.05c.243-.452.372-.901.372-2.14v-8.433c0-1.24-.13-1.688-.372-2.14a2.52 2.52 0 0 0-1.05-1.05" clipRule="evenodd"></path>
            </svg>
            Copy mnemonic
          </button>
        </div>
      </div>
    </div>
  );
};

