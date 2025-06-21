import { Link } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View
} from 'react-native';
import { useAuth } from '../context/auth';

export default function SignInScreen() {
  const [email, setEmail] = useState('francis'); // Default username for testing
  const [password, setPassword] = useState('password123'); // Default password for testing
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  const { signIn, loading, loadRememberedCredentials } = useAuth();

  // Load remembered credentials on component mount
  useEffect(() => {
    const loadRemembered = async () => {
      try {
        const remembered = await loadRememberedCredentials();
        if (remembered) {
          setEmail(remembered.email);
          setPassword(remembered.password);
          setRememberMe(remembered.remember);
          console.log('✅ Loaded remembered credentials');
        }
      } catch (error) {
        console.error('Failed to load remembered credentials:', error);
      }
    };
    loadRemembered();
  }, []);

  const handleSignIn = async () => {
    try {
      setError('');
      if (!email || !password) {
        setError('Please enter both username and password');
        return;
      }
      
      await signIn(email, password, rememberMe);
      
    } catch (error: any) {
      console.error('❌ Sign in error:', error);
      
      // Show user-friendly error messages
      let errorMessage = 'An unexpected error occurred';
      
      if (error.code === 'NETWORK_ERROR' || error.message.includes('Network Error')) {
        errorMessage = 'Network connection failed. Please check your internet connection.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Invalid username or password. Please try again.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <Text style={styles.title}>GrabDocs</Text>
        
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your username"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <View style={styles.rememberMeContainer}>
            <Text style={styles.rememberMeLabel}>Remember me</Text>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              trackColor={{ false: '#767577', true: '#007AFF' }}
              thumbColor={rememberMe ? '#fff' : '#f4f3f4'}
            />
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.error}>{error}</Text>
              <Pressable 
                style={styles.retryButton}
                onPress={() => setError('')}
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>

          <Link href="/forgot-password" asChild>
            <Pressable style={styles.linkButton}>
              <Text style={styles.linkText}>Forgot your password?</Text>
            </Pressable>
          </Link>

          <Link href="/sign-up" asChild>
            <Pressable style={styles.linkButton}>
              <Text style={styles.linkText}>
                Don't have an account? Sign up
              </Text>
            </Pressable>
          </Link>
        </View>
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
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    marginBottom: 48,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 8,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ef5350',
  },
  error: {
    color: '#c62828',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#ef5350',
    borderRadius: 4,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    marginTop: 16,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 14,
  },

  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rememberMeLabel: {
    fontSize: 14,
    color: '#333',
  },
}); 