'use client';

import React, { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { cybToSats, satsToCyb } from '@/lib/wallet/transaction';

interface DailySpendViewProps {
  onBack: () => void;
}

export const DailySpendView: React.FC<DailySpendViewProps> = ({ onBack }) => {
  const { dailySpendLimitSats, setDailySpendLimitSats } = useWallet();
  const [cybInput, setCybInput] = useState(
    dailySpendLimitSats && dailySpendLimitSats > 0
      ? String(satsToCyb(dailySpendLimitSats))
      : ''
  );
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSaved(false);
    const trimmed = cybInput.trim();
    if (!trimmed) {
      setDailySpendLimitSats(null);
      setSaved(true);
      return;
    }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter a non-negative CY amount, or leave empty to disable');
      return;
    }
    if (n === 0) {
      setDailySpendLimitSats(null);
      setSaved(true);
      return;
    }
    setDailySpendLimitSats(cybToSats(n));
    setSaved(true);
  };

  const handleClear = () => {
    setCybInput('');
    setDailySpendLimitSats(null);
    setSaved(true);
    setError(undefined);
  };

  return (
    <div className="flex size-full flex-col gap-4 px-6 py-5 max-standard:min-h-screen">
      <h2 className="text-xl font-bold text-white">Daily spend limit</h2>
      <p className="text-sm text-neutral-400">
        Optional cap on CY sent per local calendar day. Exceeding requires an allow-once confirmation on send.
        Leave empty to disable.
      </p>

      <form onSubmit={handleSave} className="flex flex-col gap-3">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && !error && (
          <p className="text-sm text-green-400">Saved.</p>
        )}
        <label className="text-sm text-neutral-200">Limit (CY)</label>
        <input
          type="text"
          inputMode="decimal"
          value={cybInput}
          onChange={(e) => {
            setCybInput(e.target.value);
            setSaved(false);
          }}
          placeholder="Disabled"
          className="h-11 px-3 rounded-xl border border-white/14 bg-neutral-800/75 text-sm text-white outline-none"
          autoComplete="off"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 h-11 rounded-xl border border-white/14 bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="h-11 px-4 rounded-xl border border-white/14 bg-neutral-900 text-neutral-200 text-sm"
          >
            Disable
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="mt-auto h-11 rounded-xl border border-white/14 bg-neutral-900 text-neutral-200 text-sm"
      >
        Back
      </button>
    </div>
  );
};
