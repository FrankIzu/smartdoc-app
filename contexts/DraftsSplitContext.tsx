import { usePathname, useRouter } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  clampSidebarWidth,
  computeDefaultSidebarWidth,
  useNotesSplitLayout,
} from '../hooks/useNotesSplitLayout';
import { useAuth } from '../app/context/auth';
import { createUntitledDraft, type DraftListItem } from '../utils/createUntitledDraft';
import { selectNextDraftIdAfterDelete } from '../utils/draftListOrdering';
import { draftsCache } from '../utils/draftsCache';
import { getLastOpenedDraftId, saveLastOpenedDraft } from '../utils/lastOpenedDraft';
import { getStoredSidebarWidth, saveSidebarWidth } from '../utils/sidebarWidthStorage';

type ListSnapshotGetter = () => DraftListItem[];

interface DraftsSplitContextValue {
  isSplit: boolean;
  canResizeSidebar: boolean;
  screenWidth: number;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  persistSidebarWidth: (width: number) => void;
  selectedDraftId: number | null;
  openDraft: (id: number) => void;
  openDraftsIndex: () => void;
  createAndOpenNewDraft: (
    currentDrafts: DraftListItem[],
    onListUpdated?: (drafts: DraftListItem[]) => void,
    options?: { forceOffline?: boolean },
  ) => Promise<DraftListItem | null>;
  handleDeleteNavigation: (
    deletedId: number,
    options?: { snapshot?: DraftListItem[]; isPhoneDeleteOpen?: boolean },
  ) => void;
  getListSnapshot: () => DraftListItem[];
  registerListSnapshot: (getter: ListSnapshotGetter | null) => void;
  registerListRefresh: (refresh: (() => void) | null) => void;
  refreshList: () => void;
  notifyDraftOpened: (draftId: number) => void;
}

const DraftsSplitContext = createContext<DraftsSplitContextValue | null>(null);

function parseEditDraftId(pathname: string | null): number | null {
  if (!pathname) return null;
  const match = pathname.match(/\/drafts\/edit\/(-?\d+)/);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return Number.isNaN(id) ? null : id;
}

