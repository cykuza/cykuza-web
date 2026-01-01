'use client';

import React, { useState, useEffect, useRef } from 'react';

interface PasswordLockProps {
  isLocked: boolean;
  onUnlock: (password: string) => Promise<void>;
  onSetPassword: (password: string) => Promise<void>;
  onSetInitialPassword?: (password: string) => Promise<void>;
  requiresPassword: boolean;
  requiresInitialPassword?: boolean;
  error?: string;
}

export const PasswordLock: React.FC<PasswordLockProps> = ({
  isLocked,
  onUnlock,
  onSetPassword,
  onSetInitialPassword,
  requiresPassword,
  requiresInitialPassword,
  error,
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(error);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const isInitialPasswordMode = requiresInitialPassword === true;

  useEffect(() => {
    setErrorMessage(error);
  }, [error]);

  useEffect(() => {
    if ((isLocked || requiresInitialPassword) && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLocked, requiresInitialPassword]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(undefined);
    
    if (!password.trim()) {
      setErrorMessage('Password is required');
      return;
    }

    try {
      await onUnlock(password);
      setPassword('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid password');
      setPassword('');
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleInitialPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(undefined);

    if (!password.trim()) {
      setErrorMessage('Password is required');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    try {
      if (onSetInitialPassword) {
        await onSetInitialPassword(password);
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to set password');
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(undefined);

    if (!password.trim()) {
      setErrorMessage('Password is required');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    try {
      if (isInitialPasswordMode && onSetInitialPassword) {
        await onSetInitialPassword(password);
      } else {
        await onSetPassword(password);
      }
      setPassword('');
      setConfirmPassword('');
      setIsSettingPassword(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to set password');
    }
  };

  // Only show if wallet is actually locked
  // Don't show if wallet is unlocked (isLocked = false)
  // requiresPassword is for setting password on unlocked wallet, which shouldn't show unlock modal
  const shouldShow = isLocked || requiresInitialPassword === true;
  
  if (!shouldShow) {
    return null;
  }

  const title = isInitialPasswordMode 
    ? 'Set Wallet Password' 
    : isSettingPassword 
      ? 'Set Wallet Password' 
      : 'Unlock Wallet';

  return (
    <div className="rounded-xl border border-white/7 bg-neutral-800 p-6">
      <h3 className="font-bold mb-4 text-white text-lg">{title}</h3>
      <form onSubmit={isInitialPasswordMode ? handleInitialPassword : (isSettingPassword ? handleSetPassword : handleUnlock)} className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400 text-sm">
            {errorMessage}
          </div>
        )}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-neutral-200 mb-2">
            Password
          </label>
          <div className="flex w-full flex-col justify-center gap-2 rounded-xl border border-white/7 bg-neutral-700 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7 h-12 px-5">
            <div className="flex w-full items-center justify-between gap-2">
              <input
                ref={inputRef}
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage(undefined);
                }}
                className="h-auto w-full truncate bg-transparent text-sm text-white outline-none focus:outline-none placeholder:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-20 max-mobile:text-base"
                placeholder="Enter your password"
                autoComplete="current-password"
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
        </div>

        {(isSettingPassword || isInitialPasswordMode) && (
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-200 mb-2">
              Confirm Password
            </label>
            <div className="flex w-full flex-col justify-center gap-2 rounded-xl border border-white/7 bg-neutral-700 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7 h-12 px-5">
              <div className="flex w-full items-center justify-between gap-2">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setErrorMessage(undefined);
                  }}
                  className="h-auto w-full truncate bg-transparent text-sm text-white outline-none focus:outline-none placeholder:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-20 max-mobile:text-base"
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                />
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 bg-transparent m-0 space-y-0 p-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon" className="stroke-2 text-neutral-200">
                      {showConfirmPassword ? (
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
          </div>
        )}

        <div className="flex gap-3">
          {(isSettingPassword || isInitialPasswordMode) ? (
            <>
              {!isInitialPasswordMode && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingPassword(false);
                    setPassword('');
                    setConfirmPassword('');
                    setErrorMessage(undefined);
                  }}
                  className="flex-1 px-4 py-2 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="flex-1 px-4 py-2 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all"
              >
                Set Password
              </button>
            </>
          ) : (
            <>
              {requiresPassword && !isLocked && (
                <button
                  type="button"
                  onClick={() => setIsSettingPassword(true)}
                  className="flex-1 px-4 py-2 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all"
                >
                  Set Password
                </button>
              )}
              <button
                type="submit"
                className="flex-1 px-4 py-2 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all"
              >
                Unlock
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-neutral-400 mt-4">
          {isInitialPasswordMode || isSettingPassword
            ? 'Your password will be used to encrypt wallet data. Make sure to use a strong, unique password. You must set a password before creating or importing a wallet.'
            : 'Enter your password to access the wallet. The wallet will lock after 10 minutes of inactivity.'}
        </p>
      </form>
    </div>
  );
};

