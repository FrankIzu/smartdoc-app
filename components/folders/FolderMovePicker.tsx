import React, { useEffect, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService } from '../../services/api';
import type { FolderRowModel } from '../../types/folder';
import FolderBreadcrumb from './FolderBreadcrumb';
import FolderListItem from './FolderListItem';
import { ROOT_BREADCRUMB } from '../../types/folder';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (folderId: number | null) => void;
  workspaceId?: number;
  title?: string;
}

export default function FolderMovePicker({
  visible,
  onClose,
  onSelect,
  workspaceId,
  title = 'Move to folder',
}: Props) {
  const colors = useThemeColors();
  const [pickerFolderId, setPickerFolderId] = useState<number | null>(null);
  const [folders, setFolders] = useState<FolderRowModel[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (parentId: number | null) => {
    setLoading(true);
    try {
      const res = await apiService.listFolders({ parentId, workspaceId });
      setFolders(res.folders ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setPickerFolderId(null);
      void load(null);
    }
  }, [visible, workspaceId]);

  const breadcrumb =
    pickerFolderId == null
      ? ROOT_BREADCRUMB
      : [{ id: null, name: 'My Files' }, { id: pickerFolderId, name: '…' }];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <FolderBreadcrumb
          items={breadcrumb}
          onPress={(idx) => {
            if (idx === 0) {
              setPickerFolderId(null);
              void load(null);
            }
          }}
        />
        <TouchableOpacity
          style={[styles.rootBtn, { borderColor: colors.border }]}
          onPress={() => {
            onSelect(null);
            onClose();
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: '600' }}>My Files (root)</Text>
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : (
          <FlatList
            data={folders}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <FolderListItem
                folder={item}
                onPress={() => {
                  setPickerFolderId(item.id);
                  void load(item.id);
                }}
                onLongPress={() => {
                  onSelect(item.id);
                  onClose();
                }}
              />
            )}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>No subfolders</Text>
            }
          />
        )}
        {pickerFolderId != null ? (
          <TouchableOpacity
            style={[styles.selectBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              onSelect(pickerFolderId);
              onClose();
            }}
          >
            <Text style={styles.selectBtnText}>Select this folder</Text>
          </TouchableOpacity>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 18, fontWeight: '600' },
  rootBtn: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  empty: { textAlign: 'center', marginTop: 24, padding: 16 },
  selectBtn: {
    margin: 16,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  selectBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
