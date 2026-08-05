import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { getBlockHeaderHex, getChainTip } from '@/lib/electrum/rpc';
import { parseBlockHeader, calculateDifficultyFromBits, calculateHashrate } from '@/lib/utils';
import { z } from 'zod';

const querySchema = z.object({
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
      network: searchParams.get('network') || 'mainnet',
    });

    const tip = await getChainTip(query.network);

    // Cyberyen (Litecoin fork) has a 150 second (2.5 minute) block time
    const BLOCK_TIME_SECONDS = 150;
    let difficulty = 0;
    let hashrate = 0;

    if (tip.height > 0) {
      try {
        const headerHex = await getBlockHeaderHex(query.network, tip.height);

        if (headerHex.length >= 160) {
          const parsed = parseBlockHeader(headerHex.substring(0, 160));
          difficulty = calculateDifficultyFromBits(parsed.bits);
          hashrate = calculateHashrate(difficulty, BLOCK_TIME_SECONDS);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error calculating difficulty/hashrate:', error);
        }
        if (tip.difficulty) {
          difficulty = tip.difficulty;
          hashrate = calculateHashrate(difficulty, BLOCK_TIME_SECONDS);
        }
      }
    }

    return NextResponse.json({
      network: query.network,
      blockHeight: tip.height,
      blockHash: tip.headerHex,
      difficulty: difficulty || 0,
      hashrate,
      timestamp: Date.now(),
    }, {
      headers: {
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching network stats:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch network stats' },
      { status: 500 }
    );
  }
}

