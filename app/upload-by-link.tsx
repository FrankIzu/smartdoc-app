import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../constants/Config';
import { useLimitError } from '../contexts/LimitErrorContext';
import { useThemeColors } from '../hooks/useThemeColors';
import { extractLimitErrorData, getErrorResponseData } from '../utils/limitErrorUtils';
import DocumentViewer from '../components/DocumentViewer';

interface IntakeChecklistItem {
  label: string;
  description: string | null;
  required: boolean;
  status: 'pending' | 'matched' | 'confirmed' | 'not_applicable';
}

interface UploadLinkInfo {
  name: string;
  description: string;
  current_uploads: number;
  max_uploads: number | null;
  expires_at: string | null;
  /** Present only when this File Request link belongs to an Intake (client document checklist). */
  intake: { id: number; title: string; checklist: IntakeChecklistItem[] } | null;
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


const api = {
  get: async <T,>(url: string): Promise<{ data: T }> => {
    const response = await fetch(`${API_BASE_URL}${url}`);
    const data = await response.json();
    return { data };
  },
  post: async (url: string, data: FormData, options?: any): Promise<{ data: any }> => {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'POST',
      body: data,
      ...options,
    });
    const responseData = await response.json();
    return { data: responseData };
  },
};

export default function UploadByLinkScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const { showLimitError } = useLimitError();
  const [uploadInfo, setUploadInfo] = useState<UploadLinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<UploadFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [refreshing, setRefreshing] = useState(false);

  // Form fields
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [message, setMessage] = useState('');
  const [actionCode, setActionCode] = useState('');

  useEffect(() => {
    if (token) {
      loadUploadInfo();
    }
  }, [token]);

  const loadUploadInfo = async () => {
    try {
      // Web endpoint (same as grabdocs.com/upload-to) so shared links are reachable
      const response = await api.get<UploadLinkResponse>(`/api/v1/web/upload-to/${token}`);
      if (response.data.success && response.data.upload_link) {
        const raw = response.data.upload_link;
        setUploadInfo({
          name: raw.link_name ?? raw.name ?? 'File Request',
          description: raw.description ?? '',
          current_uploads: raw.upload_count ?? raw.current_uploads ?? 0,
          max_uploads: raw.max_uploads ?? null,
          expires_at: raw.expires_at ?? null,
          intake: raw.intake ?? null,
        });
      } else {
        Alert.alert('Error', 'Invalid or expired upload link');
        router.back();
      }
    } catch (error: any) {
      console.error('Failed to load upload info:', error);
      const status = error.response?.status;
      const message =
        status === 404
          ? 'Upload link not found'
          : status === 410
          ? 'Upload link has expired'
          : status === 409
          ? 'Upload limit reached'
          : 'Failed to load upload information';

      Alert.alert('Error', message, [{ text: 'OK', onPress: () => router.back() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadUploadInfo();
  };

  const selectFiles = async () => {
    const { useFileStore } = require('../stores/fileStore');
    const fileStore = useFileStore.getState();

    if (fileStore.isDocumentPickerOpen) {
      console.log('Document picker already in progress, ignoring request');
      return;
    }

    try {
      fileStore.setDocumentPickerOpen(true);
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        type: '*/*',
      });

      if (!result.canceled && result.assets) {
        const newFiles: UploadFile[] = result.assets.map((asset) => ({
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

        setSelectedFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (error) {
      console.error('Failed to select files:', error);
      Alert.alert('Error', 'Failed to select files');
    } finally {
      fileStore.setDocumentPickerOpen(false);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
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
        let file = selectedFiles[i];
        const fileKey = `${file.name}_${i}`;
        newProgress[fileKey] = 0;
        setUploadProgress({ ...newProgress });

        // Convert HEIC to PNG before upload
        try {
          const { convertHeicToPng } = await import('../utils/imageConversion');
          file = await convertHeicToPng(file, (progress, message) => {
            // Scale conversion progress to 0-10% of total
            newProgress[fileKey] = progress * 0.1;
            setUploadProgress({ ...newProgress });
          });
        } catch (conversionError) {
          console.warn('HEIC conversion failed, continuing with original:', conversionError);
        }

        const formData = new FormData();
        // API expects 'files' field (plural) - upload one file at a time
        formData.append('files', {
          uri: file.uri,
          name: file.name,
          type: file.type,
        } as any);

        // Add all form fields (matching mobile API)
        if (senderName.trim()) {
          formData.append('sender_name', senderName.trim());
        }
        if (senderEmail.trim()) {
          formData.append('sender_email', senderEmail.trim());
        }
        if (message.trim()) {
          formData.append('message', message.trim());
        }
        if (actionCode.trim()) {
          formData.append('action_code', actionCode.trim());
        }

        try {
          // Web endpoint (same as grabdocs.com) so uploads go to the same link
          const uploadUrl = `${API_BASE_URL}/api/v1/web/upload-to/${token}`;
          newProgress[fileKey] = 10;
          setUploadProgress({ ...newProgress });

          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
          });

          newProgress[fileKey] = 50;
          setUploadProgress({ ...newProgress });

          const contentType = uploadResponse.headers.get('content-type');
          let responseData: any;
          if (contentType && contentType.includes('application/json')) {
            responseData = await uploadResponse.json();
          } else {
            const textResponse = await uploadResponse.text();
            console.error('❌ Non-JSON response from server:', textResponse.substring(0, 200));
            throw new Error(`Server returned non-JSON response. Status: ${uploadResponse.status}`);
          }

          if (uploadResponse.ok && responseData.success) {
            newProgress[fileKey] = 100;
            setUploadProgress({ ...newProgress });
          } else {
            const err = new Error(responseData.message || 'Upload failed');
            (err as any).responseData = responseData;
            throw err;
          }
        } catch (fileError: any) {
          const limitData = extractLimitErrorData(getErrorResponseData(fileError));
          if (limitData) {
            showLimitError(limitData);
            break;
          }
          console.error(`❌ Failed to upload ${file.name}:`, fileError);
          const errorMessage = fileError.message || `Failed to upload ${file.name}`;
          Alert.alert('Upload Error', errorMessage);
          break;
        }
      }

      Alert.alert('Success', 'Files uploaded successfully!', [
        {
          text: 'OK',
          onPress: () => {
            setSelectedFiles([]);
            setUploadProgress({});
            setSenderName('');
            setSenderEmail('');
            setMessage('');
            setActionCode('');
            // Re-fetch so the client immediately sees updated checklist status (e.g. pending -> matched)
            // without needing to reopen the page.
            loadUploadInfo();
          },
        },
      ]);
    } catch (error: any) {
      const limitData = extractLimitErrorData(getErrorResponseData(error));
      if (limitData) {
        showLimitError(limitData);
        return;
      }
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

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Unknown date';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getFileIcon = (fileName: string, fileKind?: string) => {
    if (fileKind) {
      const kind = fileKind.toLowerCase();
      if (kind.includes('receipt')) return 'receipt-outline';
      if (kind.includes('invoice')) return 'document-text-outline';
      if (kind.includes('form')) return 'clipboard-outline';
    }
    
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return 'document-text';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'heic':
      case 'heif':
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
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    content: {
      flex: 1,
      padding: 12,
    },
    infoCard: {
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    infoStats: {
      flexDirection: 'row',
    },
    statItem: {
      flex: 1,
    },
    statLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    section: {
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    inputGroup: {
      marginBottom: 12,
    },
    label: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 6,
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
    selectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#E3F2FD',
      borderRadius: 6,
      paddingVertical: 12,
      borderWidth: 2,
      borderColor: '#007AFF',
      borderStyle: 'dashed',
    },
    selectButtonText: {
      fontSize: 14,
      color: '#007AFF',
      fontWeight: '500',
      marginLeft: 6,
    },
    fileItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 2,
    },
    fileSize: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    progressContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },
    progressBar: {
      flex: 1,
      height: 4,
      backgroundColor: colors.border,
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
      color: colors.textSecondary,
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
      backgroundColor: colors.border,
    },
    uploadButtonText: {
      fontSize: 14,
      color: '#fff',
      fontWeight: '600',
      marginLeft: 6,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textSecondary,
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
      color: colors.textSecondary,
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
    checklistItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    checklistIcon: {
      marginRight: 10,
      marginTop: 1,
    },
    checklistTextCol: {
      flex: 1,
    },
    checklistLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
    },
    checklistLabelDone: {
      textDecorationLine: 'line-through',
      color: colors.textSecondary,
    },
    checklistOptional: {
      fontSize: 11,
      color: colors.textLight,
    },
    checklistDescription: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={dynamicStyles.loadingText}>Loading upload information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!uploadInfo) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#FF3B30" />
          <Text style={dynamicStyles.errorText}>Upload link not available</Text>
          <TouchableOpacity style={dynamicStyles.backButton} onPress={() => router.back()}>
            <Text style={dynamicStyles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={dynamicStyles.headerTitle}>Upload Files</Text>
          {uploadInfo && (
            <Text style={dynamicStyles.headerSubtitle}>Upload to: {uploadInfo.name}</Text>
          )}
        </View>
        <Ionicons name="cloud-upload" size={24} color="#007AFF" />
      </View>

      <ScrollView
          style={dynamicStyles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#007AFF" />
          }
        >
          {/* Upload Info */}
          <View style={dynamicStyles.infoCard}>
            <View style={dynamicStyles.infoStats}>
              <View style={dynamicStyles.statItem}>
                <Text style={dynamicStyles.statLabel}>Uploads</Text>
                <Text style={dynamicStyles.statValue}>
                  {uploadInfo.current_uploads}
                  {uploadInfo.max_uploads && ` / ${uploadInfo.max_uploads}`}
                </Text>
              </View>
              {uploadInfo.expires_at && (
                <View style={dynamicStyles.statItem}>
                  <Text style={dynamicStyles.statLabel}>Expires</Text>
                  <Text style={dynamicStyles.statValue}>
                    {formatExpiryDate(uploadInfo.expires_at)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Intake checklist — only present when this link belongs to an Intake */}
          {uploadInfo.intake && uploadInfo.intake.checklist.length > 0 && (
            <View style={dynamicStyles.section}>
              <Text style={dynamicStyles.sectionTitle}>Documents needed for &quot;{uploadInfo.intake.title}&quot;</Text>
              {uploadInfo.intake.checklist.map((item, idx) => {
                const done = item.status === 'confirmed' || item.status === 'matched' || item.status === 'not_applicable';
                const icon =
                  item.status === 'confirmed'
                    ? 'checkmark-circle'
                    : item.status === 'matched'
                    ? 'checkmark-circle-outline'
                    : item.status === 'not_applicable'
                    ? 'remove-circle-outline'
                    : 'ellipse-outline';
                const iconColor =
                  item.status === 'confirmed'
                    ? '#34C759'
                    : item.status === 'matched'
                    ? '#007AFF'
                    : item.status === 'not_applicable'
                    ? colors.textLight
                    : colors.textLight;
                return (
                  <View key={`${item.label}-${idx}`} style={dynamicStyles.checklistItem}>
                    <Ionicons name={icon as any} size={18} color={iconColor} style={dynamicStyles.checklistIcon} />
                    <View style={dynamicStyles.checklistTextCol}>
                      <Text style={[dynamicStyles.checklistLabel, done && dynamicStyles.checklistLabelDone]}>
                        {item.label}
                        {!item.required && <Text style={dynamicStyles.checklistOptional}> (optional)</Text>}
                      </Text>
                      {item.description && <Text style={dynamicStyles.checklistDescription}>{item.description}</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Sender Information */}
          <View style={dynamicStyles.section}>
            <Text style={dynamicStyles.sectionTitle}>Your Information (Optional)</Text>
            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Your Name</Text>
              <TextInput
                style={dynamicStyles.input}
                value={senderName}
                onChangeText={setSenderName}
                placeholder="Enter your name"
                placeholderTextColor={colors.textLight}
                editable={!uploading}
              />
            </View>
            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Your Email</Text>
              <TextInput
                style={dynamicStyles.input}
                value={senderEmail}
                onChangeText={setSenderEmail}
                placeholder="Enter your email"
                placeholderTextColor={colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!uploading}
              />
            </View>
            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Action Code</Text>
              <TextInput
                style={dynamicStyles.input}
                value={actionCode}
                onChangeText={setActionCode}
                placeholder="Enter action code"
                placeholderTextColor={colors.textLight}
                autoCapitalize="none"
                editable={!uploading}
              />
            </View>
            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Message</Text>
              <TextInput
                style={[dynamicStyles.input, dynamicStyles.textArea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Add any additional message or comments..."
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={4}
                editable={!uploading}
              />
            </View>
          </View>

          {/* File Selection */}
          <View style={dynamicStyles.section}>
            <Text style={dynamicStyles.sectionTitle}>Select Files</Text>
            <TouchableOpacity
              style={dynamicStyles.selectButton}
              onPress={selectFiles}
              disabled={uploading}
            >
              <Ionicons name="add-circle" size={24} color="#007AFF" />
              <Text style={dynamicStyles.selectButtonText}>Choose Files</Text>
            </TouchableOpacity>
          </View>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <View style={dynamicStyles.section}>
              <Text style={dynamicStyles.sectionTitle}>
                Selected Files ({selectedFiles.length})
              </Text>
              {selectedFiles.map((file, index) => {
                const fileKey = `${file.name}_${index}`;
                const progress = uploadProgress[fileKey] || 0;

                return (
                  <View key={`file-${file.name}-${index}`} style={dynamicStyles.fileItem}>
                    <View style={dynamicStyles.fileIcon}>
                      <Ionicons name={getFileIcon(file.name) as any} size={20} color="#007AFF" />
                    </View>
                    <View style={dynamicStyles.fileInfo}>
                      <Text style={dynamicStyles.fileName}>{file.name}</Text>
                      <Text style={dynamicStyles.fileSize}>{formatFileSize(file.size)}</Text>
                      {uploading && progress > 0 && (
                        <View style={dynamicStyles.progressContainer}>
                          <View style={dynamicStyles.progressBar}>
                            <View
                              style={[dynamicStyles.progressFill, { width: `${progress}%` }]}
                            />
                          </View>
                          <Text style={dynamicStyles.progressText}>{Math.round(progress)}%</Text>
                        </View>
                      )}
                    </View>
                    {!uploading && (
                      <TouchableOpacity
                        style={dynamicStyles.removeButton}
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
            <View style={dynamicStyles.uploadContainer}>
              <TouchableOpacity
                style={[dynamicStyles.uploadButton, uploading && dynamicStyles.uploadButtonDisabled]}
                onPress={uploadFiles}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="cloud-upload" size={20} color="#fff" />
                )}
                <Text style={dynamicStyles.uploadButtonText}>
                  {uploading
                    ? 'Uploading...'
                    : `Upload ${selectedFiles.length} File${selectedFiles.length !== 1 ? 's' : ''}`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
    </SafeAreaView>
  );
}
