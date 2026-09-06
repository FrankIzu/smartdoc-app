import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClientsButton from '../../components/clients/ClientsButton';
import { FeedbackTouchable } from '../../components/FeedbackTouchable';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService } from '../../services/api';
import { setItemClients } from '../../services/clientsApi';
import { uploadLinksListScreenKey } from '../../services/userScopedCache';
import { screenCache } from '../../utils/screenCache';
import { useAuth } from '../context/auth';

import AppBackButton from '../../components/AppBackButton';
import AppHeaderTitle from '../../components/AppHeaderTitle';

export default function CreateUploadLinkScreen() {
  const router = useRouter();
  const { client_id: clientIdParam } = useLocalSearchParams<{ client_id?: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [maxUploads, setMaxUploads] = useState('10');
  const [hasExpiration, setHasExpiration] = useState(true);
  const [hasUploadLimit, setHasUploadLimit] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);

  useEffect(() => {
    const raw = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;
    const id = typeof raw === 'string' && /^\d+$/.test(raw) ? parseInt(raw, 10) : null;
    if (id != null) {
      setSelectedClientIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  }, [clientIdParam]);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name for the file request');
      return;
    }

    setLoading(true);
    try {
      const data: any = {
        name: name.trim(),
        description: description.trim() || undefined,
      };

      if (hasExpiration) {
        const days = parseInt(expiresInDays);
        if (isNaN(days) || days <= 0) {
          Alert.alert('Error', 'Please enter a valid number of days for expiration');
          setLoading(false);
          return;
        }
        data.expires_in_days = days;
      }

      if (hasUploadLimit) {
        const limit = parseInt(maxUploads);
        if (isNaN(limit) || limit <= 0) {
          Alert.alert('Error', 'Please enter a valid upload limit');
          setLoading(false);
          return;
        }
        data.max_uploads = limit;
      }

      const response = await apiService.createUploadLink(data);
      
      if (response.success) {
        const resAny = response as any;
        const newLink = resAny.upload_link ?? resAny.link;
        const newLinkId = newLink?.id as number | undefined;
        if (newLinkId && selectedClientIds.length > 0) {
          try {
            await setItemClients({
              client_ids: selectedClientIds,
              item_type: 'file_upload_link',
              item_id: newLinkId,
            });
          } catch (linkErr) {
            console.error('Error linking clients:', linkErr);
          }
        }
        const listKey = uploadLinksListScreenKey(user?.id);
        if (listKey) screenCache.invalidate(listKey);
        Alert.alert(
          'Success',
          'File request created successfully!',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Error', response.message || 'Failed to create upload link');
      }
    } catch (error: any) {
      console.error('Create upload link error:', error);
      Alert.alert('Error', error.message || 'Failed to create upload link');
    } finally {
      setLoading(false);
    }
  };

  const expirationOptions = [
    { label: '1 day', value: '1' },
    { label: '3 days', value: '3' },
    { label: '7 days', value: '7' },
    { label: '14 days', value: '14' },
    { label: '30 days', value: '30' },
    { label: '90 days', value: '90' },
  ];

  const uploadLimitOptions = [
    { label: '5 uploads', value: '5' },
    { label: '10 uploads', value: '10' },
    { label: '25 uploads', value: '25' },
    { label: '50 uploads', value: '50' },
    { label: '100 uploads', value: '100' },
  ];

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.headerBackground,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    placeholder: {
      width: 24,
    },
    content: {
      flex: 1,
    },
    section: {
      backgroundColor: colors.card,
      marginTop: 8,
      padding: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 16,
    },
    inputGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 8,
    },
    required: {
      color: '#FF3B30',
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    textArea: {
      height: 80,
      textAlignVertical: 'top',
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    switchInfo: {
      flex: 1,
      marginRight: 12,
    },
    switchLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 4,
    },
    switchDescription: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    optionsContainer: {
      marginTop: 12,
    },
    optionsLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 12,
    },
    optionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    optionButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    selectedOption: {
      borderColor: '#007AFF',
      backgroundColor: '#E3F2FD',
    },
    optionText: {
      fontSize: 14,
      color: colors.text,
    },
    selectedOptionText: {
      color: '#007AFF',
      fontWeight: '600',
    },
    customInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    customLabel: {
      fontSize: 14,
      color: colors.text,
    },
    customInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
    },
    infoBox: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 8,
      margin: 16,
      borderLeftWidth: 4,
      borderLeftColor: '#007AFF',
    },
    infoText: {
      flex: 1,
      marginLeft: 12,
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    footer: {
      padding: 16,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    createButton: {
      backgroundColor: '#007AFF',
      paddingVertical: 16,
      borderRadius: 8,
      alignItems: 'center',
    },
    disabledButton: {
      opacity: 0.5,
    },
    createButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  }), [colors]);

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <AppBackButton onPress={() => {
            Keyboard.dismiss();
            router.back();
          }} />
        <AppHeaderTitle>Create File Request</AppHeaderTitle>
        <View style={dynamicStyles.placeholder} />
      </View>

      <ScrollView
        style={dynamicStyles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Basic Information</Text>
          
          <View style={dynamicStyles.inputGroup}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[dynamicStyles.label, { marginBottom: 0 }]}>
                Name <Text style={dynamicStyles.required}>*</Text>
              </Text>
              <ClientsButton
                selectedClientIds={selectedClientIds}
                onChange={setSelectedClientIds}
                allowCreate
                compact
              />
            </View>
            <TextInput
              style={dynamicStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Client Documents, Team Reports"
              placeholderTextColor={colors.textLight}
              maxLength={100}
            />
          </View>

          <View style={dynamicStyles.inputGroup}>
            <Text style={dynamicStyles.label}>Description (Optional)</Text>
            <TextInput
              style={[dynamicStyles.input, dynamicStyles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe what files should be uploaded..."
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </View>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Expiration Settings</Text>
          
          <View style={dynamicStyles.switchRow}>
            <View style={dynamicStyles.switchInfo}>
              <Text style={dynamicStyles.switchLabel}>Set Expiration Date</Text>
              <Text style={dynamicStyles.switchDescription}>
                Link will become inactive after this period
              </Text>
            </View>
            <Switch
              value={hasExpiration}
              onValueChange={setHasExpiration}
              trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
              thumbColor={colors.switchThumbAndroid(hasExpiration)}
              ios_backgroundColor={colors.switchTrackOff}
            />
          </View>

          {hasExpiration && (
            <View style={dynamicStyles.optionsContainer}>
              <Text style={dynamicStyles.optionsLabel}>Expires in:</Text>
              <View style={dynamicStyles.optionsGrid}>
                {expirationOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      dynamicStyles.optionButton,
                      expiresInDays === option.value && dynamicStyles.selectedOption,
                    ]}
                    onPress={() => setExpiresInDays(option.value)}
                  >
                    <Text
                      style={[
                        dynamicStyles.optionText,
                        expiresInDays === option.value && dynamicStyles.selectedOptionText,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <View style={dynamicStyles.customInputContainer}>
                <Text style={dynamicStyles.customLabel}>Or custom days:</Text>
                <TextInput
                  style={dynamicStyles.customInput}
                  value={expiresInDays}
                  onChangeText={setExpiresInDays}
                  keyboardType="numeric"
                  placeholder="7"
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </View>
          )}
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Upload Limits</Text>
          
          <View style={dynamicStyles.switchRow}>
            <View style={dynamicStyles.switchInfo}>
              <Text style={dynamicStyles.switchLabel}>Set Upload Limit</Text>
              <Text style={dynamicStyles.switchDescription}>
                Maximum number of files that can be uploaded
              </Text>
            </View>
            <Switch
              value={hasUploadLimit}
              onValueChange={setHasUploadLimit}
              trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
              thumbColor={colors.switchThumbAndroid(hasUploadLimit)}
              ios_backgroundColor={colors.switchTrackOff}
            />
          </View>

          {hasUploadLimit && (
            <View style={dynamicStyles.optionsContainer}>
              <Text style={dynamicStyles.optionsLabel}>Maximum uploads:</Text>
              <View style={dynamicStyles.optionsGrid}>
                {uploadLimitOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      dynamicStyles.optionButton,
                      maxUploads === option.value && dynamicStyles.selectedOption,
                    ]}
                    onPress={() => setMaxUploads(option.value)}
                  >
                    <Text
                      style={[
                        dynamicStyles.optionText,
                        maxUploads === option.value && dynamicStyles.selectedOptionText,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <View style={dynamicStyles.customInputContainer}>
                <Text style={dynamicStyles.customLabel}>Or custom limit:</Text>
                <TextInput
                  style={dynamicStyles.customInput}
                  value={maxUploads}
                  onChangeText={setMaxUploads}
                  keyboardType="numeric"
                  placeholder="10"
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </View>
          )}
        </View>

        <View style={dynamicStyles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#007AFF" />
          <Text style={dynamicStyles.infoText}>
            Once created, you can share the upload link via email or copy it to share manually. 
            Recipients can upload files without needing an account.
          </Text>
        </View>
      </ScrollView>

      <View style={dynamicStyles.footer}>
        <FeedbackTouchable
          style={[dynamicStyles.createButton, loading && dynamicStyles.disabledButton]}
          onPress={handleCreate}
          disabled={loading}
          loading={loading}
          spinnerColor="#fff"
          replaceWithSpinner={false}
        >
          <Text style={dynamicStyles.createButtonText}>
            {loading ? 'Creating...' : 'Create File Request'}
          </Text>
        </FeedbackTouchable>
      </View>
    </SafeAreaView>
  );
}
