import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useColorScheme,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';

export default function SignUpScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handleSignUp = async () => {
    if (!username.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    try {
      const success = await signup(username.trim(), email.trim(), password);
      if (success) {
        router.replace('/(tabs)');
      } else {
        Alert.alert('Error', 'Failed to create account. Username or email may already exist.');
      }
    } catch (error) {
      Alert.alert('Error', 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = username.trim() && email.trim() && password.trim() && 
                     confirmPassword.trim() && password === confirmPassword && 
                     password.length >= 6;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#1a1a2e' : '#f5f5f5',
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 8,
      color: isDark ? '#ffffff' : '#1a1a2e',
    },
    subtitle: {
      fontSize: 16,
      textAlign: 'center',
      marginBottom: 48,
      color: isDark ? '#888' : '#666',
    },
    input: {
      backgroundColor: isDark ? '#2d2d44' : '#ffffff',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      marginBottom: 16,
      fontSize: 16,
      borderWidth: 1,
      borderColor: isDark ? '#404040' : '#e1e1e1',
      color: isDark ? '#ffffff' : '#000000',
    },
    inputError: {
      borderColor: '#ef4444',
    },
    button: {
      backgroundColor: '#4F46E5',
      paddingVertical: 16,
      borderRadius: 8,
      marginTop: 8,
    },
    buttonDisabled: {
      backgroundColor: isDark ? '#555' : '#ccc',
    },
    buttonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    linkContainer: {
      marginTop: 24,
      alignItems: 'center',
    },
    linkText: {
      color: '#4F46E5',
      fontSize: 16,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Quick Forms</Text>
          <Text style={styles.subtitle}>Create your account</Text>

          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor={isDark ? '#888' : '#666'}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={isDark ? '#888' : '#666'}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={isDark ? '#888' : '#666'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={[
              styles.input,
              confirmPassword && password !== confirmPassword && styles.inputError
            ]}
            placeholder="Confirm Password"
            placeholderTextColor={isDark ? '#888' : '#666'}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.button, (!isFormValid || loading) && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={!isFormValid || loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creating Account...' : 'Sign Up'}
            </Text>
          </TouchableOpacity>

          <View style={styles.linkContainer}>
            <Link href="/(auth)" style={styles.linkText}>
              Already have an account? Sign in
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
} 