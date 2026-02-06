import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../hooks/useThemeColors';
import { API_BASE_URL } from '../constants/Config';

export default function UploadByLinkCodeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!code.trim()) {
      Alert.alert('Error', 'Please enter an upload code');
      return;
    }

    setLoading(true);
    try {
      // Web endpoint (same as grabdocs.com) so shared links are reachable
      const trimmedCode = code.trim();
      const url = `${API_BASE_URL}/api/v1/web/upload-to/by-code/${encodeURIComponent(trimmedCode)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok && data.success && data.upload_link) {
        // Resolve to link_token and open upload form (URLs use link_token, not short code)
        const linkToken = data.upload_link.link_token ?? trimmedCode;
        router.push({
          pathname: '/upload-by-link',
          params: { token: linkToken },
        });
      } else {
        let errorMessage = 'The upload code you entered is invalid or has expired.';
        
        if (response.status === 404) {
          errorMessage = 'Upload code not found. Please check the code and try again.';
        } else if (response.status === 410) {
          errorMessage = 'This upload link has expired.';
        } else if (response.status === 409) {
          errorMessage = 'Upload limit reached for this link.';
        } else if (data.message) {
          errorMessage = data.message;
        }
        
        Alert.alert('Invalid Code', errorMessage, [{ text: 'OK' }]);
      }
    } catch (error: any) {
      console.error('❌ Failed to validate upload code:', error);
      Alert.alert(
        'Error',
        'Failed to validate upload code. Please check your connection and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginLeft: 16,
    },
    content: {
      flexGrow: 1,
      padding: 20,
      justifyContent: 'center',
      paddingBottom: 40,
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: 32,
    },
    iconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#E3F2FD',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    description: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 22,
    },
    inputContainer: {
      marginBottom: 24,
    },
    label: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontSize: 18,
      color: colors.text,
      textAlign: 'center',
      letterSpacing: 2,
      fontWeight: '600',
    },
    inputFocused: {
      borderColor: '#007AFF',
      borderWidth: 2,
    },
    continueButton: {
      backgroundColor: '#007AFF',
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    continueButtonDisabled: {
      backgroundColor: colors.border,
      opacity: 0.5,
    },
    continueButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 8,
    },
    helpText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 24,
      lineHeight: 20,
    },
  });

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Upload by Link</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={dynamicStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={dynamicStyles.iconContainer}>
            <View style={dynamicStyles.iconCircle}>
              <Ionicons name="link" size={40} color="#007AFF" />
            </View>
            <Text style={dynamicStyles.title}>Enter Upload Code</Text>
            <Text style={dynamicStyles.description}>
              Enter the code provided to you to upload files to this link
            </Text>
          </View>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.label}>Upload Code</Text>
            <TextInput
              style={dynamicStyles.input}
              value={code}
              onChangeText={setCode}
              placeholder="Enter code"
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              maxLength={50}
              returnKeyType="done"
              onSubmitEditing={() => {
                Keyboard.dismiss();
                if (code.trim() && !loading) {
                  handleContinue();
                }
              }}
            />
          </View>

          <TouchableOpacity
            style={[
              dynamicStyles.continueButton,
              (!code.trim() || loading) && dynamicStyles.continueButtonDisabled,
            ]}
            onPress={handleContinue}
            disabled={!code.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
                <Text style={dynamicStyles.continueButtonText}>Continue</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={dynamicStyles.helpText}>
            Don't have a code? Contact the person who shared the upload link with you.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
