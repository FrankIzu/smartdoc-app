/**
 * Shared TTL cache keys for workspace-scoped mobile data (members, activities, files sheet).
 * Keys include the authenticated user id so accounts never share cached workspace data.
 */
import {
  workspaceActivitiesScreenKey,
  workspaceDetailScreenKey,
  workspaceFilesSheetScreenKey,
  workspaceMembersScreenKey,
  workspacesListScreenKey,
} from '../services/userScopedCache';
import { screenCache } from './screenCache';

export const WORKSPACE_MEMBERS_CACHE_MS = 60_000;
export const WORKSPACE_ACTIVITIES_CACHE_MS = 60_000;
export const WORKSPACE_FILES_SHEET_CACHE_MS = 45_000;

export function workspaceMembersCacheKey(
  userId: string | number | null | undefined,
  workspaceId: number,
): string | null {
  return workspaceMembersScreenKey(userId, workspaceId);
}

export function workspaceActivitiesCacheKey(
  userId: string | number | null | undefined,
  workspaceId: number,
): string | null {
  return workspaceActivitiesScreenKey(userId, workspaceId);
}

export function workspaceFilesSheetFirstPageKey(
  userId: string | number | null | undefined,
  workspaceId: number,
): string | null {
  return workspaceFilesSheetScreenKey(userId, workspaceId);
}

export function workspaceDetailCacheKey(
  userId: string | number | null | undefined,
  routeId: string,
): string | null {
  return workspaceDetailScreenKey(userId, routeId);
}

export interface WorkspaceMembersCachePayload {
  members: any[];
  invitations: any[];
}

export interface WorkspaceActivitiesCachePayload {
  activities: any[];
}

export interface WorkspaceFilesSheetCachePayload {
  bookmarks: any[];
  files: any[];
  hasMore: boolean;
  nextOffset: number | null;
}

/** Call after member/invite/workspace mutations so all workspace slices stay consistent. */
export function invalidateWorkspaceScreenCaches(
  userId: string | number | null | undefined,
  routeId: string,
  workspaceNumericId: number,
): void {
  const detail = workspaceDetailScreenKey(userId, routeId);
  const members = workspaceMembersScreenKey(userId, workspaceNumericId);
  const activities = workspaceActivitiesScreenKey(userId, workspaceNumericId);
  const files = workspaceFilesSheetScreenKey(userId, workspaceNumericId);
  const list = workspacesListScreenKey(userId);
  if (detail) screenCache.invalidate(detail);
  if (members) screenCache.invalidate(members);
  if (activities) screenCache.invalidate(activities);
  if (files) screenCache.invalidate(files);
  if (list) screenCache.invalidate(list);
}
