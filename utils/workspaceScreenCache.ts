/**
 * Shared TTL cache keys for workspace-scoped mobile data (members, activities, files sheet).
 * Keeps keys consistent across workspace detail, chats participant picker, etc.
 */
import { screenCache } from './screenCache';

export const WORKSPACE_MEMBERS_CACHE_MS = 60_000;
export const WORKSPACE_ACTIVITIES_CACHE_MS = 60_000;
export const WORKSPACE_FILES_SHEET_CACHE_MS = 45_000;

export function workspaceMembersCacheKey(workspaceId: number): string {
  return `workspace_members_${workspaceId}`;
}

export function workspaceActivitiesCacheKey(workspaceId: number): string {
  return `workspace_activities_${workspaceId}`;
}

/** First page of workspace files bottom sheet (offset 0). */
export function workspaceFilesSheetFirstPageKey(workspaceId: number): string {
  return `workspace_files_sheet_${workspaceId}`;
}

export interface WorkspaceMembersCachePayload {
  members: any[];
  invitations: any[];
}

export interface WorkspaceActivitiesCachePayload {
  activities: any[];
}

export interface WorkspaceFilesSheetCachePayload {
  /** Prefer slim rows `{ bookmark_id, bookmark_name, file_count }` — avoid caching nested bookmark `files`. */
  bookmarks: any[];
  files: any[];
  hasMore: boolean;
  nextOffset: number | null;
}

/** Call after member/invite/workspace mutations so all workspace slices stay consistent. */
export function invalidateWorkspaceScreenCaches(
  routeId: string,
  workspaceNumericId: number
): void {
  screenCache.invalidate(`workspace_detail_${routeId}`);
  screenCache.invalidate(workspaceMembersCacheKey(workspaceNumericId));
  screenCache.invalidate(workspaceActivitiesCacheKey(workspaceNumericId));
  screenCache.invalidate(workspaceFilesSheetFirstPageKey(workspaceNumericId));
  // Workspace list tab uses member_count / roles; refresh when this workspace changes.
  screenCache.invalidate('workspaces_list');
}
