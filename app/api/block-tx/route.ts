import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { getTxidFromPos } from '@/lib/electrum/rpc';
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
      const txid = await getTxidFromPos(query.network, query.height, query.txPos);

      return NextResponse.json({ txid }, {
        headers: {
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
      });
    } catch {
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

