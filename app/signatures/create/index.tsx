import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UploadOptionsModal } from '../../components/UploadOptionsModal';
import DocumentSourcePicker, {
  pickDocumentsLikeFilesScreen,
  pickGalleryImagesLikeFilesScreen,
} from '../../../components/signatures/DocumentSourcePicker';
import { useEnvelopeDraft } from '../../../hooks/useEnvelopeDraft';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useAuth } from '../../context/auth';
import { createEnvelope, getEnvelope, replaceDocuments, updateEnvelopeDraft } from '../../../services/envelopeApi';
import { uploadPdfForSignature } from '../../../services/uploadWithGlobalProgress';
import type { SourceInput, WizardSourceDraft } from '../../../types/signature';
import { saveDraftStep } from '../../../services/signatureSessionCache';
import { useFileStore } from '../../../stores/fileStore';
import { envelopeDocsToWizardSources, wizardSourcesToReplaceDocuments } from '../../../utils/signatureRuntime';

function newLocalId() {
  return `src_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function CreateEnvelopeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ envelopeId?: string }>();
  const { saveWizardSources, loadWizardSources } = useEnvelopeDraft();
  const { user } = useAuth();
  const [sources, setSources] = useState<WizardSourceDraft[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void (async () => {
      if (params.envelopeId) {
        const res = await getEnvelope(params.envelopeId);
        setTitle(res.envelope.title ?? '');
        setMessage(res.envelope.message ?? '');
        const docs = res.envelope.documents ?? [];
        if (docs.length) {
          const hydrated = envelopeDocsToWizardSources(docs);
          setSources(hydrated);
          void saveWizardSources(hydrated);
        }
      } else {
        const cached = await loadWizardSources();
        if (cached.length) setSources(cached);
      }
    })();
  }, [params.envelopeId, loadWizardSources, saveWizardSources]);

  const persistSources = (next: WizardSourceDraft[]) => {
    setSources(next);
    void saveWizardSources(next);
  };

  const addSignatureUploads = useCallback(
    async (assets: Array<{ uri: string; name?: string | null; mimeType?: string | null }>) => {
      const added: WizardSourceDraft[] = [];

      for (const asset of assets) {
        const { templateId, displayName } = await uploadPdfForSignature({
          uri: asset.uri,
          name: asset.name ?? 'Document',
          mimeType: asset.mimeType ?? null,
        });
        added.push({
          localId: newLocalId(),
          source_type: 'fillable',
          fillable_template_id: templateId,
          display_name: displayName,
          needsPrepare: true,
        });
      }

      if (!added.length) return;

      setSources((prev) => {
        const nextSources = [...prev, ...added];
        void saveWizardSources(nextSources);
        return nextSources;
      });
      const firstTemplateId = added[0].fillable_template_id;
      if (firstTemplateId) {
        router.push(`/signatures/create/prepare/${firstTemplateId}` as any);
      }
    },
    [router, saveWizardSources],
  );

  const dismissUploadModal = useCallback(() => {
    setShowUploadOptions(false);
  }, []);

  const handleUploadFromFilesViaModal = useCallback(async () => {
    if (uploading) return;

    setShowUploadOptions(false);
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      setUploading(true);
      await useFileStore.getState().forceResetDocumentPicker();
      const assets = await pickDocumentsLikeFilesScreen();
      if (!assets?.length) return;
      await addSignatureUploads(assets);
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setUploading(false);
    }
  }, [addSignatureUploads, uploading]);

  const handleUploadFromCameraViaModal = useCallback(() => {
    setShowUploadOptions(false);
    router.push('/scanner');
  }, [router]);

  const handleUploadFromGalleryViaModal = useCallback(async () => {
    if (uploading) return;

    setShowUploadOptions(false);
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      setUploading(true);
      const assets = await pickGalleryImagesLikeFilesScreen();
      if (!assets?.length) return;
      await addSignatureUploads(assets);
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setUploading(false);
    }
  }, [addSignatureUploads, uploading]);

  const handleUploadByLinkViaModal = useCallback(() => {
    setShowUploadOptions(false);
    router.push('/upload-by-link-code');
  }, [router]);

  const handleNext = async () => {
    if (!sources.length) {
      Alert.alert('Add documents', 'Add at least one document.');
      return;
    }
    setSaving(true);
    try {
      const apiSources: SourceInput[] = sources.map((s) => {
        if (s.source_type === 'fillable') {
          return { source_type: 'fillable', fillable_template_id: s.fillable_template_id! };
        }
        if (s.source_type === 'form') {
          return { source_type: 'form', user_form_id: s.user_form_id! };
        }
        return { source_type: 'attachment', file_id: s.file_id! };
      });
      let envelopeId = params.envelopeId;
      if (!envelopeId) {
        const res = await createEnvelope({
          sources: apiSources,
          ...(title.trim() ? { title: title.trim() } : {}),
          message: message || undefined,
        });
        envelopeId = res.envelope.public_id || String(res.envelope.id);
      } else {
        const existing = await getEnvelope(envelopeId);
        await updateEnvelopeDraft(envelopeId, {
          ...(title.trim() ? { title: title.trim() } : {}),
          message: message || undefined,
        });
        await replaceDocuments(
          envelopeId,
          wizardSourcesToReplaceDocuments(sources, existing.envelope.documents),
        );
      }
      await saveDraftStep(user?.id, envelopeId, 'recipients');
      router.push(`/signatures/create/recipients?envelopeId=${envelopeId}` as any);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create');
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Prepare for Signature</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.label, { color: colors.text }]}>Title</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          value={title}
          onChangeText={setTitle}
          placeholder="Envelope title"
          placeholderTextColor={colors.textSecondary}
        />
        <Text style={[styles.label, { color: colors.text }]}>Message (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border }]}
          value={message}
          onChangeText={setMessage}
          placeholder="Message to signers"
          placeholderTextColor={colors.textSecondary}
          multiline
        />
        <DocumentSourcePicker
          sources={sources}
          onSourcesChange={persistSources}
          onOpenUpload={() => setShowUploadOptions(true)}
          onPrepare={(templateId) => router.push(`/signatures/create/prepare/${templateId}` as any)}
        />
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          disabled={saving}
          onPress={() => void handleNext()}
        >
          <Text style={styles.nextText}>{saving ? 'Saving…' : 'Next: Recipients'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <UploadOptionsModal
        visible={showUploadOptions}
        isUploading={uploading}
        onDismiss={dismissUploadModal}
        onFiles={handleUploadFromFilesViaModal}
        onCamera={handleUploadFromCameraViaModal}
        onGallery={handleUploadFromGalleryViaModal}
        onLink={handleUploadByLinkViaModal}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  content: { padding: 14, paddingBottom: 40 },
  label: { fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  nextBtn: { marginTop: 24, padding: 14, borderRadius: 8, alignItems: 'center' },
  nextText: { color: '#fff', fontWeight: '700' },
});
