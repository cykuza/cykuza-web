import { type NetworkType } from '../cyberyenNetwork';
import { isValidAddress } from './address';

export const MAX_ADDRESS_BOOK_ENTRIES = 50;
export const MAX_ADDRESS_BOOK_LABEL_LENGTH = 40;

export interface AddressBookEntry {
  label: string;
  address: string;
  network: NetworkType;
}

function normalizeAddressBookLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const label = raw.trim().slice(0, MAX_ADDRESS_BOOK_LABEL_LENGTH);
  if (!label) return null;
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i);
    if (code < 32 || code === 127) return null;
  }
  return label;
}

export function normalizeAddressBookEntry(raw: unknown): AddressBookEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { label?: unknown; address?: unknown; network?: unknown };
  const network: NetworkType | null =
    obj.network === 'mainnet' || obj.network === 'testnet' ? obj.network : null;
  if (!network) return null;
  const label = normalizeAddressBookLabel(obj.label);
  if (!label) return null;
  if (typeof obj.address !== 'string') return null;
  const address = obj.address.trim();
  if (!isValidAddress(address, network)) return null;
  return { label, address, network };
}

export function normalizeAddressBook(raw: unknown): AddressBookEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AddressBookEntry[] = [];
  for (const item of raw) {
    if (out.length >= MAX_ADDRESS_BOOK_ENTRIES) break;
    const entry = normalizeAddressBookEntry(item);
    if (!entry) continue;
    const key = `${entry.network}:${entry.address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

export function addAddressBookEntry(
  book: AddressBookEntry[],
  entry: { label: string; address: string; network: NetworkType }
): AddressBookEntry[] {
  return normalizeAddressBook([...book, entry]);
}

export function removeAddressBookEntry(
  book: AddressBookEntry[],
  network: NetworkType,
  address: string
): AddressBookEntry[] {
  const normalized = address.trim().toLowerCase();
  return normalizeAddressBook(
    book.filter(
      (e) =>
        !(e.network === network && e.address.toLowerCase() === normalized)
    )
  );
}
