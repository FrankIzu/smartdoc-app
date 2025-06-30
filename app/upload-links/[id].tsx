import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Alert,
    Clipboard,
    FlatList,
    Modal,
    Platform,
    RefreshControl,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';
import { useAuth } from '../context/auth';

interface UploadLink {
  id: number;
  name: string;
  description?: string;
  token: string;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
  upload_count: number;
  max_uploads?: number;
  url: string;
  uploaded_files: UploadedFile[];
}

interface UploadedFile {
  id: number;
  filename: string;
  file_size: number;
  file_type: string;
  file_kind: string;
  upload_date: string;
  status: string;
}

export default function UploadLinkDetailsScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const [uploadLink, setUploadLink] = useState<UploadLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [emails, setEmails] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [shareLoading, setShareLoading] = useState(false);

  const loadUploadLink = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await apiService.getUploadLink(Number(id));
      if (response.success) {
        setUploadLink(response.upload_link);
      } else {
        Alert.alert('Error', response.message || 'Failed to load upload link');
        router.back();
      }
    } catch (error: any) {
      console.error('Load upload link error:', error);
      Alert.alert('Error', error.message || 'Failed to load upload link');
      router.back();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadUploadLink();
      }
    }, [user, id])
  );

  const handleRefresh = () => {
    if (!user) return;
    setRefreshing(true);
    loadUploadLink();
  };

  const handleCopyLink = async () => {
    if (uploadLink) {
      Clipboard.setString(uploadLink.url);
      Alert.alert('Copied', 'Upload link copied to clipboard');
    }
  };

  const handleShareLink = async () => {
    if (!uploadLink) return;
    
    try {
      const message = `Upload files using this link: ${uploadLink.url}\n\nLink: ${uploadLink.name}\n${uploadLink.description ? `Description: ${uploadLink.description}` : ''}`;
      
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await Share.share({
          message,
          url: uploadLink.url,
          title: `Upload Link: ${uploadLink.name}`,
        });
      }
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleEmailShare = () => {
    setShareModalVisible(true);
    setEmails('');
    setShareMessage('');
  };

  const handleSendEmails = async () => {
    if (!emails.trim()) {
      Alert.alert('Error', 'Please enter at least one email address');
      return;
    }

    const emailList = emails.split(',').map(email => email.trim()).filter(email => email);
    
    if (emailList.length === 0) {
      Alert.alert('Error', 'Please enter valid email addresses');
      return;
    }

    setShareLoading(true);
    try {
      const response = await apiService.shareUploadLink(Number(id), {
        emails: emailList,
        message: shareMessage.trim() || undefined,
      });

      if (response.success) {
        Alert.alert('Success', `Upload link shared with ${emailList.length} recipient(s)`);
        setShareModalVisible(false);
      } else {
        Alert.alert('Error', response.message || 'Failed to share upload link');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to share upload link');
    } finally {
      setShareLoading(false);
    }
  };

  const handleToggleActive = async () => {
    if (!uploadLink) return;

    try {
      const response = await apiService.updateUploadLink(uploadLink.id, {
        is_active: !uploadLink.is_active
      });
      
      if (response.success) {
        setUploadLink(prev => prev ? { ...prev, is_active: !prev.is_active } : null);
      } else {
        Alert.alert('Error', response.message || 'Failed to update link');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update link');
    }
  };

  const handleDeleteLink = () => {
    if (!uploadLink) return;

    Alert.alert(
      'Delete Upload Link',
      `Are you sure you want to delete "${uploadLink.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiService.deleteUploadLink(uploadLink.id);
              if (response.success) {
                router.back();
              } else {
                Alert.alert('Error', response.message || 'Failed to delete link');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete link');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const renderFile = ({ item }: { item: UploadedFile }) => (
    <View style={styles.fileCard}>
      <View style={styles.fileHeader}>
        <View style={styles.fileIcon}>
          <Ionicons 
            name={item.file_type.includes('image') ? 'image' : 
                  item.file_type.includes('pdf') ? 'document' : 
                  'document-text'} 
            size={24} 
            color="#007AFF" 
          />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName}>{item.filename}</Text>
          <View style={styles.fileMetadata}>
            <Text style={styles.fileSize}>{formatFileSize(item.file_size)}</Text>
            <Text style={styles.fileSeparator}>•</Text>
            <Text style={styles.fileDate}>{formatDate(item.upload_date)}</Text>
          </View>
        </View>
      </View>
      {item.file_kind && (
        <View style={styles.fileBadge}>
          <Text style={styles.fileBadgeText}>{item.file_kind}</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Upload Link</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading upload link...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!uploadLink) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Upload Link</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Upload link not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const expired = isExpired(uploadLink.expires_at);
  const limitReached = uploadLink.max_uploads && uploadLink.upload_count >= uploadLink.max_uploads;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Upload Link</Text>
        <TouchableOpacity onPress={handleDeleteLink}>
          <Ionicons name="trash" size={24} color="#FF3B30" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={uploadLink.uploaded_files}
        renderItem={renderFile}
        keyExtractor={(item) => `file-${item.id}`}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#007AFF"
          />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Link Info */}
            <View style={styles.linkCard}>
              <View style={styles.linkHeader}>
                <Text style={styles.linkName}>{uploadLink.name}</Text>
                {(!uploadLink.is_active || expired || limitReached) && (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>
                      {!uploadLink.is_active ? 'Inactive' : 
                       expired ? 'Expired' : 
                       'Limit Reached'}
                    </Text>
                  </View>
                )}
              </View>
              
              {uploadLink.description && (
                <Text style={styles.linkDescription}>{uploadLink.description}</Text>
              )}

              <View style={styles.linkStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{uploadLink.upload_count}</Text>
                  <Text style={styles.statLabel}>
                    {uploadLink.max_uploads ? `of ${uploadLink.max_uploads} uploads` : 'uploads'}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {uploadLink.expires_at ? 
                      formatDate(uploadLink.expires_at).split(' ')[0] : 
                      '∞'
                    }
                  </Text>
                  <Text style={styles.statLabel}>
                    {uploadLink.expires_at ? 'expires on' : 'never expires'}
                  </Text>
                </View>
              </View>

              <Text style={styles.linkUrl}>{uploadLink.url}</Text>
            </View>

            {/* Actions */}
            <View style={styles.actionsCard}>
              <TouchableOpacity style={styles.actionButton} onPress={handleCopyLink}>
                <Ionicons name="copy" size={20} color="#007AFF" />
                <Text style={styles.actionText}>Copy Link</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionButton} onPress={handleShareLink}>
                <Ionicons name="share" size={20} color="#007AFF" />
                <Text style={styles.actionText}>Share</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionButton} onPress={handleEmailShare}>
                <Ionicons name="mail" size={20} color="#007AFF" />
                <Text style={styles.actionText}>Email</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionButton} onPress={handleToggleActive}>
                <Ionicons 
                  name={uploadLink.is_active ? "pause" : "play"} 
                  size={20} 
                  color={uploadLink.is_active ? "#FF9500" : "#34C759"} 
                />
                <Text style={[styles.actionText, { color: uploadLink.is_active ? "#FF9500" : "#34C759" }]}>
                  {uploadLink.is_active ? 'Deactivate' : 'Activate'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Files Header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Uploaded Files ({uploadLink.uploaded_files.length})</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cloud-upload" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No Files Uploaded</Text>
            <Text style={styles.emptyDescription}>
              Files uploaded through this link will appear here
            </Text>
          </View>
        }
      />

      {/* Email Share Modal */}
      <Modal
        visible={shareModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShareModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShareModalVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Share via Email</Text>
            <TouchableOpacity 
              onPress={handleSendEmails}
              disabled={shareLoading}
            >
              <Text style={[styles.modalSendText, shareLoading && styles.disabledText]}>
                {shareLoading ? 'Sending...' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Addresses (comma separated)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={emails}
                onChangeText={setEmails}
                placeholder="john@example.com, jane@example.com"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Custom Message (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={shareMessage}
                onChangeText={setShareMessage}
                placeholder="Add a personal message..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
  },
  listContainer: {
    padding: 16,
    flexGrow: 1,
  },
  linkCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  linkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  linkName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  linkDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  linkStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  linkUrl: {
    fontSize: 12,
    color: '#007AFF',
    backgroundColor: '#f0f8ff',
    padding: 8,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButton: {
    alignItems: 'center',
    padding: 8,
  },
  actionText: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 4,
    fontWeight: '500',
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  fileCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIcon: {
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  fileMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileSize: {
    fontSize: 12,
    color: '#666',
  },
  fileSeparator: {
    fontSize: 12,
    color: '#666',
    marginHorizontal: 8,
  },
  fileDate: {
    fontSize: 12,
    color: '#666',
  },
  fileBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 8,
  },
  fileBadgeText: {
    fontSize: 10,
    color: '#1976d2',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#666',
  },
  modalSendText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  disabledText: {
    color: '#ccc',
  },
  modalContent: {
    flex: 1,
    padding: 16,
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
  input: {
    backgroundColor: '#fff',
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
}); 