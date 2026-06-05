import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  draftsContentStorageKey,
  draftsListStorageKey,
  draftsPendingCreatesKey,
  draftsPendingRenamesKey,
  draftsPendingSavesKey,
} from '../services/userScopedCache';

export interface CachedDraftMeta {
  id: number;
  original_filename?: string;
  file_kind?: string;
  created_at: string;
  updated_at?: string;
  json_data?: { source_file_id?: number; created_from?: string };
}

export interface CachedDraftContent {
  filename: string;
  content_html: string;
  version?: number;
  updated_at?: string;
  cached_at: number;
}

export interface PendingSave {
  id: number;
  html: string;
  plainText: string;
  filename?: string;
  queued_at: number;
}

export interface PendingRename {
  id: number;
  filename: string;
  queued_at: number;
}

export interface PendingCreate {
  localId: number;
  filename: string;
  html: string;
  plainText: string;
  queued_at: number;
}

function isNetworkError(e: any): boolean {
  // Gateway/proxy errors (502, 503, 504) and no-response cases both mean the
  // device cannot reach the server — treat them identically to a dropped connection
  // so the app falls back to offline mode instead of showing a raw HTTP error alert.
  const status = e?.response?.status as number | undefined;
  if (status === 502 || status === 503 || status === 504 || status === 0) return true;
  if (!e?.response && e?.request) return true; // request sent but no response received
  if (e?.isOfflineGatewayError === true) return true;
  const msg = (e?.message ?? e?.response?.data?.message ?? '').toString().toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('err_network') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection') ||
    msg.includes('failed to connect') ||
    e?.code === 'ERR_NETWORK' ||
    e?.code === 'ECONNREFUSED' ||
    e?.code === 'ECONNABORTED'
  );
}

export { isNetworkError };

