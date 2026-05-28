import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AI_FM_RUN_BUTTON_COLOR } from '../../constants/aiFileManagerHelp';
import { useThemeColors } from '../../hooks/useThemeColors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function HighRiskConfirmModal({ visible, onClose, onConfirm }: Props) {
  const colors = useThemeColors();
  const [text, setText] = useState('');

  const handleConfirm = () => {
    if (text.trim() !== 'CONFIRM') return;
    setText('');
    onConfirm();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.box, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.text }]}>Confirm destructive action</Text>
          <Text style={[styles.msg, { color: colors.textSecondary }]}>
            Type CONFIRM to run this high-risk plan.
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="CONFIRM"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
          />
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.action}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={text.trim() !== 'CONFIRM'}
              style={styles.action}
            >
              <Text style={{ color: AI_FM_RUN_BUTTON_COLOR, fontWeight: '600' }}>Run</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 24,
  },
  box: { borderRadius: 12, padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  msg: { fontSize: 14, marginBottom: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  action: { padding: 8 },
});
