import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function UploadScreen() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleClose = () => {
    if (uploading) {
      Alert.alert('Upload in Progress', 'Upload is in progress. Are you sure you want to cancel?', [
        { text: 'Continue Upload', style: 'cancel' },
        { text: 'Cancel Upload', style: 'destructive', onPress: () => router.back() }
      ]);
    } else {
      router.back();
    }
  };

  const handleUpload = async () => {
    const { useFileStore } = require('../../stores/fileStore');
    const fileStore = useFileStore.getState();
    
    if (fileStore.isDocumentPickerOpen) {
      console.log('Document picker already in progress, ignoring request');
      return;
    }
    
    try {
      fileStore.setDocumentPickerOpen(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        multiple: true,
      });

      if (result.canceled) {
        return;
      }

      // Check mobile file limit (3 files max)
      const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';
      if (isMobile && result.assets.length > 3) {
        Alert.alert(
          'Upload Limit',
          'Sorry, our maximum upload is 3',
          [{ text: 'OK' }]
        );
        fileStore.setDocumentPickerOpen(false);
        return;
      }

      setUploading(true);

      // Process each selected file
      for (const file of result.assets) {
        try {
          console.log('Uploading file:', file.name, file.uri);
          
          // Convert HEIC to PNG before upload if needed
          let fileToUpload = {
            uri: file.uri,
            name: file.name || 'unnamed_file',
            type: file.mimeType || 'application/octet-stream',
            size: file.size,
          };

          try {
            const { convertHeicToPng } = await import('../../utils/imageConversion');
            fileToUpload = await convertHeicToPng(fileToUpload, (progress, message) => {
              // Show conversion progress (0-10% of total)
              setProgress(progress * 0.1);
              console.log(`🔄 Conversion progress: ${progress}% - ${message}`);
            });
          } catch (conversionError) {
            console.warn('HEIC conversion failed, continuing with original:', conversionError);
          }
          
          // Create FormData for file upload
          const formData = new FormData();
          
          // Add file to form data
          formData.append('file', {
            uri: fileToUpload.uri,
            type: fileToUpload.type,
            name: fileToUpload.name,
          } as any);

          // Import API client
          const { apiClient } = await import('../../services/api');
          
          // Upload file using API client with progress polling
          const uploadResult = await apiClient.uploadFileWithProgressPolling(formData, (progress, message, phase) => {
            // Scale server progress to 10-100% (conversion was 0-10%)
            setProgress(10 + (progress * 0.9));
            console.log(`📊 Upload progress: ${progress}% - ${message} (${phase})`);
          });

          console.log('Upload successful:', uploadResult);

        } catch (error) {
          console.error('Error uploading file:', file.name, error);
          Alert.alert('Upload Error', `Failed to upload ${file.name}. Please try again.`);
        }
      }

      Alert.alert('Success', 'Documents uploaded successfully!', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/documents') }
      ]);
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to upload documents. Please try again.');
    } finally {
      setUploading(false);
      setProgress(0);
      fileStore.setDocumentPickerOpen(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleClose} style={styles.closeButton}>
          <MaterialIcons name="close" size={24} color="#007AFF" />
        </Pressable>
        <Text style={styles.title}>Upload Documents</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Pressable
          style={[styles.uploadArea, uploading && styles.uploadAreaDisabled]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.uploadingText}>Uploading... {progress}%</Text>
              <Text style={styles.uploadSubtext}>Please don&apos;t close this screen</Text>
            </View>
          ) : (
            <>
              <MaterialIcons name="cloud-upload" size={64} color="#007AFF" />
              <Text style={styles.uploadText}>Tap to select documents</Text>
              <Text style={styles.supportedFormats}>
                Supported formats: PDF, Images, Word documents
              </Text>
              <Text style={styles.hint}>
                You can select multiple files at once
              </Text>
            </>
          )}
        </Pressable>
        
        {!uploading && (
          <Pressable style={styles.cancelButton} onPress={handleClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  closeButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSpacer: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  uploadArea: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  uploadAreaDisabled: {
    borderColor: '#ccc',
    backgroundColor: '#f8f8f8',
  },
  uploadText: {
    fontSize: 18,
    color: '#007AFF',
    marginTop: 16,
  },
  supportedFormats: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  uploadingContainer: {
    alignItems: 'center',
  },
  uploadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  uploadSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  cancelButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
}); 