import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useEnhanced2FAAuth } from '../../contexts/Enhanced2FAAuthContext';
import { googleAuthService } from '../../services/googleAuth';
import { appleAuthService } from '../../services/appleAuth';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

export default function SignUpScreen() {
  const router = useRouter();
  const { signup } = useEnhanced2FAAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);

  // Check Apple Sign In availability on mount
  React.useEffect(() => {
    if (Platform.OS === 'ios') {
      appleAuthService.isAvailableAsync().then(setAppleSignInAvailable);
    }
  }, []);

  const handleSignUp = async () => {
    try {
      setError('');
      setIsLoading(true);

      if (!username || !email || !password || !confirmPassword) {
        setError('Please fill in all fields');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      if (!agreeToTerms) {
        setError('Please agree to the Terms of Service and Privacy Policy');
        return;
      }

      // Call Enhanced 2FA signup function
      const result = await signup({
        username,
        email,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });

      if (result.success) {
        Alert.alert('Success', 'Account created successfully!');
        router.replace('/(tabs)');
      } else {
        setError(result.message || 'An error occurred during sign up');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during sign up');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      setError('');
      setIsLoading(true);

      if (!agreeToTerms) {
        setError('Please agree to the Terms of Service and Privacy Policy before continuing');
        return;
      }

      // Use Google Auth service for sign-up
      const result = await googleAuthService.signInWithGoogleEnhanced();
      
      if (result.success) {
        Alert.alert('Success', 'Account created with Google successfully!');
        router.replace('/(tabs)');
      } else if (result.requires2FA) {
        Alert.alert(
          '2FA Required',
          result.message || 'Additional verification required. Please use phone verification.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue with Phone', onPress: () => router.push('/phone-login') },
          ]
        );
      } else {
        setError(result.message || 'Google sign-up failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-up failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignUp = async () => {
    try {
      setError('');
      setIsLoading(true);

      if (!agreeToTerms) {
        setError('Please agree to the Terms of Service and Privacy Policy before continuing');
        return;
      }

      // Use Apple Auth service for sign-up
      const result = await appleAuthService.signInWithAppleEnhanced();
      
      if (result.success) {
        // Format and store user data
        const { secureStorage } = await import('../../utils/storage');
        const backendUser = result.user;
        
        // Format user data similar to sign-in
        const fullName = backendUser.first_name || backendUser.firstName
          ? `${backendUser.first_name || backendUser.firstName || ''} ${backendUser.last_name || backendUser.lastName || ''}`.trim()
          : '';
        const displayName = fullName || backendUser.name || backendUser.username || backendUser.email || 'Apple User';
        
        const userData = {
          id: (backendUser.id || backendUser.user_id || '').toString(),
          email: backendUser.email || backendUser.username || '',
          name: displayName,
        };
        
        // Validate user data
        if (!userData.id) {
          console.error('Invalid user data from Apple sign-up: missing ID', backendUser);
          setError('Failed to create account. Please try again.');
          return;
        }
        
        // Email might be null if user chose to hide it - use a placeholder
        if (!userData.email) {
          userData.email = `apple-${userData.id}@grabdocs.app`;
          console.warn('Apple user email hidden, using placeholder:', userData.email);
        }
        
        await secureStorage.setItem('user', JSON.stringify(userData));
        await secureStorage.setItem('auth_token', 'session_token');
        
        Alert.alert('Success', 'Account created with Apple successfully!');
        
        // Small delay to ensure state propagation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        router.replace('/(tabs)');
      } else if (result.requires2FA) {
        Alert.alert(
          '2FA Required',
          result.message || 'Additional verification required. Please use phone verification.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue with Phone', onPress: () => router.push('/phone-login') },
          ]
        );
      } else {
        setError(result.message || 'Apple sign-up failed');
      }
    } catch (err: any) {
      if (err.code === 'ERR_CANCELED' || err.message?.includes('canceled')) {
        // User cancelled - don't show error
        return;
      }
      setError(err instanceof Error ? err.message : 'Apple sign-up failed');
    } finally {
      setIsLoading(false);
    }
  };

  const openTermsOfService = () => {
    WebBrowser.openBrowserAsync('https://yourdomain.com/terms');
  };

  const openPrivacyPolicy = () => {
    WebBrowser.openBrowserAsync('https://yourdomain.com/privacy');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Create Account</Text>
        
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Username *</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
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

        <View style={styles.nameContainer}>
          <View style={styles.nameInputContainer}>
            <Text style={styles.inputLabel}>First Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.nameInput]}
                placeholder="First name"
                value={firstName}
                onChangeText={setFirstName}
                autoComplete="given-name"
                placeholderTextColor="#999"
              />
              {firstName.length > 0 && (
                <TouchableOpacity onPress={() => setFirstName('')}>
                  <Ionicons name="close-circle" size={20} color="#ccc" />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.nameInputContainer}>
            <Text style={styles.inputLabel}>Last Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.nameInput]}
                placeholder="Last name"
                value={lastName}
                onChangeText={setLastName}
                autoComplete="family-name"
                placeholderTextColor="#999"
              />
              {lastName.length > 0 && (
                <TouchableOpacity onPress={() => setLastName('')}>
                  <Ionicons name="close-circle" size={20} color="#ccc" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Email Address *</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholderTextColor="#999"
            />
            {email.length > 0 && (
              <TouchableOpacity onPress={() => setEmail('')}>
                <Ionicons name="close-circle" size={20} color="#ccc" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Password *</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCorrect={false}
              autoCapitalize="none"
              textContentType="newPassword"
              autoComplete="new-password"
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

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Confirm Password *</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCorrect={false}
              autoCapitalize="none"
              textContentType="newPassword"
              autoComplete="new-password"
              placeholderTextColor="#999"
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              <Ionicons 
                name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} 
                size={20} 
                color="#666" 
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.termsContainer}>
          <Pressable
            style={styles.checkbox}
            onPress={() => setAgreeToTerms(!agreeToTerms)}
          >
            <View style={[styles.checkboxInner, agreeToTerms && styles.checkboxChecked]} />
          </Pressable>
          <Text style={styles.termsText}>
            By signing up, you agree to our{' '}
            <Text style={styles.link} onPress={openTermsOfService}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text style={styles.link} onPress={openPrivacyPolicy}>
              Privacy Policy
            </Text>
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Creating Account...' : 'Sign Up'}
          </Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, isLoading && styles.buttonDisabled]}
          onPress={handleGoogleSignUp}
          disabled={isLoading}
        >
          <Text style={styles.googleButtonText}>
            {isLoading ? 'Signing up...' : '🔍 Continue with Google'}
          </Text>
        </TouchableOpacity>

        {/* Apple Sign In - iOS only when available */}
        {Platform.OS === 'ios' && appleSignInAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={handleAppleSignUp}
          />
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/sign-in" style={styles.footerLink}>
            Sign In
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: Colors.text,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 5,
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
  nameContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 15,
  },
  nameInputContainer: {
    width: '48%',
  },
  nameInput: {
    width: '100%',
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 4,
    marginRight: 10,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
  },
  link: {
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    color: Colors.text,
    fontSize: 14,
  },
  footerLink: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    marginBottom: 15,
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 15,
    color: '#666',
    fontSize: 14,
  },
  appleButton: {
    width: '100%',
    height: 50,
    marginBottom: 16,
  },
  googleButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#4285f4',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  googleButtonText: {
    color: '#4285f4',
    fontSize: 16,
    fontWeight: 'bold',
  },
}); 