'use client';

import { useSearchParams } from 'next/navigation';
import { useElectrumExplorer } from './useElectrumExplorer';

export type ElectrumStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

export function useElectrumStatus(): ElectrumStatus {
 const searchParams = useSearchParams();
 const network = (searchParams.get('network') as 'mainnet' | 'testnet') || 'mainnet';
 const { connected, connecting, error } = useElectrumExplorer({ network, autoConnect: true });

 // Map useElectrumExplorer status to ElectrumStatus
 if (connected) {
  return 'ready';
 } else if (connecting) {
  return 'connecting';
 } else if (error) {
  return 'error';
 } else {
  return 'disconnected';
 }
}

