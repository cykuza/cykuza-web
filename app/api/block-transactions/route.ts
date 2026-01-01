import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { callElectrumX } from '@/lib/electrumServer';
import { ElectrumXTransaction, ElectrumXOutput } from '@/lib/parsers';
import { z } from 'zod';

const querySchema = z.object({
  height: z.string().transform((val) => parseInt(val, 10)).refine((val) => !isNaN(val) && val >= 0),
  network: z.enum(['mainnet', 'testnet']).default('mainnet'),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
});

interface TransactionResult {
  txid: string;
  value: number;
  isMweb: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const rateLimitResult = rateLimit(req);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const query = querySchema.parse({
      height: searchParams.get('height'),
      network: searchParams.get('network') || 'mainnet',
      limit: searchParams.get('limit'),
    });

    const maxTxToCheck = query.limit || 100;

    // Step 1: Fetch all transaction hashes in parallel
    const txHashPromises = [];
    for (let txPos = 0; txPos < maxTxToCheck; txPos++) {
      txHashPromises.push(
        callElectrumX(
          query.network,
          'blockchain.transaction.id_from_pos',
          [query.height, txPos, false]
        ).then(
          (txHash) => {
            if (typeof txHash === 'string' && txHash.length === 64 && /^[a-fA-F0-9]{64}$/.test(txHash)) {
              return txHash;
            }
            return null;
          },
          () => null // Return null on error
        )
      );
    }

    const txHashes = await Promise.all(txHashPromises);
    const validTxHashes = txHashes.filter((hash): hash is string => hash !== null);

    if (validTxHashes.length === 0) {
      return NextResponse.json([], {
        headers: {
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
      });
    }

    // Step 2: Fetch all transaction details in parallel
    const txDetailPromises = validTxHashes.map((txid) =>
      callElectrumX(
        query.network,
        'blockchain.transaction.get',
        [txid, true] // verbose=true to get full transaction data
      ).then(
        (txData: unknown) => {
          if (!txData || typeof txData !== 'object') {
            return {
              txid,
              value: 0,
              isMweb: false,
            };
          }

          const tx = txData as ElectrumXTransaction;

          // Calculate sent value (outputs to recipients, excluding change back to sender)
          // ElectrumX returns values in CY, we need to convert to satoshis (multiply by 100,000,000)
          const calculateSentValue = (): number => {
            // Get all input addresses (sender addresses)
            const inputAddresses = new Set<string>();
            if (tx.vin && Array.isArray(tx.vin)) {
              tx.vin.forEach((input: any) => {
                // Check prevout for addresses
                if (input.prevout?.scriptPubKey?.addresses && Array.isArray(input.prevout.scriptPubKey.addresses)) {
                  input.prevout.scriptPubKey.addresses.forEach((addr: string) => {
                    if (addr) inputAddresses.add(addr);
                  });
                }
                // Also check direct address in prevout
                if (input.prevout?.addresses && Array.isArray(input.prevout.addresses)) {
                  input.prevout.addresses.forEach((addr: string) => {
                    if (addr) inputAddresses.add(addr);
                  });
                }
              });
            }

            // Get outputs
            const outputs = tx.vout || [];
            if (!Array.isArray(outputs) || outputs.length === 0) return 0;

            // If we can't determine input addresses, use first output (usually the recipient)
            if (inputAddresses.size === 0) {
              const firstOutput = outputs[0];
              const value = firstOutput?.value || 0;
              return value > 0 ? Math.floor(value * 100000000) : 0;
            }

            // Sum outputs that don't match any input address (these are sent amounts, not change)
            let sentValue = 0;
            outputs.forEach((out: ElectrumXOutput) => {
              const outputAddresses: string[] = [];
              
              // Get addresses from output
              if (out.scriptPubKey?.addresses && Array.isArray(out.scriptPubKey.addresses)) {
                outputAddresses.push(...out.scriptPubKey.addresses);
              }
              if (out.address) {
                outputAddresses.push(out.address);
              }

              // Check if this output goes to a different address (not change)
              const isChange = outputAddresses.some(addr => inputAddresses.has(addr));
              
              if (!isChange) {
                const value = out.value || 0;
                sentValue += value * 100000000;
              }
            });

            // If no sent value found (all outputs are change, which shouldn't happen but handle it),
            // fall back to first output
            if (sentValue === 0 && outputs.length > 0) {
              const firstOutput = outputs[0];
              const value = firstOutput?.value || 0;
              return value > 0 ? Math.floor(value * 100000000) : 0;
            }

            return Math.floor(sentValue);
          };

          const totalValue = calculateSentValue();

          // Check if transaction is MWEB
          let isMweb = false;
          if (tx.mweb_extension !== undefined && tx.mweb_extension !== null) {
            isMweb = true;
          } else if (tx.vout && Array.isArray(tx.vout)) {
            isMweb = tx.vout.some((out: ElectrumXOutput) => 
              out.scriptPubKey?.type === 'witness_mweb_hogaddr'
            );
          }

          return {
            txid,
            value: totalValue,
            isMweb,
          };
        },
        () => ({
          txid,
          value: 0,
          isMweb: false,
        })
      )
    );

    const transactions: TransactionResult[] = await Promise.all(txDetailPromises);

    return NextResponse.json(transactions, {
      headers: {
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request parameters',
          ...(process.env.NODE_ENV === 'development' && { details: error.errors })
        },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching block transactions:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch block transactions' },
      { status: 500 }
    );
  }
}

