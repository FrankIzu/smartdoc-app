import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActionMenuModal, { type ActionMenuItem } from '../../../components/ActionMenuModal';
import FileNameText from '../../../components/FileNameText';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useAuth } from '../../context/auth';
import { getEnvelope, putFieldAssignments } from '../../../services/envelopeApi';
import { getFillableTemplate } from '../../../services/fillableApi';
import { apiService } from '../../../services/api';
import type { Envelope, EnvelopeDocument, FieldAssignmentInput, WizardField } from '../../../types/signature';
import { makeFieldKey } from '../../../utils/fieldKeys';
import { saveDraftStep } from '../../../services/signatureSessionCache';

export default function AssignFieldsScreen() {
  const { envelopeId } = useLocalSearchParams<{ envelopeId: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [assignments, setAssignments] = useState<FieldAssignmentInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [assignMenuIndex, setAssignMenuIndex] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      if (!envelopeId) return;
      const res = await getEnvelope(envelopeId);
      setEnvelope(res.envelope);
      const existing = res.envelope.field_assignments ?? [];
      if (existing.length) {
        setAssignments(
          existing.map((a) => ({
            recipient_id: a.recipient_id,
            document_id: a.document_id ?? undefined,
            field_key: a.field_key,
            field_type: a.field_type,
            required: a.required,
          })),
        );
      } else {
        const built = await buildDefaultAssignments(res.envelope);
        setAssignments(built);
      }
    })();
  }, [envelopeId]);

  const signers = (envelope?.recipients ?? []).filter((r) => r.role === 'signer');
  const firstSignerId = signers[0]?.id;

  const pickRecipient = (index: number) => {
    if (!signers.length) return;
    setAssignMenuIndex(index);
  };

  const assignMenuItems = useMemo((): ActionMenuItem[] => {
    if (assignMenuIndex == null) return [];
    return signers.map((s) => ({
      id: String(s.id),
      label: s.name || s.email,
      icon: 'person-outline' as const,
      iconColor: colors.primary,
      onPress: () => {
        setAssignments((prev) =>
          prev.map((a, i) => (i === assignMenuIndex ? { ...a, recipient_id: s.id } : a)),
        );
      },
    }));
  }, [assignMenuIndex, colors.primary, signers]);

  const handleNext = async () => {
    if (!envelopeId) return;
    if (!assignments.length) {
      Alert.alert(
        'No fields',
        'Send without signature fields?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => router.push(`/signatures/create/review?envelopeId=${envelopeId}&acknowledgeOnly=1` as any),
          },
        ],
      );
      return;
    }
    setSaving(true);
    try {
      await putFieldAssignments(envelopeId, assignments);
      await saveDraftStep(user?.id, envelopeId, 'review');
      router.push(`/signatures/create/review?envelopeId=${envelopeId}` as any);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Assign fields</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>
          Tap a field to change its signer. {assignments.length} field(s) configured.
        </Text>
        {(envelope?.documents ?? []).map((doc) => {
          const docAssignments = assignments.filter((a) => a.document_id === doc.id);
          if (!docAssignments.length) return null;
          return (
            <View key={doc.id} style={[styles.docBlock, { borderColor: colors.border }]}>
              <FileNameText name={doc.display_name} style={[styles.docName, { color: colors.text }]} />
              {docAssignments.map((a) => {
                const signer = signers.find((s) => s.id === a.recipient_id);
                const globalIdx = assignments.indexOf(a);
                return (
                  <TouchableOpacity
                    key={a.field_key}
                    style={styles.fieldRow}
                    onPress={() => pickRecipient(globalIdx)}
                  >
                    <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                      {a.field_key}
                    </Text>
                    <Text style={{ color: colors.primary, fontSize: 13 }}>
                      {signer?.name || signer?.email || 'Unassigned'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          disabled={saving || !firstSignerId}
          onPress={() => void handleNext()}
        >
          <Text style={styles.nextText}>{saving ? 'Saving…' : 'Next: Review'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <ActionMenuModal
        visible={assignMenuIndex != null}
        title="Assign to"
        items={assignMenuItems}
        onClose={() => setAssignMenuIndex(null)}
      />
    </SafeAreaView>
  );
}

async function buildDefaultAssignments(envelope: Envelope): Promise<FieldAssignmentInput[]> {
  const signers = (envelope.recipients ?? []).filter((r) => r.role === 'signer');
  const recipientId = signers[0]?.id;
  if (!recipientId) return [];
  const out: FieldAssignmentInput[] = [];
  for (const doc of envelope.documents ?? []) {
    const fields = await loadFieldsForDoc(doc);
    for (const f of fields) {
      out.push({
        recipient_id: recipientId,
        document_id: doc.id,
        field_key: makeFieldKey(f.id, f.rev ?? 1),
        field_type: f.type,
        required: f.required ?? false,
      });
    }
  }
  return out;
}

async function loadFieldsForDoc(doc: EnvelopeDocument): Promise<WizardField[]> {
  if (doc.source_type === 'attachment') return [];
  if (doc.source_type === 'fillable' && doc.fillable_template_id) {
    const t = await getFillableTemplate(doc.fillable_template_id);
    return t.json_fields?.fields ?? [];
  }
  if (doc.source_type === 'form' && doc.user_form_id) {
    const res = await apiService.getFormById(doc.user_form_id);
    const form = (res as { form?: { json_fields?: unknown } }).form;
    const jf = form?.json_fields;
    if (jf && typeof jf === 'object' && Array.isArray((jf as { fields?: WizardField[] }).fields)) {
      return (jf as { fields: WizardField[] }).fields;
    }
  }
  return [];
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  content: { padding: 14, paddingBottom: 40 },
  docBlock: { padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 8 },
  docName: { fontWeight: '600', marginBottom: 8, flexShrink: 1 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  nextBtn: { marginTop: 24, padding: 14, borderRadius: 8, alignItems: 'center' },
  nextText: { color: '#fff', fontWeight: '700' },
});
