import { apiClient } from '../services/api';
import {
  CachedDraftMeta,
  draftsCache,
  isNetworkError,
} from './draftsCache';

function plainTextFromHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Upload a single local-only draft (negative id) to the server.
 * Returns the new server id, or null if still offline / failed.
 */
export async function syncSingleLocalDraft(
  userId: string | number,
  localId: number,
): Promise<number | null> {
  if (!draftsCache.isLocalDraftId(localId)) return localId;

  const pending = await draftsCache.getPendingCreates(userId);
  const create = pending.find((c) => c.localId === localId);
  const cached = await draftsCache.getDraftContent(userId, localId);

  if (!create && !cached) {
    await draftsCache.removePendingCreate(userId, localId);
    return null;
  }

  const html = create?.html ?? cached?.content_html ?? '<p><br></p>';
  const plainText = create?.plainText ?? plainTextFromHtml(html);
  const filename = create?.filename ?? cached?.filename ?? 'Untitled Note';

  try {
    const res = await apiClient.createDraft();
    const serverId = (res as { draft?: { id?: number } })?.draft?.id;
    if (!serverId) return null;

    await apiClient.saveDraft(serverId, html, plainText);
    if (filename !== 'Untitled Note') {
      await apiClient.renameFile(serverId, filename);
    }

    await draftsCache.saveDraftContent(userId, serverId, {
      filename,
      content_html: html,
    });
    await draftsCache.deleteDraftContent(userId, localId);
    await draftsCache.remapPendingSaves(userId, localId, serverId);
    await draftsCache.remapPendingRenames(userId, localId, serverId);
    await draftsCache.removePendingCreate(userId, localId);
    await draftsCache.removeFromDraftsList(userId, localId);

    const list = await draftsCache.getDraftsList(userId);
    const now = new Date().toISOString();
    const serverMeta: CachedDraftMeta = {
      id: serverId,
      original_filename: filename,
      file_kind: 'draft',
      created_at: now,
      updated_at: now,
    };
    const updatedList = [
      serverMeta,
      ...(list || []).filter((d) => d.id !== localId && d.id !== serverId),
    ];
    await draftsCache.saveDraftsList(userId, updatedList);

    return serverId;
  } catch (e) {
    if (!isNetworkError(e)) {
      console.warn('syncSingleLocalDraft failed:', e);
    }
    return null;
  }
}

/** Upload all queued local-only drafts (oldest first). Stops on first failure. */
export async function flushPendingCreates(userId: string | number): Promise<void> {
  const pendingCreates = await draftsCache.getPendingCreates(userId);
  if (pendingCreates.length === 0) return;
  const sorted = [...pendingCreates].sort((a, b) => a.queued_at - b.queued_at);
  for (const create of sorted) {
    const serverId = await syncSingleLocalDraft(userId, create.localId);
    if (!serverId) break;
  }
}

export async function flushAllPendingSaves(userId: string | number): Promise<void> {
  const pending = await draftsCache.getPendingSaves(userId);
  if (pending.length === 0) return;
  for (const item of pending) {
    if (draftsCache.isLocalDraftId(item.id)) continue;
    try {
      await apiClient.saveDraft(item.id, item.html, item.plainText);
      await draftsCache.removePendingSave(userId, item.id);
    } catch {
      break;
    }
  }
}

export async function flushAllPendingRenames(userId: string | number): Promise<void> {
  const pending = await draftsCache.getPendingRenames(userId);
  if (pending.length === 0) return;
  for (const item of pending) {
    if (draftsCache.isLocalDraftId(item.id)) continue;
    try {
      await apiClient.renameFile(item.id, item.filename);
      await draftsCache.removePendingRename(userId, item.id);
    } catch {
      break;
    }
  }
}

/** Push all offline note ops, then refresh list merge happens separately. */
export async function flushAllPendingDraftOps(userId: string | number): Promise<void> {
  await flushPendingCreates(userId);
  await flushAllPendingSaves(userId);
  await flushAllPendingRenames(userId);
}
