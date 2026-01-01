'use client';

import { useState, useMemo, useRef, useEffect, useCallback, FormEvent } from 'react';
import { useWallet } from '@/context/WalletContext';
import { satsToCyb, cybToSats, estimateFee } from '@/lib/wallet/transaction';

const isValidCybAddress = (addr: string) => /^cy1[ac-hj-np-z02-9]{25,62}$/i.test(addr.trim());

interface SendViewProps {
  onBack: () => void;
  onInternalBack?: (handler: (() => void) | null) => void;
}

export const SendView = ({ onBack, onInternalBack }: SendViewProps) => {
  const { send, feeRate, balance, isLocked, setFeeRate, address, getUtxos, unlockWallet, passwordError: walletPasswordError } = useWallet();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [passwordError, setPasswordError] = useState<string>();
  const [txid, setTxid] = useState<string>();
  const [includeFee, setIncludeFee] = useState(true);
  const [feeRateOption, setFeeRateOption] = useState<'slow' | 'standard' | 'custom'>('standard');
  const [showFeeRateModal, setShowFeeRateModal] = useState(false);
  const [customFeeRate, setCustomFeeRate] = useState('');
  const [utxos, setUtxos] = useState<Array<{ txid: string; vout: number; value: number }>>([]);
  const feeRateDropdownRef = useRef<HTMLDivElement>(null);

  const numericAmount = parseFloat(amount) || 0;
  const balanceCy = satsToCyb(balance.confirmed);
  
  // Fetch UTXOs for fee estimation
  useEffect(() => {
    const fetchUtxos = async () => {
      try {
        const utxosList = await getUtxos();
        setUtxos(utxosList);
      } catch (err) {
        // Ignore errors - UTXOs will be fetched when sending
        setUtxos([]);
      }
    };
    if (address && !isLocked) {
      fetchUtxos();
    }
  }, [address, isLocked, getUtxos]);

  // Estimate fee based on current inputs
  const feeEstimate = useMemo(() => {
    if (!numericAmount || numericAmount <= 0) {
      return { estimatedFee: 0, actualAmountSats: 0, totalNeeded: 0 };
    }
    
    // If no UTXOs yet, estimate a minimal fee based on typical transaction size
    // This allows the form to work even before UTXOs are loaded
    if (!utxos.length) {
      const estimatedVSize = 10 + 1 * 68 + 2 * 31; // 1 input, 2 outputs (to + change)
      const estimatedFeeSats = Math.ceil(estimatedVSize * feeRate);
      const totalNeededSats = includeFee ? cybToSats(numericAmount) : (cybToSats(numericAmount) + estimatedFeeSats);
      return { 
        estimatedFee: estimatedFeeSats, 
        actualAmountSats: includeFee ? Math.max(0, cybToSats(numericAmount) - estimatedFeeSats) : cybToSats(numericAmount), 
        totalNeeded: totalNeededSats
      };
    }
    
    try {
      return estimateFee({
        amountSats: cybToSats(numericAmount),
        feeRate,
        utxos,
        includeFee,
      });
    } catch (err) {
      return { estimatedFee: 0, actualAmountSats: 0, totalNeeded: 0 };
    }
  }, [numericAmount, feeRate, utxos, includeFee]);

  const estimatedFeeCy = satsToCyb(feeEstimate.estimatedFee);
  const totalNeededCy = feeEstimate.totalNeeded > 0 ? satsToCyb(feeEstimate.totalNeeded) : 0;

  // Validate address format
  const trimmedTo = to.trim();
  const isValidAddress = trimmedTo && isValidCybAddress(trimmedTo);

  // Check if balance is sufficient
  // If fee estimate is 0 (UTXOs not loaded), add a small buffer for fee estimation
  // Use a conservative estimate: amount + estimated fee (even if not calculated yet)
  const totalNeededForCheck = totalNeededCy > 0 
    ? totalNeededCy 
    : (numericAmount > 0 ? numericAmount + estimatedFeeCy + 0.0001 : 0); // Small buffer if fee not calculated yet
  const insufficient = numericAmount <= 0 || totalNeededForCheck > balanceCy;
  
  // Validate custom fee rate if selected
  const customFeeRateValid = feeRateOption !== 'custom' || (customFeeRate && !isNaN(parseFloat(customFeeRate)) && parseFloat(customFeeRate) > 0);
  
  // Form is valid if all conditions are met
  const isFormValid = isValidAddress && numericAmount > 0 && !insufficient && !isLocked && customFeeRateValid;

  // Update fee rate based on selection
  useEffect(() => {
    if (feeRateOption === 'slow') {
      setFeeRate(50);
    } else if (feeRateOption === 'standard') {
      setFeeRate(200);
    } else if (feeRateOption === 'custom' && customFeeRate) {
      const customRate = parseFloat(customFeeRate);
      if (!isNaN(customRate) && customRate > 0) {
        setFeeRate(customRate);
      }
    }
  }, [feeRateOption, customFeeRate, setFeeRate]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (isValidCybAddress(text)) {
        setTo(text);
      }
    } catch (err) {
      // Clipboard access denied
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!isValidCybAddress(to)) {
      setError('Invalid Cyberyen bech32 address');
      return;
    }
    if (insufficient) {
      setError('Insufficient balance');
      return;
    }
    setShowConfirmation(true);
    setPassword('');
    setPasswordVerified(false);
    setPasswordError(undefined);
  };

  const handlePasswordVerify = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(undefined);
    
    if (!password.trim()) {
      setPasswordError('Password is required');
      return;
    }

    try {
      await unlockWallet(password);
      setPasswordVerified(true);
      setPasswordError(undefined);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : walletPasswordError || 'Invalid password';
      setPasswordError(errorMsg);
      setPasswordVerified(false);
    }
  };

  const confirmSend = async () => {
    if (!passwordVerified) {
      setError('Please verify your password first');
      return;
    }
    
    setBusy(true);
    try {
      const res = await send(to.trim(), numericAmount, includeFee);
      setTxid(res.txid);
      // Reset form on success
      setTimeout(() => {
        setTo('');
        setAmount('');
        setError(undefined);
        setTxid(undefined);
        setShowConfirmation(false);
        setPassword('');
        setPasswordVerified(false);
        onBack();
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send transaction');
    } finally {
      setBusy(false);
    }
  };

  const handleBack = useCallback(() => {
    if (!busy) {
      if (showConfirmation) {
        // Go back to form step
        setShowConfirmation(false);
        setPassword('');
        setPasswordVerified(false);
        setPasswordError(undefined);
      } else {
        // Go back to main wallet page
        setTo('');
        setAmount('');
        setError(undefined);
        setTxid(undefined);
        onBack();
      }
    }
  }, [busy, showConfirmation, onBack]);

  // Register/unregister internal back handler with parent
  useEffect(() => {
    if (onInternalBack) {
      // When in confirmation step, register our handleBack
      // When not in confirmation, unregister (null) so parent handles it
      onInternalBack(showConfirmation ? handleBack : null);
    }
    // Cleanup: unregister when component unmounts
    return () => {
      if (onInternalBack) {
        onInternalBack(null);
      }
    };
  }, [showConfirmation, handleBack, onInternalBack]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (feeRateDropdownRef.current && !feeRateDropdownRef.current.contains(event.target as Node)) {
        setShowFeeRateModal(false);
      }
    };

    if (showFeeRateModal) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFeeRateModal]);

  return (
    <>
      <div className="flex size-full flex-col gap-6 px-6 py-5 max-standard:min-h-screen relative">
        {/* Content */}
        <div className="flex flex-1 w-full flex-col gap-4 overflow-y-auto">
          {!showConfirmation ? (
            <form className="flex flex-1 w-full flex-col gap-6 min-h-0" onSubmit={handleSubmit}>
            {/* Amount Field */}
            <div className="flex w-full flex-col gap-2">
              <div className="flex w-full flex-col gap-2 rounded-xl border border-white/7 bg-neutral-700 px-5 py-4 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7">
                <label className="font-medium text-neutral-200 text-xs">Amount</label>
                <input
                  autoComplete="off"
                  className="h-auto w-full truncate bg-transparent text-white outline-none focus:outline-none placeholder:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-20 text-3xl max-mobile:text-3xl"
                  placeholder="0"
                  inputMode="decimal"
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, '');
                    setAmount(value);
                    setError(undefined);
                  }}
                  name="amount"
                />
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between">
                    <span className="text-neutral-200 text-xs">
                      Balance: <span className="text-white">{balanceCy.toFixed(8)} CY</span>
                    </span>
                  </div>
                  {numericAmount > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">
                        {includeFee ? 'Recipient gets:' : 'Amount to send:'} <span className="text-white">{numericAmount.toFixed(8)} CY</span>
                      </span>
                      <span className="text-neutral-400">
                        Fee: <span className="text-white">{estimatedFeeCy.toFixed(8)} CY</span>
                      </span>
                    </div>
                  )}
                  {numericAmount > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">
                        Total: <span className="text-white">{totalNeededCy.toFixed(8)} CY</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Receiver Address Field */}
              <div className="flex w-full flex-col gap-2">
                <label className="font-medium text-neutral-200 text-xs">Receiver address</label>
                <div className="flex w-full flex-col justify-center gap-2 rounded-xl border border-white/7 bg-neutral-700 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7 h-12 px-5">
                  <div className="flex w-full items-center justify-between gap-2">
                    <input
                      autoComplete="off"
                      className="h-auto w-full truncate bg-transparent text-sm text-white outline-none focus:outline-none placeholder:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-20 max-mobile:text-base"
                      placeholder="Enter receiver address"
                      value={to}
                      onChange={(e) => {
                        setTo(e.target.value);
                        setError(undefined);
                      }}
                      name="toAddress"
                    />
                    <button
                      type="button"
                      onClick={handlePaste}
                      className="inline-flex items-center justify-center shrink-0 p-0 m-0"
                      aria-label="Paste address"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20" className="size-4 text-neutral-200">
                        <path stroke="#F0F0F0" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M1.9 5.5V3.7a1.8 1.8 0 0 1 1.8-1.8h1.8m9 0h1.8a1.8 1.8 0 0 1 1.8 1.8v1.8m0 9v1.8a1.8 1.8 0 0 1-1.8 1.8h-1.8m-9 0H3.7a1.8 1.8 0 0 1-1.8-1.8v-1.8"></path>
                        <path fill="currentColor" stroke="#F0F0F0" d="M1.9 9.6a.4.4 0 1 1-.001.8.4.4 0 0 1 .001-.8Zm4.05 0a.4.4 0 1 1-.001.8.4.4 0 0 1 .001-.8Zm4.05 0a.4.4 0 1 1 0 .801.4.4 0 0 1 0-.8Zm4.05 0a.4.4 0 1 1 0 .801.4.4 0 0 1 0-.8Zm4.05 0a.4.4 0 1 1-.001.801.4.4 0 0 1 0-.8Z"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Fee Rate Selector */}
            <div className="flex w-full flex-col gap-2 relative" ref={feeRateDropdownRef}>
              <button
                type="button"
                role="combobox"
                aria-expanded={showFeeRateModal}
                aria-controls="fee-rate-dropdown"
                aria-autocomplete="none"
                data-state={showFeeRateModal ? 'open' : 'closed'}
                className={`space-nowrap group flex select-none items-center justify-between gap-2.5 bg-neutral-800 px-5 font-medium text-sm text-white shadow-xs outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-white border border-white/7 h-12 w-full transition-colors hover:bg-neutral-700/50 ${
                  showFeeRateModal ? 'rounded-t-xl' : 'rounded-xl'
                }`}
                onClick={() => setShowFeeRateModal(!showFeeRateModal)}
              >
                <span style={{ pointerEvents: 'none' }} className="text-sm leading-5 whitespace-nowrap">
                  {feeRateOption === 'slow' ? 'Slow (50 rin/Vb)' : feeRateOption === 'standard' ? `Standard (${feeRate} rin/Vb)` : feeRateOption === 'custom' && customFeeRate ? `Custom (${customFeeRate} rin/Vb)` : 'Custom'}
                </span>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  strokeWidth="1.5" 
                  stroke="currentColor" 
                  aria-hidden="true" 
                  data-slot="icon" 
                  className="size-4 opacity-50 transition-transform duration-150 group-data-[state=open]:rotate-180 shrink-0"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"></path>
                </svg>
              </button>

              {/* Hidden select for accessibility */}
              <select
                aria-hidden="true"
                tabIndex={-1}
                className="absolute border-0 w-px h-px p-0 -m-px overflow-hidden clip-[rect(0,0,0,0)] whitespace-nowrap"
                style={{ position: 'absolute', overflow: 'hidden', clip: 'rect(0px, 0px, 0px, 0px)' }}
              >
                <option value="slow">Slow (50 rin/Vb)</option>
                <option value="standard" selected={feeRateOption === 'standard'}>Standard ({feeRate} rin/Vb)</option>
                <option value="custom">Custom</option>
              </select>

              {/* Dropdown List */}
              {showFeeRateModal && (
                <div className="absolute top-full left-0 right-0 z-[70] rounded-b-xl border-t-0 border border-white/14 bg-neutral-800 shadow-lg overflow-hidden">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => {
                        setFeeRateOption('slow');
                        setShowFeeRateModal(false);
                      }}
                      className={`flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors ${
                        feeRateOption === 'slow'
                          ? 'bg-neutral-700 text-white'
                          : 'text-neutral-200 hover:bg-neutral-700/50'
                      }`}
                    >
                      <span className="text-sm leading-5">Slow</span>
                      <span className="text-xs text-neutral-400 leading-4">50 rin/Vb</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setFeeRateOption('standard');
                        setShowFeeRateModal(false);
                      }}
                      className={`flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors ${
                        feeRateOption === 'standard'
                          ? 'bg-neutral-700 text-white'
                          : 'text-neutral-200 hover:bg-neutral-700/50'
                      }`}
                    >
                      <span className="text-sm leading-5">Standard</span>
                      <span className="text-xs text-neutral-400 leading-4">200 rin/Vb</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setFeeRateOption('custom');
                        setShowFeeRateModal(false);
                      }}
                      className={`flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors rounded-b-xl ${
                        feeRateOption === 'custom'
                          ? 'bg-neutral-700 text-white'
                          : 'text-neutral-200 hover:bg-neutral-700/50'
                      }`}
                    >
                      <span className="text-sm leading-5">Custom</span>
                      <span className="text-xs text-neutral-400 leading-4">Enter rate</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Custom Fee Rate Input - shown inline when custom is selected */}
              {feeRateOption === 'custom' && !showFeeRateModal && (
                <div className="flex w-full flex-col gap-2">
                  <label className="text-sm font-medium text-neutral-200">Custom Fee Rate (rin/Vb)</label>
                  <div className="flex w-full flex-col justify-center gap-2 rounded-xl border border-white/7 bg-neutral-700 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7 h-12 px-5">
                    <input
                      type="number"
                      value={customFeeRate}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.]/g, '');
                        setCustomFeeRate(value);
                      }}
                      className="h-auto w-full truncate bg-transparent text-sm text-white outline-none focus:outline-none placeholder:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-20"
                      placeholder="Enter fee rate"
                      min="1"
                      step="1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Include Fee Checkbox */}
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={includeFee}
                data-state={includeFee ? 'checked' : 'unchecked'}
                className={`peer relative shrink-0 rounded-md border border-neutral-600 bg-neutral-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-neutral-600 data-[state=checked]:bg-neutral-600 data-[state=checked]:text-white size-5 ${includeFee ? 'data-[state=checked]' : ''}`}
                onClick={() => setIncludeFee(!includeFee)}
                id="includeFee"
              >
                <span data-state={includeFee ? 'checked' : 'unchecked'} className="flex items-center justify-center text-current" style={{ pointerEvents: 'none' }}>
                  {includeFee && (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon" className="size-3 stroke-[3.5px]!">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"></path>
                    </svg>
                  )}
                </span>
              </button>
              <label htmlFor="includeFee" className="font-medium text-xs text-neutral-200 cursor-pointer">
                Include fee in the amount
              </label>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            {txid && <p className="text-sm text-green-400">Broadcasted txid: {txid}</p>}
            
            {/* Validation feedback */}
            {!isValidAddress && to.trim() && (
              <p className="text-red-400 text-sm">Invalid Cyberyen address format</p>
            )}
            {numericAmount > 0 && insufficient && (
              <p className="text-red-400 text-sm">
                Insufficient balance. Need {totalNeededCy.toFixed(8)} CY, have {balanceCy.toFixed(8)} CY
              </p>
            )}

            {/* Continue Button - Always visible at bottom */}
            <div className="mt-auto pt-4 w-full">
              <button
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-12 w-full"
                disabled={!isFormValid || busy}
                type="submit"
              >
                {busy ? 'Processing...' : 'Continue'}
              </button>
            </div>
          </form>
          ) : (
            /* Confirmation Step */
            <div className="flex flex-1 w-full flex-col gap-6 min-h-0">
              <div className="flex flex-col gap-6">
                <h2 className="text-xl font-bold text-white">Confirm Transaction</h2>
                
                {/* Transaction Details */}
                <div className="flex flex-col gap-4 rounded-xl border border-white/7 bg-neutral-800 p-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-neutral-400">Amount</span>
                    <span className="text-lg font-medium text-white">{totalNeededCy.toFixed(8)} CY</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-neutral-400">Recipient Address</span>
                    <span className="text-sm font-mono break-all text-neutral-200">{to.trim()}</span>
                  </div>
                </div>

                {/* Password Input */}
                {!passwordVerified ? (
                  <form onSubmit={handlePasswordVerify} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-neutral-200">Enter Password</label>
                      <div className="flex w-full flex-col justify-center gap-2 rounded-xl border border-white/7 bg-neutral-700 transition-colors focus-within:bg-neutral-600 focus-within:border-white/7 h-12 px-5">
                        <div className="flex w-full items-center justify-between gap-2">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              setPasswordError(undefined);
                            }}
                            className="h-auto w-full truncate bg-transparent text-sm text-white outline-none focus:outline-none placeholder:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-20 max-mobile:text-base"
                            placeholder="Enter your wallet password"
                            autoComplete="current-password"
                            autoFocus
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
                      {passwordError && (
                        <p className="text-sm text-red-400">{passwordError}</p>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-12 w-full"
                      disabled={!password.trim() || busy}
                    >
                      Unlock Wallet
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm text-green-400">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="size-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      Password verified
                    </div>
                  </div>
                )}
              </div>

              {/* Send Button - Only shown after password verification */}
              {passwordVerified && (
                <div className="mt-auto pt-4 w-full">
                  <button
                    onClick={confirmSend}
                    disabled={busy}
                    className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45 h-12 transition-all hover:opacity-100 w-full ${
                      busy
                        ? 'bg-neutral-800 text-neutral-200 opacity-45 cursor-not-allowed'
                        : 'bg-white text-black hover:bg-neutral-100 opacity-80 disabled:text-neutral-600'
                    }`}
                  >
                    {busy ? 'Broadcasting…' : 'Send'}
                  </button>
                </div>
              )}

              {error && <p className="text-red-400 text-sm">{error}</p>}
              {txid && <p className="text-sm text-green-400">Transaction broadcasted! TXID: {txid}</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

