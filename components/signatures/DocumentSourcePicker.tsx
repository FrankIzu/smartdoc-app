import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FileNameText from '../FileNameText';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { WizardSourceDraft } from '../../types/signature';

interface Props {
  sources: WizardSourceDraft[];
  onSourcesChange: (sources: WizardSourceDraft[]) => void;
  onUploadPdf: () => Promise<void>;
  onPickTemplate: () => void;
  onPickForm: () => void;
  onPickAttachment: () => Promise<void>;
  onPrepare: (templateId: number) => void;
}

export default function DocumentSourcePicker({
  sources,
  onSourcesChange,
  onUploadPdf,
  onPickTemplate,
  onPickForm,
  onPickAttachment,
  onPrepare,
}: Props) {
  const colors = useThemeColors();

  const move = (index: number, dir: -1 | 1) => {
    const next = [...sources];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    onSourcesChange(next);
  };

  const remove = (index: number) => {
    Alert.alert('Remove document?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => onSourcesChange(sources.filter((_, i) => i !== index)),
      },
    ]);
  };

  return (
    <View>
      <View style={styles.actions}>
        <ActionBtn icon="cloud-upload-outline" label="Upload" colors={colors} onPress={() => void onUploadPdf()} />
        <ActionBtn icon="document-text-outline" label="Template" colors={colors} onPress={onPickTemplate} />
        <ActionBtn icon="list-outline" label="Form" colors={colors} onPress={onPickForm} />
        <ActionBtn icon="attach-outline" label="File" colors={colors} onPress={() => void onPickAttachment()} />
      </View>
      {sources.map((s, i) => (
        <View key={s.localId} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <FileNameText
              name={s.display_name || s.source_type}
              style={[styles.name, { color: colors.text }]}
            />
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{s.source_type}</Text>
          </View>
          {s.source_type === 'fillable' && s.fillable_template_id ? (
            <TouchableOpacity onPress={() => onPrepare(s.fillable_template_id!)} style={styles.iconBtn}>
              <Text style={{ color: colors.primary, fontSize: 12 }}>Prepare</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0}>
            <Ionicons name="arrow-up" size={20} color={i === 0 ? colors.border : colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => move(i, 1)} disabled={i === sources.length - 1}>
            <Ionicons name="arrow-down" size={20} color={i === sources.length - 1 ? colors.border : colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => remove(i)}>
            <Ionicons name="trash-outline" size={20} color="#dc2626" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  colors,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  colors: ReturnType<typeof useThemeColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={onPress}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={{ color: colors.text, fontSize: 11, marginTop: 4 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  actionBtn: {
    width: '22%',
    minWidth: 72,
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  name: { fontWeight: '600' },
  iconBtn: { paddingHorizontal: 8 },
});

export async function pickDocumentPdf(): Promise<DocumentPicker.DocumentPickerAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0];
}

/** Pick a document for Fill — PDF, text, or office formats (converted server-side). */
export async function pickDocumentForFill(): Promise<DocumentPicker.DocumentPickerAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/pdf',
      'text/*',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/*',
    ],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0];
}
