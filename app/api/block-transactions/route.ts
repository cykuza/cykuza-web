import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';
import { getTransaction, getTxidFromPos } from '@/lib/electrum/rpc';
import type {
  ElectrumXInput,
  ElectrumXOutput,
  ElectrumXTransaction,
} from '@/lib/electrum/protocol';
import { z } from 'zod';

const querySchema = z.object({
  height: z.string().transform((val) => parseInt(val, 10)).refine((val) => !isNaN(val) && val >= 0),
  network: z.enum(['mainnet', 'testnet']).default('mainnet'),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
});

interface TransactionResult {
  txid: string;
  value: number;
  isMweb: boolean;
}

const SATS_PER_COIN = 100_000_000;

function collectInputAddresses(inputs: ElectrumXInput[] | undefined): Set<string> {
  const addresses = new Set<string>();
  for (const input of inputs ?? []) {
    for (const addr of input.prevout?.scriptPubKey?.addresses ?? []) {
      if (addr) addresses.add(addr);
    }
  }
  return addresses;
}

function outputAddresses(output: ElectrumXOutput): string[] {
  const addresses = [...(output.scriptPubKey?.addresses ?? [])];
  if (output.address) addresses.push(output.address);
  return addresses;
}

/**
 * Amount leaving the sender: outputs that do not return to an input address.
 * Without resolvable input addresses, the first output is the best proxy.
 */
function calculateSentValue(tx: ElectrumXTransaction): number {
  const outputs = tx.vout ?? [];
  if (outputs.length === 0) return 0;

  const firstOutputValue = Math.floor((outputs[0]?.value ?? 0) * SATS_PER_COIN);
  const inputAddresses = collectInputAddresses(tx.vin);
  if (inputAddresses.size === 0) {
    return Math.max(firstOutputValue, 0);
  }

  const sent = outputs
    .filter((out) => !outputAddresses(out).some((addr) => inputAddresses.has(addr)))
    .reduce((sum, out) => sum + (out.value ?? 0) * SATS_PER_COIN, 0);

  return sent > 0 ? Math.floor(sent) : Math.max(firstOutputValue, 0);
}

function isMwebTransaction(tx: ElectrumXTransaction): boolean {
  if (tx.mweb_extension !== undefined && tx.mweb_extension !== null) return true;
  return (tx.vout ?? []).some(
    (out) => out.scriptPubKey?.type === 'witness_mweb_hogaddr'
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
    const query = querySchema.parse({
      height: searchParams.get('height'),
      network: searchParams.get('network') || 'mainnet',
      limit: searchParams.get('limit'),
    });

    const maxTxToCheck = query.limit || 100;

    // Step 1: Fetch all transaction hashes in parallel
    const txHashPromises = [];
    for (let txPos = 0; txPos < maxTxToCheck; txPos++) {
      txHashPromises.push(
        getTxidFromPos(query.network, query.height, txPos).catch(() => null)
      );
    }

    const txHashes = await Promise.all(txHashPromises);
    const validTxHashes = txHashes.filter((hash): hash is string => hash !== null);

    if (validTxHashes.length === 0) {
      return NextResponse.json([], {
        headers: {
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
      });
    }

    // Step 2: Fetch all transaction details in parallel
    const transactions: TransactionResult[] = await Promise.all(
      validTxHashes.map(async (txid) => {
        try {
          const tx = await getTransaction(query.network, txid);
          return { txid, value: calculateSentValue(tx), isMweb: isMwebTransaction(tx) };
        } catch {
          return { txid, value: 0, isMweb: false };
        }
      })
    );

    return NextResponse.json(transactions, {
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
      console.error('Error fetching block transactions:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch block transactions' },
      { status: 500 }
    );
  }
}

