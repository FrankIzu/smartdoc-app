import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentViewer from '../../components/DocumentViewer';
import FileNameText from '../../components/FileNameText';
import { SIGNATURE_HEADER_TITLE_MAX } from '../../utils/displayFilename';
import EnvelopeDetailPanels from '../../components/signatures/EnvelopeDetailPanels';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuth } from '../context/auth';
import { invalidateEnvelopeListCache } from '../../hooks/useEnvelopeList';
import {
  deleteEnvelopeDraft,
  duplicateEnvelope,
  getEnvelope,
  resendRecipientInvite,
  voidEnvelope,
} from '../../services/envelopeApi';
import type { Envelope } from '../../types/signature';
import {
  envelopeFinalFileId,
  resolveEnvelopeAuditFileId,
  resolveEnvelopeCertificateFileId,
} from '../../utils/envelopeActions';
import { envelopeStatusBadge } from '../../utils/envelopeDisplay';
import { envelopeDisplayId, resolveWizardStepFromEnvelope } from '../../utils/signatureRuntime';
import { hubSignRoute } from '../../utils/signatureRouteResolver';
import { loadDraftStep, saveDraftStep } from '../../services/signatureSessionCache';

export default function EnvelopeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState<{ id: string; name: string } | null>(null);
  const [openingPdfKind, setOpeningPdfKind] = useState<'audit' | 'certificate' | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await getEnvelope(id);
      setEnvelope(res.envelope);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleResumeDraft = async () => {
    if (!envelope) return;
    const backendStep = resolveWizardStepFromEnvelope(envelope);
    const localStep = await loadDraftStep(user?.id, envelopeDisplayId(envelope));
    const step = backendStep || localStep || 'add_documents';
    await saveDraftStep(user?.id, envelopeDisplayId(envelope), step);
    const eid = envelopeDisplayId(envelope);
    switch (step) {
      case 'add_documents':
        router.push(`/signatures/create?envelopeId=${eid}` as any);
        break;
      case 'recipients':
        router.push(`/signatures/create/recipients?envelopeId=${eid}` as any);
        break;
      case 'assign_fields':
        router.push(`/signatures/create/assign-fields?envelopeId=${eid}` as any);
        break;
      default:
        router.push(`/signatures/create/review?envelopeId=${eid}` as any);
    }
  };

  const openSignedPdf = async () => {
    if (!envelope) return;
    const fileId = envelopeFinalFileId(envelope);
    if (!fileId) {
      Alert.alert('Not available', 'The signed PDF is not ready yet.');
      return;
    }
    setViewerFile({
      id: String(fileId),
      name: envelope.title || 'Signed document',
    });
  };

  const openAuditTrailPdf = async () => {
    if (!envelope) return;
    setOpeningPdfKind('audit');
    try {
      const auditFileId = await resolveEnvelopeAuditFileId(
        envelopeDisplayId(envelope),
        envelope.audit_file_id,
      );
      if (!auditFileId) {
        Alert.alert('Not available', 'The audit trail PDF could not be generated.');
        return;
      }
      setViewerFile({
        id: String(auditFileId),
        name: `Audit trail — ${envelope.title || 'Envelope'}`,
      });
    } catch (e: unknown) {
      Alert.alert('Could not open audit trail', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setOpeningPdfKind(null);
    }
  };

  const openCertificatePdf = async () => {
    if (!envelope) return;
    setOpeningPdfKind('certificate');
    try {
      const certificateFileId = await resolveEnvelopeCertificateFileId(
        envelopeDisplayId(envelope),
        envelope.certificate_file_id,
      );
      if (!certificateFileId) {
        Alert.alert('Not available', 'The completion certificate is not ready yet.');
        return;
      }
      setViewerFile({
        id: String(certificateFileId),
        name: `Certificate — ${envelope.title || 'Envelope'}`,
      });
    } catch (e: unknown) {
      Alert.alert('Could not open certificate', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setOpeningPdfKind(null);
    }
  };

  if (loading || !envelope) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const eid = envelopeDisplayId(envelope);
  const canSign = envelope.inbox_context?.can_sign && envelope.inbox_context?.is_my_turn;
  const isActive = envelope.status === 'sent' || envelope.status === 'in_progress';
  const statusBadge = envelopeStatusBadge(envelope.status);

  const handleDeleteDraft = () => {
    Alert.alert('Delete draft?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEnvelopeDraft(eid);
            invalidateEnvelopeListCache('drafts');
            router.back();
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Could not delete');
          }
        },
      },
    ]);
  };

  const handleResend = async (recipientId: number) => {
    await resendRecipientInvite(eid, recipientId);
    Alert.alert('Sent', 'Reminder sent.');
    void load();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerBody}>
          <FileNameText
            name={envelope.title || 'Untitled envelope'}
            style={[styles.title, { color: colors.text }]}
            sanitize={false}
            maxLength={SIGNATURE_HEADER_TITLE_MAX}
          />
          <View style={[styles.statusBadge, { backgroundColor: statusBadge.backgroundColor }]}>
            <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
              {statusBadge.label}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {envelope.message ? (
          <Text style={[styles.message, { color: colors.text }]}>{envelope.message}</Text>
        ) : null}

        {envelope.status === 'draft' ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={handleResumeDraft}
          >
            <Text style={styles.btnText}>Continue draft</Text>
          </TouchableOpacity>
        ) : null}
        {canSign ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => router.push(hubSignRoute(eid))}
          >
            <Text style={styles.btnText}>Sign</Text>
          </TouchableOpacity>
        ) : null}

        <EnvelopeDetailPanels
          envelope={envelope}
          canResend={isActive}
          onResend={(recipientId) => void handleResend(recipientId)}
          onDelete={handleDeleteDraft}
        />

        {envelopeFinalFileId(envelope) || envelope.status === 'completed' ? (
          <TouchableOpacity style={styles.linkBtn} onPress={() => void openSignedPdf()}>
            <Text style={{ color: colors.primary }}>Download signed PDF</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => void openAuditTrailPdf()}
          disabled={openingPdfKind != null}
        >
          <Text style={{ color: colors.primary }}>
            {openingPdfKind === 'audit' ? 'Opening audit trail…' : 'Audit trail PDF'}
          </Text>
        </TouchableOpacity>
        {envelope.status === 'completed' ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => void openCertificatePdf()}
            disabled={openingPdfKind != null}
          >
            <Text style={{ color: colors.primary }}>
              {openingPdfKind === 'certificate' ? 'Opening certificate…' : 'Certificate'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {envelope.status !== 'draft' ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => {
              void (async () => {
                try {
                  await duplicateEnvelope(eid);
                  invalidateEnvelopeListCache('drafts');
                  Alert.alert('Duplicated', 'A new draft was created.');
                  router.push('/signatures?tab=drafts' as any);
                } catch (e: unknown) {
                  Alert.alert(
                    'Could not duplicate',
                    e instanceof Error ? e.message : 'Try again in a moment.',
                  );
                }
              })();
            }}
          >
            <Text style={{ color: colors.primary }}>Duplicate as draft</Text>
          </TouchableOpacity>
        ) : null}

        {isActive ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() =>
              Alert.alert('Void envelope?', 'Recipients will be notified.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Void',
                  style: 'destructive',
                  onPress: async () => {
                    await voidEnvelope(eid);
                    void load();
                  },
                },
              ])
            }
          >
            <Text style={{ color: '#dc2626' }}>Void envelope</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {viewerFile ? (
        <DocumentViewer
          fileId={viewerFile.id}
          fileName={viewerFile.name}
          fileType="application/pdf"
          onClose={() => setViewerFile(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  headerBody: { flex: 1, gap: 6, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '600' },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  content: { paddingHorizontal: 14, paddingBottom: 40 },
  message: { marginBottom: 12, lineHeight: 20 },
  btn: { padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  btnText: { color: '#fff', fontWeight: '600' },
  linkBtn: { paddingVertical: 12 },
});
