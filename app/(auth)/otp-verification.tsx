import { Ionicons } from '@expo/vector-icons';
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

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeLeft]);

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
        // OTP verified successfully
        // Check if backend returned token and user data directly
        if (data.token && data.user) {
          // Backend returned everything we need
          const userData = {
            id: data.user.id?.toString() || data.user.user_id?.toString() || '',
            name: data.user.name || data.user.first_name || data.user.username || '',
            email: data.user.email || params.userEmail || '',
          };
          
          // Store token and user data
          const { secureStorage } = await import('../../utils/storage');
          await secureStorage.setItem('auth_token', data.token);
          await secureStorage.setItem('user', JSON.stringify(userData));
          
          // Store device token if device is trusted
          if (data.deviceToken) {
            await secureStorage.setItem('device_token', data.deviceToken);
            console.log('💾 Stored device token for trusted device');
            
            // Show success message with device trust info
            const deviceName = data.deviceName || 'this device';
            Alert.alert(
              'Success', 
              `Authentication successful! Device "${deviceName}" is now trusted for 60 days.`,
              [
                {
                  text: 'Continue',
                  onPress: () => router.replace('/(tabs)'),
                },
              ]
            );
          } else {
            Alert.alert('Success', 'Authentication successful!', [
              {
                text: 'Continue',
                onPress: () => router.replace('/(tabs)'),
              },
            ]);
          }
          
          // Refresh auth session to pick up the new user data
          await refreshSession();
          return;
        }
        
        // If no token/user in response, the backend might have set a session cookie
        // Try to fetch user data from auth-check (session-based auth)
        try {
          const authCheckResponse = await fetch(`${API_BASE_URL}/api/v1/mobile/auth-check`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include', // Important: include cookies for session-based auth
          });

          if (authCheckResponse.ok) {
            const authData = await authCheckResponse.json();
            if (authData.success && (authData.user || authData.data)) {
              const user = authData.user || authData.data;
              const userData = {
                id: user.id?.toString() || user.user_id?.toString() || '',
                name: user.name || user.first_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || '',
                email: user.email || params.userEmail || '',
              };
              
              if (userData.id) {
                // Store user data
                const { secureStorage } = await import('../../utils/storage');
                await secureStorage.setItem('user', JSON.stringify(userData));
                await secureStorage.setItem('auth_token', 'session_token'); // Session-based auth
                
                // Refresh auth session to pick up the new user data
                await refreshSession();
                
                Alert.alert('Success', 'Authentication successful!', [
                  {
                    text: 'Continue',
                    onPress: () => router.replace('/(tabs)'),
                  },
                ]);
                return;
              }
            }
          }
        } catch (authError) {
          console.error('Error fetching user data after OTP verification:', authError);
        }
        
        // If auth-check failed, we need to complete the login
        // The backend verify-otp verifies the OTP but doesn't log the user in
        // We need to call login again, but the backend should recognize that OTP was already verified
        console.log('⚠️ Session not established after OTP verification, attempting to complete login...');
        
        // Try to complete login with username/password (OTP already verified)
        // The backend should recognize the verified OTP and complete login
        if (params.username && params.tempPassword) {
          try {
            const loginResponse = await fetch(`${API_BASE_URL}/api/v1/mobile/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({
                username: params.username,
                password: params.tempPassword,
                otpVerified: true, // Tell backend OTP was already verified
                rememberDevice: trustDevice, // Include trust device preference
              }),
            });

            const loginData = await loginResponse.json();
            console.log('📊 Login completion response:', loginData);

            if (loginResponse.ok && loginData.success && !loginData.requires2FA) {
              // Login completed successfully
              let userData = null;
              
              // Check for user data in response (multiple possible formats)
              if (loginData.user) {
                // Direct user object
                userData = {
                  id: loginData.user.id?.toString() || loginData.user.user_id?.toString() || '',
                  name: loginData.user.name || loginData.user.first_name || `${loginData.user.first_name || ''} ${loginData.user.last_name || ''}`.trim() || loginData.user.username || '',
                  email: loginData.user.email || params.userEmail || '',
                };
              } else if (loginData.session_info && loginData.session_info.user_id) {
                // Session info format
                userData = {
                  id: loginData.session_info.user_id.toString(),
                  name: params.username,
                  email: params.userEmail || '',
                };
              } else if (loginData.data && loginData.data.user) {
                // Nested data.user format
                const user = loginData.data.user;
                userData = {
                  id: user.id?.toString() || user.user_id?.toString() || '',
                  name: user.name || user.first_name || user.username || '',
                  email: user.email || params.userEmail || '',
                };
              }
              
              if (userData && userData.id) {
                // Store token and user data
                const { secureStorage } = await import('../../utils/storage');
                if (loginData.token) {
                  await secureStorage.setItem('auth_token', loginData.token);
                  console.log('💾 Stored auth token');
                } else {
                  await secureStorage.setItem('auth_token', 'session_token');
                  console.log('💾 Stored session token');
                }
                await secureStorage.setItem('user', JSON.stringify(userData));
                console.log('💾 Stored user data:', userData);
                
                // Store device token if device is trusted
                if (loginData.deviceToken) {
                  await secureStorage.setItem('device_token', loginData.deviceToken);
                  console.log('💾 Stored device token for trusted device');
                  
                  // Show success message with device trust info
                  const deviceName = loginData.deviceName || 'this device';
                  Alert.alert(
                    'Success', 
                    `Authentication successful! Device "${deviceName}" is now trusted for 60 days.`,
                    [
                      {
                        text: 'Continue',
                        onPress: () => router.replace('/(tabs)'),
                      },
                    ]
                  );
                } else {
                  Alert.alert('Success', 'Authentication successful!', [
                    {
                      text: 'Continue',
                      onPress: () => router.replace('/(tabs)'),
                    },
                  ]);
                }
                
                // Refresh auth session to pick up the new user data
                await refreshSession();
                return;
              } else {
                console.error('❌ Login successful but no valid user data found in response');
                console.log('Response structure:', JSON.stringify(loginData, null, 2));
                
                // Try auth-check again since session should be established now
                console.log('🔄 Trying auth-check again after login...');
                try {
                  const authCheckResponse = await fetch(`${API_BASE_URL}/api/v1/mobile/auth-check`, {
                    method: 'GET',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                  });

                  if (authCheckResponse.ok) {
                    const authData = await authCheckResponse.json();
                    if (authData.success && (authData.user || authData.data)) {
                      const user = authData.user || authData.data;
                      const finalUserData = {
                        id: user.id?.toString() || user.user_id?.toString() || '',
                        name: user.name || user.first_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || '',
                        email: user.email || params.userEmail || '',
                      };
                      
                      if (finalUserData.id) {
                        const { secureStorage } = await import('../../utils/storage');
                        await secureStorage.setItem('user', JSON.stringify(finalUserData));
                        await secureStorage.setItem('auth_token', 'session_token');
                        
                        // Refresh auth session to pick up the new user data
                        await refreshSession();
                        
                        Alert.alert('Success', 'Authentication successful!', [
                          {
                            text: 'Continue',
                            onPress: () => router.replace('/(tabs)'),
                          },
                        ]);
                        return;
                      }
                    }
                  }
                } catch (authCheckError) {
                  console.error('Error in auth-check after login:', authCheckError);
                }
              }
            } else {
              console.error('❌ Login completion failed:', {
                ok: loginResponse.ok,
                success: loginData.success,
                requires2FA: loginData.requires2FA,
                message: loginData.message,
              });
            }
          } catch (loginError) {
            console.error('Error completing login after OTP:', loginError);
          }
        }
        
        // If we couldn't complete login, show error
        setError('Verification successful but could not complete login. Please sign in again.');
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
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 20,
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