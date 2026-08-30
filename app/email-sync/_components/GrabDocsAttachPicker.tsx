import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedbackTouchable } from '../../../components/FeedbackTouchable';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { apiClient } from '../../../services/api';
import type { FileRowModel, FolderRowModel } from '../../../types/folder';

type Props = {
  visible: boolean;
  workspaceId?: number;
  onClose: () => void;
  onAddFiles: (files: { id: number; name: string }[]) => void | Promise<void>;
};

type Row =
  | { kind: 'folder'; folder: FolderRowModel }
  | { kind: 'file'; file: FileRowModel };

type SelectedFile = { id: number; name: string };

const PAGE_SIZE = 40;

function fileLabel(f: FileRowModel): string {
  return f.original_filename || f.filename || `File ${f.id}`;
}

export function GrabDocsAttachPicker({ visible, workspaceId, onClose, onAddFiles }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [folderId, setFolderId] = useState<number | null>(null);
  const [stack, setStack] = useState<{ id: number | null; name: string }[]>([
    { id: null, name: 'My Files' },
  ]);
  const [folders, setFolders] = useState<FolderRowModel[]>([]);
  const [files, setFiles] = useState<FileRowModel[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [adding, setAdding] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pageRef = useRef(1);
  const searching = query.trim().length > 0;
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const loadListing = useCallback(
    async (opts: {
      parentId: number | null;
      search?: string;
      pageNum?: number;
      append?: boolean;
    }) => {
      const pageNum = opts.pageNum ?? 1;
      const append = !!opts.append;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const q = (opts.search || '').trim();
        if (q) {
          const fileRes = await apiClient.getWebFiles({
            folderId: null,
            workspaceId,
            search: q,
            scope: 'global',
            page: pageNum,
            perPage: PAGE_SIZE,
            listOnly: true,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const batch = fileRes.files ?? [];
          setFolders([]);
          setFiles((prev) => (append ? [...prev, ...batch] : batch));
          setHasMore(!!fileRes.pagination?.has_more);
          pageRef.current = pageNum;
        } else {
          const folderPromise =
            pageNum === 1
              ? apiClient.listFolders({
                  parentId: opts.parentId,
                  workspaceId,
                  limit: 200,
                  signal: controller.signal,
                })
              : Promise.resolve(null);
          const [folderRes, fileRes] = await Promise.all([
            folderPromise,
            apiClient.getWebFiles({
              folderId: opts.parentId,
              workspaceId,
              scope: 'current_folder',
              page: pageNum,
              perPage: PAGE_SIZE,
              listOnly: true,
              signal: controller.signal,
            }),
          ]);
          if (controller.signal.aborted) return;
          if (folderRes && pageNum === 1) {
            setFolders(folderRes.folders ?? []);
          }
          const batch = fileRes.files ?? [];
          setFiles((prev) => (append ? [...prev, ...batch] : batch));
          setHasMore(!!fileRes.pagination?.has_more);
          pageRef.current = pageNum;
        }
      } catch (e: any) {
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || controller.signal.aborted) {
          return;
        }
        if (!append) {
          setFolders([]);
          setFiles([]);
          setHasMore(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    if (!visible) {
      abortRef.current?.abort();
      return;
    }
    setFolderId(null);
    setStack([{ id: null, name: 'My Files' }]);
    setQuery('');
    setSelected([]);
    setFiles([]);
    setFolders([]);
    void loadListing({ parentId: null, pageNum: 1 });
  }, [visible, loadListing]);

  useEffect(() => {
    if (!visible) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void loadListing({ parentId: folderId, search: query, pageNum: 1 });
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, visible]); // eslint-disable-line react-hooks/exhaustive-deps -- folder nav loads separately

  const openFolder = (f: FolderRowModel) => {
    setQuery('');
    setFolderId(f.id);
    setStack((s) => [...s, { id: f.id, name: f.name }]);
    setFiles([]);
    setFolders([]);
    void loadListing({ parentId: f.id, pageNum: 1 });
  };

  const goUp = () => {
    if (stack.length <= 1) {
      onClose();
      return;
    }
    const next = stack.slice(0, -1);
    const parent = next[next.length - 1];
    setStack(next);
    setFolderId(parent.id);
    setQuery('');
    setFiles([]);
    setFolders([]);
    void loadListing({ parentId: parent.id, pageNum: 1 });
  };

  const toggleFile = (file: FileRowModel) => {
    const name = fileLabel(file);
    setSelected((prev) => {
      if (prev.some((s) => s.id === file.id)) {
        return prev.filter((s) => s.id !== file.id);
      }
      return [...prev, { id: file.id, name }];
    });
  };

  const removeSelected = (id: number) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  };

  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    void loadListing({
      parentId: folderId,
      search: query,
      pageNum: pageRef.current + 1,
      append: true,
    });
  };

  const addSelected = async () => {
    if (!selected.length || adding) return;
    setAdding(true);
    try {
      await onAddFiles(selected);
    } finally {
      setAdding(false);
    }
  };

  const rows: Row[] = useMemo(() => {
    if (searching) return files.map((file) => ({ kind: 'file' as const, file }));
    return [
      ...folders.map((folder) => ({ kind: 'folder' as const, folder })),
      ...files.map((file) => ({ kind: 'file' as const, file })),
    ];
  }, [folders, files, searching]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background, paddingTop: insets.top },
        header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 },
        title: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text },
        iconBtn: { padding: 10 },
        crumb: {
          paddingHorizontal: 16,
          paddingBottom: 8,
          color: colors.textSecondary,
          fontSize: 13,
        },
        search: {
          marginHorizontal: 16,
          marginBottom: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          paddingVertical: 11,
          color: colors.text,
          fontSize: 16,
        },
        selectedWrap: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          paddingBottom: 8,
          marginBottom: 4,
        },
        selectedLabel: {
          paddingHorizontal: 16,
          paddingBottom: 6,
          fontSize: 12,
          fontWeight: '600',
          color: colors.textSecondary,
        },
        selectedChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          maxWidth: 200,
          marginLeft: 8,
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRadius: 16,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        selectedChipTxt: { flexShrink: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
          gap: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        name: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '500' },
        empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40, paddingHorizontal: 24 },
        footer: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: colors.background,
        },
        addBtn: {
          backgroundColor: '#2563EB',
          borderRadius: 10,
          paddingVertical: 14,
          alignItems: 'center',
        },
        addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
        checkbox: {
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        checkboxOn: {
          backgroundColor: '#2563EB',
          borderColor: '#2563EB',
        },
      }),
    [colors, insets.top, insets.bottom]
  );

  const title = searching ? 'Search results' : stack[stack.length - 1]?.name || 'My Files';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.safe}>
        <View style={styles.header}>
          <FeedbackTouchable onPress={goUp} style={styles.iconBtn} accessibilityLabel="Back">
            <Ionicons name={stack.length > 1 && !searching ? 'chevron-back' : 'close'} size={28} color={colors.text} />
          </FeedbackTouchable>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {!searching && stack.length > 1 ? (
          <Text style={styles.crumb} numberOfLines={1}>
            {stack.map((s) => s.name).join(' / ')}
          </Text>
        ) : null}
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search files"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        {selected.length > 0 ? (
          <View style={styles.selectedWrap}>
            <Text style={styles.selectedLabel}>
              Selected ({selected.length}) — browse folders to add more
            </Text>
            <FlatList
              horizontal
              data={selected}
              keyExtractor={(item) => `sel-${item.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.selectedChip} onPress={() => removeSelected(item.id)}>
                  <Text style={styles.selectedChipTxt} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            />
          </View>
        ) : null}

        {loading && rows.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 28 }} color="#007AFF" />
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={rows}
            keyExtractor={(item) =>
              item.kind === 'folder' ? `folder-${item.folder.id}` : `file-${item.file.id}`
            }
            keyboardShouldPersistTaps="handled"
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <Text style={styles.empty}>{searching ? 'No matching files' : 'This folder is empty'}</Text>
            }
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color="#007AFF" /> : null
            }
            renderItem={({ item }) => {
              if (item.kind === 'folder') {
                return (
                  <TouchableOpacity style={styles.row} onPress={() => openFolder(item.folder)}>
                    <Ionicons name="folder" size={22} color="#007AFF" />
                    <Text style={styles.name} numberOfLines={1}>
                      {item.folder.name}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                );
              }
              const label = fileLabel(item.file);
              const checked = selectedIds.has(item.file.id);
              return (
                <TouchableOpacity style={styles.row} onPress={() => toggleFile(item.file)}>
                  <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                    {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                  </View>
                  <Ionicons name="document-text-outline" size={22} color={colors.textSecondary} />
                  <Text style={styles.name} numberOfLines={1}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.addBtn, (!selected.length || adding) && { opacity: 0.45 }]}
            disabled={!selected.length || adding}
            onPress={() => void addSelected()}
          >
            {adding ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addBtnTxt}>
                {selected.length ? `Add ${selected.length} file${selected.length === 1 ? '' : 's'}` : 'Select files to add'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
