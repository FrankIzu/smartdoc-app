import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { API_BASE_URL } from '../../constants/Config';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService } from '../../services/api';
import type { PlanFileLinkRow } from '../../types/aiFileManager';

interface Props {
  links?: PlanFileLinkRow[];
  onOpenFile?: (fileId: number, name?: string) => void;
}

export default function PlanFileLinks({ links, onOpenFile }: Props) {
  const colors = useThemeColors();
  if (!links?.length) return null;

  const handleOpen = async (link: PlanFileLinkRow) => {
    const fileId = link.file_id;
    if (fileId == null) return;
    if (onOpenFile) {
      onOpenFile(fileId, link.name);
      return;
    }
    try {
      await apiService.getFileById(fileId);
      const path = link.view_path || `/api/v1/web/files/${fileId}/view`;
      const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
      await Linking.openURL(url);
    } catch {
      Toast.show({ type: 'info', text1: 'File no longer available' });
    }
  };

  return (
    <View style={styles.wrap}>
      {links.map((link, i) => (
        <TouchableOpacity
          key={`${link.file_id ?? i}-${link.name ?? i}`}
          style={[styles.row, { borderColor: colors.border }]}
          onPress={() => void handleOpen(link)}
          disabled={link.file_id == null}
        >
          <Text style={[styles.name, { color: colors.primary }]} numberOfLines={1}>
            {link.name || `File ${link.file_id}`}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, gap: 6 },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  name: { fontSize: 14 },
});
