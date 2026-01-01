'use client';

import { formatSatoshi, truncateHash, formatTimestamp } from '@/lib/utils';
import { ParsedTransaction, hasConfidentialData } from '@/lib/parsers';
import Link from 'next/link';

interface TxDetailsProps {
 tx: ParsedTransaction;
 network: 'mainnet' | 'testnet';
 blockHeight?: number | null;
 blockHash?: string | null;
 blockTimestamp?: number | null;
 currentHeight?: number | null;
}

export default function TxDetails({ tx, network, blockHeight, blockHash, blockTimestamp, currentHeight }: TxDetailsProps) {
 const isConfidential = hasConfidentialData(tx);
 const confirmations = blockHeight !== null && blockHeight !== undefined && currentHeight !== null && currentHeight !== undefined 
  ? currentHeight - blockHeight + 1 
  : null;

 return (
  <>
   {/* Details Section */}
   <div className="rounded-2xl border border-white/14 bg-neutral-800/75 px-5 py-4">
    <div className="flex items-center gap-2 mb-2">
     <h2 className="font-medium text-base">Details</h2>
     {tx.isMweb && (
      <span className="px-2 py-0.5 rounded-lg border border-white/7 bg-neutral-700/30 text-neutral-300 font-medium text-xs">
       MWEB{isConfidential && <span className="text-neutral-400 ml-1">(Confidential)</span>}
      </span>
     )}
    </div>
     <div className="w-full rounded-2xl bg-transparent font-mono border-none p-0">
      <table className="w-full">
       <tbody className="flex-col">
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Status</td>
         <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          {confirmations !== null ? `${confirmations} confirmations` : 'Pending'}
         </td>
        </tr>
        {blockHash && blockHeight !== null && (
         <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
          <td className="py-4 text-neutral-200">Included in block</td>
          <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
           <Link
            href={`/block/${blockHash}?network=${network}`}
            className="max-w-full truncate text-neutral-100 hover:text-white"
           >
            {truncateHash(blockHash, 5, 5)}
           </Link>
          </td>
         </tr>
        )}
        {blockHeight !== null && (
         <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
          <td className="py-4 text-neutral-200">Block height</td>
          <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
           {blockHeight}
          </td>
         </tr>
        )}
        {blockTimestamp !== null && blockTimestamp !== undefined && (
         <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
          <td className="py-4 text-neutral-200">Block timestamp</td>
          <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
           <div>{formatTimestamp(blockTimestamp)}</div>
          </td>
         </tr>
        )}
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Fee</td>
         <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          {tx.fee !== undefined && tx.fee !== null ? `${formatSatoshi(tx.fee)} CY` : 'N/A'}
         </td>
        </tr>
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Size</td>
         <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          {tx.size} bytes
         </td>
        </tr>
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Virtual size</td>
         <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          {tx.vsize} vB
         </td>
        </tr>
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Weight units</td>
         <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          {tx.weight} WU
         </td>
        </tr>
        <tr className="text-wrap border-b border-b-neutral-600/45 font-medium text-sm last:border-b-0">
         <td className="py-4 text-neutral-200">Version</td>
         <td className="flex justify-end overflow-hidden text-ellipsis break-normal py-4 pl-4 text-end">
          {tx.version}
         </td>
        </tr>
       </tbody>
      </table>
     </div>
   </div>
  </>
 );
}

