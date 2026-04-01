import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  DRAFTS_LIST: 'drafts_cache_list',
  DRAFT_CONTENT: (id: number | string) => `drafts_cache_content_${id}`,
  PENDING_SAVES: 'drafts_cache_pending_saves',
  PENDING_RENAMES: 'drafts_cache_pending_renames',
  PENDING_CREATES: 'drafts_cache_pending_creates',
};

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
  const msg = (e?.message ?? e?.response?.data?.message ?? '').toString().toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('err_network') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection') ||
    e?.code === 'ERR_NETWORK' ||
    e?.code === 'ECONNREFUSED'
  );
}

export { isNetworkError };

export const draftsCache = {
  isLocalDraftId(id: number): boolean {
    return Number(id) < 0;
  },

  async getDraftsList(): Promise<CachedDraftMeta[] | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.DRAFTS_LIST);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async saveDraftsList(drafts: CachedDraftMeta[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.DRAFTS_LIST, JSON.stringify(drafts));
    } catch {}
  },

  async removeFromDraftsList(id: number): Promise<void> {
    try {
      const list = await this.getDraftsList();
      if (!list) return;
      const filtered = list.filter(d => d.id !== id);
      await this.saveDraftsList(filtered);
    } catch {}
  },

  async getDraftContent(id: number): Promise<CachedDraftContent | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.DRAFT_CONTENT(id));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async saveDraftContent(id: number, data: Omit<CachedDraftContent, 'cached_at'>): Promise<void> {
    try {
      await AsyncStorage.setItem(
        KEYS.DRAFT_CONTENT(id),
        JSON.stringify({ ...data, cached_at: Date.now() })
      );
    } catch {}
  },

  async deleteDraftContent(id: number): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEYS.DRAFT_CONTENT(id));
    } catch {}
  },

  async updateCachedMeta(id: number, patch: Partial<CachedDraftMeta>): Promise<void> {
    try {
      const list = await this.getDraftsList();
      if (!list) return;
      const updated = list.map(d => (d.id === id ? { ...d, ...patch } : d));
      await this.saveDraftsList(updated);
    } catch {}
  },

  async updateCachedFilename(id: number, filename: string): Promise<void> {
    try {
      const content = await this.getDraftContent(id);
      if (content) {
        await this.saveDraftContent(id, { ...content, filename });
      }
      await this.updateCachedMeta(id, { original_filename: filename });
    } catch {}
  },

  async getPendingSaves(): Promise<PendingSave[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.PENDING_SAVES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async addPendingSave(save: Omit<PendingSave, 'queued_at'>): Promise<void> {
    try {
      const existing = await this.getPendingSaves();
      const filtered = existing.filter(s => s.id !== save.id);
      filtered.push({ ...save, queued_at: Date.now() });
      await AsyncStorage.setItem(KEYS.PENDING_SAVES, JSON.stringify(filtered));
    } catch {}
  },

  async removePendingSave(id: number): Promise<void> {
    try {
      const existing = await this.getPendingSaves();
      const filtered = existing.filter(s => s.id !== id);
      await AsyncStorage.setItem(KEYS.PENDING_SAVES, JSON.stringify(filtered));
    } catch {}
  },

  async hasPendingSave(id: number): Promise<boolean> {
    try {
      const existing = await this.getPendingSaves();
      return existing.some(s => s.id === id);
    } catch {
      return false;
    }
  },

  async remapPendingSaves(localId: number, serverId: number): Promise<void> {
    try {
      const existing = await this.getPendingSaves();
      const remapped = existing.map(s => (s.id === localId ? { ...s, id: serverId } : s));
      const deduped: PendingSave[] = [];
      const seen = new Set<number>();
      for (let i = remapped.length - 1; i >= 0; i -= 1) {
        const item = remapped[i];
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        deduped.unshift(item);
      }
      await AsyncStorage.setItem(KEYS.PENDING_SAVES, JSON.stringify(deduped));
    } catch {}
  },

  async getPendingRenames(): Promise<PendingRename[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.PENDING_RENAMES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async addPendingRename(rename: Omit<PendingRename, 'queued_at'>): Promise<void> {
    try {
      const existing = await this.getPendingRenames();
      const filtered = existing.filter(r => r.id !== rename.id);
      filtered.push({ ...rename, queued_at: Date.now() });
      await AsyncStorage.setItem(KEYS.PENDING_RENAMES, JSON.stringify(filtered));
    } catch {}
  },

  async removePendingRename(id: number): Promise<void> {
    try {
      const existing = await this.getPendingRenames();
      const filtered = existing.filter(r => r.id !== id);
      await AsyncStorage.setItem(KEYS.PENDING_RENAMES, JSON.stringify(filtered));
    } catch {}
  },

  async remapPendingRenames(localId: number, serverId: number): Promise<void> {
    try {
      const existing = await this.getPendingRenames();
      const remapped = existing.map(r => (r.id === localId ? { ...r, id: serverId } : r));
      const deduped: PendingRename[] = [];
      const seen = new Set<number>();
      for (let i = remapped.length - 1; i >= 0; i -= 1) {
        const item = remapped[i];
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        deduped.unshift(item);
      }
      await AsyncStorage.setItem(KEYS.PENDING_RENAMES, JSON.stringify(deduped));
    } catch {}
  },

  async getPendingCreates(): Promise<PendingCreate[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.PENDING_CREATES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async addPendingCreate(create: Omit<PendingCreate, 'queued_at'>): Promise<void> {
    try {
      const existing = await this.getPendingCreates();
      const filtered = existing.filter(c => c.localId !== create.localId);
      filtered.push({ ...create, queued_at: Date.now() });
      await AsyncStorage.setItem(KEYS.PENDING_CREATES, JSON.stringify(filtered));
    } catch {}
  },

  async updatePendingCreate(localId: number, patch: Partial<Omit<PendingCreate, 'localId' | 'queued_at'>>): Promise<void> {
    try {
      const existing = await this.getPendingCreates();
      const updated = existing.map(c => (c.localId === localId ? { ...c, ...patch } : c));
      await AsyncStorage.setItem(KEYS.PENDING_CREATES, JSON.stringify(updated));
    } catch {}
  },

  async removePendingCreate(localId: number): Promise<void> {
    try {
      const existing = await this.getPendingCreates();
      const filtered = existing.filter(c => c.localId !== localId);
      await AsyncStorage.setItem(KEYS.PENDING_CREATES, JSON.stringify(filtered));
    } catch {}
  },
};
