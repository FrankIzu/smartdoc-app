import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  DRAFTS_LIST: 'drafts_cache_list',
  DRAFT_CONTENT: (id: number | string) => `drafts_cache_content_${id}`,
  PENDING_SAVES: 'drafts_cache_pending_saves',
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
};
