import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { API_BASE_URL } from '../../constants/Config';
import { useThemeColors } from '../../hooks/useThemeColors';
import { navigateTabsThenDefaultHome, resolveDefaultHomeWebPath } from '../../utils/defaultHomePath';
import { useAuth } from '../context/auth';

interface OtpVerificationParams {
  username: string;
  method: 'sms' | 'email';
  identifier: string;
  expiresIn: string;
  userEmail?: string;
  userPhone?: string;
  preferredAuthMethod?: 'email' | 'phone';
  tempPassword?: string;
  rememberDevice?: string;
}

function buildUserDataFromMobileLoginUser(
  user: Record<string, unknown> | null | undefined,
  fallbackEmail: string,
  fallbackUsername: string
): { id: string; name: string; email: string } | null {
  if (!user) return null;
  const id =
    user.id != null ? String(user.id) : user.user_id != null ? String(user.user_id) : '';
  if (!id) return null;
  const first = typeof user.first_name === 'string' ? user.first_name : '';
  const last = typeof user.last_name === 'string' ? user.last_name : '';
  const fn = typeof user.firstName === 'string' ? user.firstName : '';
  const ln = typeof user.lastName === 'string' ? user.lastName : '';
  const combined = [first, last].filter(Boolean).join(' ').trim();
  const combinedCamel = [fn, ln].filter(Boolean).join(' ').trim();
  const name =
    (typeof user.name === 'string' && user.name) ||
    combined ||
    combinedCamel ||
    (typeof user.username === 'string' && user.username) ||
    fallbackUsername;
  const email = (typeof user.email === 'string' && user.email) || fallbackEmail || '';
  return { id, name, email };
}

function buildUserDataFromAuthCheckData(
  data: Record<string, unknown> | null | undefined,
  fallbackEmail: string
): { id: string; name: string; email: string } | null {
  if (!data || data.id == null) return null;
  const name =
    (typeof data.name === 'string' && data.name) ||
    (typeof data.username === 'string' && data.username) ||
    '';
  const email = (typeof data.email === 'string' && data.email) || fallbackEmail || '';
  return { id: String(data.id), name, email };
}

const OTP_LENGTH = 6;

