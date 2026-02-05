import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { STORAGE_KEYS } from '../../constants/Config';
import { useEnhanced2FAAuth } from '../../contexts/Enhanced2FAAuthContext';
import { appleAuthService } from '../../services/appleAuth';
import { googleAuthService } from '../../services/googleAuth';

const isAndroid = Platform.OS === 'android';

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
  const insets = useSafeAreaInsets();

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
        if (result.completedViaDeepLink) {
          Alert.alert('Complete sign-in', 'Please complete sign-in in the browser. You\'ll return to the app when done.');
        } else {
          Alert.alert('Success', 'Account created with Google successfully!');
          router.replace('/(tabs)');
        }
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
        await secureStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'session_token');
        
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

  // Ensure content clears status bar (time, battery). Use insets; on Android fallback if insets are 0.
  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;
  const topPadding = Math.max(insets.top, statusBarHeight) + (isAndroid ? 20 : 24);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: topPadding }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    paddingBottom: isAndroid ? 16 : 24,
    // paddingTop set dynamically with insets.top so content stays below status bar
  },
  content: {
    paddingHorizontal: isAndroid ? 16 : 20,
    paddingBottom: isAndroid ? 16 : 24,
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: isAndroid ? 20 : 24,
    fontWeight: 'bold',
    marginBottom: isAndroid ? 16 : 30,
    color: Colors.text,
  },
  inputContainer: {
    width: '100%',
    marginBottom: isAndroid ? 8 : 15,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    marginBottom: isAndroid ? 3 : 5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: isAndroid ? 8 : 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: isAndroid ? 15 : 16,
    color: '#333',
  },
  nameContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: isAndroid ? 8 : 15,
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
    marginBottom: isAndroid ? 12 : 20,
    paddingHorizontal: isAndroid ? 4 : 10,
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
    fontSize: isAndroid ? 13 : 14,
    lineHeight: isAndroid ? 18 : 20,
    color: Colors.text,
  },
  link: {
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  button: {
    width: '100%',
    height: isAndroid ? 44 : 50,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: isAndroid ? 6 : 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: isAndroid ? 15 : 16,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    marginTop: isAndroid ? 12 : 20,
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
    marginBottom: isAndroid ? 8 : 15,
    textAlign: 'center',
    fontSize: 13,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: isAndroid ? 12 : 20,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: isAndroid ? 12 : 15,
    color: '#666',
    fontSize: 14,
  },
  appleButton: {
    width: '100%',
    height: isAndroid ? 44 : 50,
    marginBottom: isAndroid ? 10 : 16,
  },
  googleButton: {
    width: '100%',
    height: isAndroid ? 44 : 50,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#4285f4',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: isAndroid ? 8 : 10,
  },
  googleButtonText: {
    color: '#4285f4',
    fontSize: isAndroid ? 15 : 16,
    fontWeight: 'bold',
  },
}); 