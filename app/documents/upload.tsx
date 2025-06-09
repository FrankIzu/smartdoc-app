import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function UploadScreen() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

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
          // Here you would typically upload to your backend
          // For now, we'll simulate an upload with a delay
          const fileInfo = await FileSystem.getInfoAsync(file.uri);
          console.log('File info:', fileInfo);

          // Simulate upload progress
          for (let i = 0; i <= 100; i += 10) {
            setProgress(i);
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          console.log('Uploaded:', file.name);
        } catch (error) {
          console.error('Error processing file:', error);
        }
      }

      // Navigate back to documents screen
      router.push('/documents');
    } catch (error) {
      console.error('Error picking document:', error);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
        </Pressable>
        <Text style={styles.title}>Upload Documents</Text>
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
            </View>
          ) : (
            <>
              <MaterialIcons name="cloud-upload" size={48} color="#007AFF" />
              <Text style={styles.uploadText}>Tap to select documents</Text>
              <Text style={styles.supportedFormats}>
                Supported formats: PDF, Images, Word documents
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
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
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
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
}); 