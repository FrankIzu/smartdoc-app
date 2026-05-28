/**
 * PreparePropertiesSheet — bottom sheet for field properties.
 *
 * Shows when a field is selected (primarySelectedFieldId non-null).
 * Slides up from the bottom using Reanimated.
 * DocuSign-style: type (read-only with color), label, required toggle,
 * page selector, copy/paste, delete.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect } from 'react';
import {
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import type { PrepareEditorActions, PrepareEditorState } from '../../../hooks/usePrepareEditor';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { FieldType } from '../../../types/signature';
import { FIELD_COLORS } from '../../../utils/fillable';

const SHEET_HEIGHT = 220;

interface Props {
  editor: PrepareEditorState & PrepareEditorActions;
}

export default function PreparePropertiesSheet({ editor }: Props) {
  const colors = useThemeColors();
  const {
    fields,
    primarySelectedFieldId,
    selectedFieldIds,
    totalPages,
    updateField,
    softDeleteSelected,
    copySelected,
    paste,
    fieldClipboard,
  } = editor;

  const primaryField = primarySelectedFieldId
    ? fields.find((f) => f.id === primarySelectedFieldId)
    : null;

  // Animate sheet in/out
  const translateY = useSharedValue(SHEET_HEIGHT);
  useEffect(() => {
    translateY.value = withSpring(primaryField ? 0 : SHEET_HEIGHT, {
      damping: 22,
      stiffness: 280,
    });
  }, [primaryField, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleLabelChange = useCallback(
    (text: string) => {
      if (!primarySelectedFieldId) return;
      updateField(primarySelectedFieldId, { label: text });
    },
    [primarySelectedFieldId, updateField],
  );

  const handleRequiredToggle = useCallback(
    (val: boolean) => {
      if (!primarySelectedFieldId) return;
      updateField(primarySelectedFieldId, { required: val });
    },
    [primarySelectedFieldId, updateField],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      if (!primarySelectedFieldId) return;
      updateField(primarySelectedFieldId, { page });
    },
    [primarySelectedFieldId, updateField],
  );

  if (!primaryField) return null;

  const fieldColor = FIELD_COLORS[(primaryField.type as FieldType)] ?? colors.primary;
  const hasClipboard = fieldClipboard.current.length > 0;
  const fieldPage = primaryField.page ?? 0;

  return (
    <Animated.View
      style={[
        styles.sheet,
        { backgroundColor: colors.background, borderTopColor: colors.border ?? '#E5E7EB' },
        animatedStyle,
      ]}
      pointerEvents={primaryField ? 'auto' : 'none'}
    >
      {/* Handle bar */}
      <View style={styles.handleRow}>
        <View style={[styles.handle, { backgroundColor: colors.textSecondary }]} />
      </View>

      {/* Header row: type chip + actions */}
      <View style={styles.headerRow}>
        {/* Type badge */}
        <View style={[styles.typeBadge, { backgroundColor: `${fieldColor}18`, borderColor: fieldColor }]}>
          <View style={[styles.typeDot, { backgroundColor: fieldColor }]} />
          <Text style={[styles.typeLabel, { color: fieldColor }]}>
            {primaryField.type.charAt(0).toUpperCase() + primaryField.type.slice(1)}
          </Text>
        </View>

        {/* Selection count */}
        {selectedFieldIds.length > 1 && (
          <Text style={[styles.selectionCount, { color: colors.textSecondary }]}>
            {selectedFieldIds.length} selected
          </Text>
        )}

        <View style={styles.spacer} />

        {/* Copy / Paste / Delete */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={copySelected}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="copy-outline" size={18} color={colors.text} />
        </TouchableOpacity>
        {hasClipboard && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={paste}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="clipboard-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={softDeleteSelected}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* Label */}
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Label</Text>
        <TextInput
          style={[styles.textInput, { color: colors.text, borderColor: colors.border ?? '#E5E7EB', backgroundColor: colors.background }]}
          value={primaryField.label}
          onChangeText={handleLabelChange}
          placeholder="Field label"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
          maxLength={80}
        />
      </View>

      {/* Required toggle */}
      <View style={styles.toggleRow}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>Required</Text>
        <Switch
          value={primaryField.required}
          onValueChange={handleRequiredToggle}
          accessibilityLabel="Required field"
          style={styles.requiredSwitch}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
          thumbColor={colors.switchThumbAndroid(primaryField.required)}
          ios_backgroundColor={colors.switchTrackOff}
        />
      </View>

      {/* Page picker */}
      {totalPages > 1 && (
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Page</Text>
          <View style={styles.pageRow}>
            {Array.from({ length: totalPages }).map((_, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.pageChip,
                  {
                    backgroundColor: fieldPage === i ? fieldColor : 'transparent',
                    borderColor: fieldPage === i ? fieldColor : colors.border ?? '#D1D5DB',
                  },
                ]}
                onPress={() => handlePageChange(i)}
              >
                <Text
                  style={[
                    styles.pageChipText,
                    { color: fieldPage === i ? '#fff' : colors.textSecondary },
                  ]}
                >
                  {i + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectionCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  spacer: {
    flex: 1,
  },
  actionBtn: {
    padding: 6,
    borderRadius: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  requiredSwitch: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '500',
    width: 64,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 36,
  },
  pageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  pageChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
