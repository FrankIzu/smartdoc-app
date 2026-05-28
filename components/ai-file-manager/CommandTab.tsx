import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { AI_FM_COMMAND_HINT, AI_FM_DISCLAIMER, AI_FM_RUN_BUTTON_COLOR } from '../../constants/aiFileManagerHelp';
import type { UseAiFileManagerReturn } from '../../hooks/useAiFileManager';
import { useThemeColors } from '../../hooks/useThemeColors';
import GateActionSheet from './GateActionSheet';
import HighRiskConfirmModal from './HighRiskConfirmModal';
import PlanFileLinks from './PlanFileLinks';

interface Props {
  fm: UseAiFileManagerReturn;
  onOpenHistoryTab: () => void;
}

export default function CommandTab({ fm, onOpenHistoryTab }: Props) {
  const colors = useThemeColors();
  const [input, setInput] = useState('');
  const [showHighRisk, setShowHighRisk] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const showSub = Keyboard.addListener(showEvent, () => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => showSub.remove();
  }, []);

  const busy = fm.phase === 'planning' || fm.phase === 'executing' || fm.phase === 'undoing';
  const unknown = fm.phase === 'unknown';

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || busy || unknown) return;
    setInput('');
    void fm.sendPlan(msg);
  };

  const handleRun = () => {
    if (fm.pendingPlan?.requiresHighRiskConfirm) {
      setShowHighRisk(true);
      return;
    }
    void fm.approveExecute();
  };

  React.useEffect(() => {
    if (fm.phase === 'gate' && fm.activeGate) {
      setShowGate(true);
    } else {
      setShowGate(false);
    }
  }, [fm.phase, fm.activeGate]);

  return (
    <View style={styles.flex}>
      {unknown ? (
        <View style={[styles.banner, { backgroundColor: colors.primary + '18' }]}>
          <Text style={[styles.bannerText, { color: colors.text }]}>
            Execution status unclear. Refresh history to continue.
          </Text>
          <View style={styles.bannerActions}>
            <TouchableOpacity onPress={() => void fm.resolveUnknownFromHistory()}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Refresh History</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onOpenHistoryTab}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Open History</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Text style={[styles.hint, { color: colors.textSecondary }]}>{AI_FM_COMMAND_HINT}</Text>

      <FlatList
        ref={listRef}
        style={styles.listFlex}
        data={fm.thread}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user'
                ? [styles.userBubble, { backgroundColor: colors.primary + '22' }]
                : [styles.assistantBubble, { backgroundColor: colors.background }],
            ]}
          >
            <Text style={[styles.bubbleText, { color: colors.text }]}>{item.content}</Text>
            {item.role === 'assistant' && item.planFileLinks?.length ? (
              <PlanFileLinks links={item.planFileLinks} />
            ) : null}
          </View>
        )}
        ListFooterComponent={
          busy ? (
            <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
          ) : null
        }
      />

      {fm.pendingPlan != null ? (
        <View style={[styles.pendingActionsBar, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.runBtn, styles.runBtnFlex, { backgroundColor: AI_FM_RUN_BUTTON_COLOR }]}
            onPress={handleRun}
            disabled={busy}
          >
            <Text style={styles.runBtnText}>Run</Text>
          </TouchableOpacity>
          {fm.pendingPlan.historyId != null ? (
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => void fm.abandonHistory(fm.pendingPlan!.historyId!)}
              disabled={busy}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel plan</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.inputSection, { borderTopColor: colors.border }]}>
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Command…"
            placeholderTextColor={colors.textSecondary}
            multiline
            editable={!busy && !unknown}
            style={[
              styles.input,
              { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
            ]}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || busy || unknown}
            style={[
              styles.planBtn,
              { backgroundColor: colors.primary, opacity: !input.trim() || busy || unknown ? 0.4 : 1 },
            ]}
          >
            <Text style={styles.planBtnText}>Plan</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{AI_FM_DISCLAIMER}</Text>
      </View>

      <GateActionSheet
        visible={showGate}
        gateType={fm.activeGate}
        planResponse={fm.lastPlanResponse}
        onClose={() => setShowGate(false)}
        onConfirmScope={() => {
          setShowGate(false);
          fm.confirmScope();
        }}
        onConfirmFolderScope={(currentOnly) => {
          setShowGate(false);
          fm.confirmFolderScope(currentOnly);
        }}
        onConfirmRenameBatch={() => {
          setShowGate(false);
          fm.confirmRenameBatch();
        }}
        onPickRenameTarget={(id) => {
          setShowGate(false);
          fm.pickRenameTarget(id);
        }}
        onRunNowAnyway={() => {
          setShowGate(false);
          fm.runNowAnyway();
        }}
      />

      <HighRiskConfirmModal
        visible={showHighRisk}
        onClose={() => setShowHighRisk(false)}
        onConfirm={() => {
          setShowHighRisk(false);
          void fm.approveExecute('CONFIRM');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listFlex: { flex: 1 },
  list: { padding: 12, paddingBottom: 8 },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  bubble: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    maxWidth: '92%',
  },
  userBubble: { alignSelf: 'flex-end', maxWidth: '92%' },
  assistantBubble: { alignSelf: 'stretch', maxWidth: '100%' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  inputSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  planBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  planBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  disclaimer: { fontSize: 11, lineHeight: 15, marginTop: 8, textAlign: 'center' },
  pendingActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  runBtnFlex: { flex: 1 },
  cancelBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  runBtn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  runBtnText: { color: '#fff', fontWeight: '600' },
  banner: { padding: 12, margin: 12, borderRadius: 8 },
  bannerText: { fontSize: 14, marginBottom: 8 },
  bannerActions: { flexDirection: 'row', gap: 16 },
});
