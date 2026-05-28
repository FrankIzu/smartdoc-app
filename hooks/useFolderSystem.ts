import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { apiService } from '../services/api';
import {
  folderCacheKey,
  ROOT_BREADCRUMB,
  type BreadcrumbItem,
  type FileListScope,
  type FileRowModel,
  type FolderListingSnapshot,
  type FolderRowModel,
} from '../types/folder';

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 30;
const FILES_PAGE_SIZE = 20;

export interface UseFolderSystemOptions {
  workspaceId?: number;
  initialFolderId?: number | null;
  fileListScope?: FileListScope;
  enabled?: boolean;
}

export function useFolderSystem(options: UseFolderSystemOptions = {}) {
  const { workspaceId, initialFolderId = null, fileListScope = 'current_folder', enabled = true } =
    options;

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(initialFolderId ?? null);
  const [currentFolderWorkspaceId, setCurrentFolderWorkspaceId] = useState<number | null>(
    workspaceId ?? null
  );
  const [folders, setFolders] = useState<FolderRowModel[]>([]);
  const [files, setFiles] = useState<FileRowModel[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>(ROOT_BREADCRUMB);
  const [loading, setLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<FileListScope>(fileListScope);
  const [filesPage, setFilesPage] = useState(1);
  const [filesHasMore, setFilesHasMore] = useState(false);

  const cacheRef = useRef<Map<string, FolderListingSnapshot>>(new Map());
  const cacheOrderRef = useRef<string[]>([]);
  const navigationTokenRef = useRef(0);
  const navAbortRef = useRef<AbortController | null>(null);
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());

  // Refs that mirror mutable state so loadFolderView doesn't need them as deps
  // (avoids recreating the callback — and everything depending on it — after every load).
  const filesRef = useRef<FileRowModel[]>([]);
  const filesPageRef = useRef(1);
  const currentFolderWorkspaceIdRef = useRef<number | null>(workspaceId ?? null);
  const searchQueryRef = useRef('');
  const searchScopeRef = useRef<FileListScope>(fileListScope);

  const touchCacheKey = useCallback((key: string) => {
    const order = cacheOrderRef.current.filter((k) => k !== key);
    order.push(key);
    cacheOrderRef.current = order;
    while (order.length > MAX_CACHE_ENTRIES) {
      const evict = order.shift();
      if (evict) cacheRef.current.delete(evict);
    }
  }, []);

  const invalidateKeys = useCallback((keys: string[]) => {
    for (const k of keys) cacheRef.current.delete(k);
  }, []);

  const applySnapshot = useCallback((snap: FolderListingSnapshot) => {
    setFolders(snap.folders);
    filesRef.current = snap.files;
    setFiles(snap.files);
    setBreadcrumb(snap.breadcrumb);
    filesPageRef.current = snap.filesPagination.page;
    setFilesHasMore(snap.filesPagination.has_more);
    setFilesPage(snap.filesPagination.page);
    if (snap.workspaceId != null) {
      currentFolderWorkspaceIdRef.current = snap.workspaceId;
      setCurrentFolderWorkspaceId(snap.workspaceId);
    }
  }, []);

  const loadFolderView = useCallback(
    async (folderId: number | null, opts?: { appendFiles?: boolean; search?: string; scope?: FileListScope }) => {
      if (!enabled) return;

      const key = folderCacheKey(folderId, workspaceId);
      const cached = cacheRef.current.get(key);
      const now = Date.now();
      if (cached && now - cached.fetchedAt < CACHE_TTL_MS && !opts?.appendFiles && !opts?.search) {
        applySnapshot(cached);
      }

      const existing = inflightRef.current.get(key);
      if (existing && !opts?.appendFiles) {
        await existing;
        return;
      }

      navigationTokenRef.current += 1;
      const token = navigationTokenRef.current;
      navAbortRef.current?.abort();
      const controller = new AbortController();
      navAbortRef.current = controller;
      const signal = controller.signal;

      const run = async () => {
        if (!opts?.appendFiles) setLoading(true);
        else setFilesLoading(true);
        setError(null);

        try {
          const page = opts?.appendFiles ? filesPageRef.current + 1 : 1;
          const scope = opts?.scope ?? searchScopeRef.current;
          const search = opts?.search ?? searchQueryRef.current;

          const promises: Promise<unknown>[] = [
            apiService.listFolders({
              parentId: folderId,
              workspaceId,
              signal,
            }),
            apiService.getWebFiles({
              folderId,
              workspaceId,
              search: search.trim() || undefined,
              scope,
              page,
              perPage: FILES_PAGE_SIZE,
              signal,
            }),
          ];

          let folderDetail: Awaited<ReturnType<typeof apiService.getFolderDetail>> | null = null;
          if (folderId != null) {
            promises.push(apiService.getFolderDetail(folderId, signal));
          }

          const results = await Promise.allSettled(promises);
          if (token !== navigationTokenRef.current) return;

          const foldersResult = results[0];
          const filesResult = results[1];
          const detailResult = folderId != null ? results[2] : null;

          let nextFolders: FolderRowModel[] = cached?.folders ?? [];
          if (foldersResult.status === 'fulfilled') {
            nextFolders = foldersResult.value.folders ?? [];
          }

          let nextFiles: FileRowModel[] = opts?.appendFiles ? [...filesRef.current] : [];
          let pagination = cached?.filesPagination ?? {
            page: 1,
            per_page: FILES_PAGE_SIZE,
            total: 0,
            has_more: false,
          };
          if (filesResult.status === 'fulfilled') {
            const batch = filesResult.value.files ?? [];
            nextFiles = opts?.appendFiles ? [...nextFiles, ...batch] : batch;
            pagination = filesResult.value.pagination ?? pagination;
          }

          let nextBreadcrumb: BreadcrumbItem[] = ROOT_BREADCRUMB;
          let wsId = workspaceId ?? currentFolderWorkspaceIdRef.current;
          if (folderId != null && detailResult?.status === 'fulfilled') {
            const detail = detailResult.value;
            if (detail.folder?.id === folderId) {
              const trail = detail.breadcrumb?.length
                ? [{ id: null as number | null, name: 'My Files' }, ...detail.breadcrumb]
                : ROOT_BREADCRUMB;
              nextBreadcrumb = trail;
              if (detail.folder.workspace_id != null) wsId = detail.folder.workspace_id;
            } else if (cached?.breadcrumb) {
              nextBreadcrumb = cached.breadcrumb;
            }
          } else if (folderId == null) {
            nextBreadcrumb = ROOT_BREADCRUMB;
          } else if (cached?.breadcrumb) {
            nextBreadcrumb = cached.breadcrumb;
          }

          const snap: FolderListingSnapshot = {
            folderId,
            workspaceId: wsId,
            folders: nextFolders,
            files: nextFiles,
            breadcrumb: nextBreadcrumb,
            filesPagination: pagination,
            fetchedAt: Date.now(),
          };
          cacheRef.current.set(key, snap);
          touchCacheKey(key);
          applySnapshot(snap);
          if (wsId != null) setCurrentFolderWorkspaceId(wsId);
        } catch (e: any) {
          if (token !== navigationTokenRef.current) return;
          if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
          const msg = e?.response?.data?.message || e?.message || 'Failed to load folder';
          setError(msg);
          if (e?.response?.status === 404 && folderId != null) {
            Alert.alert('Folder not found', msg, [
              { text: 'Go back', onPress: () => void loadFolderView(null) },
            ]);
          }
        } finally {
          if (token === navigationTokenRef.current) {
            setLoading(false);
            setFilesLoading(false);
          }
          inflightRef.current.delete(key);
        }
      };

      const p = run();
      if (!opts?.appendFiles) inflightRef.current.set(key, p);
      await p;
    },
    [
      enabled,
      workspaceId,
      applySnapshot,
      touchCacheKey,
    ]
  );

  const openFolder = useCallback(
    (folderId: number) => {
      setCurrentFolderId(folderId);
      void loadFolderView(folderId);
    },
    [loadFolderView]
  );

  const goToRoot = useCallback(() => {
    setCurrentFolderId(null);
    void loadFolderView(null);
  }, [loadFolderView]);

  const goToBreadcrumb = useCallback(
    (index: number) => {
      const item = breadcrumb[index];
      if (!item || item.id == null) {
        goToRoot();
        return;
      }
      setCurrentFolderId(item.id);
      void loadFolderView(item.id);
    },
    [breadcrumb, goToRoot, loadFolderView]
  );

  const syncFromServer = useCallback(() => {
    const key = folderCacheKey(currentFolderId, workspaceId);
    cacheRef.current.delete(key);
    return loadFolderView(currentFolderId, { search: searchQueryRef.current, scope: searchScopeRef.current });
  }, [currentFolderId, workspaceId, loadFolderView]);

  const loadMoreFiles = useCallback(() => {
    if (!filesHasMore || filesLoading) return;
    void loadFolderView(currentFolderId, { appendFiles: true, search: searchQueryRef.current, scope: searchScopeRef.current });
  }, [filesHasMore, filesLoading, loadFolderView, currentFolderId]);

  const createFolder = useCallback(
    async (name: string) => {
      const ws =
        currentFolderWorkspaceId ??
        (await apiService.resolveEffectiveWorkspaceId({
          folderId: currentFolderId,
          explicitWorkspaceId: workspaceId,
        }));
      if (ws == null) throw new Error('No workspace available for new folder');
      await apiService.createFolder({
        name,
        workspace_id: ws,
        parent_folder_id: currentFolderId,
      });
      invalidateKeys([
        folderCacheKey(currentFolderId, workspaceId),
        ...(currentFolderId != null ? [folderCacheKey(currentFolderId, workspaceId)] : []),
      ]);
      await syncFromServer();
    },
    [currentFolderId, currentFolderWorkspaceId, workspaceId, invalidateKeys, syncFromServer]
  );

  const renameFolderById = useCallback(
    async (folderId: number, name: string) => {
      await apiService.renameFolder(folderId, name);
      await syncFromServer();
    },
    [syncFromServer]
  );

  const deleteFolderById = useCallback(
    async (folderId: number) => {
      await apiService.deleteFolderById(folderId);
      if (folderId === currentFolderId) {
        goToRoot();
      } else {
        await syncFromServer();
      }
    },
    [currentFolderId, goToRoot, syncFromServer]
  );

  const moveFiles = useCallback(
    async (fileIds: number[], targetFolderId: number | null) => {
      const result = await apiService.moveFilesToFolder(fileIds, targetFolderId);
      if (result.failed?.length) {
        Alert.alert(
          'Some files could not be moved',
          result.failed.map((f) => `#${f.id}: ${f.reason}`).join('\n')
        );
      }
      await syncFromServer();
      return result;
    },
    [syncFromServer]
  );

  const moveFolderById = useCallback(
    async (folderId: number, parentFolderId: number | null) => {
      await apiService.moveFolderToParent(folderId, parentFolderId);
      await syncFromServer();
    },
    [syncFromServer]
  );

  const runSearch = useCallback(
    (query: string, scope?: FileListScope) => {
      const nextScope = scope ?? searchScopeRef.current;
      searchQueryRef.current = query;
      setSearchQuery(query);
      if (scope) {
        searchScopeRef.current = nextScope;
        setSearchScope(nextScope);
      }
      cacheRef.current.delete(folderCacheKey(currentFolderId, workspaceId));
      void loadFolderView(currentFolderId, { search: query, scope: nextScope });
    },
    [currentFolderId, workspaceId, loadFolderView]
  );

  return {
    currentFolderId,
    currentFolderWorkspaceId,
    folders,
    files,
    breadcrumb,
    loading,
    filesLoading,
    error,
    searchQuery,
    searchScope,
    setSearchScope,
    filesHasMore,
    openFolder,
    goToRoot,
    goToBreadcrumb,
    loadFolderView,
    syncFromServer,
    loadMoreFiles,
    createFolder,
    renameFolderById,
    deleteFolderById,
    moveFiles,
    moveFolderById,
    runSearch,
    invalidateKeys,
  };
}
