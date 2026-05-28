import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { BreadcrumbItem } from '../../types/folder';

interface Props {
  items: BreadcrumbItem[];
  onPress: (index: number) => void;
}

export default function FolderBreadcrumb({ items, onPress }: Props) {
  const colors = useThemeColors();
  if (!items.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {items.map((item, index) => (
        <View key={`${item.id ?? 'root'}-${index}`} style={styles.segmentRow}>
          {index > 0 ? (
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} style={styles.sep} />
          ) : null}
          <TouchableOpacity onPress={() => onPress(index)} disabled={index === items.length - 1}>
            <Text
              style={[
                styles.label,
                {
                  color: index === items.length - 1 ? colors.text : colors.primary,
                  fontWeight: index === items.length - 1 ? '600' : '400',
                },
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, maxHeight: 33 },
  content: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5 },
  segmentRow: { flexDirection: 'row', alignItems: 'center' },
  sep: { marginHorizontal: 4 },
  label: { fontSize: 14, maxWidth: 140 },
});
