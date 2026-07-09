import AsyncStorage from '@react-native-async-storage/async-storage';
import { screenCache } from '../utils/screenCache';

/** Scope caches to the authenticated user — never share across accounts on one device. */
export function userCacheScope(userId: string | number | null | undefined): string | null {
  if (userId == null) return null;
  const id = String(userId).trim();
  return id ? `u${id}` : null;
}

export function scopedScreenKey(
  userId: string | number | null | undefined,
  key: string,
): string | null {
  const scope = userCacheScope(userId);
  return scope ? `${key}_${scope}` : null;
}

export function scopedStorageKey(
  userId: string | number | null | undefined,
  baseKey: string,
): string | null {
  const scope = userCacheScope(userId);
  return scope ? `${baseKey}:${scope}` : null;
}

// ---- Screen cache key builders ----

export function dashboardScreenKey(userId: string | number | null | undefined) {
  return scopedScreenKey(userId, 'dashboard_data');
}

export function chatListScreenKey(userId: string | number | null | undefined) {
  return scopedScreenKey(userId, 'chat_list_data');
}

export function workspacesListScreenKey(userId: string | number | null | undefined) {
  return scopedScreenKey(userId, 'workspaces_list');
}

export function bookmarksListScreenKey(userId: string | number | null | undefined) {
  return scopedScreenKey(userId, 'bookmarks_list');
}

export function bookmarkDetailScreenKey(
  userId: string | number | null | undefined,
  bookmarkId: number,
) {
  return scopedScreenKey(userId, `bookmark_detail_${bookmarkId}`);
}

export function userProfileScreenKey(userId: string | number | null | undefined) {
  return scopedScreenKey(userId, 'user_profile');
}

export function workspaceDetailScreenKey(
  userId: string | number | null | undefined,
  routeId: string,
) {
  return scopedScreenKey(userId, `workspace_detail_${routeId}`);
}

export function workspaceMembersScreenKey(
  userId: string | number | null | undefined,
  workspaceId: number,
) {
  return scopedScreenKey(userId, `workspace_members_${workspaceId}`);
}

export function workspaceActivitiesScreenKey(
  userId: string | number | null | undefined,
  workspaceId: number,
) {
  return scopedScreenKey(userId, `workspace_activities_${workspaceId}`);
}

export function workspaceFilesSheetScreenKey(
  userId: string | number | null | undefined,
  workspaceId: number,
) {
  return scopedScreenKey(userId, `workspace_files_sheet_${workspaceId}`);
}

export function intakesListScreenKey(
  userId: string | number | null | undefined,
  archived: boolean,
) {
  return scopedScreenKey(userId, archived ? 'intakes_list_archived' : 'intakes_list_active');
}

export function intakeDetailScreenKey(
  userId: string | number | null | undefined,
  intakeId: number,
) {
  return scopedScreenKey(userId, `intake_detail_${intakeId}`);
}

export function uploadLinksListScreenKey(userId: string | number | null | undefined) {
  return scopedScreenKey(userId, 'upload_links_list');
}

export function uploadLinkDetailScreenKey(
  userId: string | number | null | undefined,
  linkId: number,
) {
  return scopedScreenKey(userId, `upload_link_detail_${linkId}`);
}

export function signaturesHubScreenKey(
  userId: string | number | null | undefined,
  tab: string,
) {
  return scopedScreenKey(userId, `signatures_hub_${tab}`);
}

// ---- AsyncStorage key builders ----

export function chatContextsStorageKey(userId: string | number | null | undefined) {
  return scopedStorageKey(userId, '@grabdocs_chat_contexts');
}

export function favoriteChatsStorageKey(userId: string | number | null | undefined) {
  return scopedStorageKey(userId, '@grabdocs_favorite_chats');
}

export function userChatFavoritesStorageKey(userId: string | number | null | undefined) {
  return scopedStorageKey(userId, '@grabdocs_user_chat_favorites');
}

export function wizardSourcesStorageKey(userId: string | number | null | undefined) {
  return scopedStorageKey(userId, '@grabdocs_sig_wizard_sources');
}