export function DraftsSplitProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const userId = user?.id;
  const { isSplit, canResizeSidebar, screenWidth, defaultSidebarWidth } = useNotesSplitLayout();

  const [sidebarWidth, setSidebarWidthState] = useState(defaultSidebarWidth);
  const hasAttemptedRestore = useRef(false);
  const listSnapshotRef = useRef<ListSnapshotGetter | null>(null);
  const listRefreshRef = useRef<(() => void) | null>(null);

  const selectedDraftId = useMemo(() => parseEditDraftId(pathname), [pathname]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const stored = await getStoredSidebarWidth(userId, screenWidth);
      if (cancelled) return;
      const next = stored ?? computeDefaultSidebarWidth(screenWidth);
      setSidebarWidthState(clampSidebarWidth(next, screenWidth));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, screenWidth]);

  useEffect(() => {
    setSidebarWidthState((prev) => clampSidebarWidth(prev, screenWidth));
  }, [screenWidth]);

  useEffect(() => {
    if (!isSplit || !userId) return;
    if (pathname !== '/drafts') return;
    if (hasAttemptedRestore.current) return;
    hasAttemptedRestore.current = true;

    (async () => {
      const lastId = await getLastOpenedDraftId(userId);
      if (!lastId) return;
      const list = await draftsCache.getDraftsList(userId);
      if (list?.some((d) => d.id === lastId)) {
        router.replace(`/drafts/edit/${lastId}`);
      }
    })();
  }, [isSplit, userId, pathname, router]);

  const setSidebarWidth = useCallback(
    (width: number) => {
      setSidebarWidthState(clampSidebarWidth(width, screenWidth));
    },
    [screenWidth],
  );

  const persistSidebarWidth = useCallback(
    (width: number) => {
      if (!userId) return;
      const clamped = clampSidebarWidth(width, screenWidth);
      setSidebarWidthState(clamped);
      void saveSidebarWidth(userId, clamped, screenWidth);
    },
    [userId, screenWidth],
  );

  const openDraft = useCallback(
    (id: number) => {
      if (isSplit) {
        router.replace(`/drafts/edit/${id}`);
      } else {
        router.push(`/drafts/edit/${id}`);
      }
    },
    [isSplit, router],
  );

  const openDraftsIndex = useCallback(() => {
    router.replace('/drafts');
  }, [router]);

  const notifyDraftOpened = useCallback(
    (draftId: number) => {
      if (!userId) return;
      void saveLastOpenedDraft(userId, draftId);
    },
    [userId],
  );

  const registerListSnapshot = useCallback((getter: ListSnapshotGetter | null) => {
    listSnapshotRef.current = getter;
  }, []);

  const registerListRefresh = useCallback((refresh: (() => void) | null) => {
    listRefreshRef.current = refresh;
  }, []);

  const refreshList = useCallback(() => {
    listRefreshRef.current?.();
  }, []);

  const createAndOpenNewDraft = useCallback(
    async (
      currentDrafts: DraftListItem[],
      onListUpdated?: (drafts: DraftListItem[]) => void,
      options?: { forceOffline?: boolean },
    ) => {
      if (!userId) return null;
      const result = await createUntitledDraft(userId, currentDrafts, options);
      if (!result) return null;
      onListUpdated?.(result.updatedList);
      await saveLastOpenedDraft(userId, result.id);
      openDraft(result.id);
      listRefreshRef.current?.();
      return result.draft;
    },
    [userId, openDraft],
  );

  const getListSnapshot = useCallback((): DraftListItem[] => {
    return listSnapshotRef.current?.() ?? [];
  }, []);

  const handleDeleteNavigation = useCallback(
    (
      deletedId: number,
      options?: { snapshot?: DraftListItem[]; isPhoneDeleteOpen?: boolean },
    ) => {
      if (isSplit) {
        if (deletedId !== selectedDraftId) return;
        const snapshot = options?.snapshot ?? listSnapshotRef.current?.() ?? [];
        const nextId = selectNextDraftIdAfterDelete(deletedId, snapshot);
        if (nextId != null) {
          openDraft(nextId);
        } else {
          openDraftsIndex();
        }
        return;
      }
      if (options?.isPhoneDeleteOpen) {
        router.back();
      }
    },
    [isSplit, selectedDraftId, openDraft, openDraftsIndex, router],
  );

  const value = useMemo(
    () => ({
      isSplit,
      canResizeSidebar,
      screenWidth,
      sidebarWidth,
      setSidebarWidth,
      persistSidebarWidth,
      selectedDraftId,
      openDraft,
      openDraftsIndex,
      createAndOpenNewDraft,
      handleDeleteNavigation,
      registerListSnapshot,
      registerListRefresh,
      refreshList,
      notifyDraftOpened,
      getListSnapshot,
    }),
    [
      isSplit,
      canResizeSidebar,
      screenWidth,
      sidebarWidth,
      setSidebarWidth,
      persistSidebarWidth,
      selectedDraftId,
      openDraft,
      openDraftsIndex,
      createAndOpenNewDraft,
      handleDeleteNavigation,
      registerListSnapshot,
      registerListRefresh,
      refreshList,
      notifyDraftOpened,
      getListSnapshot,
    ],
  );

  return <DraftsSplitContext.Provider value={value}>{children}</DraftsSplitContext.Provider>;
}

export function useDraftsSplit() {
  const ctx = useContext(DraftsSplitContext);
  if (!ctx) {
    throw new Error('useDraftsSplit must be used within DraftsSplitProvider');
  }
  return ctx;
}

export function useDraftsSplitOptional() {
  return useContext(DraftsSplitContext);
}
