/**
 * PrepareHeader — top navigation bar for the prepare editor.
 *
 * Contains: back (with dirty guard), title, page nav,
 * undo/redo, save/finish buttons (color indicates unsaved state).
 * Page nav and toolbar buttons are disabled during gestureLock.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import type { PrepareEditorActions, PrepareEditorState } from '../../../hooks/usePrepareEditor';
import { useThemeColors } from '../../../hooks/useThemeColors';

interface Props {
  editor: PrepareEditorState & PrepareEditorActions;
  onBack: () => void;
  onSave: () => void;
  showFinish?: boolean;
  onFinish?: () => void;
  isFinishing?: boolean;
}

export default function PrepareHeader({
  editor,
  onBack,
  onSave,
  showFinish,
  onFinish,
  isFinishing,
}: Props) {
  const colors = useThemeColors();
  const {
    isDirty, isSaving, currentPage, totalPages,
    canUndo, canRedo,
    goToPage, undo, redo,
    isGestureLocked,
  } = editor;

  const locked = isGestureLocked;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, borderBottomColor: colors.border ?? '#E5E7EB' }]}>
      {/* Left: back + undo/redo */}
      <View style={styles.side}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconBtn, !canUndo && styles.disabled]}
          onPress={undo}
          disabled={!canUndo || locked}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-undo-outline" size={20} color={canUndo ? colors.text : colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconBtn, !canRedo && styles.disabled]}
          onPress={redo}
          disabled={!canRedo || locked}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-redo-outline" size={20} color={canRedo ? colors.text : colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Center: page nav */}
      <View style={styles.center}>
        <TouchableOpacity
          onPress={() => goToPage(currentPage - 1)}
          disabled={currentPage === 0 || locked}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="chevron-back-outline"
            size={18}
            color={currentPage === 0 || locked ? colors.textSecondary : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.pageLabel, { color: colors.text }]}>
          {currentPage + 1} / {totalPages || '–'}
        </Text>
        <TouchableOpacity
          onPress={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages - 1 || locked}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="chevron-forward-outline"
            size={18}
            color={currentPage >= totalPages - 1 || locked ? colors.textSecondary : colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Right: finish + save */}
      <View style={styles.side}>
        {showFinish ? (
          <TouchableOpacity
            style={[styles.finishBtn, { backgroundColor: colors.success ?? '#16A34A' }]}
            onPress={onFinish}
            disabled={isFinishing || isSaving || locked}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isFinishing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveText}>Finish</Text>
            )}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[
            styles.saveBtn,
            {
              backgroundColor: isDirty ? colors.warning : colors.primary,
              opacity: isDirty ? 1 : 0.5,
            },
          ]}
          onPress={onSave}
          disabled={isSaving || isFinishing || locked}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  center: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
  },
  disabled: {
    opacity: 0.35,
  },
  pageLabel: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'center',
  },
  finishBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginLeft: 2,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginLeft: 2,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
