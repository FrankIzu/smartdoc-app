import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { RecipientInput } from '../../types/signature';

interface Props {
  recipients: RecipientInput[];
  onChange: (recipients: RecipientInput[]) => void;
}

export default function RecipientEditor({ recipients, onChange }: Props) {
  const colors = useThemeColors();

  const update = (index: number, patch: Partial<RecipientInput>) => {
    const next = recipients.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  };

  const addSigner = () => {
    onChange([
      ...recipients,
      {
        email: '',
        name: '',
        role: 'signer',
        order_index: recipients.filter((r) => r.role === 'signer').length,
      },
    ]);
  };

  const addCc = () => {
    onChange([...recipients, { email: '', name: '', role: 'cc', order_index: 999 }]);
  };

  const remove = (index: number) => {
    onChange(recipients.filter((_, i) => i !== index));
  };

  return (
    <View>
      {recipients.map((r, i) => (
        <View key={i} style={[styles.row, { borderColor: colors.border }]}>
          <Text style={[styles.role, { color: colors.textSecondary }]}>
            {r.role === 'cc' ? 'CC' : `Signer ${(r.order_index ?? 0) + 1}`}
          </Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
            value={r.email}
            onChangeText={(email) => update(i, { email })}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="Name (optional)"
            placeholderTextColor={colors.textSecondary}
            value={r.name ?? ''}
            onChangeText={(name) => update(i, { name })}
          />
          <TouchableOpacity onPress={() => remove(i)}>
            <Text style={{ color: '#dc2626' }}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.addRow}>
        <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={addSigner}>
          <Text style={{ color: colors.primary }}>+ Signer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.addBtn, { borderColor: colors.border }]} onPress={addCc}>
          <Text style={{ color: colors.textSecondary }}>+ CC</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  role: { fontSize: 12, marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 16 },
  addRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  addBtn: { paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderRadius: 8 },
});
