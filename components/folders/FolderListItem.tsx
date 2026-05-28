import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';
import { FOLDER_ICON_BG, FOLDER_ICON_COLOR } from '../../constants/folderTheme';
import type { FolderRowModel } from '../../types/folder';

interface Props {
  folder: FolderRowModel;
  onPress: () => void;
  onLongPress?: () => void;
  onMenuPress?: () => void;
  /** Horizontal tile for folder carousel; default is full-width list row */
  variant?: 'list' | 'tile';
}

export default function FolderListItem({
  folder,
  onPress,
  onLongPress,
  onMenuPress,
  variant = 'list',
}: Props) {
  const colors = useThemeColors();
  const sub =
    folder.subfolder_count != null || folder.file_count != null
      ? `${folder.subfolder_count ?? 0} · ${folder.file_count ?? 0}`
      : undefined;

  if (variant === 'tile') {
    return (
      <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {onMenuPress ? (
          <TouchableOpacity
            style={styles.tileKebab}
            onPress={onMenuPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Actions for folder ${folder.name}`}
            accessibilityRole="button"
          >
            <Ionicons name="ellipsis-vertical" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.tileBody}
          onPress={onPress}
          onLongPress={onMenuPress ?? onLongPress}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel={`Open folder ${folder.name}`}
        >
          <View style={[styles.tileIconWrap, { backgroundColor: FOLDER_ICON_BG }]}>
            <MaterialCommunityIcons name="folder" size={24} color={FOLDER_ICON_COLOR} />
          </View>
          <Text
            style={[styles.tileName, { color: colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {folder.name}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.rowPressable}
        onPress={onPress}
        onLongPress={onMenuPress ?? onLongPress}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`Open folder ${folder.name}`}
      >
        <View style={[styles.iconWrap, { backgroundColor: FOLDER_ICON_BG }]}>
          <MaterialCommunityIcons name="folder" size={22} color={FOLDER_ICON_COLOR} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
            {folder.name}
          </Text>
          {sub ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      {onMenuPress ? (
        <ListKebab onPress={onMenuPress} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      )}
    </View>
  );
}

function ListKebab({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.listKebab}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Folder actions"
    >
      <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    minWidth: 0,
  },
  listKebab: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '500' },
  sub: { fontSize: 12, marginTop: 2 },
  tile: {
    width: 96,
    paddingVertical: 10,
    paddingHorizontal: 9,
    marginRight: 9,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    position: 'relative',
  },
  tileKebab: {
    position: 'absolute',
    top: 3,
    right: 3,
    zIndex: 1,
    padding: 4,
  },
  tileBody: {
    alignItems: 'center',
    width: '100%',
  },
  tileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tileName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  tileSub: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
  },
});
