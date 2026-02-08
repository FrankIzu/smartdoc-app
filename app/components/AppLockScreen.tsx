import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppLock } from '../../contexts/AppLockContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuth } from '../context/auth';

export default function AppLockScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const {
    unlockWithBiometric,
    unlockWithPin,
    resetAppLockAndUnlock,
    biometricAvailable,
    hasPinSet,
  } = useAppLock();

  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [biometricLabel, setBiometricLabel] = useState('Face ID / Touch ID');

  useEffect(() => {
    (async () => {
      if (!biometricAvailable) return;
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricLabel('Face ID');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricLabel('Touch ID');
      }
    })();
  }, [biometricAvailable]);

  const handleBiometric = useCallback(async () => {
    setError('');
    const result = await unlockWithBiometric();
    if (result.success) return;
    // Don't show an error when user simply cancelled—only for real failures
    const cancelled = result.error === 'user_cancel' || result.error === 'system_cancel' || result.error === 'app_cancel';
    if (cancelled) {
      setError(''); // Try again or use PIN (no scary message)
    } else {
      setError('Face ID didn\'t recognize you. Try again or use PIN.');
    }
  }, [unlockWithBiometric]);


  const handlePinSubmit = useCallback(async () => {
    const trimmed = pin.replace(/\D/g, '');
    if (trimmed.length < 4) {
      setError('Enter 4–6 digit PIN');
      return;
    }
    setError('');
    const success = await unlockWithPin(trimmed);
    if (success) {
      setPin('');
      Keyboard.dismiss();
    } else {
      setError('Incorrect PIN');
      setPin('');
    }
  }, [pin, unlockWithPin]);

  const dynamicStyles = {
    overlay: {
      backgroundColor: colors.background + 'F0',
    },
    title: { color: colors.text },
    subtitle: { color: colors.textSecondary },
    error: { color: colors.error || '#ef4444' },
    pinInput: {
      backgroundColor: colors.inputBackground || colors.surface,
      borderColor: colors.border,
      color: colors.text,
    },
    button: {
      backgroundColor: colors.tint,
    },
    buttonSecondary: {
      borderColor: colors.border,
      borderWidth: 1,
    },
    buttonText: { color: '#fff' },
    buttonTextSecondary: { color: colors.text },
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.container]} pointerEvents="box-none">
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
      >
        <View style={[styles.overlay, dynamicStyles.overlay, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
          <Text style={[styles.title, dynamicStyles.title]}>Unlock GrabDocs</Text>
          <Text style={[styles.subtitle, dynamicStyles.subtitle]}>
            App locked after 5 minutes in background
          </Text>

          {error ? <Text style={[styles.error, dynamicStyles.error]}>{error}</Text> : null}

          {!showPinInput ? (
            <View style={styles.actions}>
              {biometricAvailable && (
                <TouchableOpacity
                  style={[styles.primaryButton, dynamicStyles.button]}
                  onPress={handleBiometric}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.primaryButtonText, dynamicStyles.buttonText]}>
                    {biometricLabel}
                  </Text>
                </TouchableOpacity>
              )}
              {hasPinSet && (
                <TouchableOpacity
                  style={[styles.secondaryButton, dynamicStyles.buttonSecondary]}
                  onPress={() => setShowPinInput(true)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryButtonText, dynamicStyles.buttonTextSecondary]}>
                    Use PIN
                  </Text>
                </TouchableOpacity>
              )}
              {!biometricAvailable && !hasPinSet && (
                <Text style={[styles.subtitle, dynamicStyles.subtitle]}>
                  Set a PIN in Settings → Security to unlock.
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.pinSection}>
              <Text style={[styles.subtitle, dynamicStyles.subtitle]}>Enter your PIN</Text>
              <TextInput
                style={[styles.pinInput, dynamicStyles.pinInput]}
                value={pin}
                onChangeText={(t) => {
                  setError('');
                  setPin(t.replace(/\D/g, '').slice(0, 6));
                }}
                placeholder="••••••"
                placeholderTextColor={colors.textLight}
                keyboardType="number-pad"
                maxLength={6}
                secureTextEntry
                autoFocus
              />
              <TouchableOpacity
                style={[styles.primaryButton, dynamicStyles.button]}
                onPress={handlePinSubmit}
                activeOpacity={0.8}
              >
                <Text style={[styles.primaryButtonText, dynamicStyles.buttonText]}>Unlock</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, dynamicStyles.buttonSecondary]}
                onPress={() => { setShowPinInput(false); setPin(''); setError(''); Keyboard.dismiss(); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryButtonText, dynamicStyles.buttonTextSecondary]}>
                  Back
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.forgotPinLink}
                onPress={() => {
                  Alert.alert(
                    'Forgot PIN?',
                    'You will be signed out for security. Sign in again to access your account, then set a new PIN in Settings → App lock if you want to re-enable app lock.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Sign out',
                        style: 'destructive',
                        onPress: async () => {
                          await resetAppLockAndUnlock();
                          setShowPinInput(false);
                          setPin('');
                          setError('');
                          await signOut();
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={[styles.forgotPinText, { color: colors.textSecondary }]}>
                  Forgot PIN?
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 9999,
  },
  keyboardAvoid: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  error: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  actions: {
    gap: 12,
    alignItems: 'center',
  },
  primaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '500',
  },
  pinSection: {
    gap: 12,
    alignItems: 'center',
  },
  pinInput: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
  },
  forgotPinLink: {
    marginTop: 16,
    paddingVertical: 8,
  },
  forgotPinText: {
    fontSize: 15,
  },
});
