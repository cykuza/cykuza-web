import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { blockHeightSchema, hashSchema } from '@/lib/utils';
import { fetchBlockByHeight, findBlockHeightByHash } from '@/lib/blockParser';
import { z } from 'zod';

const querySchema = z.object({
  height: z.string().optional().refine(
    (val) => !val || (!isNaN(parseInt(val, 10)) && parseInt(val, 10) >= 0),
    { message: 'Height must be a non-negative integer' }
  ).transform((val) => val ? parseInt(val, 10) : undefined),
  hash: z.string().optional(),
  fromHeight: z.string().optional().refine(
    (val) => !val || (!isNaN(parseInt(val, 10)) && parseInt(val, 10) >= 0),
    { message: 'fromHeight must be a non-negative integer' }
  ).transform((val) => val ? parseInt(val, 10) : undefined),
  network: z.enum(['mainnet', 'testnet']).default('mainnet'),
});

export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimit(req);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const { searchParams } = new URL(req.url);
    let query;
    try {
      const heightParam = searchParams.get('height');
      const hashParam = searchParams.get('hash');
      const fromHeightParam = searchParams.get('fromHeight');
      query = querySchema.parse({
        height: heightParam || undefined,
        hash: hashParam || undefined,
        fromHeight: fromHeightParam || undefined,
        network: searchParams.get('network') || 'mainnet',
      });
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return NextResponse.json(
          { 
          error: 'Invalid request parameters',
          ...(process.env.NODE_ENV === 'development' && { details: validationError.errors })
        },
          { status: 400 }
        );
      }
      throw validationError;
    }

    if (!query.height && !query.hash) {
      return NextResponse.json(
        { error: 'Either height or hash must be provided' },
        { status: 400 }
      );
    }

    let blockData;
    
    if (query.height !== undefined && query.height !== null) {
      // Fetch block by height
      try {
        blockData = await fetchBlockByHeight(query.network, query.height);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching block by height:', error);
        }
        return NextResponse.json(
          { error: 'Failed to fetch block from ElectrumX' },
          { status: 500 }
        );
      }
    } else if (query.hash) {
      // Validate hash format
      try {
        hashSchema.parse(query.hash);
      } catch (validationError) {
        return NextResponse.json(
          { error: 'Invalid block hash format' },
          { status: 400 }
        );
      }
      
      // Find block height by hash
      try {
        const blockHeight = await findBlockHeightByHash(
          query.network,
          query.hash,
          query.fromHeight
        );
        
        if (blockHeight === null) {
          return NextResponse.json(
            { error: 'Block not found. The hash might be from a very old block or the block might not exist.' },
            { status: 404 }
          );
        }
        
        // Fetch block by the found height
        blockData = await fetchBlockByHeight(query.network, blockHeight);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching block by hash:', error);
        }
        return NextResponse.json(
          { error: 'Failed to fetch block from ElectrumX' },
          { status: 500 }
        );
      }
    }

    // MWEB data is embedded in the block structure, no need for separate call

    return NextResponse.json(blockData, {
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
      console.error('Error fetching block:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch block data' },
      { status: 500 }
    );
  }
}

