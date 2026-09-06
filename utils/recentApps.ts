/** Persist / read recently used home app keys. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'grabdocs_recent_apps_v1';
const MAX = 12;

export const DEFAULT_RECENT_APPS = ['upload', 'clients', 'chatgd', 'intake'] as const;

export async function getRecentApps(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [...DEFAULT_RECENT_APPS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_RECENT_APPS];
    return parsed.filter((x) => typeof x === 'string');
  } catch {
    return [...DEFAULT_RECENT_APPS];
  }
}

export async function trackRecentApp(key: string): Promise<void> {
  try {
    const prev = await getRecentApps();
    const next = [key, ...prev.filter((k) => k !== key)].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