export function TxInputsOutputs({ tx, network }: { tx: ParsedTransaction; network: 'mainnet' | 'testnet' }) {
 // Calculate sent value (outputs to recipients, excluding change back to sender)
 const calculateSentValue = (): number => {
   // Get all input addresses (sender addresses)
   const inputAddresses = new Set<string>();
   tx.inputs.forEach((input) => {
     if (input.type === 'regular' && input.address) {
       inputAddresses.add(input.address);
     }
   });

   // If we can't determine input addresses, use first output (usually the recipient)
   if (inputAddresses.size === 0) {
     const firstOutput = tx.outputs.find((out) => out.type === 'regular' && out.value && out.value > 0);
     return firstOutput && firstOutput.type === 'regular' ? (firstOutput.value || 0) : 0;
   }

   // Sum outputs that don't match any input address (these are sent amounts, not change)
   let sentValue = 0;
   tx.outputs.forEach((out) => {
     if (out.type === 'regular' && out.value && out.value > 0) {
       const outputAddress = out.address;
       
       // Check if this output goes to a different address (not change)
       const isChange = outputAddress && inputAddresses.has(outputAddress);
       
       if (!isChange) {
         sentValue += out.value;
       }
     }
   });

   // If no sent value found (all outputs are change, which shouldn't happen but handle it),
   // fall back to first output
   if (sentValue === 0) {
     const firstOutput = tx.outputs.find((out) => out.type === 'regular' && out.value && out.value > 0);
     return firstOutput && firstOutput.type === 'regular' ? (firstOutput.value || 0) : 0;
   }

   return sentValue;
 };

 const sentValue = calculateSentValue();

 return (
  <section className="flex w-full flex-col gap-2.5">
    <div className="rounded-2xl border border-white/14 bg-neutral-800/75 px-5 py-4 font-medium text-lg max-md:text-base">
     Inputs & Outputs
    </div>
    <div className="relative flex w-full flex-col gap-2.5">
     <div className="flex w-full flex-col rounded-2xl border border-white/14 bg-neutral-800/75 font-mono">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-4 px-5 pt-4">
       <div className="flex w-full items-center gap-1 whitespace-nowrap min-w-0">
        <span className="mr-2 text-neutral-200 text-xs flex-shrink-0">
         <span className="text-white">#1</span>
        </span>
        <span className="text-neutral-200 text-xs flex-shrink-0">ID:</span>
        <span className="max-w-full w-0 min-w-0 flex-1 truncate text-xs text-neutral-100 hover:text-white">
         {truncateHash(tx.txid, 5, 5)}
        </span>
       </div>
       <div className="flex items-start sm:items-end sm:self-end flex-shrink-0">
        <div className="flex flex-col items-start sm:items-end gap-1 min-w-0">
         {sentValue > 0 && (
          <div className="relative group w-full sm:w-auto">
           <span className="block sm:inline truncate font-medium text-white text-sm cursor-help max-w-full">
            {formatSatoshi(sentValue)} CY
           </span>
           {tx.isMweb && (
            <div className="absolute bottom-full right-0 mb-2 px-3 py-2 rounded-lg border border-white/14 bg-neutral-800/95 text-xs text-neutral-200 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none shadow-lg">
             Total amount in MWEB chain
             <div className="absolute top-full right-4 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-white/14"></div>
             <div className="absolute top-full right-4 mt-[-1px] w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-neutral-800/95"></div>
            </div>
           )}
          </div>
         )}
         <div className="flex items-center gap-2">
          <span className="truncate font-medium text-white text-sm">
           <span className="text-neutral-200">Fee: </span>
           {tx.fee !== undefined && tx.fee !== null ? formatSatoshi(tx.fee) + ' CY' : 'N/A'}
          </span>
         </div>
        </div>
       </div>
      </div>
      <div className="flex w-full items-start gap-4 px-5 py-4 md:flex-row flex-col">
       {/* Inputs Column */}
       <div className="flex w-full flex-1 flex-col gap-2">
        <div className="text-neutral-400 text-xs font-medium mb-1 px-2">Inputs</div>
        {tx.inputs.map((input, index) => {
         if (input.type === 'mweb_input') {
          return (
           <div key={index} className="flex w-full items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-neutral-700/30 transition-colors">
            <span className="text-neutral-200 text-xs">MWEB Input #{index + 1}</span>
           </div>
          );
         }
         const isCoinbase = !input.prevout_hash || input.prevout_hash === '';
         
         return (
          <div key={index} className="flex w-full items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-neutral-700/30 transition-colors">
           {isCoinbase ? (
            <span className="text-neutral-200 text-xs">Coinbase</span>
           ) : (
            <>
             <span className="text-neutral-400 text-xs min-w-[2rem]">#{index}</span>
             <Link
              href={`/tx/${input.prevout_hash}?network=${network}`}
              className="flex-1 min-w-0 truncate text-neutral-100 hover:text-white text-xs"
              title={input.prevout_hash}
             >
              {truncateHash(input.prevout_hash, 5, 5)}
             </Link>
            </>
           )}
          </div>
         );
        })}
       </div>
       <div className="h-px w-full bg-white/14 md:h-full md:w-px md:min-h-[200px]"></div>
       {/* Outputs Column */}
       <div className="flex w-full flex-1 flex-col gap-2">
        <div className="text-neutral-400 text-xs font-medium mb-1 px-2">Outputs</div>
        {tx.outputs.map((output, index) => {
         if (output.type === 'mweb_output') {
          return (
           <div key={index} className="flex w-full items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-neutral-700/30 transition-colors">
            <span className="text-neutral-200 text-xs">MWEB Output #{index + 1}</span>
            {output.value && output.value > 0 && (
             <span className="truncate font-medium text-white text-xs ml-auto">{formatSatoshi(output.value)} CY</span>
            )}
           </div>
          );
         }
         
         // Check if this is a witness_mweb_hogaddr output (MWEB output type)
         const isMwebOutput = (output as any).scriptPubKeyType === 'witness_mweb_hogaddr';
         if (isMwebOutput) {
          return (
           <div key={index} className="flex w-full items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-neutral-700/30 transition-colors">
            <span className="text-neutral-200 text-xs">MWEB Output #{index + 1}</span>
            {output.value && output.value > 0 && (
             <span className="truncate font-medium text-white text-xs ml-auto">{formatSatoshi(output.value)} CY</span>
            )}
           </div>
          );
         }
         
         // Check if this is a data/OP_RETURN output (0 value, no address)
         const scriptHex = output.script_pubkey || '';
         const isOpReturn = scriptHex.startsWith('6a') || scriptHex.toLowerCase().includes('op_return');
         
         return (
          <div key={index} className="flex w-full items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-neutral-700/30 transition-colors">
           <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-neutral-400 text-xs min-w-[2rem]">#{index}</span>
            {output.address ? (
             <Link
              href={`/address/${output.address}?network=${network}`}
              className="flex-1 min-w-0 truncate text-neutral-100 hover:text-white text-xs"
              title={output.address}
             >
              {output.address.substring(0, 10)}...
             </Link>
            ) : isOpReturn ? (
             <span className="text-neutral-200 text-xs uppercase">OP_RETURN</span>
            ) : (
             <span className="text-neutral-200 text-xs">Output #{index + 1}</span>
            )}
           </div>
           {output.value && output.value > 0 && (
            <span className="truncate font-medium text-white text-xs ml-auto whitespace-nowrap">{formatSatoshi(output.value)} CY</span>
           )}
          </div>
         );
        })}
       </div>
      </div>
     </div>
    </div>
   </section>
 );
}

