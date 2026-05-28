/**
 * PrepareToolPalette — tool row + scrollable field list.
 *
 * Tools: cursor + 5 field types (tap a type to add one field, then drag to position).
 * Field list: tap to select and jump to page (blocked during gestureLock).
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { PrepareTool, PrepareEditorState, PrepareEditorActions } from '../../../hooks/usePrepareEditor';
import { FIELD_COLORS, FIELD_ICONS, FIELD_TYPES } from '../../../utils/fillable';
import type { FieldType } from '../../../types/signature';

const FIELD_LABELS: Record<string, string> = {
  cursor: 'Select',
  signature: 'Signature',
  initials: 'Initials',
  date: 'Date',
  text: 'Text',
  checkbox: 'Checkbox',
};

interface Props {
  editor: PrepareEditorState & PrepareEditorActions;
}

const TOOLS: PrepareTool[] = ['cursor', ...FIELD_TYPES];

export default function PrepareToolPalette({ editor }: Props) {
  const colors = useThemeColors();
  const {
    prepareTool: activeTool,
    setPrepareTool,
    sortedAllFields,
    selectedFieldIds,
    jumpToField,
    isGestureLocked,
  } = editor;

  const locked = isGestureLocked;

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background, borderBottomColor: colors.border ?? '#E5E7EB' }]}>
      {/* Tool buttons */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.toolRow}
      >
        {TOOLS.map((tool) => {
          const isActive = activeTool === tool;
          const color = tool === 'cursor' ? colors.primary : FIELD_COLORS[tool];
          return (
            <TouchableOpacity
              key={tool}
              style={[
                styles.toolBtn,
                locked && styles.disabled,
                isActive
                  ? { backgroundColor: color, borderColor: color }
                  : { backgroundColor: 'transparent', borderColor: color },
              ]}
              onPress={() => setPrepareTool(tool)}
              disabled={locked}
              activeOpacity={0.75}
            >
              <Ionicons
                name={(tool === 'cursor' ? 'hand-left-outline' : FIELD_ICONS[tool]) as keyof typeof Ionicons.glyphMap}
                size={16}
                color={isActive ? '#fff' : color}
              />
              <Text style={[styles.toolLabel, { color: isActive ? '#fff' : color }]}>
                {FIELD_LABELS[tool]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Field list */}
      {sortedAllFields.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.fieldRow}
        >
          {sortedAllFields.map((f) => {
            const isSelected = selectedFieldIds.includes(f.id);
            const color = FIELD_COLORS[(f.type as FieldType)] ?? colors.primary;
            return (
              <TouchableOpacity
                key={f.id}
                style={[
                  styles.fieldChip,
                  locked && styles.disabled,
                  {
                    borderColor: isSelected ? color : colors.border ?? '#D1D5DB',
                    backgroundColor: isSelected ? `${color}18` : 'transparent',
                  },
                ]}
                onPress={() => jumpToField(f.id)}
                disabled={locked}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={(FIELD_ICONS[f.type as FieldType] ?? 'document-outline') as keyof typeof Ionicons.glyphMap}
                  size={12}
                  color={isSelected ? color : colors.textSecondary}
                />
                <Text
                  style={[styles.fieldChipText, { color: isSelected ? color : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {f.label || f.type} · p{(f.page ?? 0) + 1}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  toolRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
    paddingBottom: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 6,
    alignItems: 'center',
    paddingTop: 2,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  fieldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 140,
  },
  fieldChipText: {
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
  },
  disabled: {
    opacity: 0.4,
  },
});
