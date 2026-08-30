import type {
  BreadcrumbItem,
  DeletedFolderGroup,
  FileListScope,
  FileRowModel,
  FolderRowModel,
  GetWebFilesParams,
} from '../types/folder';
import type { AxiosInstance } from 'axios';

const WEB = '/api/v1/web';

export async function resolveEffectiveWorkspaceId(
  client: AxiosInstance,
  options?: { folderId?: number | null; explicitWorkspaceId?: number }
): Promise<number | null> {
  if (options?.explicitWorkspaceId != null) return options.explicitWorkspaceId;
  if (options?.folderId != null) {
    try {
      const res = await client.get(`${WEB}/folders/${options.folderId}`);
      const ws = res.data?.folder?.workspace_id;
      if (typeof ws === 'number') return ws;
    } catch {
      /* fall through */
    }
  }
  try {
    const raw = await client.get('/api/v1/mobile/workspaces');
    const list = raw.data?.workspaces ?? raw.data?.data ?? raw.data;
    if (Array.isArray(list) && list.length > 0) {
      const first = list[0];
      const id = first?.id ?? first?.workspace_id;
      if (typeof id === 'number') return id;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function buildWebFilesParams(params: GetWebFilesParams): Record<string, string | number> {
  const q: Record<string, string | number> = {
    page: params.page ?? 1,
    per_page: params.perPage ?? 20,
  };
  const scope = params.scope ?? 'current_folder';
  const folderId = params.folderId;

  if (params.search?.trim()) {
    q.search = params.search.trim();
    if (scope === 'global') {
      q.search_all_folders = '1';
    } else if (scope === 'workspace' && params.workspaceId != null) {
      q.workspace_id = params.workspaceId;
      q.search_all_folders = '1';
    } else if (folderId != null) {
      q.folder_id = folderId;
    } else {
      q.root_files = '1';
    }
  } else if (scope === 'global') {
    q.search_all_folders = '1';
    if (params.workspaceId != null) q.workspace_id = params.workspaceId;
  } else if (scope === 'workspace' && params.workspaceId != null) {
    q.workspace_id = params.workspaceId;
  } else if (folderId != null) {
    q.folder_id = folderId;
  } else {
    q.root_files = '1';
  }

  if (params.workspaceId != null) {
    q.workspace_id = params.workspaceId;
  }
  if (params.fileKind) q.file_kind = params.fileKind;
  if (params.listOnly) q.list_only = '1';
  return q;
}

export async function getWebFiles(client: AxiosInstance, params: GetWebFilesParams) {
  const response = await client.get(`${WEB}/files`, {
    params: buildWebFilesParams(params),
    signal: params.signal,
    timeout: params.signal ? 25000 : undefined,
  });
  const data = response.data ?? {};
  const files: FileRowModel[] = data.files ?? data.data ?? [];
  const pagination = data.pagination ?? {
    page: params.page ?? 1,
    per_page: params.perPage ?? 20,
    total: files.length,
    has_more: false,
  };
  return { success: data.success !== false, files, pagination, raw: data };
}

export async function listFolders(
  client: AxiosInstance,
  options?: {
    parentId?: number | null;
    workspaceId?: number;
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
  }
) {
  const params: Record<string, string | number> = { limit: options?.limit ?? 500 };
  if (options?.parentId != null) params.parent_id = options.parentId;
  if (options?.workspaceId != null) params.workspace_id = options.workspaceId;
  if (options?.cursor) params.cursor = options.cursor;
  const response = await client.get(`${WEB}/folders`, { params, signal: options?.signal });
  const data = response.data ?? {};
  return {
    success: data.success !== false,
    folders: (data.folders ?? []) as FolderRowModel[],
    next_cursor: data.next_cursor as string | undefined,
    total_folder_count: data.total_folder_count as number | undefined,
  };
}

export async function fetchAllFoldersForParent(
  client: AxiosInstance,
  parentId: number | null,
  workspaceId?: number,
  signal?: AbortSignal
): Promise<FolderRowModel[]> {
  const all: FolderRowModel[] = [];
  let cursor: string | undefined;
  do {
    const page = await listFolders(client, { parentId, workspaceId, cursor, signal });
    all.push(...page.folders);
    cursor = page.next_cursor;
  } while (cursor);
  return all;
}

export async function getFolder(client: AxiosInstance, folderId: number, signal?: AbortSignal) {
  const response = await client.get(`${WEB}/folders/${folderId}`, { signal });
  const data = response.data ?? {};
  const folder = data.folder as FolderRowModel & { breadcrumb?: BreadcrumbItem[] };
  return {
    success: data.success !== false,
    folder,
    breadcrumb: (folder?.breadcrumb ?? []) as BreadcrumbItem[],
  };
}

export async function createFolder(
  client: AxiosInstance,
  body: { name: string; workspace_id: number; parent_folder_id?: number | null }
) {
  const response = await client.post(`${WEB}/folders`, body);
  return response.data;
}

export async function renameFolder(client: AxiosInstance, folderId: number, name: string) {
  const response = await client.put(`${WEB}/folders/${folderId}`, { name });
  return response.data;
}

export async function deleteFolder(client: AxiosInstance, folderId: number) {
  const response = await client.delete(`${WEB}/folders/${folderId}`);
  return response.data;
}

export async function moveFolder(client: AxiosInstance, folderId: number, parentFolderId: number | null) {
  const response = await client.put(`${WEB}/folders/${folderId}/move`, {
    parent_folder_id: parentFolderId,
  });
  return response.data;
}

export async function moveFilesToFolder(
  client: AxiosInstance,
  fileIds: number[],
  folderId?: number | null
) {
  const response = await client.post(`${WEB}/files/batch-folder`, {
    file_ids: fileIds,
    folder_id: folderId ?? null,
  });
  return response.data as {
    updated_ids?: number[];
    failed?: Array<{ id: number; reason: string }>;
  };
}

export async function listFoldersTrash(client: AxiosInstance) {
  const response = await client.get(`${WEB}/folders/trash`);
  return response.data;
}

export async function restoreFolder(client: AxiosInstance, folderId: number) {
  const response = await client.post(`${WEB}/folders/${folderId}/restore`);
  return response.data;
}

export async function permanentlyDeleteFolder(client: AxiosInstance, folderId: number) {
  const response = await client.delete(`${WEB}/folders/${folderId}/permanent?confirmed=true`);
  return response.data;
}

export async function getDeletedFilesWithFolders(
  client: AxiosInstance,
  page = 1,
  perPage = 100
) {
  const response = await client.get(`${WEB}/files/deleted`, {
    params: { page, per_page: perPage },
  });
  const data = response.data ?? {};
  return {
    success: data.success !== false,
    folder_groups: (data.folder_groups ?? []) as DeletedFolderGroup[],
    standalone_files: (data.standalone_files ?? data.files ?? []) as FileRowModel[],
    files: (data.files ?? data.standalone_files ?? []) as FileRowModel[],
    pagination: data.pagination,
    retention_days: data.retention_days as number | undefined,
    message: data.message as string | undefined,
  };
}

export type { FileListScope, GetWebFilesParams };
