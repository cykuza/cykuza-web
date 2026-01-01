'use client';

import React, { useState } from 'react';

interface PasswordCreationProps {
  onConfirm: (password: string) => void;
  onBack?: () => void;
}

export const PasswordCreation: React.FC<PasswordCreationProps> = ({ onConfirm, onBack }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
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

    onConfirm(password);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Create Password</h2>
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
          <button
            type="submit"
            className="flex-1 px-4 py-3 rounded-xl border border-white/14 bg-neutral-800/75 text-white hover:bg-neutral-700 transition-all font-medium"
          >
            Next
          </button>
        </div>
      </form>
    </div>
  );
};

