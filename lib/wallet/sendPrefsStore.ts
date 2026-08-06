/**
 * localStorage ports for send prefs (address book, daily spend).
 */

import {
  normalizeAddressBook,
  type AddressBookEntry,
} from './addressBook';
import {
  defaultDailySpendState,
  normalizeDailySpend,
  normalizeDailySpendLimit,
  type DailySpendState,
} from './dailySpend';

export const ADDRESS_BOOK_KEY = 'wallet_address_book';
export const DAILY_SPEND_LIMIT_KEY = 'wallet_daily_spend_limit_sats';
export const DAILY_SPEND_KEY = 'wallet_daily_spend';

export function readAddressBook(
  storage: Pick<Storage, 'getItem'> = localStorage
): AddressBookEntry[] {
  try {
    const raw = storage.getItem(ADDRESS_BOOK_KEY);
    if (!raw) return [];
    return normalizeAddressBook(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeAddressBook(
  entries: AddressBookEntry[],
  storage: Pick<Storage, 'setItem'> = localStorage
): void {
  storage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(normalizeAddressBook(entries)));
}

export function readDailySpendLimitSats(
  storage: Pick<Storage, 'getItem'> = localStorage
): number | null {
  try {
    const raw = storage.getItem(DAILY_SPEND_LIMIT_KEY);
    if (raw === null) return null;
    return normalizeDailySpendLimit(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeDailySpendLimitSats(
  limitSats: number | null,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage
): void {
  const normalized = normalizeDailySpendLimit(limitSats);
  if (normalized === null) {
    storage.removeItem(DAILY_SPEND_LIMIT_KEY);
    return;
  }
  storage.setItem(DAILY_SPEND_LIMIT_KEY, JSON.stringify(normalized));
}

export function readDailySpend(
  storage: Pick<Storage, 'getItem'> = localStorage,
  now: number = Date.now()
): DailySpendState {
  try {
    const raw = storage.getItem(DAILY_SPEND_KEY);
    if (!raw) return defaultDailySpendState(now);
    return normalizeDailySpend(JSON.parse(raw), now);
  } catch {
    return defaultDailySpendState(now);
  }
}

export function writeDailySpend(
  state: DailySpendState,
  storage: Pick<Storage, 'setItem'> = localStorage
): void {
  storage.setItem(DAILY_SPEND_KEY, JSON.stringify(normalizeDailySpend(state)));
}

export function clearDailySpendStorage(
  storage: Pick<Storage, 'removeItem'> = localStorage
): void {
  storage.removeItem(DAILY_SPEND_KEY);
}
