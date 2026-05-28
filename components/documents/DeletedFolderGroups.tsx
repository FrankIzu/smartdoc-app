import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FileNameText from '../FileNameText';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { DeletedFolderGroup } from '../../types/folder';

interface Props {
  groups: DeletedFolderGroup[];
  onRestoreFolder: (folderRootId: number) => Promise<void>;
  onPermanentDeleteFolder: (folderRootId: number) => void;
  onRestoreFile: (fileId: number) => void;
  onPermanentDeleteFile: (file: { id: number; original_filename?: string }) => void;
  actionId: number | null;
}

export default function DeletedFolderGroups({
  groups,
  onRestoreFolder,
  onPermanentDeleteFolder,
  onRestoreFile,
  onPermanentDeleteFile,
  actionId,
}: Props) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  if (!groups.length) return null;

  return (
    <View style={styles.wrap}>
      {groups.map((g) => {
        const open = expanded[g.folder_root_id] ?? false;
        const busy = actionId === g.folder_root_id;
        return (
          <View
            key={g.folder_root_id}
            style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <TouchableOpacity
              style={styles.header}
              onPress={() =>
                setExpanded((prev) => ({ ...prev, [g.folder_root_id]: !open }))
              }
            >
              <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.text} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>
                  {g.name}
                </Text>
                {g.path_label ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                    {g.path_label}
                  </Text>
                ) : null}
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {(g.files?.length ?? 0)} files
                  {g.days_remaining != null ? ` · ${g.days_remaining} days left` : ''}
                </Text>
              </View>
              {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </TouchableOpacity>
            {open ? (
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => void onRestoreFolder(g.folder_root_id)}
                  disabled={busy}
                >
                  <Text style={{ color: colors.primary }}>Restore folder</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onPermanentDeleteFolder(g.folder_root_id)}
                  disabled={busy}
                >
                  <Text style={{ color: '#dc2626' }}>Delete forever</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {open
              ? (g.files ?? []).map((f) => (
                  <View key={f.id} style={[styles.fileRow, { borderTopColor: colors.border }]}>
                    <FileNameText
                      name={f.original_filename || f.filename || 'File'}
                      style={{ flex: 1, color: colors.text }}
                    />
                    <TouchableOpacity onPress={() => onRestoreFile(f.id)}>
                      <Text style={{ color: colors.primary, fontSize: 13 }}>Restore</Text>
                    </TouchableOpacity>
                  </View>
                ))
              : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8 },
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  groupName: { fontSize: 16, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 16,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});
