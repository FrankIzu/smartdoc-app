import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentViewer from '../../../components/DocumentViewer';
import { useThemeColors } from '../../../hooks/useThemeColors';
import {
  hubFillEditorRoute,
  hubTemplateSubmissionsRoute,
} from '../../../utils/signatureRouteResolver';

export default function FillCompleteScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{
    templateId?: string;
    filledFileId?: string;
    submissionId?: string;
    templateName?: string;
  }>();
  const [viewerOpen, setViewerOpen] = useState(false);

  const templateName = params.templateName?.trim() || 'Document';
  const filledFileId = params.filledFileId?.trim();
  const templateId = params.templateId?.trim();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        content: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
          gap: 12,
        },
        iconWrap: {
          width: 72,
          height: 72,
          borderRadius: 36,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${colors.success ?? '#16A34A'}20`,
          marginBottom: 8,
        },
        title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
        subtitle: {
          fontSize: 15,
          lineHeight: 22,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: 12,
        },
        primaryBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: colors.primary,
          paddingVertical: 14,
          paddingHorizontal: 20,
          borderRadius: 10,
          width: '100%',
          maxWidth: 320,
        },
        primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
        secondaryBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderWidth: 1,
          borderColor: colors.border ?? '#E5E7EB',
          paddingVertical: 13,
          paddingHorizontal: 20,
          borderRadius: 10,
          width: '100%',
          maxWidth: 320,
        },
        secondaryBtnText: { color: colors.text, fontWeight: '600', fontSize: 15 },
        linkBtn: { paddingVertical: 10, marginTop: 4 },
        linkText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
      }),
    [colors],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={44} color={colors.success ?? '#16A34A'} />
        </View>
        <Text style={styles.title}>Document completed</Text>
        <Text style={styles.subtitle}>
          {templateName} has been saved as a completed PDF in your Documents.
        </Text>

        {filledFileId ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setViewerOpen(true)}>
            <Ionicons name="document-text-outline" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>View completed PDF</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.replace('/(tabs)/documents' as never)}
        >
          <Ionicons name="folder-open-outline" size={20} color={colors.text} />
          <Text style={styles.secondaryBtnText}>Go to Documents</Text>
        </TouchableOpacity>

        {templateId ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => router.push(hubTemplateSubmissionsRoute(templateId))}
          >
            <Text style={styles.linkText}>View all submissions for this document</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.replace('/signatures?tab=all' as never)}
        >
          <Text style={styles.linkText}>Back to Signatures</Text>
        </TouchableOpacity>

        {templateId ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => router.push(hubFillEditorRoute(templateId))}
          >
            <Text style={styles.linkText}>Fill another copy</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {viewerOpen && filledFileId ? (
        <DocumentViewer
          fileId={filledFileId}
          fileName={templateName}
          fileType="application/pdf"
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}
