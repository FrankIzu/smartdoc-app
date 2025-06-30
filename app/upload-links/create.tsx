import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';

export default function CreateUploadLinkScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [maxUploads, setMaxUploads] = useState('10');
  const [hasExpiration, setHasExpiration] = useState(true);
  const [hasUploadLimit, setHasUploadLimit] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a link name');
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
        Alert.alert(
          'Success',
          'Upload link created successfully!',
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Create Upload Link</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Link Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Client Documents, Team Reports"
              placeholderTextColor="#999"
              maxLength={100}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe what files should be uploaded..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expiration Settings</Text>
          
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Set Expiration Date</Text>
              <Text style={styles.switchDescription}>
                Link will become inactive after this period
              </Text>
            </View>
            <Switch
              value={hasExpiration}
              onValueChange={setHasExpiration}
              trackColor={{ false: '#e5e5e5', true: '#007AFF' }}
              thumbColor="#fff"
            />
          </View>

          {hasExpiration && (
            <View style={styles.optionsContainer}>
              <Text style={styles.optionsLabel}>Expires in:</Text>
              <View style={styles.optionsGrid}>
                {expirationOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      expiresInDays === option.value && styles.selectedOption,
                    ]}
                    onPress={() => setExpiresInDays(option.value)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        expiresInDays === option.value && styles.selectedOptionText,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <View style={styles.customInputContainer}>
                <Text style={styles.customLabel}>Or custom days:</Text>
                <TextInput
                  style={styles.customInput}
                  value={expiresInDays}
                  onChangeText={setExpiresInDays}
                  keyboardType="numeric"
                  placeholder="7"
                  placeholderTextColor="#999"
                />
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Limits</Text>
          
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Set Upload Limit</Text>
              <Text style={styles.switchDescription}>
                Maximum number of files that can be uploaded
              </Text>
            </View>
            <Switch
              value={hasUploadLimit}
              onValueChange={setHasUploadLimit}
              trackColor={{ false: '#e5e5e5', true: '#007AFF' }}
              thumbColor="#fff"
            />
          </View>

          {hasUploadLimit && (
            <View style={styles.optionsContainer}>
              <Text style={styles.optionsLabel}>Maximum uploads:</Text>
              <View style={styles.optionsGrid}>
                {uploadLimitOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      maxUploads === option.value && styles.selectedOption,
                    ]}
                    onPress={() => setMaxUploads(option.value)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        maxUploads === option.value && styles.selectedOptionText,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <View style={styles.customInputContainer}>
                <Text style={styles.customLabel}>Or custom limit:</Text>
                <TextInput
                  style={styles.customInput}
                  value={maxUploads}
                  onChangeText={setMaxUploads}
                  keyboardType="numeric"
                  placeholder="10"
                  placeholderTextColor="#999"
                />
              </View>
            </View>
          )}
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#007AFF" />
          <Text style={styles.infoText}>
            Once created, you can share the upload link via email or copy it to share manually. 
            Recipients can upload files without needing an account.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createButton, loading && styles.disabledButton]}
          onPress={handleCreate}
          disabled={loading}
        >
          <Text style={styles.createButtonText}>
            {loading ? 'Creating...' : 'Create Upload Link'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 24,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#FF3B30',
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
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
    marginRight: 16,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  switchDescription: {
    fontSize: 14,
    color: '#666',
  },
  optionsContainer: {
    marginTop: 8,
  },
  optionsLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 12,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  optionButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    margin: 4,
  },
  selectedOption: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  optionText: {
    fontSize: 14,
    color: '#333',
  },
  selectedOptionText: {
    color: '#fff',
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  customLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 12,
  },
  customInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    color: '#333',
    width: 80,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#f0f8ff',
    borderWidth: 1,
    borderColor: '#b3d9ff',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 8,
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  createButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 