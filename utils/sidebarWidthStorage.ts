import AsyncStorage from '@react-native-async-storage/async-storage';
import { clampSidebarWidth } from '../hooks/useNotesSplitLayout';

const KEY_PREFIX = '@grabdocs/sidebarWidth:';

function storageKey(userId: number | string): string {
  return `${KEY_PREFIX}${userId}`;
}

export async function getStoredSidebarWidth(
  userId: number | string,
  screenWidth: number,
): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return null;
    return clampSidebarWidth(parsed, screenWidth);
  } catch {
    return null;
  }
}

export async function saveSidebarWidth(
  userId: number | string,
  width: number,
  screenWidth: number,
): Promise<void> {
  try {
    const clamped = clampSidebarWidth(width, screenWidth);
    await AsyncStorage.setItem(storageKey(userId), String(clamped));
  } catch {
    // best-effort
  }
}
