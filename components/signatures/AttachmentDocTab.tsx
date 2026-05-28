import React, { useEffect } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { RuntimeDocument } from '../../types/signature';
import { sessionAttachmentViewed, tokenAttachmentViewed } from '../../services/envelopeApi';

interface Props {
  document: RuntimeDocument;
  envelopeId: string;
  isTokenMode?: boolean;
  token?: string;
  onViewed?: (documentKey: string) => void;
}

export default function AttachmentDocTab({ document, envelopeId, isTokenMode, token, onViewed }: Props) {
  const colors = useThemeColors();

  useEffect(() => {
    void (async () => {
      try {
        if (isTokenMode && token) {
          await tokenAttachmentViewed(token, document.documentKey);
        } else {
          await sessionAttachmentViewed(envelopeId, document.documentKey);
        }
        onViewed?.(document.documentKey);
      } catch {
        // non-blocking audit ping
      }
    })();
  }, [document.documentKey, envelopeId, isTokenMode, onViewed, token]);

  return (
    <ScrollView style={styles.scroll}>
      <Text style={[styles.title, { color: colors.text }]}>{document.title}</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>Reference document (view only)</Text>
      {document.pages.map((p) => (
        <Image key={p.index} source={{ uri: p.imageUrl }} style={styles.page} resizeMode="contain" />
      ))}
      {document.pages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.textSecondary }}>No preview available</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, padding: 14 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  hint: { fontSize: 13, marginBottom: 16 },
  page: { width: '100%', height: 480, marginBottom: 12, backgroundColor: '#f5f5f5' },
  empty: { padding: 40, alignItems: 'center' },
});
