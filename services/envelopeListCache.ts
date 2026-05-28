import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EnvelopeTab } from './envelopeApi';
import type { Envelope } from '../types/signature';
import { userCacheScope } from './userScopedCache';
import { screenCache } from '../utils/screenCache';

export const ENVELOPE_LIST_PAGE_SIZE = 20;
const LIST_CACHE_PREFIX = 'sig_list_';
const STORAGE_PREFIX = '@grabdocs_sig_list:';
/** In-memory TTL — instant tab switches within a session. */
export const LIST_MEMORY_TTL_MS = 120_000;
/** AsyncStorage TTL — show last-known list on cold start. */
export const LIST_STORAGE_TTL_MS = 10 * 60_000;

export interface EnvelopeListCacheEntry {
  envelopes: Envelope[];
  hasMore: boolean;
  fetchedAt: number;
}

function memoryKey(userScope: string, tab: EnvelopeTab) {
  return `${LIST_CACHE_PREFIX}${userScope}_${tab}`;
}

function storageKey(userScope: string, tab: EnvelopeTab) {
  return `${STORAGE_PREFIX}${userScope}:${tab}`;
}

export function readEnvelopeListMemory(
  userId: string | number | null | undefined,
  tab: EnvelopeTab,
): EnvelopeListCacheEntry | null {
  const scope = userCacheScope(userId);
  if (!scope) return null;
  return screenCache.get<EnvelopeListCacheEntry>(memoryKey(scope, tab), LIST_MEMORY_TTL_MS);
}

export function writeEnvelopeListMemory(
  userId: string | number | null | undefined,
  tab: EnvelopeTab,
  entry: EnvelopeListCacheEntry,
) {
  const scope = userCacheScope(userId);
  if (!scope) return;
  screenCache.set(memoryKey(scope, tab), entry);
  void AsyncStorage.setItem(storageKey(scope, tab), JSON.stringify(entry)).catch(() => {});
}

export async function readEnvelopeListStorage(
  userId: string | number | null | undefined,
  tab: EnvelopeTab,
): Promise<EnvelopeListCacheEntry | null> {
  const scope = userCacheScope(userId);
  if (!scope) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(scope, tab));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EnvelopeListCacheEntry;
    if (!parsed?.fetchedAt || Date.now() - parsed.fetchedAt > LIST_STORAGE_TTL_MS) {
      await AsyncStorage.removeItem(storageKey(scope, tab));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function invalidateEnvelopeListCache(_tab?: EnvelopeTab) {
  // Always clear every user's cached lists — safe on logout and after mutations.
  screenCache.invalidatePrefix(LIST_CACHE_PREFIX);
  void AsyncStorage.getAllKeys()
    .then((keys) => keys.filter((k) => k.startsWith(STORAGE_PREFIX)))
    .then((keys) => AsyncStorage.multiRemove(keys))
    .catch(() => {});
}

export function isEnvelopeListStale(entry: EnvelopeListCacheEntry | null | undefined, ttlMs = LIST_MEMORY_TTL_MS) {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > ttlMs;
}
