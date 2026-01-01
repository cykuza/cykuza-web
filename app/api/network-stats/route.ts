import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { callElectrumX } from '@/lib/electrumServer';
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

    // Get current tip - blockchain.headers.subscribe returns an object with height and hex, or just a number
    const tip = await callElectrumX(query.network, 'blockchain.headers.subscribe', []);
    const currentHeight = (tip && typeof tip === 'object' && 'height' in tip) 
      ? tip.height 
      : (typeof tip === 'number' ? tip : 0);
    
    // Get current block header to extract bits and calculate difficulty
    let difficulty = 0;
    let hashrate = 0;
    
    if (currentHeight > 0) {
      try {
        // Get the current block header to extract bits
        const currentBlockHeader = await callElectrumX(
          query.network,
          'blockchain.block.header',
          [currentHeight]
        );
        
        if (typeof currentBlockHeader === 'string' && currentBlockHeader.length >= 160) {
          // Parse block header to get bits
          const parsed = parseBlockHeader(currentBlockHeader.substring(0, 160));
          
          // Calculate difficulty from bits
          difficulty = calculateDifficultyFromBits(parsed.bits);
          
          // Calculate hashrate: Hashrate = Difficulty * (2^32) / Block Time
          // Cyberyen (Litecoin fork) has a 150 second (2.5 minute) block time
          const BLOCK_TIME_SECONDS = 150;
          hashrate = calculateHashrate(difficulty, BLOCK_TIME_SECONDS);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error calculating difficulty/hashrate:', error);
        }
        // Fallback: try to get difficulty from tip if available
        if (tip && typeof tip === 'object' && 'difficulty' in tip && tip.difficulty) {
          difficulty = tip.difficulty;
          const BLOCK_TIME_SECONDS = 150;
          hashrate = calculateHashrate(difficulty, BLOCK_TIME_SECONDS);
        }
      }
    }

    const tipHex = (tip && typeof tip === 'object' && 'hex' in tip) 
      ? tip.hex 
      : '';

    return NextResponse.json({
      network: query.network,
      blockHeight: currentHeight,
      blockHash: tipHex,
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

