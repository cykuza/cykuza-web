'use client';

import React, { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { isValidAddress } from '@/lib/wallet/address';
import { MAX_ADDRESS_BOOK_LABEL_LENGTH } from '@/lib/wallet/addressBook';

interface AddressBookViewProps {
  onBack: () => void;
}

export const AddressBookView: React.FC<AddressBookViewProps> = ({ onBack }) => {
  const {
    addressBook,
    networkType,
    addToAddressBook,
    removeFromAddressBook,
  } = useWallet();
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string>();

  const networkEntries = addressBook.filter((e) => e.network === networkType);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    const trimmedLabel = label.trim().slice(0, MAX_ADDRESS_BOOK_LABEL_LENGTH);
    const trimmedAddr = address.trim();
    if (!trimmedLabel) {
      setError('Label is required');
      return;
    }
    if (!isValidAddress(trimmedAddr, networkType)) {
      setError('Invalid address for the selected network');
      return;
    }
    try {
      addToAddressBook({ label: trimmedLabel, address: trimmedAddr });
      setLabel('');
      setAddress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add entry');
    }
  };

  return (
    <div className="flex size-full flex-col gap-4 px-6 py-5 max-standard:min-h-screen">
      <h2 className="text-xl font-bold text-white">Address book</h2>
      <p className="text-sm text-neutral-400">
        Saved recipients for {networkType}. Not a send gate — you still confirm the last 6 characters.
      </p>

      <form onSubmit={handleAdd} className="flex flex-col gap-3">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          maxLength={MAX_ADDRESS_BOOK_LABEL_LENGTH}
          className="h-11 px-3 rounded-xl border border-white/14 bg-neutral-800/75 text-sm text-white outline-none"
          autoComplete="off"
        />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Address"
          className="h-11 px-3 rounded-xl border border-white/14 bg-neutral-800/75 text-sm text-white outline-none font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className="h-11 rounded-xl border border-white/14 bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700"
        >
          Add
        </button>
      </form>

      <ul className="flex flex-col gap-2 mt-2">
        {networkEntries.length === 0 && (
          <li className="text-sm text-neutral-500">No saved addresses yet.</li>
        )}
        {networkEntries.map((entry) => (
          <li
            key={`${entry.network}:${entry.address}`}
            className="flex items-start justify-between gap-3 rounded-xl border border-white/7 bg-neutral-800 p-3"
          >
            <div className="min-w-0">
              <div className="text-sm text-white font-medium">{entry.label}</div>
              <div className="text-xs font-mono text-neutral-400 break-all">{entry.address}</div>
            </div>
            <button
              type="button"
              onClick={() => removeFromAddressBook(entry.address)}
              className="text-xs text-red-300 shrink-0"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

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
