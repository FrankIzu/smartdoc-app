/** Folder row from GET /api/v1/web/folders */
export interface FolderRowModel {
  id: number;
  name: string;
  parent_folder_id: number | null;
  path: string;
  workspace_id?: number;
  created_at?: string;
  updated_at?: string;
  subfolder_count?: number;
  file_count?: number;
}

export interface BreadcrumbItem {
  id: number | null;
  name: string;
}

export interface FileRowModel {
  id: number;
  filename?: string;
  original_filename?: string;
  file_size?: number;
  file_kind?: string;
  file_type?: string;
  folder_id?: number | null;
  workspace_id?: number | null;
  created_at?: string;
  updated_at?: string;
  processing_status?: string;
  in_locked_bookmark?: boolean;
  is_deleted?: boolean;
  lifecycle_state?: string | null;
}

/** Mobile file list scope — maps to backend query params in getWebFiles only */
export type FileListScope = 'current_folder' | 'workspace' | 'global';

export interface FolderListingSnapshot {
  folderId: number | null;
  workspaceId?: number | null;
  folders: FolderRowModel[];
  files: FileRowModel[];
  breadcrumb: BreadcrumbItem[];
  filesPagination: {
    page: number;
    per_page: number;
    total: number;
    has_more: boolean;
  };
  foldersNextCursor?: string;
  fetchedAt: number;
}

export interface FolderViewResponse {
  folder?: FolderRowModel;
  breadcrumb: BreadcrumbItem[];
  folders: FolderRowModel[];
  files: FileRowModel[];
  next_cursor?: string;
  permissions?: Record<string, boolean>;
}

export interface DeletedFolderGroup {
  folder_root_id: number;
  name: string;
  path?: string;
  path_label?: string;
  trash_bundle_id?: string;
  deleted_at?: string;
  purge_at?: string | null;
  days_remaining?: number | null;
  files: FileRowModel[];
}

export interface GetWebFilesParams {
  folderId: number | null;
  workspaceId?: number;
  search?: string;
  scope?: FileListScope;
  page?: number;
  perPage?: number;
  fileKind?: string;
  signal?: AbortSignal;
}

export const ROOT_BREADCRUMB: BreadcrumbItem[] = [{ id: null, name: 'My Files' }];

export function folderCacheKey(folderId: number | null, workspaceId?: number): string {
  const ws = workspaceId != null ? `:ws${workspaceId}` : '';
  return folderId == null ? `root${ws}` : `${folderId}${ws}`;
}
