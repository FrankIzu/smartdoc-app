import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import UnifiedSignerShell from '../../../../components/signatures/UnifiedSignerShell';
import SignerPhoneVerificationGate from '../../../../components/signatures/SignerPhoneVerificationGate';
import { useSignerEngine } from '../../../../hooks/useSignerEngine';
import { useSignerFillableCapture } from '../../../../hooks/useSignerFillableCapture';
import { useSignerUIState } from '../../../../hooks/useSignerUIState';
import { useSignerLifecycle } from '../../../../hooks/useSignerLifecycle';
import { invalidateEnvelopeListCache } from '../../../../hooks/useEnvelopeList';
import { useThemeColors } from '../../../../hooks/useThemeColors';

function paramToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return String(value ?? '').trim();
}

export default function TokenSignScreen() {
  const params = useLocalSearchParams<{ token: string }>();
  const token = useMemo(() => paramToString(params.token), [params.token]);
  const router = useRouter();
  const colors = useThemeColors();
  const ui = useSignerUIState();
  const pageCaptureRef = useRef<View>(null);
  const hydrateRef = useRef<() => Promise<void>>(async () => {});
  const compositeDocumentRef = useRef<(docKey: string) => Promise<string[] | null>>(async () => null);
  const sessionKey = token ? `tok_${token.slice(0, 12)}` : 'tok_pending';

  const engine = useSignerEngine({
    token: token || undefined,
    sessionKey,
    onCompleted: () => {
      invalidateEnvelopeListCache('inbox');
      router.replace('/signatures' as any);
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

  const handlePhoneVerified = useCallback(() => {
    void hydrateRef.current();
  }, []);

  useSignerLifecycle({
    isTokenMode: true,
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
        {engine.error ? (
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>{engine.error}</Text>
        ) : null}
      </SafeAreaView>
    );
  }

  const needsPhoneGate =
    engine.session.phoneVerificationRequired && !engine.session.phoneVerified;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {needsPhoneGate ? (
        <SignerPhoneVerificationGate
          envelopeId={engine.session.envelopeId}
          token={token}
          phoneMasked={engine.session.phoneMasked}
          onVerified={handlePhoneVerified}
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
            envelopeId={engine.session.envelopeId}
            token={token}
            pageCaptureRef={pageCaptureRef}
            onFieldValue={engine.setFieldValue}
            onSubmit={() => void engine.submit()}
            onDecline={() => void engine.decline()}
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
