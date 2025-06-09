import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function UploadScreen() {
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
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        multiple: true,
      });

      if (result.canceled) {
        return;
      }

      setUploading(true);

      // Process each selected file
      for (const file of result.assets) {
        try {
          console.log('Uploading file:', file.name, file.uri);
          
          // Create FormData for file upload
          const formData = new FormData();
          
          // Add file to form data
          formData.append('files', {
            uri: file.uri,
            type: file.mimeType || 'application/octet-stream',
            name: file.name || 'unnamed_file',
          } as any);

          // Import API client
          const { apiClient } = await import('../../services/api');
          
          // Upload file using API client
          const uploadResult = await apiClient.uploadFile(formData, (progress) => {
            setProgress(progress);
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
              <Text style={styles.uploadSubtext}>Please don't close this screen</Text>
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