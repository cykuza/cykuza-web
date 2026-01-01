'use client';

interface ImportMethodProps {
  onSelectMnemonic: () => void;
  onSelectPrivateKey: () => void;
}

export const ImportMethod = ({ onSelectMnemonic, onSelectPrivateKey }: ImportMethodProps) => {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Import Wallet</h2>
        <p className="text-sm text-neutral-200">Choose how you want to import your wallet</p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onSelectMnemonic}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-12 opacity-80 transition-all hover:opacity-100"
        >
          <div className="font-medium mb-1">Import Mnemonic</div>
        </button>

        <button
          type="button"
          onClick={onSelectPrivateKey}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-12 opacity-80 transition-all hover:opacity-100"
        >
          <div className="font-medium mb-1">Import Private Key</div>
        </button>
      </div>
    </div>
  );
};