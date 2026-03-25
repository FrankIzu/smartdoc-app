import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { Link, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../../constants/Config';
import { useEnhanced2FAAuth } from '../../contexts/Enhanced2FAAuthContext';
import { appleAuthService } from '../../services/appleAuth';
import { googleAuthService } from '../../services/googleAuth';
import { GoogleLogo } from '../../components/GoogleLogo';
import { useAuth } from '../context/auth';

export default function SignInScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [needsOtp, setNeedsOtp] = useState(false);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  // Use regular auth for normal login, Enhanced2FA only for biometric
  // Note: We use local isSubmitting for the button so the screen doesn't unmount on login (auth loading would hide entire app)
  const { signIn, loading: authLoading, refreshSession } = useAuth();
  const loading = authLoading || isSubmitting;
  const { loginWithBiometric } = useEnhanced2FAAuth();

  // Check biometric availability on component mount
  useEffect(() => {
    checkBiometricAvailability();
    checkAppleSignInAvailability();
  }, []);

  const checkAppleSignInAvailability = async () => {
    if (Platform.OS === 'ios') {
      try {
        const available = await appleAuthService.isAvailableAsync();
        setAppleSignInAvailable(available);
      } catch (error) {
        console.error('Error checking Apple Sign In availability:', error);
        setAppleSignInAvailable(false);
      }
    }
  };

  const checkBiometricAvailability = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      
      // Disable biometric in Expo Go (development only)
      const isExpoGo = __DEV__ && !Constants.executionEnvironment || Constants.executionEnvironment === 'storeClient';
      const available = hasHardware && isEnrolled && supportedTypes.length > 0 && !isExpoGo;
      setBiometricAvailable(available);
      
      if (available) {
        // Determine the biometric type for better UX
        if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Touch ID');
        } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          setBiometricType('Iris');
        } else {
          setBiometricType('Biometric');
        }
      }
      
      console.log('Biometric check:', { 
        hasHardware, 
        isEnrolled, 
        supportedTypes: supportedTypes.map(type => 
          type === LocalAuthentication.AuthenticationType.FINGERPRINT ? 'Fingerprint' :
          type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION ? 'Face ID' :
          type === LocalAuthentication.AuthenticationType.IRIS ? 'Iris' : 'Unknown'
        ),
        available 
      });
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      setBiometricAvailable(false);
    }
  };

  // Handle regular login with OTP verification
  const handleSignIn = async () => {
    try {
      setError('');
      if (!username || !password) {
        setError('Please enter both username and password');
        return;
      }

      setIsSubmitting(true);

      // Step 1: Try regular login first
      try {
        await signIn(username, password, rememberDevice);
        // Success: we're on sign-in screen so we must navigate to home (index only redirects when it's the active route)
        router.replace('/(tabs)');
        return;
      } catch (loginError: any) {
        // IMPORTANT: On login failure, stay on login screen and show error
        // Do NOT navigate away - user should see the error message
        
        // Check if error is due to 2FA requirement
        if (loginError.requires2FA) {
          console.log('🔐 2FA required - navigating to OTP verification');
          console.log('📦 User data from login:', loginError.user);
          
          // Store user data for OTP verification
          const userData = loginError.user;
          const preferredMethod = loginError.preferredAuthMethod || 'email';
          
          // Get email or phone based on preferred method
          const email = userData?.email || '';
          const phoneNumber = userData?.phone_number || userData?.phoneNumber || '';
          
          setIsSubmitting(false);
          // Navigate to OTP verification screen with user info
          // Note: We pass password temporarily so we can complete login after OTP verification
          // This is stored in memory only and cleared after use
          router.push({
            pathname: '/(auth)/otp-verification',
            params: {
              username: username, // Keep for backward compatibility
              method: preferredMethod === 'phone' ? 'sms' : 'email',
              identifier: loginError.identifier || (preferredMethod === 'phone' ? phoneNumber : email),
              expiresIn: '600', // 10 minutes
              // Pass user data as JSON string (router params are strings)
              userEmail: email,
              userPhone: phoneNumber,
              preferredAuthMethod: preferredMethod,
              tempPassword: password, // Temporary: needed to complete login after OTP
              rememberDevice: rememberDevice ? 'true' : 'false', // Pass remember device preference
            }
          });
          return;
        }
        
        // If login fails for other reasons, check if user needs OTP verification
        console.log('Initial login failed, checking if OTP verification is needed');
        
        // Step 2: Check if user needs OTP verification
        const shouldUseOtp = await checkUserForOtpVerification(username);
        
        if (shouldUseOtp) {
          // Request OTP - this will navigate to OTP screen on success
          await requestOtpForUser(username, password, rememberDevice);
        } else {
          // If no OTP needed, show the login error and STAY on login screen (do not redirect)
          const errorMessage = loginError.message || 'Invalid username or password';
          console.log('❌ Login failed - showing error on login screen:', errorMessage);
          setError(errorMessage);
          return;
        }
      }
    } catch (error: any) {
      console.error('Enhanced login error:', error);
      // On any error, show error on login screen and stay here (do not redirect to home)
      const errorMessage = error.message || 'Login failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if user exists and needs OTP verification
  const checkUserForOtpVerification = async (username: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/check-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.exists && (data.hasPhone || data.hasEmail);
      }
      return false;
    } catch (error) {
      console.error('Error checking user for OTP:', error);
      return false;
    }
  };

  // Request OTP for the user (password needed so after verify-otp we can POST /login with otpVerified: true)
  const requestOtpForUser = async (
    username: string,
    password: string,
    rememberDevice: boolean
  ) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/request-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          purpose: 'login'
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const email =
          (typeof data.email === 'string' && data.email) ||
          (typeof data.userEmail === 'string' && data.userEmail) ||
          '';
        const phoneNumber =
          (typeof data.phoneNumber === 'string' && data.phoneNumber) ||
          (typeof data.userPhone === 'string' && data.userPhone) ||
          '';
        const method =
          data.method === 'sms' || data.method === 'email' ? data.method : 'email';
        const preferred =
          data.preferredAuthMethod === 'phone' || data.preferredAuthMethod === 'email'
            ? data.preferredAuthMethod
            : method === 'sms'
              ? 'phone'
              : 'email';
        const expires =
          data.expiresIn != null ? Number(data.expiresIn) : 600;

        router.push({
          pathname: '/(auth)/otp-verification',
          params: {
            username,
            method,
            identifier:
              data.identifier ||
              (preferred === 'phone' ? phoneNumber : email) ||
              username,
            expiresIn: String(Number.isFinite(expires) ? expires : 600),
            userEmail: email,
            userPhone: phoneNumber,
            preferredAuthMethod: preferred,
            tempPassword: password,
            rememberDevice: rememberDevice ? 'true' : 'false',
          }
        });
      } else {
        setError(data.message || 'Failed to send verification code');
      }
    } catch (error) {
      console.error('Error requesting OTP:', error);
      setError('Failed to send verification code. Please try again.');
    }
  };

  // Handle biometric login
  const handleBiometricLogin = async () => {
    try {
      setError('');
      
      const result = await loginWithBiometric();
      
      if (!result.success) {
        if (result.message?.includes('not enrolled') || result.message?.includes('not trusted')) {
          Alert.alert(
            'Biometric Setup Required',
            'To use biometric authentication:\n\n1. First login with your username and password\n2. Ensure biometric authentication is enabled in your device settings\n3. Device will be trusted for future biometric logins',
            [{ text: 'OK' }]
          );
        } else if (result.message?.includes('not available') || result.message?.includes('hardware')) {
          Alert.alert(
            'Biometric Not Available',
            'Biometric authentication is not available on this device. Please use username and password to sign in.',
            [{ text: 'OK' }]
          );
        } else {
          setError(result.message || 'Biometric authentication failed');
        }
      }
      // Navigation handled by context if successful
    } catch (error: any) {
      console.error('Biometric login error:', error);
      setError('Biometric authentication failed. Please try again or use your password.');
    }
  };

  // Handle Google Sign-In
  const handleGoogleSignIn = async () => {
    try {
      setError('');
      await googleAuthService.signInWithGoogle();
      // Navigation handled by auth context
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      setError(error.message || 'Google sign-in failed');
    }
  };

  // Handle Apple Sign-In
  const handleAppleSignIn = async () => {
    try {
      setError('');
      
      // Use enhanced Apple Sign In with backend integration
      const result = await appleAuthService.signInWithAppleEnhanced();
      
      if (result.success && result.user) {
        // Format user data to match auth context expectations
        const { secureStorage } = await import('../../utils/storage');
        
        // Format user data using consistent utility function
        const backendUser = result.user;
        const fullName = backendUser.first_name || backendUser.firstName
          ? `${backendUser.first_name || backendUser.firstName || ''} ${backendUser.last_name || backendUser.lastName || ''}`.trim()
          : '';
        const displayName = fullName || backendUser.name || backendUser.username || backendUser.email || 'Apple User';
        
        const userData = {
          id: (backendUser.id || backendUser.user_id || '').toString(),
          email: backendUser.email || backendUser.username || '',
          name: displayName,
        };
        
        // Validate user data before storing
        if (!userData.id) {
          console.error('Invalid user data from Apple sign-in: missing ID', backendUser);
          setError('Failed to retrieve user information. Please try again.');
          return;
        }
        
        // Email might be null if user chose to hide it - use a placeholder
        if (!userData.email) {
          userData.email = `apple-${userData.id}@grabdocs.app`;
          console.warn('Apple user email hidden, using placeholder:', userData.email);
        }
        
        console.log('💾 Storing Apple sign-in user data:', userData);
        await secureStorage.setItem('user', JSON.stringify(userData));
        
        // CRITICAL FIX: Store the actual JWT token returned from backend, not 'session_token'
        const authToken = result.token || 'session_token';
        await secureStorage.setItem('auth_token', authToken);
        
        if (authToken && authToken !== 'session_token') {
          console.log('✅ Apple Sign-In: JWT token stored');
        } else {
          console.warn('⚠️ Apple Sign-In: No JWT token received, using session_token fallback');
        }
        
        // Refresh the auth context to pick up the new user
        await refreshSession();
        
        // Small delay to ensure state propagation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Navigate to main app
        router.replace('/(tabs)');
      } else {
        if (result.requires2FA) {
          // Handle 2FA requirement if needed
          setError(result.message || 'Additional verification required');
        } else {
          setError(result.message || 'Apple sign-in failed');
        }
      }
    } catch (error: any) {
      console.error('Apple sign-in error:', error);
      if (error.code === 'ERR_CANCELED' || error.message?.includes('canceled') || error.message?.includes('User cancelled')) {
        // User cancelled - don't show error
        return;
      }
      setError(error.message || 'Apple sign-in failed');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={[styles.content, { paddingTop: insets.top + (Platform.OS === 'android' ? 20 : 28) }]}>
        <View style={styles.centeredBlock}>
          {/* Top spacer */}
          <View style={styles.topSpacer} />
          {/* Profile Section */}
          <View style={styles.profileSection}>
            <Text style={styles.welcomeText}>GrabDocs</Text>
          </View>
          
          {/* Form */}
          <View style={styles.form}>
          {/* Username Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                textContentType="username"
                autoComplete="username"
                placeholderTextColor="#999"
              />
              {username.length > 0 && (
                <TouchableOpacity onPress={() => setUsername('')}>
                  <Ionicons name="close-circle" size={20} color="#ccc" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCorrect={false}
                autoCapitalize="none"
                textContentType="password"
                placeholderTextColor="#999"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons 
                  name={showPassword ? "eye-off-outline" : "eye-outline"} 
                  size={20} 
                  color="#666" 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Remember Me & Biometric Row */}
          <View style={styles.optionsRow}>
            <View style={styles.rememberMeContainer}>
              <Switch
                value={rememberDevice}
                onValueChange={setRememberDevice}
                trackColor={{ false: '#e0e0e0', true: '#007AFF' }}
                thumbColor={rememberDevice ? '#fff' : '#f4f3f4'}
                style={styles.switch}
              />
              <Text style={styles.rememberMeLabel}>Remember me</Text>
            </View>
            
            {biometricAvailable && (
              <TouchableOpacity 
                style={styles.faceIdContainer}
                onPress={handleBiometricLogin}
                disabled={loading}
              >
                <Ionicons 
                  name={
                    biometricType === 'Face ID' ? 'scan' :
                    biometricType === 'Touch ID' ? 'finger-print' :
                    biometricType === 'Iris' ? 'eye' : 
                    'finger-print'
                  } 
                  size={20} 
                  color="#007AFF" 
                />
                <Text style={styles.faceIdText}>{biometricType}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.signInButton, loading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.signInButtonText}>Sign in</Text>
            )}
          </TouchableOpacity>

          {/* Forgot Password */}
          <Link href="/forgot-password" asChild>
            <TouchableOpacity style={styles.forgotPasswordContainer}>
              <Text style={styles.forgotPasswordText}>Forgot username or password?</Text>
              <Ionicons name="open-outline" size={16} color="#007AFF" />
            </TouchableOpacity>
          </Link>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social sign-in: regular full-width buttons with "Sign in with Google" / "Sign in with Apple" */}
          <View style={styles.socialContainer}>
            <TouchableOpacity
              style={[styles.socialButton, styles.googleButton, loading && styles.buttonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={loading}
            >
              <GoogleLogo size={20} />
              <Text style={styles.socialButtonText}>Sign in with Google</Text>
            </TouchableOpacity>
            {Platform.OS === 'ios' && appleSignInAvailable && (
              <TouchableOpacity
                style={[styles.socialButton, styles.appleButton, loading && styles.buttonDisabled]}
                onPress={handleAppleSignIn}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <Text style={[styles.socialButtonText, styles.appleButtonText]}>Sign in with Apple</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Sign Up Link */}
          <View style={styles.signUpContainer}>
            <Text style={styles.signUpText}>New to GrabDocs? </Text>
            <Link href="/sign-up" asChild>
              <TouchableOpacity>
                <Text style={styles.signUpLink}>Create an account</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const isAndroid = Platform.OS === 'android';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    paddingHorizontal: isAndroid ? 20 : 24,
    // paddingTop set dynamically with insets.top so content stays below status bar
  },
  centeredBlock: {
    flex: 1,
  },
  topSpacer: {
    minHeight: 32,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: isAndroid ? 16 : 40,
  },
  welcomeText: {
    fontSize: isAndroid ? 26 : 32,
    fontWeight: '700',
    color: '#333',
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 18,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    minHeight: 24,
    paddingVertical: 4,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isAndroid ? 14 : 24,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switch: {
    marginRight: 8,
  },
  rememberMeLabel: {
    fontSize: isAndroid ? 14 : 16,
    color: '#333',
  },
  faceIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faceIdText: {
    fontSize: isAndroid ? 14 : 16,
    color: '#007AFF',
    marginLeft: 6,
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: isAndroid ? 8 : 12,
    borderRadius: 8,
    marginBottom: isAndroid ? 10 : 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
  },
  signInButton: {
    backgroundColor: '#007AFF',
    paddingVertical: isAndroid ? 12 : 16,
    borderRadius: isAndroid ? 8 : 12,
    alignItems: 'center',
    marginBottom: isAndroid ? 14 : 24,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: isAndroid ? 16 : 18,
    fontWeight: '600',
  },
  forgotPasswordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isAndroid ? 10 : 16,
  },
  forgotPasswordText: {
    color: '#007AFF',
    fontSize: isAndroid ? 14 : 16,
    marginRight: 6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: isAndroid ? 8 : 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    marginHorizontal: isAndroid ? 8 : 10,
    color: '#666',
    fontSize: 14,
  },
  socialContainer: {
    width: '100%',
    marginBottom: isAndroid ? 16 : 24,
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  appleButton: {
    backgroundColor: '#000',
  },
  socialButtonText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#333',
  },
  appleButtonText: {
    color: '#fff',
  },
  signUpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: isAndroid ? 20 : 40,
  },
  signUpText: {
    fontSize: isAndroid ? 14 : 16,
    color: '#666',
  },
  signUpLink: {
    fontSize: isAndroid ? 14 : 16,
    color: '#007AFF',
    fontWeight: '500',
  },
}); 