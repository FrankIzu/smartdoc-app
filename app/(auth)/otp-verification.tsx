import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { API_BASE_URL } from '../../constants/Config';
import { useEnhanced2FAAuth } from '../../contexts/Enhanced2FAAuthContext';

interface OtpVerificationParams {
  username: string;
  method: 'sms' | 'email';
  identifier: string;
  expiresIn: string;
}

export default function OtpVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<OtpVerificationParams>();
  const { setUser } = useEnhanced2FAAuth();
  
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(parseInt(params.expiresIn || '600'));
  const [isResending, setIsResending] = useState(false);
  
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

      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: params.username,
          otpCode: finalCode,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store user data
        const userData = {
          id: data.user.id.toString(),
          name: data.user.name,
          email: data.user.email,
        };
        
        await setUser(userData);
        
        Alert.alert('Success', 'Authentication successful!', [
          {
            text: 'Continue',
            onPress: () => router.replace('/(tabs)'),
          },
        ]);
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

      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/resend-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: params.username,
        }),
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
          We've sent a 6-digit code to your {getMethodText()}
        </Text>
        <Text style={styles.identifier}>{params.identifier}</Text>

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
          <Text style={styles.resendText}>Didn't receive the code? </Text>
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
    marginBottom: 5,
  },
  identifier: {
    fontSize: 16,
    textAlign: 'center',
    color: Colors.primary,
    fontWeight: '600',
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
    marginBottom: 30,
  },
  expiredText: {
    textAlign: 'center',
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 30,
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