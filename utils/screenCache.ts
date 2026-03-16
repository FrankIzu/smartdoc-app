/**
 * screenCache — lightweight module-level TTL cache shared across screens.
 *
 * Lives for the lifetime of the JS bundle (survives React component unmounts,
 * which matters for stack-based screens that unmount when navigating away).
 * Use `useRef`-based caches inside tab screens when you need per-instance caches.
 *
 * Usage:
 *   screenCache.set('dashboard', { stats, activities });
 *   const cached = screenCache.get<DashboardCache>('dashboard', 60_000); // 60 s TTL
 *   screenCache.invalidate('dashboard');
 *   screenCache.invalidatePrefix('workspace_detail_');
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class ScreenCache {
  private entries = new Map<string, CacheEntry<unknown>>();

  /** Return cached data if it exists and is within `ttlMs`. Returns null on miss/expiry. */
  get<T>(key: string, ttlMs: number): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /** Store data under `key` with the current timestamp. */
  set<T>(key: string, data: T): void {
    this.entries.set(key, { data, timestamp: Date.now() });
  }

  /** Remove a single cache entry. */
  invalidate(key: string): void {
    this.entries.delete(key);
  }

  /** Remove all entries whose key starts with `prefix`. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  /** Remove all entries. */
  clear(): void {
    this.entries.clear();
  }
}

export const screenCache = new ScreenCache();
