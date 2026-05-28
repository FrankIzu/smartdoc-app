import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import UnifiedSignerShell from '../../../components/signatures/UnifiedSignerShell';
import { capturePageRef } from '../../../components/signatures/PdfFieldRenderer';
import { useSignerEngine } from '../../../hooks/useSignerEngine';
import { useSignerUIState } from '../../../hooks/useSignerUIState';
import { useSignerLifecycle } from '../../../hooks/useSignerLifecycle';
import { invalidateEnvelopeListCache } from '../../../hooks/useEnvelopeList';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { NormalizedSignerSession } from '../../../types/signature';

export default function SessionSignScreen() {
  const { envelopeId } = useLocalSearchParams<{ envelopeId: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const ui = useSignerUIState();
  const pageCaptureRef = useRef<View>(null);
  const sessionRef = useRef<NormalizedSignerSession | null>(null);
  const sessionKey = `env_${envelopeId}`;

  const compositePage = useCallback(
    async (docKey: string, pageIndex: number) => {
      const sess = sessionRef.current;
      if (!sess) return null;
      const docIndex = sess.documents.findIndex((d) => d.documentKey === docKey);
      if (docIndex < 0) return null;
      ui.setActiveDocIndex(docIndex);
      ui.setActivePage(pageIndex);
      await new Promise((r) => setTimeout(r, 350));
      return capturePageRef(pageCaptureRef);
    },
    [ui],
  );

  const engine = useSignerEngine({
    envelopeId: envelopeId!,
    sessionKey,
    onCompleted: () => {
      invalidateEnvelopeListCache('inbox');
      router.replace(`/signatures/${envelopeId}` as any);
    },
    onDeclined: () => router.back(),
    compositePage,
  });

  useEffect(() => {
    sessionRef.current = engine.session;
  }, [engine.session]);

  useSignerLifecycle({
    onForeground: () => {
      void engine.retryAutosave();
    },
    onBackground: () => {
      void engine.flushAutosave();
    },
  });

  if (!engine.session || engine.state === 'initializing' || engine.state === 'hydrating') {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <UnifiedSignerShell
        session={engine.session}
        fieldValues={engine.fieldValues}
        state={engine.state}
        error={engine.error}
        pendingSubmission={engine.pendingSubmission}
        ui={ui}
        envelopeId={envelopeId!}
        pageCaptureRef={pageCaptureRef}
        onFieldValue={engine.setFieldValue}
        onSubmit={() => void engine.submit()}
        onDecline={() => void engine.decline()}
        onReloadConflict={() => void engine.reloadAfterConflict()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
