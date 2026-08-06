import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { addressSchema } from '@/lib/utils';
import {
  getScripthashBalance,
  getScripthashHistory,
  getScripthashMempool,
} from '@/lib/electrum/rpc';
import type { ScripthashHistoryEntry } from '@/lib/electrum/protocol';
import { z } from 'zod';
import { addressToScriptHash } from '@/lib/wallet/crypto';

const querySchema = z.object({
  address: z.string(),
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
      address: searchParams.get('address'),
      network: searchParams.get('network') || 'mainnet',
    });

    addressSchema.parse(query.address);

    let scriptHash: string;
    try {
      scriptHash = addressToScriptHash(query.address, query.network);
    } catch {
      throw new Error('Invalid address format');
    }

    // Get balance first (this usually works even for addresses with large history)
    let balance;
    try {
      balance = await getScripthashBalance(query.network, scriptHash);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching balance:', error);
      }
      throw new Error('Failed to fetch address balance');
    }

    // Try to get history, but handle "history too large" error gracefully
    let history: ScripthashHistoryEntry[] = [];
    let historyError: string | null = null;
    try {
      history = await getScripthashHistory(query.network, scriptHash);
    } catch (error: unknown) {
      const errorMessage = (error instanceof Error ? error.message : String(error)) || String(error);
      if (errorMessage.includes('history too large') || errorMessage.includes('too large')) {
        historyError = 'This address has too many transactions to display. Please use a block explorer with pagination support.';
        // Try to get just mempool transactions as a fallback
        try {
          history = await getScripthashMempool(query.network, scriptHash);
        } catch {
          // If mempool also fails, just return empty history
          history = [];
        }
      } else {
        // For other errors, re-throw
        throw error;
      }
    }

    return NextResponse.json({
      address: query.address,
      balance: balance.confirmed + balance.unconfirmed,
      confirmed: balance.confirmed,
      unconfirmed: balance.unconfirmed,
      history,
      historyError: historyError || undefined,
    }, {
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
      console.error('Error fetching address:', error);
    }
    
    // Check if it's a "history too large" error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('history too large') || errorMessage.includes('too large')) {
      return NextResponse.json(
        { 
          error: 'This address has too many transactions to display. Please use a block explorer with pagination support.',
          code: 'HISTORY_TOO_LARGE'
        },
        { status: 413 } // 413 Payload Too Large
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch address data' },
      { status: 500 }
    );
  }
}

