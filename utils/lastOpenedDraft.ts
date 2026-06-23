import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = '@grabdocs/lastOpenedDraft:';

function storageKey(userId: number | string): string {
  return `${KEY_PREFIX}${userId}`;
}

export async function getLastOpenedDraftId(userId: number | string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const id = parseInt(raw, 10);
    return Number.isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

export async function saveLastOpenedDraft(userId: number | string, draftId: number): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), String(draftId));
  } catch {
    // best-effort
  }
}
