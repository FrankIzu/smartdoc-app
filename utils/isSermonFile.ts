import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { secureStorage } from './storage';

export interface SermonMetaResponse {
  success?: boolean;
  is_sermon?: boolean;
  sermon_id?: string | null;
  header_label?: string | null;
  original_filename?: string | null;
  file_type?: string | null;
}

const SERMON_ID_RE = /^\d{2}-\d{3,4}/i;

/** True when the file is a Branham sermon (paragraph text + PDF viewer). */
export function isSermonFromMeta(meta: SermonMetaResponse | null | undefined): boolean {
  if (!meta) return false;
  if (typeof meta.is_sermon === 'boolean') return meta.is_sermon;
  const sermonId = (meta.sermon_id || '').trim();
  return SERMON_ID_RE.test(sermonId);
}

export async function fetchSermonMeta(fileId: number): Promise<SermonMetaResponse | null> {
  try {
    const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    const res = await fetch(`${API_BASE_URL}/api/v1/web/files/${fileId}/sermon-meta`, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SermonMetaResponse;
    return data?.success ? data : null;
  } catch {
    return null;
  }
}

export async function isSermonFile(fileId: number): Promise<boolean> {
  const meta = await fetchSermonMeta(fileId);
  return isSermonFromMeta(meta);
}
