import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
  EnvelopeApiError,
  sessionRequestOtp,
  sessionVerifyOtp,
  tokenRequestOtp,
  tokenVerifyOtp,
} from '../../services/envelopeApi';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;
const CONTENT_LOAD_DELAY_MS = 1500;

interface Props {
  envelopeId: string;
  token?: string;
  phoneMasked?: string | null;
  onVerified: () => void | Promise<void>;
}

export default function SignerPhoneVerificationGate({
  envelopeId,
  token,
  phoneMasked,
  onVerified,
}: Props) {
  const colors = useThemeColors();
  const [code, setCode] = useState('');
  const [maskedPhone, setMaskedPhone] = useState(phoneMasked ?? '');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const requestedRef = useRef(false);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  const requestOtp = useCallback(async () => {
    setSending(true);
    setError('');
    try {
      const res = token
        ? await tokenRequestOtp(token)
        : await sessionRequestOtp(envelopeId);
      if (res.phone_masked) setMaskedPhone(res.phone_masked);
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (e: unknown) {
      const msg =
        e instanceof EnvelopeApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Failed to send code';
      setError(msg);
    } finally {
      setSending(false);
    }
  }, [envelopeId, token]);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    void requestOtp();
  }, [requestOtp]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (!contentLoading) return;
    const timer = setTimeout(() => {
      void onVerifiedRef.current();
    }, CONTENT_LOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [contentLoading]);

  const verify = async (otpCode: string) => {
    if (otpCode.length !== OTP_LENGTH || verifying) return;
    setVerifying(true);
    setError('');
    try {
      const res = token
        ? await tokenVerifyOtp(token, otpCode)
        : await sessionVerifyOtp(envelopeId, otpCode);
      if (res.phone_verified) {
        setContentLoading(true);
      } else {
        setError('Verification failed. Please try again.');
        setCode('');
      }
    } catch (e: unknown) {
      const msg =
        e instanceof EnvelopeApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Invalid code';
      setError(msg);
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const handleCodeChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    setError('');
    if (digits.length === OTP_LENGTH) {
      void verify(digits);
    }
  };

  if (contentLoading) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <View style={[styles.card, styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={28} color="#16a34a" />
          </View>
          <Text style={[styles.title, styles.successTitle, { color: colors.text }]}>Phone verified</Text>
          <Text style={[styles.subtitle, styles.successSubtitle, { color: colors.textSecondary }]}>
            Now loading your content…
          </Text>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Verify your phone</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Enter the 6-digit code sent to {maskedPhone || 'your phone'} to continue signing.
        </Text>

        <TouchableOpacity
          activeOpacity={1}
          onPress={() => inputRef.current?.focus()}
          style={[styles.otpRow, { borderColor: colors.border }]}
        >
          {Array.from({ length: OTP_LENGTH }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.otpCell,
                { borderColor: code.length === i ? colors.primary : colors.border },
              ]}
            >
              <Text style={[styles.otpDigit, { color: colors.text }]}>{code[i] ?? ''}</Text>
            </View>
          ))}
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={handleCodeChange}
          keyboardType="number-pad"
          maxLength={OTP_LENGTH}
          autoFocus
          style={styles.hiddenInput}
          caretHidden
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {verifying ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
        ) : null}

        <TouchableOpacity
          style={[styles.resendBtn, { opacity: sending || cooldown > 0 ? 0.5 : 1 }]}
          disabled={sending || cooldown > 0}
          onPress={() => void requestOtp()}
        >
          <Text style={{ color: colors.primary, fontWeight: '600' }}>
            {sending
              ? 'Sending…'
              : cooldown > 0
                ? `Resend code (${cooldown}s)`
                : 'Resend code'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
  },
  successCard: { alignItems: 'center' },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  successTitle: { textAlign: 'center', marginBottom: 4 },
  successSubtitle: { textAlign: 'center', marginBottom: 20 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  otpCell: {
    flex: 1,
    aspectRatio: 0.85,
    maxWidth: 48,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: { fontSize: 22, fontWeight: '600' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 0, width: 0 },
  errorText: { color: '#b91c1c', fontSize: 13, marginTop: 8 },
  resendBtn: { marginTop: 20, alignItems: 'center', paddingVertical: 8 },
});
