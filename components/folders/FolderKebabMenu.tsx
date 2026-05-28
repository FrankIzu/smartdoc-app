import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FOLDER_ICON_COLOR } from '../../constants/folderTheme';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { FolderRowModel } from '../../types/folder';

export type FolderKebabAction = 'open' | 'rename' | 'move' | 'details' | 'delete';

interface Props {
  visible: boolean;
  folder: FolderRowModel | null;
  onClose: () => void;
  onAction: (action: FolderKebabAction, folder: FolderRowModel) => void;
}

export default function FolderKebabMenu({ visible, folder, onClose, onAction }: Props) {
  const colors = useThemeColors();

  if (!folder) return null;

  const run = (action: FolderKebabAction) => {
    onClose();
    onAction(action, folder);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.menuTitle, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
            {folder.name}
          </Text>

          <MenuRow mdiIcon="folder-open-outline" color={FOLDER_ICON_COLOR} label="Open" onPress={() => run('open')} />
          <MenuRow icon="pencil-outline" color="#6B7280" label="Rename" onPress={() => run('rename')} />
          <MenuRow icon="arrow-forward-outline" color="#007AFF" label="Move to" onPress={() => run('move')} />
          <MenuRow icon="information-circle-outline" color="#5856D6" label="Details" onPress={() => run('details')} />
          <MenuRow
            icon="trash-outline"
            color="#EF4444"
            label="Delete"
            onPress={() => run('delete')}
            destructive
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function MenuRow({
  icon,
  mdiIcon,
  color,
  label,
  onPress,
  destructive,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  mdiIcon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      {mdiIcon ? (
        <MaterialCommunityIcons name={mdiIcon} size={20} color={color} />
      ) : (
        <Ionicons name={icon!} size={20} color={color} />
      )}
      <Text style={[styles.rowLabel, { color: destructive ? '#EF4444' : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menu: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowLabel: { fontSize: 16, fontWeight: '500' },
});
