import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import UnifiedSignerShell from '../../../../components/signatures/UnifiedSignerShell';
import SignerPhoneVerificationGate from '../../../../components/signatures/SignerPhoneVerificationGate';
import { capturePageRef } from '../../../../components/signatures/PdfFieldRenderer';
import { useSignerEngine } from '../../../../hooks/useSignerEngine';
import { useSignerUIState } from '../../../../hooks/useSignerUIState';
import { useSignerLifecycle } from '../../../../hooks/useSignerLifecycle';
import { invalidateEnvelopeListCache } from '../../../../hooks/useEnvelopeList';
import { useThemeColors } from '../../../../hooks/useThemeColors';
import type { NormalizedSignerSession } from '../../../../types/signature';

export default function TokenSignScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const ui = useSignerUIState();
  const pageCaptureRef = useRef<View>(null);
  const sessionRef = useRef<NormalizedSignerSession | null>(null);
  const sessionKey = `tok_${token?.slice(0, 12)}`;

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
    token: token!,
    sessionKey,
    onCompleted: () => {
      invalidateEnvelopeListCache('inbox');
      router.replace('/signatures' as any);
    },
    onDeclined: () => router.back(),
    compositePage,
  });

  const handlePhoneVerified = useCallback(() => {
    void engine.hydrate();
  }, [engine.hydrate]);

  useEffect(() => {
    sessionRef.current = engine.session;
  }, [engine.session]);

  useSignerLifecycle({
    isTokenMode: true,
    onForeground: () => {
      void engine.retryAutosave();
    },
    onBackground: () => {
      void engine.flushAutosave();
    },
  });

  const showInitialLoading =
    engine.state === 'initializing' ||
    (engine.state === 'hydrating' && !engine.session);

  if (showInitialLoading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
