import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { Link } from 'expo-router';
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
import { useEnhanced2FAAuth } from '../../contexts/Enhanced2FAAuthContext';
import { googleAuthService } from '../../services/googleAuth';
import { useAuth } from '../context/auth';

export default function SignInScreen() {
  // Temporarily commented out until expo-router is fully working
  // const router = useRouter();
  const [username, setUsername] = useState('francis'); // Default username for testing
  const [password, setPassword] = useState('password123'); // Default password for testing
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');

  // Use regular auth for normal login, Enhanced2FA only for biometric
  const { signIn, loading } = useAuth();
  const { loginWithBiometric } = useEnhanced2FAAuth();

  // Check biometric availability on component mount
  useEffect(() => {
    checkBiometricAvailability();
  }, []);

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

  // Handle regular login using standard auth context
  const handleSignIn = async () => {
    try {
      setError('');
      if (!username || !password) {
        setError('Please enter both username and password');
        return;
      }

      await signIn(username, password, rememberDevice);
      // Navigation handled by auth context if successful
    } catch (error: any) {
      console.error('Regular login error:', error);
      setError(error.message || 'Login failed');
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>


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

          {/* Google Sign In */}
          <TouchableOpacity
            style={[styles.googleButton, loading && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={loading}
          >
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 100,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#333',
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switch: {
    marginRight: 8,
  },
  rememberMeLabel: {
    fontSize: 16,
    color: '#333',
  },
  faceIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faceIdText: {
    fontSize: 16,
    color: '#007AFF',
    marginLeft: 6,
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
  },
  signInButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  forgotPasswordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  forgotPasswordText: {
    color: '#007AFF',
    fontSize: 16,
    marginRight: 6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#666',
    fontSize: 14,
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  googleButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '500',
  },
  signUpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  signUpText: {
    fontSize: 16,
    color: '#666',
  },
  signUpLink: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
}); 