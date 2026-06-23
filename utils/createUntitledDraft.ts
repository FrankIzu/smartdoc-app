import { Alert } from 'react-native';
import { apiClient } from '../services/api';
import { toAlertMessage } from './alertUtils';
import { CachedDraftMeta, draftsCache, isNetworkError } from './draftsCache';

export interface DraftListItem {
  id: number;
  original_filename?: string;
  file_kind?: string;
  created_at: string;
  updated_at?: string;
  json_data?: { source_file_id?: number; created_from?: string };
}

export interface CreateUntitledDraftResult {
  id: number;
  draft: DraftListItem;
  updatedList: DraftListItem[];
  wentOffline?: boolean;
}

const UNTITLED_HTML = '<p><br></p>';

async function createLocalUntitledDraft(userId: number | string): Promise<CreateUntitledDraftResult> {
  const localId = -Date.now();
  const nowIso = new Date().toISOString();
  const localDraft: CachedDraftMeta = {
    id: localId,
    original_filename: 'Untitled Note',
    file_kind: 'draft',
    created_at: nowIso,
    updated_at: nowIso,
  };
  const currentList = (await draftsCache.getDraftsList(userId)) || [];
  const updated = [localDraft, ...currentList.filter((d) => d.id !== localId)];
  await draftsCache.saveDraftsList(userId, updated);
  await draftsCache.saveDraftContent(userId, localId, {
    filename: 'Untitled Note',
    content_html: UNTITLED_HTML,
  });
  await draftsCache.addPendingCreate(userId, {
    localId,
    filename: 'Untitled Note',
    html: UNTITLED_HTML,
    plainText: '',
  });
  return {
    id: localId,
    draft: localDraft as DraftListItem,
    updatedList: updated as DraftListItem[],
    wentOffline: true,
  };
}

export async function createUntitledDraft(
  userId: number | string,
  currentDrafts: DraftListItem[],
  options?: { forceOffline?: boolean },
): Promise<CreateUntitledDraftResult | null> {
  if (options?.forceOffline) {
    return createLocalUntitledDraft(userId);
  }

  try {
    const res = await apiClient.createDraft();
    if (res?.success && (res as { draft?: DraftListItem }).draft?.id) {
      const newDraft = (res as { draft: DraftListItem }).draft;
      const updated = [newDraft as CachedDraftMeta, ...(currentDrafts as CachedDraftMeta[])];
      await draftsCache.saveDraftsList(userId, updated);
      return {
        id: newDraft.id,
        draft: newDraft,
        updatedList: updated as DraftListItem[],
      };
    }
    Alert.alert('Error', toAlertMessage((res as { message?: string })?.message, 'Failed to create note'));
    return null;
  } catch (e: unknown) {
    const err = e as { message?: string; response?: { data?: { message?: string } } };
    if (isNetworkError(e)) {
      return createLocalUntitledDraft(userId);
    }
    Alert.alert('Error', toAlertMessage(err?.message ?? err?.response?.data?.message, 'Failed to create note'));
    return null;
  }
}
