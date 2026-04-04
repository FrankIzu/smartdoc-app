import { BlurView } from 'expo-blur';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useState } from 'react';
import {
    InteractionManager,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppLock } from '../../contexts/AppLockContext';
import { useThemeColors } from '../../hooks/useThemeColors';
// const { signOut } = useAuth(); // used only for Forgot PIN - commented out

export default function AppLockScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const {
    unlockWithBiometric,
    lockAfterMinutes,
    // unlockWithPin, resetAppLockAndUnlock, hasPinSet - GrabDocs PIN hidden; unlock via biometric + device passcode only
    biometricAvailable,
  } = useAppLock();

  // const [showPinInput, setShowPinInput] = useState(false);
  // const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  /** After an automatic prompt fails or is dismissed, show the manual unlock button. */
  const [showManualUnlockButton, setShowManualUnlockButton] = useState(false);
  // Button label is generic so it stays correct when system shows passcode instead (e.g. Expo Go)
  const [unlockButtonLabel, setUnlockButtonLabel] = useState('Unlock');

  useEffect(() => {
    (async () => {
      if (!biometricAvailable) return;
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setUnlockButtonLabel('Unlock with Face ID or passcode');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setUnlockButtonLabel('Unlock with Touch ID or passcode');
      } else {
        setUnlockButtonLabel('Unlock');
      }
    })();
  }, [biometricAvailable]);

  // Trigger biometric as soon as the lock screen is shown; button appears only if that attempt fails.
  useEffect(() => {
    if (!biometricAvailable) {
      setShowManualUnlockButton(false);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      timeoutId = setTimeout(async () => {
        if (cancelled) return;
        setError('');
        const result = await unlockWithBiometric();
        if (cancelled) return;
        if (result.success) return;
        setShowManualUnlockButton(true);
        const userCancelled =
          result.error === 'user_cancel' ||
          result.error === 'system_cancel' ||
          result.error === 'app_cancel';
        if (!userCancelled) {
          setError('Try again or use your device passcode.');
        }
      }, Platform.OS === 'android' ? 280 : 120);
    });

    return () => {
      cancelled = true;
      interactionHandle.cancel();
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [biometricAvailable, unlockWithBiometric]);

  const handleBiometric = useCallback(async () => {
    setError('');
    const result = await unlockWithBiometric();
    if (result.success) return;
    // Don't show an error when user simply cancelled—only for real failures
    const cancelled = result.error === 'user_cancel' || result.error === 'system_cancel' || result.error === 'app_cancel';
    if (cancelled) {
      setError('');
    } else {
      setError('Try again or use your device passcode.');
    }
  }, [unlockWithBiometric]);

  /* GrabDocs PIN unlock - commented out; use biometric + device passcode only
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
  */

  const dynamicStyles = {
    overlay: {
      backgroundColor: colors.background + 'F0',
    },
    title: { color: colors.text },
    subtitle: { color: colors.text },
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
            {biometricAvailable
              ? showManualUnlockButton
                ? 'Use the button below if the prompt did not appear, or to try again.'
                : `App locked after ${lockAfterMinutes} minutes in background. Confirm your identity when prompted.`
              : `App locked after ${lockAfterMinutes} minutes in background.`}
          </Text>

          {error ? <Text style={[styles.error, dynamicStyles.error]}>{error}</Text> : null}

          <View style={styles.actions}>
            {biometricAvailable && showManualUnlockButton && (
              <TouchableOpacity
                style={[styles.primaryButton, dynamicStyles.button]}
                onPress={handleBiometric}
                activeOpacity={0.8}
              >
                <Text style={[styles.primaryButtonText, dynamicStyles.buttonText]}>
                  {unlockButtonLabel}
                </Text>
              </TouchableOpacity>
            )}
            {!biometricAvailable && (
              <Text style={[styles.subtitle, dynamicStyles.subtitle]}>
                Enable Face ID or Touch ID in your device Settings to unlock.
              </Text>
            )}
          </View>

          {/* GrabDocs PIN UI commented out - unlock via biometric + device passcode only
          {!showPinInput ? ( ... ) : (
            <View style={styles.pinSection}> ... Use PIN, Enter PIN, Forgot PIN? ... </View>
          )}
          */}
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
