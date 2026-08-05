import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { txHashSchema } from '@/lib/utils';
import { getTransaction } from '@/lib/electrum/rpc';
import type { ElectrumXInput, ElectrumXTransaction } from '@/lib/electrum/protocol';
import type { ElectrumNetwork } from '@/lib/electrum/types';
import { z } from 'zod';

const querySchema = z.object({
  hash: z.string().min(1),
  network: z.enum(['mainnet', 'testnet']).default('mainnet'),
});

function needsPrevout(input: ElectrumXInput): boolean {
  if (input.coinbase !== undefined && input.coinbase !== null) return false;
  if (typeof input.value === 'number' && input.value > 0) return false;
  if (typeof input.prevout?.value === 'number' && input.prevout.value > 0) return false;
  return true;
}

/**
 * ElectrumX omits input values when the daemon response lacks prevout data,
 * so resolve them from the spent transactions. Missing prevouts are tolerated:
 * the UI renders the transaction without input amounts.
 */
async function resolvePrevouts(
  network: ElectrumNetwork,
  tx: ElectrumXTransaction
): Promise<void> {
  if (!Array.isArray(tx.vin)) return;

  await Promise.all(
    tx.vin.filter(needsPrevout).map(async (input) => {
      const prevTxid = input.txid || input.prevout_hash;
      const prevIndex = input.vout ?? input.prevout_n;
      if (!prevTxid || prevIndex === undefined || prevIndex < 0) return;

      try {
        const prevTx = await getTransaction(network, prevTxid);
        const prevOutput = prevTx.vout?.[prevIndex];
        if (!prevOutput) return;

        input.prevout = {
          ...input.prevout,
          value: prevOutput.value ?? input.prevout?.value,
          scriptPubKey: prevOutput.scriptPubKey ?? input.prevout?.scriptPubKey,
        };
      } catch {
        // Prevout enrichment is best-effort.
      }
    })
  );
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

    const txData = await getTransaction(query.network, query.hash);
    await resolvePrevouts(query.network, txData);

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
