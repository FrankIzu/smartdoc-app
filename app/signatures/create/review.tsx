import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FileNameText from '../../../components/FileNameText';
import { SIGNATURE_LIST_TITLE_MAX } from '../../../utils/displayFilename';
import { useEnvelopeDraft } from '../../../hooks/useEnvelopeDraft';
import { invalidateEnvelopeListCache } from '../../../hooks/useEnvelopeList';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useAuth } from '../../context/auth';
import { getEnvelope, sendEnvelope } from '../../../services/envelopeApi';
import type { Envelope } from '../../../types/signature';
import { clearDraftStep } from '../../../services/signatureSessionCache';

export default function ReviewSendScreen() {
  const { envelopeId, acknowledgeOnly } = useLocalSearchParams<{
    envelopeId: string;
    acknowledgeOnly?: string;
  }>();
  const router = useRouter();
  const colors = useThemeColors();
  const { clearWizardSources } = useEnvelopeDraft();
  const { user } = useAuth();
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!envelopeId) return;
    void getEnvelope(envelopeId).then((res) => setEnvelope(res.envelope));
  }, [envelopeId]);

  const handleSend = async () => {
    if (!envelopeId) return;
    setSending(true);
    try {
      await sendEnvelope(envelopeId, {
        acknowledgeOnly: acknowledgeOnly === '1',
      });
      await clearWizardSources();
      await clearDraftStep(user?.id, envelopeId);
      invalidateEnvelopeListCache();
      Alert.alert('Sent', 'Your envelope has been sent for signature.', [
        { text: 'OK', onPress: () => router.replace('/signatures' as any) },
      ]);
    } catch (e: unknown) {
      Alert.alert('Send failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Review & send</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <FileNameText
          name={envelope?.title}
          style={[styles.envTitle, { color: colors.text }]}
          sanitize={false}
          maxLength={SIGNATURE_LIST_TITLE_MAX}
        />
        {envelope?.message ? (
          <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>{envelope.message}</Text>
        ) : null}
        <Text style={[styles.section, { color: colors.text }]}>
          Documents: {envelope?.documents?.length ?? 0}
        </Text>
        <Text style={[styles.section, { color: colors.text }]}>
          Signers: {(envelope?.recipients ?? []).filter((r) => r.role === 'signer').length}
        </Text>
        <Text style={[styles.section, { color: colors.text }]}>
          Field assignments: {envelope?.field_assignments?.length ?? 0}
        </Text>
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: sending ? 0.6 : 1 }]}
          disabled={sending}
          onPress={() => void handleSend()}
        >
          <Text style={styles.sendText}>{sending ? 'Sending…' : 'Send for signature'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  content: { padding: 14, paddingBottom: 40 },
  envTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  section: { marginBottom: 8, fontWeight: '500' },
  sendBtn: { marginTop: 32, padding: 16, borderRadius: 8, alignItems: 'center' },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
