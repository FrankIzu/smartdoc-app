/**
 * PrepareHeader — top navigation bar for the prepare editor.
 *
 * Contains: back (with dirty guard), title, page nav,
 * undo/redo, save/finish buttons (color indicates unsaved state).
 *
 * Uses RNGH TouchableOpacity so taps stay reliable after field gestures
 * (RN Touchables inside GestureHandlerRootView can intermittently ignore presses).
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { FeedbackTouchable } from '../../FeedbackTouchable';
import type { PrepareEditorActions, PrepareEditorState } from '../../../hooks/usePrepareEditor';
import { useThemeColors } from '../../../hooks/useThemeColors';
import AppBackButton from '../../AppBackButton';

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
  } = editor;

  return (
    <View style={[styles.container, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border ?? '#E5E7EB' }]}>
      {/* Left: back + undo/redo */}
      <View style={styles.side}>
        <AppBackButton onPress={onBack} />

        <TouchableOpacity
          style={[styles.iconBtn, !canUndo && styles.disabled]}
          onPress={undo}
          disabled={!canUndo || isSaving || isFinishing}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-undo-outline" size={20} color={canUndo ? colors.text : colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconBtn, !canRedo && styles.disabled]}
          onPress={redo}
          disabled={!canRedo || isSaving || isFinishing}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-redo-outline" size={20} color={canRedo ? colors.text : colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Center: page nav */}
      <View style={styles.center}>
        <TouchableOpacity
          onPress={() => goToPage(currentPage - 1)}
          disabled={currentPage === 0 || isSaving || isFinishing}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="chevron-back-outline"
            size={18}
            color={currentPage === 0 ? colors.textSecondary : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.pageLabel, { color: colors.text }]}>
          {currentPage + 1} / {totalPages || '–'}
        </Text>
        <TouchableOpacity
          onPress={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages - 1 || isSaving || isFinishing}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="chevron-forward-outline"
            size={18}
            color={currentPage >= totalPages - 1 ? colors.textSecondary : colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Right: finish + save */}
      <View style={styles.side}>
        {showFinish ? (
          <FeedbackTouchable
            style={[styles.finishBtn, { backgroundColor: colors.success ?? '#16A34A' }]}
            onPress={onFinish}
            loading={!!isFinishing}
            disabled={isFinishing || isSaving}
            spinnerColor="#fff"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.saveText}>Finish</Text>
          </FeedbackTouchable>
        ) : null}

        <FeedbackTouchable
          style={[
            styles.saveBtn,
            {
              backgroundColor: isDirty ? colors.warning : colors.primary,
              opacity: isDirty ? 1 : 0.5,
            },
          ]}
          onPress={onSave}
          loading={isSaving}
          disabled={!isDirty || isSaving || isFinishing}
          spinnerColor="#fff"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.saveText}>Save</Text>
        </FeedbackTouchable>
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
