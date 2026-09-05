import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
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
import { FeedbackTouchable } from '../components/FeedbackTouchable';
import { API_BASE_URL } from '../constants/Config';
import { useThemeColors } from '../hooks/useThemeColors';
import { getUploadLinkErrorMessage, type UploadLinkErrorPayload } from '../utils/uploadLinkErrors';

import AppBackButton from '../components/AppBackButton';
import AppHeaderTitle from '../components/AppHeaderTitle';

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
    Keyboard.dismiss();
    try {
      const trimmedCode = code.trim();
      const url = `${API_BASE_URL}/api/v1/web/upload-to/by-code/${encodeURIComponent(trimmedCode)}`;
      const response = await fetch(url);
      let data: {
        success?: boolean;
        upload_link?: { link_token?: string };
      } & UploadLinkErrorPayload = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (response.ok && data.success && data.upload_link?.link_token) {
        router.push({
          pathname: '/upload-by-link',
          params: { token: data.upload_link.link_token },
        });
        return;
      }

      Alert.alert(
        'Invalid Code',
        getUploadLinkErrorMessage(data, 'The upload code you entered is invalid or has expired.'),
        [{ text: 'OK' }],
      );
    } catch (error) {
      console.error('❌ Failed to validate upload code:', error);
      Alert.alert(
        'Error',
        'Failed to validate upload code. Please check your connection and try again.',
        [{ text: 'OK' }],
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
      backgroundColor: colors.headerBackground,
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
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: 12,
    },
    inputCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
      marginTop: 28,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 10,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: 4,
      textAlign: 'center',
      color: colors.text,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    hint: {
      marginTop: 8,
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    continueButton: {
      marginTop: 20,
      backgroundColor: '#007AFF',
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    continueButtonDisabled: {
      opacity: 0.5,
    },
    continueButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <AppBackButton />
        <AppHeaderTitle>Upload by Link</AppHeaderTitle>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={dynamicStyles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={dynamicStyles.iconContainer}>
            <View style={dynamicStyles.iconCircle}>
              <Ionicons name="link" size={36} color="#007AFF" />
            </View>
            <Text style={dynamicStyles.title}>Enter Upload Code</Text>
            <Text style={dynamicStyles.subtitle}>
              Enter the 6–8 character code you received to open the upload page
            </Text>
          </View>

          <View style={dynamicStyles.inputCard}>
            <Text style={dynamicStyles.label}>Upload Code</Text>
            <TextInput
              style={dynamicStyles.input}
              value={code}
              onChangeText={(text) => setCode(text.toUpperCase().replace(/\s/g, ''))}
              placeholder="ABC123"
              placeholderTextColor={colors.textLight}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              editable={!loading}
              returnKeyType="go"
              onSubmitEditing={() => void handleContinue()}
            />
            <Text style={dynamicStyles.hint}>Codes are case-insensitive</Text>

            <FeedbackTouchable
              style={[
                dynamicStyles.continueButton,
                (!code.trim() || loading) && dynamicStyles.continueButtonDisabled,
              ]}
              onPress={handleContinue}
              disabled={!code.trim() || loading}
              loading={loading}
              spinnerColor="#fff"
            >
              <Text style={dynamicStyles.continueButtonText}>Continue</Text>
            </FeedbackTouchable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
