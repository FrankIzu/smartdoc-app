import AsyncStorage from '@react-native-async-storage/async-storage';
import { userCacheScope } from './userScopedCache';
import { screenCache } from '../utils/screenCache';

export const FILL_PICK_PAGE_SIZE = 20;
const MEMORY_PREFIX = 'fill_pick_';
const STORAGE_PREFIX = '@grabdocs_fill_pick:';
export const FILL_PICK_MEMORY_TTL_MS = 120_000;
export const FILL_PICK_STORAGE_TTL_MS = 10 * 60_000;

export interface FillPickFile {
  id: number;
  name: string;
  updatedAt?: string;
  createdAt?: string;
  fileSize?: number;
  fileKind?: string;
}

export interface FillPickListCacheEntry {
  files: FillPickFile[];
  hasMore: boolean;
  fetchedAt: number;
}

function memoryKey(userScope: string, search: string) {
  return `${MEMORY_PREFIX}${userScope}_${search || '__all__'}`;
}

function storageKey(userScope: string, search: string) {
  return `${STORAGE_PREFIX}${userScope}:${search || '__all__'}`;
}

export function readFillPickMemory(
  userId: string | number | null | undefined,
  search: string,
): FillPickListCacheEntry | null {
  const scope = userCacheScope(userId);
  if (!scope) return null;
  return screenCache.get<FillPickListCacheEntry>(memoryKey(scope, search), FILL_PICK_MEMORY_TTL_MS);
}

export function writeFillPickMemory(
  userId: string | number | null | undefined,
  search: string,
  entry: FillPickListCacheEntry,
) {
  const scope = userCacheScope(userId);
  if (!scope) return;
  screenCache.set(memoryKey(scope, search), entry);
  void AsyncStorage.setItem(storageKey(scope, search), JSON.stringify(entry)).catch(() => {});
}

export async function readFillPickStorage(
  userId: string | number | null | undefined,
  search: string,
): Promise<FillPickListCacheEntry | null> {
  const scope = userCacheScope(userId);
  if (!scope) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(scope, search));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FillPickListCacheEntry;
    if (!parsed?.fetchedAt || Date.now() - parsed.fetchedAt > FILL_PICK_STORAGE_TTL_MS) {
      await AsyncStorage.removeItem(storageKey(scope, search));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function invalidateFillPickListCache(_search?: string) {
  screenCache.invalidatePrefix(MEMORY_PREFIX);
  void AsyncStorage.getAllKeys()
    .then((keys) => keys.filter((k) => k.startsWith(STORAGE_PREFIX)))
    .then((keys) => AsyncStorage.multiRemove(keys))
    .catch(() => {});
}

export function isFillPickListStale(
  entry: FillPickListCacheEntry | null | undefined,
  ttlMs = FILL_PICK_MEMORY_TTL_MS,
) {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > ttlMs;
}
