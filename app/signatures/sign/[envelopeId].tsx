import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import UnifiedSignerShell from '../../../components/signatures/UnifiedSignerShell';
import SignerPhoneVerificationGate from '../../../components/signatures/SignerPhoneVerificationGate';
import { capturePageRef } from '../../../components/signatures/PdfFieldRenderer';
import { useSignerEngine } from '../../../hooks/useSignerEngine';
import { useSignerUIState } from '../../../hooks/useSignerUIState';
import { useSignerLifecycle } from '../../../hooks/useSignerLifecycle';
import { invalidateEnvelopeListCache } from '../../../hooks/useEnvelopeList';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { NormalizedSignerSession } from '../../../types/signature';

function paramToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return String(value ?? '').trim();
}

export default function SessionSignScreen() {
  const params = useLocalSearchParams<{ envelopeId: string }>();
  const envelopeId = useMemo(() => paramToString(params.envelopeId), [params.envelopeId]);
  const router = useRouter();
  const colors = useThemeColors();
  const ui = useSignerUIState();
  const pageCaptureRef = useRef<View>(null);
  const sessionRef = useRef<NormalizedSignerSession | null>(null);
  const hydrateRef = useRef<() => Promise<void>>(async () => {});
  const sessionKey = envelopeId ? `env_${envelopeId}` : 'env_pending';

  const setActiveDocIndex = ui.setActiveDocIndex;
  const setActivePage = ui.setActivePage;

  const compositePage = useCallback(
    async (docKey: string, pageIndex: number) => {
      const sess = sessionRef.current;
      if (!sess) return null;
      const docIndex = sess.documents.findIndex((d) => d.documentKey === docKey);
      if (docIndex < 0) return null;
      setActiveDocIndex(docIndex);
      setActivePage(pageIndex);
      await new Promise((r) => setTimeout(r, 350));
      return capturePageRef(pageCaptureRef);
    },
    [setActiveDocIndex, setActivePage],
  );

  const engine = useSignerEngine({
    envelopeId: envelopeId || undefined,
    sessionKey,
    onCompleted: () => {
      invalidateEnvelopeListCache('inbox');
      router.replace(`/signatures/${envelopeId}` as any);
    },
    onDeclined: () => router.back(),
    compositePage,
  });

  hydrateRef.current = engine.hydrate;

  const handlePhoneVerified = useCallback(() => {
    void hydrateRef.current();
  }, []);

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

  // Only block on first load — once we have a session (including phone-gated), keep UI mounted.
  if (!engine.session) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
          {engine.error || 'Loading…'}
        </Text>
      </SafeAreaView>
    );
  }

  const needsPhoneGate =
    engine.session.phoneVerificationRequired && !engine.session.phoneVerified;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {needsPhoneGate ? (
        <SignerPhoneVerificationGate
          envelopeId={envelopeId}
          phoneMasked={engine.session.phoneMasked}
          onVerified={handlePhoneVerified}
        />
      ) : (
        <UnifiedSignerShell
          session={engine.session}
          fieldValues={engine.fieldValues}
          state={engine.state}
          error={engine.error}
          pendingSubmission={engine.pendingSubmission}
          ui={ui}
          envelopeId={envelopeId}
          pageCaptureRef={pageCaptureRef}
          onFieldValue={engine.setFieldValue}
          onSubmit={() => void engine.submit()}
          onDecline={() => void engine.decline()}
          onReloadConflict={() => void engine.reloadAfterConflict()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
