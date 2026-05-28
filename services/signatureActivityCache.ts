import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FillSubmission } from './fillApi';
import type { FillableTemplateListItem } from './fillableApi';
import { userCacheScope } from './userScopedCache';
import { screenCache } from '../utils/screenCache';

const MEMORY_KEY_PREFIX = 'sig_activity_';
const STORAGE_PREFIX = '@grabdocs_sig_activity:';

/** In-memory TTL — instant tab switches within a session. */
export const SIGNATURE_ACTIVITY_MEMORY_TTL_MS = 120_000;
/** AsyncStorage TTL — show last-known list on cold start. */
export const SIGNATURE_ACTIVITY_STORAGE_TTL_MS = 10 * 60_000;

export interface SignatureActivityCacheEntry {
  templates: FillableTemplateListItem[];
  submissions: FillSubmission[];
  fetchedAt: number;
}

function memoryKey(userScope: string) {
  return `${MEMORY_KEY_PREFIX}${userScope}`;
}

function storageKey(userScope: string) {
  return `${STORAGE_PREFIX}${userScope}`;
}

export function readSignatureActivityMemory(
  userId: string | number | null | undefined,
): SignatureActivityCacheEntry | null {
  const scope = userCacheScope(userId);
  if (!scope) return null;
  return screenCache.get<SignatureActivityCacheEntry>(
    memoryKey(scope),
    SIGNATURE_ACTIVITY_MEMORY_TTL_MS,
  );
}

export function writeSignatureActivityMemory(
  userId: string | number | null | undefined,
  entry: SignatureActivityCacheEntry,
) {
  const scope = userCacheScope(userId);
  if (!scope) return;
  screenCache.set(memoryKey(scope), entry);
  void AsyncStorage.setItem(storageKey(scope), JSON.stringify(entry)).catch(() => {});
}

export async function readSignatureActivityStorage(
  userId: string | number | null | undefined,
): Promise<SignatureActivityCacheEntry | null> {
  const scope = userCacheScope(userId);
  if (!scope) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignatureActivityCacheEntry;
    if (!parsed?.fetchedAt || Date.now() - parsed.fetchedAt > SIGNATURE_ACTIVITY_STORAGE_TTL_MS) {
      await AsyncStorage.removeItem(storageKey(scope));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isSignatureActivityStale(
  entry: SignatureActivityCacheEntry | null | undefined,
  ttlMs = SIGNATURE_ACTIVITY_MEMORY_TTL_MS,
) {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > ttlMs;
}

export function invalidateSignatureActivityCache() {
  screenCache.invalidatePrefix(MEMORY_KEY_PREFIX);
  void AsyncStorage.getAllKeys()
    .then((keys) => keys.filter((k) => k.startsWith(STORAGE_PREFIX)))
    .then((keys) => AsyncStorage.multiRemove(keys))
    .catch(() => {});
}
