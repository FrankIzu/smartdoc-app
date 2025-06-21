import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { apiService as api } from '../services/api';

interface UploadLinkInfo {
  name: string;
  description: string;
  current_uploads: number;
  max_uploads: number | null;
  expires_at: string | null;
}

interface UploadLinkResponse {
  success: boolean;
  upload_link: UploadLinkInfo;
}

interface UploadFile {
  uri: string;
  name: string;
  size: number;
  type: string;
}

export default function PublicUploadScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [uploadInfo, setUploadInfo] = useState<UploadLinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<UploadFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    if (token) {
      loadUploadInfo();
    }
  }, [token]);

  const loadUploadInfo = async () => {
    try {
      const response = await api.get<UploadLinkResponse>(`/upload-to/${token}`);
      if (response.data.success) {
        setUploadInfo(response.data.upload_link);
      } else {
        Alert.alert('Error', 'Invalid or expired upload link');
        router.back();
      }
    } catch (error: any) {
      console.error('Failed to load upload info:', error);
      const message = error.response?.status === 404 
        ? 'Upload link not found'
        : error.response?.status === 410
        ? 'Upload link has expired'
        : error.response?.status === 409
        ? 'Upload limit reached'
        : 'Failed to load upload information';
      
      Alert.alert('Error', message, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const selectFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        type: '*/*',
      });

      if (!result.canceled && result.assets) {
        const newFiles: UploadFile[] = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.name,
          size: asset.size || 0,
          type: asset.mimeType || 'application/octet-stream',
        }));

        // Check upload limits
        if (uploadInfo?.max_uploads) {
          const totalFiles = uploadInfo.current_uploads + selectedFiles.length + newFiles.length;
          if (totalFiles > uploadInfo.max_uploads) {
            Alert.alert(
              'Upload Limit',
              `Cannot upload ${newFiles.length} more files. Limit: ${uploadInfo.max_uploads}, Current: ${uploadInfo.current_uploads}, Selected: ${selectedFiles.length}`
            );
            return;
          }
        }

        setSelectedFiles(prev => [...prev, ...newFiles]);
      }
    } catch (error) {
      console.error('Failed to select files:', error);
      Alert.alert('Error', 'Failed to select files');
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) {
      Alert.alert('Error', 'Please select files to upload');
      return;
    }

    setUploading(true);
    const newProgress: { [key: string]: number } = {};

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileKey = `${file.name}_${i}`;
        newProgress[fileKey] = 0;
        setUploadProgress({ ...newProgress });

        const formData = new FormData();
        formData.append('file', {
          uri: file.uri,
          name: file.name,
          type: file.type,
        } as any);

        try {
          const response = await api.post(`/upload-to/${token}`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (progressEvent: any) => {
              if (progressEvent.total) {
                const progress = Math.round(
                  (progressEvent.loaded * 100) / progressEvent.total
                );
                newProgress[fileKey] = progress;
                setUploadProgress({ ...newProgress });
              }
            },
          });

          if (response.data.success) {
            newProgress[fileKey] = 100;
            setUploadProgress({ ...newProgress });
          }
        } catch (fileError) {
          console.error(`Failed to upload ${file.name}:`, fileError);
          Alert.alert('Upload Error', `Failed to upload ${file.name}`);
          break;
        }
      }

      Alert.alert('Success', 'Files uploaded successfully!', [
        { 
          text: 'OK', 
          onPress: () => {
            setSelectedFiles([]);
            setUploadProgress({});
            loadUploadInfo(); // Refresh upload info
          }
        }
      ]);
    } catch (error) {
      console.error('Upload failed:', error);
      Alert.alert('Error', 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatExpiryDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Expires soon';
    if (diffInHours < 24) return `Expires in ${diffInHours} hours`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `Expires in ${diffInDays} day${diffInDays !== 1 ? 's' : ''}`;
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return 'document-text';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return 'image';
      case 'mp4':
      case 'avi':
      case 'mov':
        return 'videocam';
      case 'mp3':
      case 'wav':
        return 'musical-notes';
      case 'doc':
      case 'docx':
        return 'document';
      case 'xls':
      case 'xlsx':
        return 'grid';
      case 'zip':
      case 'rar':
        return 'archive';
      default:
        return 'document-outline';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading upload information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!uploadInfo) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#FF3B30" />
          <Text style={styles.errorText}>Upload link not available</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upload Files</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Upload Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="cloud-upload" size={32} color="#007AFF" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>{uploadInfo.name}</Text>
              {uploadInfo.description && (
                <Text style={styles.infoDescription}>{uploadInfo.description}</Text>
              )}
            </View>
          </View>

          <View style={styles.infoStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Uploads</Text>
              <Text style={styles.statValue}>
                {uploadInfo.current_uploads}
                {uploadInfo.max_uploads && ` / ${uploadInfo.max_uploads}`}
              </Text>
            </View>
            {uploadInfo.expires_at && (
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Expires</Text>
                <Text style={styles.statValue}>
                  {formatExpiryDate(uploadInfo.expires_at)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* File Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Files</Text>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={selectFiles}
            disabled={uploading}
          >
            <Ionicons name="add-circle" size={24} color="#007AFF" />
            <Text style={styles.selectButtonText}>Choose Files</Text>
          </TouchableOpacity>
        </View>

        {/* Selected Files */}
        {selectedFiles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Selected Files ({selectedFiles.length})
            </Text>
            {selectedFiles.map((file, index) => {
              const fileKey = `${file.name}_${index}`;
              const progress = uploadProgress[fileKey] || 0;
              
              return (
                <View key={index} style={styles.fileItem}>
                  <View style={styles.fileIcon}>
                    <Ionicons name={getFileIcon(file.name)} size={20} color="#007AFF" />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName}>{file.name}</Text>
                    <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                    {uploading && progress > 0 && (
                      <View style={styles.progressContainer}>
                        <View style={styles.progressBar}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: `${progress}%` },
                            ]}
                          />
                        </View>
                        <Text style={styles.progressText}>{progress}%</Text>
                      </View>
                    )}
                  </View>
                  {!uploading && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeFile(index)}
                    >
                      <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Upload Button */}
        {selectedFiles.length > 0 && (
          <View style={styles.uploadContainer}>
            <TouchableOpacity
              style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
              onPress={uploadFiles}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="cloud-upload" size={20} color="#fff" />
              )}
              <Text style={styles.uploadButtonText}>
                {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} File${selectedFiles.length !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 16,
  },
  headerSpacer: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoContent: {
    flex: 1,
    marginLeft: 16,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  infoStats: {
    flexDirection: 'row',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  selectButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
    marginLeft: 8,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 12,
    color: '#666',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    color: '#666',
    minWidth: 30,
  },
  removeButton: {
    padding: 4,
  },
  uploadContainer: {
    paddingTop: 16,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 16,
  },
  uploadButtonDisabled: {
    backgroundColor: '#ccc',
  },
  uploadButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 