export function signatureSessionStorageKey(
  userId: string | number | null | undefined,
  sessionKey: string,
) {
  const scope = userCacheScope(userId);
  return scope ? `@grabdocs_sig_session:${scope}:${sessionKey}` : null;
}

export function signatureDraftStorageKey(
  userId: string | number | null | undefined,
  envelopeId: string,
) {
  const scope = userCacheScope(userId);
  return scope ? `@grabdocs_sig_draft:${scope}:${envelopeId}` : null;
}

export function draftsListStorageKey(userId: string | number) {
  const scope = userCacheScope(userId);
  return scope ? `drafts_cache_list_${scope}` : null;
}

export function draftsContentStorageKey(userId: string | number, draftId: number | string) {
  const scope = userCacheScope(userId);
  return scope ? `drafts_cache_content_${scope}_${draftId}` : null;
}

export function draftsPendingSavesKey(userId: string | number) {
  const scope = userCacheScope(userId);
  return scope ? `drafts_cache_pending_saves_${scope}` : null;
}

export function draftsPendingRenamesKey(userId: string | number) {
  const scope = userCacheScope(userId);
  return scope ? `drafts_cache_pending_renames_${scope}` : null;
}

export function draftsPendingCreatesKey(userId: string | number) {
  const scope = userCacheScope(userId);
  return scope ? `drafts_cache_pending_creates_${scope}` : null;
}

// ---- Legacy unscoped keys (purge on logout) ----

const LEGACY_EXACT_SCREEN_KEYS = [
  'dashboard_data',
  'chat_list_data',
  'workspaces_list',
  'bookmarks_list',
  'user_profile',
] as const;

const LEGACY_SCREEN_PREFIXES = [
  'sig_list_',
  'sig_activity_',
  'fill_pick_',
  'bookmark_detail_',
  'workspace_detail_',
  'workspace_members_',
  'workspace_activities_',
  'workspace_files_sheet_',
  'intakes_list_',
  'intake_detail_',
  'upload_links_list_',
  'upload_link_detail_',
  'signatures_hub_',
  'dashboard_data_',
  'chat_list_data_',
  'workspaces_list_',
  'bookmarks_list_',
  'user_profile_',
] as const;

const LEGACY_EXACT_STORAGE_KEYS = [
  '@grabdocs_chat_contexts',
  '@grabdocs_favorite_chats',
  '@grabdocs_user_chat_favorites',
  '@grabdocs_sig_wizard_sources',
  'drafts_cache_list',
  'drafts_cache_pending_saves',
  'drafts_cache_pending_renames',
  'drafts_cache_pending_creates',
] as const;

const LEGACY_STORAGE_PREFIXES = [
  '@grabdocs_sig_list:',
  '@grabdocs_sig_activity:',
  '@grabdocs_fill_pick:',
  '@grabdocs_chat_contexts:',
  '@grabdocs_favorite_chats:',
  '@grabdocs_user_chat_favorites:',
  '@grabdocs_sig_wizard_sources:',
  '@grabdocs_sig_session:',
  '@grabdocs_sig_draft:',
  'drafts_cache_content_',
  'drafts_cache_list_',
  'drafts_cache_pending_',
] as const;

function purgeLegacyScreenCache(): void {
  for (const key of LEGACY_EXACT_SCREEN_KEYS) {
    screenCache.invalidate(key);
  }
  for (const prefix of LEGACY_SCREEN_PREFIXES) {
    screenCache.invalidatePrefix(prefix);
  }
}

/** Wipe every user-specific cache (call on logout / account switch). */
export async function clearAllUserScopedCaches(): Promise<void> {
  purgeLegacyScreenCache();
  screenCache.clear();

  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((k) => {
      if (LEGACY_EXACT_STORAGE_KEYS.includes(k as (typeof LEGACY_EXACT_STORAGE_KEYS)[number])) {
        return true;
      }
      return LEGACY_STORAGE_PREFIXES.some((p) => k.startsWith(p));
    });
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch {
    // non-fatal
  }
}

/** @deprecated Use clearAllUserScopedCaches */
export async function clearAllUserListCaches(): Promise<void> {
  await clearAllUserScopedCaches();
}
