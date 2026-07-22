import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import UnifiedSignerShell from '../../../components/signatures/UnifiedSignerShell';
import SignerPhoneVerificationGate from '../../../components/signatures/SignerPhoneVerificationGate';
import { useSignerEngine } from '../../../hooks/useSignerEngine';
import { useSignerFillableCapture } from '../../../hooks/useSignerFillableCapture';
import { useSignerUIState } from '../../../hooks/useSignerUIState';
import { useSignerLifecycle } from '../../../hooks/useSignerLifecycle';
import { invalidateEnvelopeListCache } from '../../../hooks/useEnvelopeList';
import { useThemeColors } from '../../../hooks/useThemeColors';

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
  const hydrateRef = useRef<() => Promise<void>>(async () => {});
  const compositeDocumentRef = useRef<(docKey: string) => Promise<string[] | null>>(async () => null);
  const sessionKey = envelopeId ? `env_${envelopeId}` : 'env_pending';

  const engine = useSignerEngine({
    envelopeId: envelopeId || undefined,
    sessionKey,
    onCompleted: () => {
      invalidateEnvelopeListCache('inbox');
      router.replace(`/signatures/${envelopeId}` as any);
    },
    onDeclined: () => router.back(),
    compositeDocument: (docKey) => compositeDocumentRef.current(docKey),
  });

  const { compositeDocument, captureHost } = useSignerFillableCapture({
    session: engine.session,
    fieldValues: engine.fieldValues,
  });
  compositeDocumentRef.current = compositeDocument;

  hydrateRef.current = engine.hydrate;

  const handleBack = useCallback(() => {
    void engine.flushAutosave().finally(() => router.back());
  }, [engine.flushAutosave, router]);

  const handlePhoneVerified = useCallback(() => {
    void hydrateRef.current();
  }, []);

  useSignerLifecycle({
    onForeground: () => {
      void engine.retryAutosave();
    },
    onBackground: () => {
      void engine.flushAutosave();
    },
  });

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
          onBack={() => router.back()}
        />
      ) : (
        <>
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
            onBack={handleBack}
            onReloadConflict={() => void engine.reloadAfterConflict()}
          />
          {captureHost}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
