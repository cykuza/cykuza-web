import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { txHashSchema } from '@/lib/utils';
import { callElectrumX } from '@/lib/electrumServer';
import { z } from 'zod';

const querySchema = z.object({
  hash: z.string().min(1),
  network: z.enum(['mainnet', 'testnet']).default('mainnet'),
  verbose: z.string().optional().transform(val => val === 'true' || val === '1'),
});

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
    const hashParam = searchParams.get('hash');
    
    if (!hashParam) {
      return NextResponse.json(
        { error: 'Transaction hash is required' },
        { status: 400 }
      );
    }

    const query = querySchema.parse({
      hash: hashParam,
      network: searchParams.get('network') || 'mainnet',
      verbose: searchParams.get('verbose'),
    });

    // Validate hash format
    try {
      txHashSchema.parse(query.hash);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'Invalid transaction hash format',
            ...(process.env.NODE_ENV === 'development' && { details: validationError.errors })
          },
          { status: 400 }
        );
      }
      throw validationError;
    }

    const txData = await callElectrumX(
      query.network,
      'blockchain.transaction.get',
      [query.hash, true] // Always use verbose=true to get prevout data
    );

    // If verbose mode doesn't include prevout values, we need to fetch them
    // Check if inputs have values, and if not, try to fetch from previous transactions
    if (txData && typeof txData === 'object' && Array.isArray((txData as any).vin)) {
      const vin = (txData as any).vin;
      const inputPromises = vin.map(async (input: any, index: number) => {
        // If input already has value or prevout with value, skip
        if (input.value !== undefined && input.value !== null && input.value > 0) {
          return;
        }
        if (input.prevout?.value !== undefined && input.prevout?.value !== null && input.prevout.value > 0) {
          return;
        }
        
        // If this is a coinbase, skip
        if (input.coinbase !== undefined && input.coinbase !== null) {
          return;
        }
        
        // Try to get the previous transaction to fetch the output value
        const prevTxHash = input.txid || input.prevout_hash;
        const prevOutIndex = input.vout !== undefined ? input.vout : (input.prevout_n !== undefined ? input.prevout_n : undefined);
        
        if (prevTxHash && prevOutIndex !== undefined && prevOutIndex >= 0) {
          try {
            const prevTx = await callElectrumX(
              query.network,
              'blockchain.transaction.get',
              [prevTxHash, true]
            );
            
            if (prevTx && typeof prevTx === 'object') {
              const vout = (prevTx as any).vout || (prevTx as any).outputs;
              if (Array.isArray(vout) && vout[prevOutIndex] !== undefined) {
                const prevOutput = vout[prevOutIndex];
                // Add prevout data to the input
                if (!input.prevout) {
                  input.prevout = {};
                }
                if (prevOutput.value !== undefined && prevOutput.value !== null) {
                  input.prevout.value = prevOutput.value;
                }
                if (prevOutput.scriptPubKey) {
                  input.prevout.scriptPubKey = prevOutput.scriptPubKey;
                }
              }
            }
          } catch (err) {
            // Silently fail - prevout data is optional
            if (process.env.NODE_ENV === 'development') {
              console.warn(`Failed to fetch prevout for input ${index} (tx: ${prevTxHash}, vout: ${prevOutIndex}):`, err);
            }
          }
        }
      });
      
      // Wait for all prevout fetches to complete
      await Promise.all(inputPromises);
    }

    // MWEB transaction data would be in the transaction structure if present

    return NextResponse.json(txData, {
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
      console.error('Error fetching transaction:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch transaction data' },
      { status: 500 }
    );
  }
}

