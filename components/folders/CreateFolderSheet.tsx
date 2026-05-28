import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  title?: string;
}

export default function CreateFolderSheet({
  visible,
  onClose,
  onSubmit,
  title = 'New folder',
}: Props) {
  const colors = useThemeColors();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) setName('');
  }, [visible]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Folder name"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
            autoFocus
            onSubmitEditing={() => void handleCreate()}
          />
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.btn}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleCreate()}
              disabled={busy || !name.trim()}
              style={styles.btn}
            >
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{busy ? '…' : 'Create'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 24,
  },
  sheet: { borderRadius: 12, padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 16 },
  btn: { padding: 8 },
});
