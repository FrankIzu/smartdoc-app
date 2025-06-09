import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../services/api';
import { useAuth } from '../context/auth';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uri: string;
}

export default function UploadScreen() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        await uploadFiles(result.assets);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Permission to access camera roll is required!');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets) {
        await uploadFiles(result.assets);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Permission to access camera is required!');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        await uploadFiles(result.assets);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const uploadFiles = async (files: any[]) => {
    if (!files || files.length === 0) return;

    try {
      setUploading(true);
      setUploadProgress(0);

      const formData = new FormData();
      
      files.forEach((file, index) => {
        formData.append('files', {
          uri: file.uri,
          type: file.mimeType || 'application/octet-stream',
          name: file.name || `file_${index}`,
        } as any);
      });

      const response = await apiClient.uploadFile(formData, (progress) => {
        setUploadProgress(progress);
      });

      if (response.success) {
        Alert.alert(
          'Success',
          `Successfully uploaded ${files.length} file(s)`,
          [
            {
              text: 'View Documents',
              onPress: () => router.push('/(tabs)/documents'),
            },
            { text: 'OK' },
          ]
        );
      } else {
        throw new Error(response.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const UploadOption = ({ 
    title, 
    subtitle, 
    icon, 
    color, 
    onPress 
  }: {
    title: string;
    subtitle: string;
    icon: string;
    color: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity 
      style={[styles.uploadOption, { borderLeftColor: color }]} 
      onPress={onPress}
      disabled={uploading}
    >
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={32} color={color} />
      </View>
      <View style={styles.optionContent}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color="#999" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Upload Files</Text>
          <Text style={styles.subtitle}>
            Add documents, images, and other files to your library
          </Text>
        </View>

        {/* Upload Progress */}
        {uploading && (
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressText}>Uploading... {uploadProgress}%</Text>
              <ActivityIndicator size="small" color="#007AFF" />
            </View>
            <View style={styles.progressBar}>
              <View 
                style={[styles.progressFill, { width: `${uploadProgress}%` }]} 
              />
            </View>
          </View>
        )}

        {/* Upload Options */}
        <View style={styles.optionsContainer}>
          <UploadOption
            title="Choose Documents"
            subtitle="Select PDF, Word, Excel, and other documents"
            icon="document-text"
            color="#007AFF"
            onPress={pickDocument}
          />
          
          <UploadOption
            title="Choose Photos"
            subtitle="Select images from your photo library"
            icon="images"
            color="#34C759"
            onPress={pickImage}
          />
          
          <UploadOption
            title="Take Photo"
            subtitle="Capture a document or receipt with camera"
            icon="camera"
            color="#FF9500"
            onPress={takePhoto}
          />
        </View>

        {/* Upload Tips */}
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>Upload Tips</Text>
          
          <View style={styles.tip}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.tipText}>
              Supported formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, PNG
            </Text>
          </View>
          
          <View style={styles.tip}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.tipText}>
              Maximum file size: 50MB per file
            </Text>
          </View>
          
          <View style={styles.tip}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.tipText}>
              Files are automatically processed and made searchable
            </Text>
          </View>
          
          <View style={styles.tip}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.tipText}>
              You can upload multiple files at once
            </Text>
          </View>
        </View>

        {/* Recent Uploads Link */}
        <TouchableOpacity 
          style={styles.recentUploadsButton}
          onPress={() => router.push('/(tabs)/documents')}
        >
          <Ionicons name="time" size={24} color="#007AFF" />
          <Text style={styles.recentUploadsText}>View Recent Uploads</Text>
          <Ionicons name="chevron-forward" size={24} color="#007AFF" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  progressContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e5e5',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  optionsContainer: {
    padding: 16,
  },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  tipsContainer: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tipsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  tipText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  recentUploadsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recentUploadsText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 12,
  },
}); 