export default function OtpVerificationScreen() {
  const router = useRouter();
  const palette = useThemeColors();
  const params = useLocalSearchParams<OtpVerificationParams>();
  const { setUserFromExternal } = useAuth();

  const continueToMainApp = async (loginUser?: unknown) => {
    try {
      const webPath = await resolveDefaultHomeWebPath(loginUser);
      navigateTabsThenDefaultHome(router, webPath);
    } catch (err) {
      console.warn('OTP: navigation error, using replace fallback:', err);
      try {
        router.replace('/(tabs)');
      } catch (e2) {
        console.error('OTP: replace fallback also failed:', e2);
      }
    }
  };

  const [otpValue, setOtpValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(parseInt(params.expiresIn || '600'));
  const [isResending, setIsResending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [trustDevice, setTrustDevice] = useState(
    params.rememberDevice === 'true' || params.rememberDevice === true
  );

  const hiddenInputRef = useRef<TextInput>(null);
  const cursorAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Blinking cursor animation
  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [cursorAnim]);

  // Shake animation for errors
  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // Auto-focus on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setTimeout(() => hiddenInputRef.current?.focus(), 250);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const focusInput = () => {
    hiddenInputRef.current?.focus();
  };

  const handleOtpChange = (text: string) => {
    if (isLoading) return;
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtpValue(digits);
    setError('');
    if (digits.length === OTP_LENGTH) {
      handleVerifyOtp(digits);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVerifyOtp = async (code?: string) => {
    const finalCode = code ?? otpValue;

    if (finalCode.length !== OTP_LENGTH) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    try {
      setError('');
      setIsLoading(true);

      const preferredMethod = params.preferredAuthMethod || (params.method === 'sms' ? 'phone' : 'email');
      const email = params.userEmail || '';
      const phoneNumber = params.userPhone || '';

      let requestBody: Record<string, string>;
      if (preferredMethod === 'phone' && phoneNumber) {
        requestBody = { phoneNumber, otpCode: finalCode };
      } else if (email) {
        requestBody = { email, otpCode: finalCode };
      } else {
        requestBody = { username: params.username, otpCode: finalCode };
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Path A: verify-otp returns JWT + user directly
        if (data.token && data.user) {
          const userData = buildUserDataFromMobileLoginUser(
            data.user as Record<string, unknown>,
            params.userEmail || '',
            params.username || ''
          );
          if (userData?.id) {
            const { secureStorage } = await import('../../utils/storage');
            await secureStorage.setItem('auth_token', data.token);
            await secureStorage.setItem('user', JSON.stringify(userData));
            if (data.deviceToken) {
              await secureStorage.setItem('device_token', data.deviceToken);
            }
            await setUserFromExternal(userData, data.token);
            void continueToMainApp(data.user);
            return;
          }
        }

        // Path B: complete login via POST /login with otpVerified: true
        const completeLoginWithOtpVerified = async (): Promise<boolean> => {
          if (!params.username || !params.tempPassword) return false;

          const loginResponse = await fetch(`${API_BASE_URL}/api/v1/mobile/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              username: params.username,
              password: params.tempPassword,
              otpVerified: true,
              rememberDevice: trustDevice,
            }),
          });

          const loginData = await loginResponse.json();

          if (!loginResponse.ok || !loginData.success) return false;
          if (loginData.requires2FA) return false;
          if (!loginData.token || typeof loginData.token !== 'string') return false;

          let userData = buildUserDataFromMobileLoginUser(
            loginData.user as Record<string, unknown> | undefined,
            params.userEmail || '',
            params.username || ''
          );

          if (!userData?.id) {
            try {
              const authCheckResponse = await fetch(`${API_BASE_URL}/api/v1/mobile/auth-check`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${loginData.token}`,
                },
              });
              if (authCheckResponse.ok) {
                const authData = await authCheckResponse.json();
                const payload = authData.data || authData.user;
                userData = buildUserDataFromAuthCheckData(
                  payload as Record<string, unknown>,
                  params.userEmail || ''
                );
              }
            } catch (authErr) {
              console.error('auth-check fallback after login:', authErr);
            }
          }

          if (!userData?.id) return false;

          const { secureStorage } = await import('../../utils/storage');
          await secureStorage.setItem('auth_token', loginData.token);
          await secureStorage.setItem('user', JSON.stringify(userData));
          if (loginData.deviceToken) {
            await secureStorage.setItem('device_token', loginData.deviceToken);
          }

          // Update React auth state immediately without a network round-trip.
          // refreshSession() (calls checkAuth) is skipped here: a transient network failure
          // cannot nuke the freshly-written JWT when we use setUserFromExternal directly.
          await setUserFromExternal(userData, loginData.token);
          void continueToMainApp(loginData.user);
          return true;
        };

        try {
          const loginOk = await completeLoginWithOtpVerified();
          if (loginOk) return;
        } catch (loginError) {
          console.error('Error completing login after OTP:', loginError);
        }

        setError('Verification successful but could not complete login. Please sign in again.');
        setTimeout(() => router.replace('/(auth)/sign-in'), 2000);
      } else {
        setError(data.message || 'Incorrect code. Please try again.');
        setOtpValue('');
        triggerShake();
        requestAnimationFrame(() => hiddenInputRef.current?.focus());
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('OTP verification error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      setIsResending(true);
      setError('');

      const preferredMethod = params.preferredAuthMethod || (params.method === 'sms' ? 'phone' : 'email');
      const email = params.userEmail || '';
      const phoneNumber = params.userPhone || '';

      let requestBody: Record<string, string>;
      if (preferredMethod === 'phone' && phoneNumber) {
        requestBody = { phoneNumber };
      } else if (email) {
        requestBody = { email };
      } else {
        requestBody = { username: params.username };
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTimeLeft(600);
        setOtpValue('');
        requestAnimationFrame(() => hiddenInputRef.current?.focus());
      } else {
        setError(data.message || 'Failed to resend code');
      }
    } catch (err) {
      setError('Failed to resend code. Please try again.');
      console.error('Resend OTP error:', err);
    } finally {
      setIsResending(false);
    }
  };

  const getMethodIcon = () => (params.method === 'sms' ? 'phone-portrait' : 'mail');
  const getMethodText = () => (params.method === 'sms' ? 'phone number' : 'email address');

  const activeIndex = Math.min(otpValue.length, OTP_LENGTH - 1);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.iconContainer}>
          <View style={styles.iconWrapper}>
            <Ionicons name={getMethodIcon()} size={40} color={Colors.primary} />
          </View>
        </View>

        <Text style={styles.title}>Enter Verification Code</Text>
        <Text style={styles.subtitle}>
          We&apos;ve sent a 6-digit code to your {getMethodText()}
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Hidden real input that captures all keyboard/autofill input */}
        <TextInput
          ref={hiddenInputRef}
          value={otpValue}
          onChangeText={handleOtpChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          keyboardType="number-pad"
          maxLength={OTP_LENGTH}
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android'
            ? (params.method === 'sms' ? 'sms-otp' : 'one-time-code')
            : undefined}
          importantForAutofill="yes"
          editable={!isLoading}
          style={styles.hiddenInput}
          caretHidden
        />

        {/* Visual digit boxes */}
        <Pressable onPress={focusInput}>
          <Animated.View style={[styles.otpContainer, { transform: [{ translateX: shakeAnim }] }]}>
            {Array.from({ length: OTP_LENGTH }).map((_, i) => {
              const digit = otpValue[i];
              const isActive = isFocused && i === activeIndex && !isLoading;
              const isFilled = !!digit;

              return (
                <View
                  key={i}
                  style={[
                    styles.otpBox,
                    isFilled && styles.otpBoxFilled,
                    isActive && styles.otpBoxActive,
                    !!error && styles.otpBoxError,
                  ]}
                >
                  {digit ? (
                    <Text style={styles.otpDigit}>{digit}</Text>
                  ) : isActive ? (
                    <Animated.View style={[styles.cursor, { opacity: cursorAnim }]} />
                  ) : null}
                </View>
              );
            })}
          </Animated.View>
        </Pressable>

        {timeLeft > 0 ? (
          <Text style={styles.timerText}>Code expires in {formatTime(timeLeft)}</Text>
        ) : (
          <Text style={styles.expiredText}>Code has expired. Please request a new one.</Text>
        )}

        {/* Trust This Device */}
        <View style={styles.trustDeviceContainer}>
          <Switch
            value={trustDevice}
            onValueChange={setTrustDevice}
            trackColor={{ false: palette.switchTrackOff, true: palette.switchTrackOn }}
            thumbColor={palette.switchThumbAndroid(trustDevice)}
            ios_backgroundColor={palette.switchTrackOff}
            style={styles.trustDeviceSwitch}
          />
          <Text style={styles.trustDeviceLabel}>Trust this device for 60 days</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.verifyButton,
            (isLoading || otpValue.length < OTP_LENGTH) && styles.buttonDisabled,
          ]}
          onPress={() => handleVerifyOtp()}
          disabled={isLoading || otpValue.length < OTP_LENGTH}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.verifyButtonText}>Verify Code</Text>
          )}
        </TouchableOpacity>

        <View style={styles.resendContainer}>
          <Text style={styles.resendText}>Didn&apos;t receive the code? </Text>
          <TouchableOpacity
            onPress={handleResendOtp}
            disabled={isResending || timeLeft > 540}
          >
            {isResending ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={[styles.resendLink, timeLeft > 540 && styles.resendLinkDisabled]}>
                Resend Code
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.backToLoginButton}
          onPress={() => router.replace('/(auth)')}
        >
          <Text style={styles.backToLoginText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: Colors.text,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
  },
  errorText: {
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 14,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  otpBox: {
    width: 46,
    height: 58,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  otpBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: '#f0f8ff',
  },
  otpBoxActive: {
    borderColor: Colors.primary,
    backgroundColor: '#fff',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  otpBoxError: {
    borderColor: '#ef4444',
    backgroundColor: '#fff5f5',
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
  },
  cursor: {
    width: 2,
    height: 24,
    backgroundColor: Colors.primary,
    borderRadius: 1,
  },
  timerText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    marginBottom: 20,
  },
  expiredText: {
    textAlign: 'center',
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 20,
  },
  trustDeviceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  trustDeviceSwitch: {
    marginRight: 12,
  },
  trustDeviceLabel: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  verifyButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  resendText: {
    color: '#666',
    fontSize: 14,
  },
  resendLink: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  resendLinkDisabled: {
    color: '#ccc',
  },
  backToLoginButton: {
    alignItems: 'center',
    padding: 10,
  },
  backToLoginText: {
    color: '#666',
    fontSize: 14,
  },
});
