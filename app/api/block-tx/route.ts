import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { callElectrumX } from '@/lib/electrumServer';
import { z } from 'zod';

const querySchema = z.object({
  height: z.string().transform((val) => parseInt(val, 10)).refine((val) => !isNaN(val) && val >= 0),
  txPos: z.string().transform((val) => parseInt(val, 10)).refine((val) => !isNaN(val) && val >= 0),
  network: z.enum(['mainnet', 'testnet']).default('mainnet'),
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
    const query = querySchema.parse({
      height: searchParams.get('height'),
      txPos: searchParams.get('txPos'),
      network: searchParams.get('network') || 'mainnet',
    });

    try {
      const txHash = await callElectrumX(
        query.network,
        'blockchain.transaction.id_from_pos',
        [query.height, query.txPos, false]
      );

      if (typeof txHash === 'string' && txHash.length === 64 && /^[a-fA-F0-9]{64}$/.test(txHash)) {
        return NextResponse.json({ txid: txHash }, {
          headers: {
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          },
        });
      } else {
        return NextResponse.json(
          { error: 'Invalid transaction hash' },
          { status: 400 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Transaction not found at this position' },
        { status: 404 }
      );
    }
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
      console.error('Error fetching block transaction:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch block transaction' },
      { status: 500 }
    );
  }
}

