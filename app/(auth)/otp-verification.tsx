import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { API_BASE_URL } from '../../constants/Config';
import { useAuth } from '../context/auth';

interface OtpVerificationParams {
  username: string;
  method: 'sms' | 'email';
  identifier: string;
  expiresIn: string;
  userEmail?: string;
  userPhone?: string;
  preferredAuthMethod?: 'email' | 'phone';
  // Store password temporarily for completing login after OTP (in memory only)
  tempPassword?: string;
  rememberDevice?: string; // 'true' or 'false' as string (router params are strings)
}

/** Map /login `user` or auth-check `data` into stored user shape. */
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

export default function OtpVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<OtpVerificationParams>();
  const { refreshSession } = useAuth(); // Get auth context to refresh session after login
  
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(parseInt(params.expiresIn || '600'));
  const [isResending, setIsResending] = useState(false);
  const [trustDevice, setTrustDevice] = useState(
    params.rememberDevice === 'true' || params.rememberDevice === true
  );
  
  const inputRefs = useRef<TextInput[]>([]);
  const autofillInputRef = useRef<TextInput>(null);
  /** Remount hidden autofill field after a full code so it stays uncontrolled (no stale value=""). */
  const [autofillFieldKey, setAutofillFieldKey] = useState(0);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Focus the SMS autofill field after layout. iOS/Android need an in-layout, oneTimeCode field —
  // not off-screen — and it must not use value="" (controlled empty) or autofill can be cleared on re-render.
  useEffect(() => {
    if (params.method !== 'sms') return;
    const id = requestAnimationFrame(() => {
      setTimeout(() => autofillInputRef.current?.focus(), 250);
    });
    return () => cancelAnimationFrame(id);
  }, [params.method]);

  // Monitor clipboard for OTP codes (for email codes)
  // Note: This is a fallback for email codes. SMS codes are handled by autofill input.
  useEffect(() => {
    if (params.method === 'email') {
      let lastClipboardText = '';
      
      const checkClipboard = async () => {
        try {
          const clipboardText = await Clipboard.getStringAsync();
          
          // Only process if clipboard content changed
          if (clipboardText === lastClipboardText) {
            return;
          }
          lastClipboardText = clipboardText;
          
          // Look for 6-digit code patterns (more specific patterns)
          // Match codes that might appear in email notifications
          const codePatterns = [
            /\b(\d{6})\b/, // Simple 6-digit code
            /code[:\s]+(\d{6})/i, // "code: 123456" or "code 123456"
            /verification[:\s]+code[:\s]+(\d{6})/i, // "verification code: 123456"
            /(\d{6})[^\d]/, // 6 digits followed by non-digit
          ];
          
          for (const pattern of codePatterns) {
            const codeMatch = clipboardText.match(pattern);
            if (codeMatch) {
              const code = codeMatch[1];
              // Check if it's a valid OTP (all digits, exactly 6)
              if (/^\d{6}$/.test(code)) {
                // Only use if OTP inputs are empty or partially filled
                const currentCode = otpCode.join('');
                if (currentCode.length < 6) {
                  console.log('📋 Detected OTP code from clipboard:', code);
                  // Distribute code to inputs
                  const codeArray = code.split('').slice(0, 6);
                  setOtpCode(codeArray);
                  // Auto-verify if all digits are filled
                  if (codeArray.length === 6 && codeArray.every(d => d !== '')) {
                    setTimeout(() => {
                      // Call handleVerifyOtp directly - it's stable enough for this use case
                      const finalCode = code;
                      if (finalCode.length === 6) {
                        // Trigger verification by setting state and calling the handler
                        handleVerifyOtp(finalCode);
                      }
                    }, 300);
                  }
                  break; // Found a valid code, stop checking
                }
              }
            }
          }
        } catch (error) {
          // Silently ignore clipboard errors
        }
      };

      // Check clipboard periodically (every 2 seconds) when screen is active
      const clipboardInterval = setInterval(checkClipboard, 2000);
      
      // Also check immediately when component mounts
      checkClipboard();
      
      return () => clearInterval(clipboardInterval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.method]);

  // Handle autofill input change (for SMS autofill)
  const handleAutofillChange = (text: string) => {
    // Extract only digits
    const digits = text.replace(/\D/g, '').slice(0, 6);
    
    if (digits.length === 6) {
      console.log('📱 Detected OTP code from autofill:', digits);
      // Distribute code to individual inputs
      const codeArray = digits.split('');
      setOtpCode(codeArray);
      setAutofillFieldKey((k) => k + 1);
      
      // Focus the last input to show completion
      inputRefs.current[5]?.focus();
      
      // Auto-verify after a brief delay
      setTimeout(() => {
        handleVerifyOtp(digits);
      }, 300);
    } else if (digits.length > 0 && digits.length < 6) {
      // Partial code entered - distribute what we have
      const codeArray = digits.split('');
      const newOtp = [...otpCode];
      codeArray.forEach((digit, idx) => {
        if (idx < 6) {
          newOtp[idx] = digit;
        }
      });
      setOtpCode(newOtp);
      
      // Focus the next empty input
      const nextIndex = Math.min(digits.length, 5);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOtpChange = (value: string, index: number) => {
    const newOtp = [...otpCode];
    newOtp[index] = value;
    setOtpCode(newOtp);
    
    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Auto-submit when all fields are filled
    if (newOtp.every(digit => digit !== '') && !isLoading) {
      handleVerifyOtp(newOtp.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (code?: string) => {
    const finalCode = code || otpCode.join('');
    
    if (finalCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    try {
      setError('');
      setIsLoading(true);

      // Determine which identifier to use based on preferred auth method
      const preferredMethod = params.preferredAuthMethod || (params.method === 'sms' ? 'phone' : 'email');
      const email = params.userEmail || '';
      const phoneNumber = params.userPhone || '';
      
      // Build request body based on auth method
      let requestBody: any;
      if (preferredMethod === 'phone' && phoneNumber) {
        requestBody = {
          phoneNumber: phoneNumber,
          otpCode: finalCode,
        };
      } else if (email) {
        requestBody = {
          email: email,
          otpCode: finalCode,
        };
      } else {
        // Fallback to username if no email/phone available (backward compatibility)
        console.warn('⚠️ No email or phone available, falling back to username');
        requestBody = {
          username: params.username,
          otpCode: finalCode,
        };
      }

      console.log('🔐 Verifying OTP with:', { method: preferredMethod, identifier: preferredMethod === 'phone' ? phoneNumber : email });

      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Optional: if verify-otp ever returns JWT + user (not current API), persist immediately
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
              const deviceName = data.deviceName || 'this device';
              Alert.alert(
                'Success',
                `Authentication successful! Device "${deviceName}" is now trusted for 60 days.`,
                [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }]
              );
            } else {
              Alert.alert('Success', 'Authentication successful!', [
                { text: 'Continue', onPress: () => router.replace('/(tabs)') },
              ]);
            }
            await refreshSession();
            return;
          }
        }

        // Current API: verify-otp only returns verification flags — JWT is issued by POST /login with otpVerified: true
        const completeLoginWithOtpVerified = async (): Promise<boolean> => {
          if (!params.username || !params.tempPassword) {
            return false;
          }

          const loginResponse = await fetch(`${API_BASE_URL}/api/v1/mobile/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              username: params.username,
              password: params.tempPassword,
              otpVerified: true,
              rememberDevice: trustDevice,
            }),
          });

          const loginData = await loginResponse.json();
          console.log('📊 Login completion response:', loginData);

          if (!loginResponse.ok || !loginData.success) {
            console.error('❌ Login completion failed:', loginData);
            return false;
          }

          if (loginData.requires2FA) {
            console.error('❌ Login still requires 2FA after OTP verification');
            return false;
          }

          if (!loginData.token || typeof loginData.token !== 'string') {
            console.error('❌ Login succeeded but no JWT returned');
            return false;
          }

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

          if (!userData?.id) {
            console.error('❌ No user profile after login');
            return false;
          }

          const { secureStorage } = await import('../../utils/storage');
          await secureStorage.setItem('auth_token', loginData.token);
          await secureStorage.setItem('user', JSON.stringify(userData));
          if (loginData.deviceToken) {
            await secureStorage.setItem('device_token', loginData.deviceToken);
          }

          if (loginData.deviceToken) {
            const deviceName = loginData.deviceName || 'this device';
            Alert.alert(
              'Success',
              `Authentication successful! Device "${deviceName}" is now trusted for 60 days.`,
              [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }]
            );
          } else {
            Alert.alert('Success', 'Authentication successful!', [
              { text: 'Continue', onPress: () => router.replace('/(tabs)') },
            ]);
          }

          await refreshSession();
          return true;
        };

        try {
          const loginOk = await completeLoginWithOtpVerified();
          if (loginOk) {
            return;
          }
        } catch (loginError) {
          console.error('Error completing login after OTP:', loginError);
        }

        if (!params.username || !params.tempPassword) {
          setError(
            'Verification succeeded. Sign in again with your password to finish logging in.'
          );
        } else {
          setError('Verification successful but could not complete login. Please sign in again.');
        }
        setTimeout(() => {
          router.replace('/(auth)/sign-in');
        }, 2000);
      } else {
        setError(data.message || 'Verification failed');
        // Clear the OTP inputs on error
        setOtpCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
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

      // Use email or phoneNumber for resend, same as verify
      const preferredMethod = params.preferredAuthMethod || (params.method === 'sms' ? 'phone' : 'email');
      const email = params.userEmail || '';
      const phoneNumber = params.userPhone || '';
      
      let requestBody: any;
      if (preferredMethod === 'phone' && phoneNumber) {
        requestBody = { phoneNumber: phoneNumber };
      } else if (email) {
        requestBody = { email: email };
      } else {
        // Fallback to username
        requestBody = { username: params.username };
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/resend-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTimeLeft(600); // Reset timer to 10 minutes
        setOtpCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        Alert.alert('Code Sent', data.message);
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

  const getMethodIcon = () => {
    return params.method === 'sms' ? 'phone-portrait' : 'mail';
  };

  const getMethodText = () => {
    return params.method === 'sms' ? 'phone number' : 'email address';
  };

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

        {/* Full-width overlay: iOS needs oneTimeCode on a field that can accept 6 digits at once.
            Do not set oneTimeCode on maxLength={1} cells — that blocks SMS tap-to-fill.
            Controlled value="" on the autofill field was clearing the native value on each render. */}
        <View style={styles.otpWrapper}>
          <View style={styles.otpContainer}>
            {otpCode.map((digit, index) => (
              <TextInput
                key={index}
                ref={ref => inputRefs.current[index] = ref!}
                style={[
                  styles.otpInput,
                  digit && styles.otpInputFilled,
                  error && styles.otpInputError,
                ]}
                value={digit}
                onChangeText={(value) => handleOtpChange(value, index)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                editable={!isLoading}
              />
            ))}
          </View>
          <TextInput
            key={autofillFieldKey}
            ref={autofillInputRef}
            style={styles.otpAutofillOverlay}
            onChangeText={handleAutofillChange}
            keyboardType="number-pad"
            textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : undefined}
            autoComplete={Platform.OS === 'android' ? 'sms-otp' : undefined}
            importantForAutofill="yes"
            caretHidden
            editable={!isLoading}
            maxLength={6}
            pointerEvents="none"
          />
        </View>

        {timeLeft > 0 ? (
          <Text style={styles.timerText}>
            Code expires in {formatTime(timeLeft)}
          </Text>
        ) : (
          <Text style={styles.expiredText}>
            Code has expired. Please request a new one.
          </Text>
        )}

        {/* Trust This Device Option */}
        <View style={styles.trustDeviceContainer}>
          <Switch
            value={trustDevice}
            onValueChange={setTrustDevice}
            trackColor={{ false: '#e0e0e0', true: Colors.primary }}
            thumbColor={trustDevice ? '#fff' : '#f4f3f4'}
            style={styles.trustDeviceSwitch}
          />
          <Text style={styles.trustDeviceLabel}>
            Trust this device for 60 days
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.verifyButton, isLoading && styles.buttonDisabled]}
          onPress={() => handleVerifyOtp()}
          disabled={isLoading || otpCode.some(digit => !digit)}
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
            disabled={isResending || timeLeft > 540} // Allow resend after 1 minute
          >
            {isResending ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={[
                styles.resendLink,
                (timeLeft > 540) && styles.resendLinkDisabled
              ]}>
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
    marginBottom: 20,
    fontSize: 14,
  },
  otpWrapper: {
    position: 'relative',
    marginBottom: 20,
    paddingHorizontal: 20,
    minHeight: 55,
  },
  otpAutofillOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    zIndex: 10,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  otpInput: {
    width: 45,
    height: 55,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  otpInputFilled: {
    borderColor: Colors.primary,
    backgroundColor: '#f0f8ff',
  },
  otpInputError: {
    borderColor: '#ef4444',
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
    opacity: 0.7,
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