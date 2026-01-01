'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { WarningGate } from '@/components/wallet/WarningGate';
import { PasswordLock } from '@/components/wallet/PasswordLock';
import { PasswordCreation } from '@/components/wallet/PasswordCreation';
import { MnemonicDisplay } from '@/components/wallet/MnemonicDisplay';
import { MnemonicInput } from '@/components/wallet/MnemonicInput';
import { ImportMethod } from '@/components/wallet/ImportMethod';
import { PrivateKeyImport } from '@/components/wallet/PrivateKeyImport';
import { useWallet } from '@/context/WalletContext';
import { ReceiveView } from '@/components/wallet/ReceiveView';
import { SendView } from '@/components/wallet/SendView';
import { MnemonicView } from '@/components/wallet/MnemonicView';
import { PrivateKeyView } from '@/components/wallet/PrivateKeyView';
import { ServerConfigView } from '@/components/wallet/ServerConfigView';
import { satsToCyb } from '@/lib/wallet/transaction';
import { useWalletOverlay } from '@/context/WalletOverlayContext';

export default function WalletOverlay() {
 const router = useRouter();
 const { isOpen, close } = useWalletOverlay();
  const { 
   accepted, 
   stage, 
   status, 
   balance, 
   history, 
   address, 
   refresh, 
   createNewWallet, 
   importWallet,
   isLocked,
   requiresPassword,
   passwordError,
   setPassword,
   unlockWallet,
   confirmPassword,
   confirmMnemonic,
   pendingMnemonic,
   pendingPassword,
   networkType,
   lockWallet,
   goBack,
   importFromMnemonic,
   importFromPrivateKey,
   importMnemonicWithPassword,
   setStage,
   setPendingMnemonic,
   setImportType,
   getMnemonic,
   endSession,
   updateActivity
  } = useWallet();
  const [info, setInfo] = useState<string>();
  const [showSettings, setShowSettings] = useState(false);
  const sendViewBackHandlerRef = useRef<(() => void) | null>(null);

 useEffect(() => {
  if (stage === 'ready') {
   const load = async () => {
    try {
     await refresh();
     setInfo(undefined);
    } catch (err: unknown) {
     setInfo(err instanceof Error ? err.message : 'An error occurred');
    }
   };
   load();
  }
 }, [stage, refresh]);

 if (!isOpen) return null;

 return (
  <>
   <WarningGate />
   {/* Backdrop */}
   <div
    className="fixed inset-0 bg-black/50 z-40"
    onClick={close}
    aria-hidden="true"
   />
   {/* Wallet Sidebar */}
   <div
    role="dialog"
    aria-labelledby="wallet-title"
    className="fixed z-50 gap-4 shadow-lg transition ease-in-out inset-y-0 right-0 h-full w-full sm:w-3/4 sm:max-w-sm border-l border-none bg-transparent p-3 max-[640px]:p-0 overflow-y-auto"
    tabIndex={-1}
    style={{ pointerEvents: 'auto' }}
   >
    <div className="flex h-full rounded-xl border border-white/14 bg-black/80 max-[640px]:rounded-none max-[640px]:border-none relative overflow-hidden">
     <div className="h-full w-full rounded-xl">
      <div className="z-10 flex h-full min-h-full flex-col gap-6 px-6 py-5 pt-12">
       {/* Header buttons - Back (left), Address (center when ready), and Settings/Close (right) */}
       <div className="absolute top-0 left-0 right-0 z-10 p-8 flex items-center justify-between">
        {/* Back button - shown when not on idle or ready stage, or when settings is open */}
        {((stage !== 'idle' && stage !== 'ready') || showSettings) && (
         <button
          onClick={() => {
           // If settings is open, close it
           if (showSettings) {
            setShowSettings(false);
           } else if (stage === 'send' && sendViewBackHandlerRef.current) {
            // If SendView has an internal back handler (e.g., in confirmation step), use it
            sendViewBackHandlerRef.current();
           } else if (stage === 'send' || stage === 'receive' || stage === 'server-config' || stage === 'mnemonic-view' || stage === 'private-key-view') {
            // These stages should go back to ready (or settings if coming from settings)
            if (stage === 'server-config' || stage === 'mnemonic-view' || stage === 'private-key-view') {
             setStage('ready');
             setShowSettings(true);
            } else {
             setStage('ready');
            }
           } else {
            goBack();
           }
           setInfo(undefined);
          }}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 m-0 w-[42px] h-[42px] shrink-0 p-0 border-none"
          aria-label="Back"
         >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" className="size-6 text-white">
           <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"></path>
          </svg>
         </button>
        )}
        {/* Spacer when back button is not shown */}
        {stage === 'idle' || (stage === 'ready' && !showSettings) ? <div className="w-[42px]"></div> : null}
        
        {/* Title/Address - shown in center */}
        <div className="flex-1 flex justify-center px-4">
         {stage === 'ready' && !isLocked && address && !showSettings ? (
          <button
           onClick={() => {
            if (address) {
             navigator.clipboard?.writeText(address);
            }
           }}
           className="justify-center whitespace-nowrap rounded-xl transition-colors disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 bg-transparent m-0 space-y-0 p-0 flex items-center gap-1 font-medium text-neutral-200 text-xs"
           title={address}
          >
           <span>
            {address.length > 12 
              ? `${address.slice(0, 6)}...${address.slice(-6)}`
              : address}
           </span>
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="size-2.5">
            <path fill="currentColor" fillRule="evenodd" d="M7.556 4.222h8.66c1.24 0 1.688.13 2.14.371.453.243.808.598 1.05 1.05.243.453.372.901.372 2.14v8.661a1.111 1.111 0 1 0 2.222 0V7.698c0-1.981-.207-2.7-.593-3.425a4.04 4.04 0 0 0-1.68-1.68C19.002 2.207 18.283 2 16.302 2H7.556a1.111 1.111 0 1 0 0 2.222m8.578 2.594c-.452-.243-.9-.372-2.14-.372H5.561c-1.239 0-1.688.13-2.14.372a2.52 2.52 0 0 0-1.05 1.05c-.242.452-.371.9-.371 2.14v8.433c0 1.238.129 1.688.371 2.14a2.53 2.53 0 0 0 1.05 1.05c.452.242.901.371 2.14.371h8.433c1.238 0 1.688-.129 2.14-.371a2.53 2.53 0 0 0 1.05-1.05c.243-.452.372-.901.372-2.14v-8.433c0-1.24-.13-1.688-.372-2.14a2.52 2.52 0 0 0-1.05-1.05" clipRule="evenodd"></path>
           </svg>
          </button>
         ) : stage === 'server-config' ? (
          <span className="truncate font-medium text-sm text-white">Network</span>
        ) : stage === 'mnemonic-view' ? (
          <span className="truncate font-medium text-sm text-white">Confirm password</span>
        ) : stage === 'private-key-view' ? (
          <span className="truncate font-medium text-sm text-white">Confirm password</span>
         ) : stage === 'send' ? (
          <span className="truncate font-medium text-sm text-white">Send</span>
         ) : stage === 'receive' ? (
          <span className="truncate font-medium text-sm text-white">Receive</span>
         ) : showSettings ? (
          <span className="truncate font-medium text-sm text-white">Wallet settings</span>
         ) : null}
        </div>
        
        {/* Settings and Close buttons */}
        <div className="flex items-center gap-3">
         {stage === 'ready' && !isLocked && !showSettings && (
          <button
           onClick={() => setShowSettings(true)}
           className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 m-0 w-[42px] h-[42px] shrink-0 p-0 border-none"
           aria-label="Settings"
          >
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-6 shrink-0">
            <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clipRule="evenodd"></path>
           </svg>
          </button>
         )}
         <button
          onClick={close}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 m-0 w-[42px] h-[42px] shrink-0 p-0 border-none"
          aria-label="Close"
         >
          <svg
           xmlns="http://www.w3.org/2000/svg"
           width="24"
           height="24"
           viewBox="0 0 24 24"
           fill="none"
           stroke="currentColor"
           strokeWidth="2"
           strokeLinecap="round"
           strokeLinejoin="round"
           className="lucide lucide-x"
           aria-hidden="true"
          >
           <path d="M18 6 6 18"></path>
           <path d="m6 6 12 12"></path>
          </svg>
         </button>
        </div>
       </div>

       {/* Content based on wallet stage */}
       <div className="flex-1 overflow-y-auto space-y-6 mt-12">
        {info && <p className="text-sm text-red-400">{info}</p>}

        {/* Initial state: Show create/import buttons */}
        {stage === 'idle' && (
         <div className="flex flex-col items-center justify-center gap-2.5 min-h-[200px]">
          <div className="flex w-full flex-col gap-3.5">
           <button
            onClick={async () => {
             try {
              await createNewWallet();
             } catch (err: unknown) {
              setInfo(err instanceof Error ? err.message : 'Failed to create wallet');
             }
            }}
            disabled={!accepted}
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45 h-12 transition-all hover:opacity-100 ${
             accepted
              ? 'bg-white text-black hover:bg-neutral-100 opacity-80 disabled:text-neutral-600'
              : 'bg-neutral-800 text-neutral-200 opacity-45 cursor-not-allowed'
            }`}
           >
            Create New Wallet
           </button>
           <button
            onClick={async () => {
             try {
              await importWallet();
              setInfo(undefined);
             } catch (err: unknown) {
              setInfo(err instanceof Error ? err.message : 'Failed to import wallet');
             }
            }}
            disabled={!accepted}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:text-neutral-200 disabled:opacity-45 border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-12 opacity-80 transition-all hover:opacity-100"
           >
            Import Wallet
           </button>
          </div>
         </div>
        )}

        {/* Import method selection stage */}
        {stage === 'import-method' && (
         <ImportMethod
          onSelectMnemonic={async () => {
           try {
            await importFromMnemonic();
            setInfo(undefined);
           } catch (err: unknown) {
            setInfo(err instanceof Error ? err.message : 'Failed to start mnemonic import');
           }
          }}
          onSelectPrivateKey={() => {
           // Set import type for private key and go to password creation
           setImportType('private-key');
           setPendingMnemonic(null);
           setStage('password-creation');
           setInfo(undefined);
          }}
         />
        )}

        {/* Password creation stage */}
        {stage === 'password-creation' && (
         <PasswordCreation
          onConfirm={async (password) => {
           try {
            await confirmPassword(password);
            setInfo(undefined);
           } catch (err: unknown) {
            setInfo(err instanceof Error ? err.message : 'Failed to set password');
           }
          }}
          onBack={() => {
           goBack();
           setInfo(undefined);
          }}
         />
        )}

        {/* Mnemonic input stage (for import) */}
        {stage === 'mnemonic-input' && pendingPassword && (
         <MnemonicInput
          onConfirm={async (mnemonic) => {
           try {
            await importMnemonicWithPassword(mnemonic, pendingPassword);
            setInfo(undefined);
           } catch (err: unknown) {
            setInfo(err instanceof Error ? err.message : 'Failed to import mnemonic');
           }
          }}
         />
        )}

        {/* Private key import stage */}
        {stage === 'private-key-import' && pendingPassword && (
         <PrivateKeyImport
          password={pendingPassword}
          onConfirm={async (privateKey, password) => {
           try {
            await importFromPrivateKey(privateKey, password);
            setInfo(undefined);
           } catch (err: unknown) {
            setInfo(err instanceof Error ? err.message : 'Failed to import private key');
           }
          }}
          onBack={() => {
           goBack();
           setInfo(undefined);
          }}
         />
        )}

        {/* Mnemonic display stage */}
        {stage === 'mnemonic-display' && pendingMnemonic && (
         <MnemonicDisplay
          mnemonic={pendingMnemonic}
          onConfirm={async () => {
           try {
            await confirmMnemonic();
            setInfo(undefined);
           } catch (err: unknown) {
            setInfo(err instanceof Error ? err.message : 'Failed to create wallet');
           }
          }}
         />
        )}

        {/* Receive state */}
        {stage === 'receive' && (
         <ReceiveView />
        )}

        {/* Send state */}
        {stage === 'send' && (
         <SendView
          onBack={() => setStage('ready')}
          onInternalBack={(handler) => {
           // Register SendView's internal back handler
           sendViewBackHandlerRef.current = handler;
          }}
         />
        )}

        {/* Server Config state */}
        {stage === 'server-config' && (
         <ServerConfigView
          onBack={() => {
           setStage('ready');
           setShowSettings(true);
          }}
          onClose={close}
         />
        )}

        {/* Mnemonic View state */}
        {stage === 'mnemonic-view' && (
         <MnemonicView
          onBack={() => {
           setStage('ready');
           setShowSettings(true);
          }}
          onClose={close}
         />
        )}

        {/* Private Key View state */}
        {stage === 'private-key-view' && (
         <PrivateKeyView
          onBack={() => {
           setStage('ready');
           setShowSettings(true);
          }}
          onClose={close}
         />
        )}

        {/* Ready state: Show dashboard */}
        {stage === 'ready' && (
         <>
          {/* Show password lock inline if wallet is locked */}
          {isLocked ? (
           <div className="px-6 pt-4">
            <PasswordLock
             isLocked={isLocked}
             requiresPassword={requiresPassword}
             error={passwordError}
             onUnlock={unlockWallet}
             onSetPassword={setPassword}
            />
           </div>
          ) : (
           <>
          
          {showSettings ? (
           <div className="flex size-full flex-col gap-4 px-6 py-5 max-standard:min-h-screen">
            {/* Settings List */}
            <div className="flex flex-col gap-3">
             {/* Network Button */}
             <button
              type="button"
              onClick={() => {
               setShowSettings(false);
               setStage('server-config');
              }}
              className="flex w-full items-center justify-between gap-4 px-3.5 py-4 text-left transition hover:bg-neutral-700 rounded-xl border border-white/7 bg-neutral-800"
             >
              <div className="flex min-w-0 items-center gap-3">
               <div className="flex-1 truncate font-medium text-sm antialiased">Network</div>
              </div>
              <div className="flex items-center gap-3.5">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon" className="size-3 stroke-2 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
               </svg>
              </div>
             </button>

             {/* Show Mnemonic Button */}
             <button
              type="button"
              onClick={() => {
               setShowSettings(false);
               setStage('mnemonic-view');
              }}
              disabled={!getMnemonic()}
              className="flex w-full items-center justify-between gap-4 px-3.5 py-4 text-left transition hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl border border-white/7 bg-neutral-800"
             >
              <div className="flex min-w-0 items-center gap-3">
               <div className="flex-1 truncate font-medium text-sm antialiased">Show Mnemonic</div>
              </div>
              <div className="flex items-center gap-3.5">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon" className="size-3 stroke-2 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
               </svg>
              </div>
             </button>

             {/* Show Private Key Button */}
             <button
              type="button"
              onClick={() => {
               setShowSettings(false);
               setStage('private-key-view');
              }}
              disabled={!address}
              className="flex w-full items-center justify-between gap-4 px-3.5 py-4 text-left transition hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl border border-white/7 bg-neutral-800"
             >
              <div className="flex min-w-0 items-center gap-3">
               <div className="flex-1 truncate font-medium text-sm antialiased">Show Private Key</div>
              </div>
              <div className="flex items-center gap-3.5">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon" className="size-3 stroke-2 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
               </svg>
              </div>
             </button>

             {/* End Session Button */}
             <button
              type="button"
              onClick={() => {
               endSession(false);
               setShowSettings(false);
              }}
              className="flex w-full items-center justify-between gap-4 px-3.5 py-4 text-left transition hover:bg-neutral-700 text-red-100 rounded-xl border border-white/7 bg-neutral-800"
             >
              <div className="flex min-w-0 items-center gap-3">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-4 text-red-100">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 12.728A9 9 0 0 0 5.636 5.636Z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v9"></path>
               </svg>
               <div className="flex-1 truncate font-medium text-sm antialiased">End session</div>
              </div>
              <div className="flex items-center gap-3.5"></div>
             </button>
            </div>
           </div>
          ) : (
           <>
            <div className="flex flex-col gap-5 pt-4 pb-6 px-6">
             <div className="relative flex w-full flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
               <div className="flex cursor-pointer gap-2">
                <div className="flex justify-start">
                 <span className="font-bold text-3xl text-white">{satsToCyb(balance.confirmed).toFixed(8)}</span>
                </div>
                <span className="text-3xl text-white">CY</span>
               </div>
              </div>
             </div>
             
            </div>
            
            <div className="flex flex-col justify-start gap-1.5 px-3 font-medium text-lg">
             <button
              onClick={() => {
               if (address) {
                setStage('receive');
               } else {
                setInfo('Wallet address not available. Please ensure your wallet is unlocked.');
               }
              }}
              disabled={!address}
              className="max-w-full truncate flex w-full items-center justify-start gap-3 rounded-xl px-3 py-4 font-medium text-white text-sm transition-colors cursor-pointer hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
             >
              <div className="flex items-center justify-center gap-3">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-down size-5 shrink-0 transition-colors">
                <path d="M12 5v14"></path>
                <path d="m19 12-7 7-7-7"></path>
               </svg>
               <span>Receive</span>
              </div>
             </button>
             <button
              onClick={() => setStage('send')}
              className="max-w-full truncate flex w-full items-center justify-start gap-3 rounded-xl px-3 py-4 font-medium text-white text-sm transition-colors cursor-pointer hover:bg-white/5"
             >
              <div className="flex items-center justify-center gap-3">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-up size-5 shrink-0 transition-colors">
                <path d="m5 12 7-7 7 7"></path>
                <path d="M12 19V5"></path>
               </svg>
               <span>Send</span>
              </div>
             </button>
             <button
              onClick={() => {
               // Update activity to keep session alive
               updateActivity();
               // Close overlay but keep wallet session active
               close();
               // Navigate using Next.js router for client-side navigation
               router.push(`/address/${address}?network=${networkType}`);
              }}
              className="max-w-full truncate flex w-full items-center justify-start gap-3 rounded-xl px-3 py-4 font-medium text-white text-sm transition-colors cursor-pointer hover:bg-white/5"
             >
              <div className="flex items-center justify-center gap-3">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-left-right size-5 shrink-0 transition-colors">
                <path d="M8 3 4 7l4 4"></path>
                <path d="M4 7h16"></path>
                <path d="m16 21 4-4-4-4"></path>
                <path d="M20 17H4"></path>
               </svg>
               <span>Transactions</span>
              </div>
             </button>
             <div className="flex w-full items-center justify-start gap-3 rounded-xl px-3 py-4 font-medium text-white text-sm transition-colors">
              <button type="button" className="mt-1 text-red-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/40" onClick={lockWallet}>
               <div className="flex items-center justify-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-log-out size-5 shrink-0 transition-colors">
                 <path d="m16 17 5-5-5-5"></path>
                 <path d="M21 12H9"></path>
                 <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                </svg>
                <span>Logout</span>
               </div>
              </button>
             </div>
            </div>
           </>
          )}
           </>
          )}
         </>
        )}

        {/* Error state */}
        {stage === 'error' && (
         <div className="space-y-6">
          <h2 className="text-xl font-bold text-white">Error</h2>
          <p className="text-sm text-red-400">Something went wrong. Please try again.</p>
          <button
           onClick={() => {
            // Reset wallet state
            window.location.reload();
           }}
           className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium border border-white/7 bg-neutral-800 text-white hover:bg-neutral-600 h-12 opacity-80 transition-all hover:opacity-100"
          >
           Start Over
          </button>
         </div>
        )}
       </div>
      </div>
     </div>
    </div>
   </div>
  </>
 );
}

