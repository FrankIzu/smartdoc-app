import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { AI_FM_RUN_NOW_ANYWAY_COLOR } from '../../constants/aiFileManagerHelp';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { GateType, PlanResponse } from '../../types/aiFileManager';
import MinimizableBottomSheet from '../MinimizableBottomSheet';

interface Props {
  visible: boolean;
  gateType: GateType | null;
  planResponse: PlanResponse | null;
  onClose: () => void;
  onConfirmScope: () => void;
  onConfirmFolderScope: (currentFolderOnly: boolean) => void;
  onConfirmRenameBatch: () => void;
  onPickRenameTarget: (fileId: number) => void;
  onRunNowAnyway: () => void;
  /** Bump on every open so a minimized sheet expands again. */
  expandNonce?: number;
}

export default function GateActionSheet({
  visible,
  gateType,
  planResponse,
  onClose,
  onConfirmScope,
  onConfirmFolderScope,
  onConfirmRenameBatch,
  onPickRenameTarget,
  onRunNowAnyway,
  expandNonce = 0,
}: Props) {
  const colors = useThemeColors();
  if (!visible || !gateType) return null;

  const candidates = planResponse?.plan?.rename_candidates ?? [];

  let body: React.ReactNode = null;
  let title = 'Confirmation required';

  switch (gateType) {
    case 'scope':
      title = 'Large batch';
      body = (
        <>
          <Text style={[styles.msg, { color: colors.textSecondary }]}>
            This action may affect many files. Continue?
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={onConfirmScope}>
            <Text style={styles.btnText}>Confirm scope</Text>
          </TouchableOpacity>
        </>
      );
      break;
    case 'folder_scope':
      title = 'Folder scope';
      body = (
        <>
          <Text style={[styles.msg, { color: colors.textSecondary }]}>
            Apply only to the current folder, or the whole workspace?
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => onConfirmFolderScope(true)}
          >
            <Text style={styles.btnText}>This folder only</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnOutline, { borderColor: colors.primary }]}
            onPress={() => onConfirmFolderScope(false)}
          >
            <Text style={[styles.btnOutlineText, { color: colors.primary }]}>Whole workspace</Text>
          </TouchableOpacity>
        </>
      );
      break;
    case 'rename':
      title = 'Rename clarification';
      body = (
        <>
          <Text style={[styles.msg, { color: colors.textSecondary }]}>
            Multiple files match. Pick one or rename all matches.
          </Text>
          {candidates.map((c) => (
            <TouchableOpacity
              key={c.file_id}
              style={[styles.btnOutline, { borderColor: colors.border }]}
              onPress={() => onPickRenameTarget(c.file_id)}
            >
              <Text style={{ color: colors.text }} numberOfLines={1}>
                {c.name || `File ${c.file_id}`}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={onConfirmRenameBatch}
          >
            <Text style={styles.btnText}>Rename all matches</Text>
          </TouchableOpacity>
        </>
      );
      break;
    case 'schedule':
      title = 'Large batch';
      body = (
        <>
          <Text style={[styles.msg, { color: colors.textSecondary }]}>
            This batch is large. Schedule for later or run now anyway?
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: AI_FM_RUN_NOW_ANYWAY_COLOR }]}
            onPress={onRunNowAnyway}
          >
            <Text style={styles.btnText}>Run now anyway</Text>
          </TouchableOpacity>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Or use the Scheduled tab after picking a time in Command (schedule API).
          </Text>
        </>
      );
      break;
    default:
      body = null;
  }

  return (
    <MinimizableBottomSheet
      visible={visible}
      onClose={onClose}
      expandNonce={expandNonce}
      title={title}
      heightRatio={0.5}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {body}
        <TouchableOpacity onPress={onClose} style={styles.cancel}>
          <Text style={{ color: colors.textSecondary }}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </MinimizableBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 0 },
  msg: { fontSize: 15, marginBottom: 16, lineHeight: 22 },
  hint: { fontSize: 13, marginTop: 8 },
  btn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnText: { color: '#fff', fontWeight: '600' },
  btnOutline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  btnOutlineText: { fontWeight: '600' },
  cancel: { alignItems: 'center', paddingVertical: 12 },
});
