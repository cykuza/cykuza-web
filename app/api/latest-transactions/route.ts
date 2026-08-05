import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { getBlockHeaderHex, getChainTip, getTxidFromPos } from '@/lib/electrum/rpc';
import { parseTxCountFromBlockHex } from '@/lib/utils';
import { z } from 'zod';

const querySchema = z.object({
  network: z.enum(['mainnet', 'testnet']).default('mainnet'),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 11),
});

interface TransactionResult {
  txid: string;
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

    const { height: currentHeight } = await getChainTip(query.network);

    // Collect unique transaction hashes from recent blocks
    const txSet = new Set<string>();
    const maxBlocksToCheck = Math.min(query.limit * 2, 20);
    
    // Fetch blocks in parallel for better performance
    const blockPromises = [];
    for (let i = 0; i < maxBlocksToCheck && currentHeight - i >= 0; i++) {
      const height = currentHeight - i;
      blockPromises.push(
        (async () => {
          try {
            // Get block header to determine transaction count
            const headerHex = await getBlockHeaderHex(query.network, height);

            const txCount = headerHex.length > 160 ? parseTxCountFromBlockHex(headerHex) : 0;

            // If we couldn't get tx_count from block data, use a reasonable limit
            const maxTxPerBlock = txCount > 0 ? Math.min(txCount, 20) : 20;
            
            // Get transaction hashes in parallel for this block
            const txPromises = [];
            for (let txPos = 0; txPos < maxTxPerBlock; txPos++) {
              txPromises.push(
                getTxidFromPos(query.network, height, txPos).catch(() => null)
              );
            }
            
            const txHashes = await Promise.all(txPromises);
            return txHashes.filter((hash): hash is string => hash !== null);
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error(`Error fetching transactions for block ${height}:`, error);
            }
            return [];
          }
        })()
      );
    }

    // Wait for all blocks and collect transactions
    const blockResults = await Promise.all(blockPromises);
    for (const txHashes of blockResults) {
      for (const txHash of txHashes) {
        if (txSet.size >= query.limit) {
          break;
        }
        txSet.add(txHash);
      }
      if (txSet.size >= query.limit) {
        break;
      }
    }

    // Convert to array and limit results
    const uniqueTransactions: TransactionResult[] = Array.from(txSet)
      .slice(0, query.limit)
      .map(txid => ({ txid }));

    return NextResponse.json(uniqueTransactions, {
      headers: {
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching latest transactions:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch latest transactions' },
      { status: 500 }
    );
  }
}