export const draftsCache = {
  isLocalDraftId(id: number): boolean {
    return Number(id) < 0;
  },

  async getDraftsList(userId: string | number): Promise<CachedDraftMeta[] | null> {
    try {
      const key = draftsListStorageKey(userId);
      if (!key) return null;
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async saveDraftsList(userId: string | number, drafts: CachedDraftMeta[]): Promise<void> {
    try {
      const key = draftsListStorageKey(userId);
      if (!key) return;
      await AsyncStorage.setItem(key, JSON.stringify(drafts));
    } catch {}
  },

  async removeFromDraftsList(userId: string | number, id: number): Promise<void> {
    try {
      const list = await this.getDraftsList(userId);
      if (!list) return;
      const filtered = list.filter(d => d.id !== id);
      await this.saveDraftsList(userId, filtered);
    } catch {}
  },

  async getDraftContent(userId: string | number, id: number): Promise<CachedDraftContent | null> {
    try {
      const key = draftsContentStorageKey(userId, id);
      if (!key) return null;
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async saveDraftContent(
    userId: string | number,
    id: number,
    data: Omit<CachedDraftContent, 'cached_at'>,
  ): Promise<void> {
    try {
      const key = draftsContentStorageKey(userId, id);
      if (!key) return;
      await AsyncStorage.setItem(
        key,
        JSON.stringify({ ...data, cached_at: Date.now() })
      );
    } catch {}
  },

  async deleteDraftContent(userId: string | number, id: number): Promise<void> {
    try {
      const key = draftsContentStorageKey(userId, id);
      if (!key) return;
      await AsyncStorage.removeItem(key);
    } catch {}
  },

  async updateCachedMeta(
    userId: string | number,
    id: number,
    patch: Partial<CachedDraftMeta>,
  ): Promise<void> {
    try {
      const list = await this.getDraftsList(userId);
      if (!list) return;
      const updated = list.map(d => (d.id === id ? { ...d, ...patch } : d));
      await this.saveDraftsList(userId, updated);
    } catch {}
  },

  async updateCachedFilename(userId: string | number, id: number, filename: string): Promise<void> {
    try {
      const content = await this.getDraftContent(userId, id);
      if (content) {
        await this.saveDraftContent(userId, id, { ...content, filename });
      }
      await this.updateCachedMeta(userId, id, { original_filename: filename });
    } catch {}
  },

  async getPendingSaves(userId: string | number): Promise<PendingSave[]> {
    try {
      const key = draftsPendingSavesKey(userId);
      if (!key) return [];
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async addPendingSave(userId: string | number, save: Omit<PendingSave, 'queued_at'>): Promise<void> {
    try {
      const key = draftsPendingSavesKey(userId);
      if (!key) return;
      const existing = await this.getPendingSaves(userId);
      const filtered = existing.filter(s => s.id !== save.id);
      filtered.push({ ...save, queued_at: Date.now() });
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    } catch {}
  },

  async removePendingSave(userId: string | number, id: number): Promise<void> {
    try {
      const key = draftsPendingSavesKey(userId);
      if (!key) return;
      const existing = await this.getPendingSaves(userId);
      const filtered = existing.filter(s => s.id !== id);
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    } catch {}
  },

  async hasPendingSave(userId: string | number, id: number): Promise<boolean> {
    try {
      const existing = await this.getPendingSaves(userId);
      return existing.some(s => s.id === id);
    } catch {
      return false;
    }
  },

  async remapPendingSaves(userId: string | number, localId: number, serverId: number): Promise<void> {
    try {
      const key = draftsPendingSavesKey(userId);
      if (!key) return;
      const existing = await this.getPendingSaves(userId);
      const remapped = existing.map(s => (s.id === localId ? { ...s, id: serverId } : s));
      const deduped: PendingSave[] = [];
      const seen = new Set<number>();
      for (let i = remapped.length - 1; i >= 0; i -= 1) {
        const item = remapped[i];
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        deduped.unshift(item);
      }
      await AsyncStorage.setItem(key, JSON.stringify(deduped));
    } catch {}
  },

  async getPendingRenames(userId: string | number): Promise<PendingRename[]> {
    try {
      const key = draftsPendingRenamesKey(userId);
      if (!key) return [];
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async addPendingRename(userId: string | number, rename: Omit<PendingRename, 'queued_at'>): Promise<void> {
    try {
      const key = draftsPendingRenamesKey(userId);
      if (!key) return;
      const existing = await this.getPendingRenames(userId);
      const filtered = existing.filter(r => r.id !== rename.id);
      filtered.push({ ...rename, queued_at: Date.now() });
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    } catch {}
  },

  async removePendingRename(userId: string | number, id: number): Promise<void> {
    try {
      const key = draftsPendingRenamesKey(userId);
      if (!key) return;
      const existing = await this.getPendingRenames(userId);
      const filtered = existing.filter(r => r.id !== id);
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    } catch {}
  },

  async remapPendingRenames(userId: string | number, localId: number, serverId: number): Promise<void> {
    try {
      const key = draftsPendingRenamesKey(userId);
      if (!key) return;
      const existing = await this.getPendingRenames(userId);
      const remapped = existing.map(r => (r.id === localId ? { ...r, id: serverId } : r));
      const deduped: PendingRename[] = [];
      const seen = new Set<number>();
      for (let i = remapped.length - 1; i >= 0; i -= 1) {
        const item = remapped[i];
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        deduped.unshift(item);
      }
      await AsyncStorage.setItem(key, JSON.stringify(deduped));
    } catch {}
  },

  async getPendingCreates(userId: string | number): Promise<PendingCreate[]> {
    try {
      const key = draftsPendingCreatesKey(userId);
      if (!key) return [];
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async addPendingCreate(userId: string | number, create: Omit<PendingCreate, 'queued_at'>): Promise<void> {
    try {
      const key = draftsPendingCreatesKey(userId);
      if (!key) return;
      const existing = await this.getPendingCreates(userId);
      const filtered = existing.filter(c => c.localId !== create.localId);
      filtered.push({ ...create, queued_at: Date.now() });
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    } catch {}
  },

  async updatePendingCreate(
    userId: string | number,
    localId: number,
    patch: Partial<Omit<PendingCreate, 'localId' | 'queued_at'>>,
  ): Promise<void> {
    try {
      const key = draftsPendingCreatesKey(userId);
      if (!key) return;
      const existing = await this.getPendingCreates(userId);
      const updated = existing.map(c => (c.localId === localId ? { ...c, ...patch } : c));
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    } catch {}
  },

  async removePendingCreate(userId: string | number, localId: number): Promise<void> {
    try {
      const key = draftsPendingCreatesKey(userId);
      if (!key) return;
      const existing = await this.getPendingCreates(userId);
      const filtered = existing.filter(c => c.localId !== localId);
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    } catch {}
  },
};
