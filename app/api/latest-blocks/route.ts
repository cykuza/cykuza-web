import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { callElectrumX } from '@/lib/electrumServer';
import { fetchBlockByHeight } from '@/lib/blockParser';
import { z } from 'zod';

const querySchema = z.object({
  network: z.enum(['mainnet', 'testnet']).default('mainnet'),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 11),
});

interface BlockResult {
  height: number;
  hash?: string;
  timestamp?: number;
  version?: number;
  prev_hash?: string;
  merkle_root?: string;
  bits?: number;
  nonce?: number;
  size?: number;
  tx_count?: number;
  mweb?: unknown;
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
      network: searchParams.get('network') || 'mainnet',
      limit: searchParams.get('limit'),
    });

    // Get current tip - blockchain.headers.subscribe returns an object with height and hex, or just a number
    const tip = await callElectrumX(query.network, 'blockchain.headers.subscribe', []);
    const currentHeight = (tip && typeof tip === 'object' && 'height' in tip) 
      ? tip.height 
      : (typeof tip === 'number' ? tip : 0);

    // Fetch blocks in parallel for better performance
    const blockPromises = [];
    for (let i = 0; i < query.limit && currentHeight - i >= 0; i++) {
      const height = currentHeight - i;
      blockPromises.push(
        (async () => {
          try {
            // Use unified block parser
            const parsed = await fetchBlockByHeight(query.network, height);
            
            return {
              height: parsed.height,
              hash: parsed.hash,
              timestamp: parsed.timestamp,
              version: parsed.version,
              prev_hash: parsed.prev_hash,
              merkle_root: parsed.merkle_root,
              bits: parsed.bits,
              nonce: parsed.nonce,
              size: parsed.size,
              tx_count: parsed.tx_count,
              mweb: parsed.mweb,
            } as BlockResult;
          } catch (error) {
            // Skip if block not found
            if (process.env.NODE_ENV === 'development') {
              console.error(`Error fetching block ${height}:`, error);
            }
            return null;
          }
        })()
      );
    }

    // Wait for all blocks to be fetched in parallel
    const blockResults = await Promise.all(blockPromises);
    const blocks = blockResults.filter((block): block is BlockResult => block !== null);

    return NextResponse.json(blocks, {
      headers: {
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching latest blocks:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch latest blocks' },
      { status: 500 }
    );
  }
}

