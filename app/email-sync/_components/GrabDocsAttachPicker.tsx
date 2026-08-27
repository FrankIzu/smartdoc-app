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
  onPickFile: (file: { id: number; name: string }) => void | Promise<void>;
};

type Row =
  | { kind: 'folder'; folder: FolderRowModel }
  | { kind: 'file'; file: FileRowModel };

export function GrabDocsAttachPicker({ visible, workspaceId, onClose, onPickFile }: Props) {
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
  const [pickingId, setPickingId] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searching = query.trim().length > 0;

  const loadFolder = useCallback(
    async (parentId: number | null, search?: string) => {
      setLoading(true);
      try {
        const q = (search || '').trim();
        if (q) {
          const fileRes = await apiClient.getWebFiles({
            workspaceId,
            search: q,
            scope: 'global',
            page: 1,
            perPage: 40,
          });
          setFolders([]);
          setFiles(fileRes.files ?? []);
        } else {
          const [folderRes, fileRes] = await Promise.all([
            apiClient.listFolders({ parentId, workspaceId }),
            apiClient.getWebFiles({
              folderId: parentId,
              workspaceId,
              scope: 'current_folder',
              page: 1,
              perPage: 40,
            }),
          ]);
          setFolders(folderRes.folders ?? []);
          setFiles(fileRes.files ?? []);
        }
      } catch {
        setFolders([]);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    if (!visible) return;
    setFolderId(null);
    setStack([{ id: null, name: 'My Files' }]);
    setQuery('');
    void loadFolder(null);
  }, [visible, loadFolder]);

  useEffect(() => {
    if (!visible) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void loadFolder(folderId, query);
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, visible]); // eslint-disable-line react-hooks/exhaustive-deps -- folder nav loads separately

  const openFolder = (f: FolderRowModel) => {
    setQuery('');
    setFolderId(f.id);
    setStack((s) => [...s, { id: f.id, name: f.name }]);
    void loadFolder(f.id);
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
    void loadFolder(parent.id);
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
      }),
    [colors, insets.top]
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
        {loading ? (
          <ActivityIndicator style={{ marginTop: 28 }} color="#007AFF" />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) =>
              item.kind === 'folder' ? `folder-${item.folder.id}` : `file-${item.file.id}`
            }
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>{searching ? 'No matching files' : 'This folder is empty'}</Text>}
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
              const label =
                item.file.original_filename || item.file.filename || `File ${item.file.id}`;
              const busy = pickingId === item.file.id;
              return (
                <TouchableOpacity
                  style={styles.row}
                  disabled={pickingId != null}
                  onPress={async () => {
                    setPickingId(item.file.id);
                    try {
                      await onPickFile({ id: item.file.id, name: label });
                    } finally {
                      setPickingId(null);
                    }
                  }}
                >
                  <Ionicons name="document-text-outline" size={22} color={colors.textSecondary} />
                  <Text style={styles.name} numberOfLines={1}>
                    {label}
                  </Text>
                  {busy ? <ActivityIndicator color="#007AFF" /> : null}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}
