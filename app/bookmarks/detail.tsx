import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DocumentViewer from '../../components/DocumentViewer';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';
import { formatTimestampToLocal } from '../../utils/timeFormatting';
import { useAuth } from '../context/auth';

interface Bookmark {
  id: number;
  name: string;
  description?: string;
  color: string;
  file_count: number;
  is_active: boolean;
}

interface Document {
  id: string;
  name: string;
  type: string;
  category?: string;
  size?: string;
  created_at: string;
  status: string;
}

export default function BookmarkDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  
  const [bookmark, setBookmark] = useState<Bookmark | null>(null);
  const [files, setFiles] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddFilesModal, setShowAddFilesModal] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<Document[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loadingAvailableFiles, setLoadingAvailableFiles] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  
  // Edit form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('#007AFF');
  
  const bookmarkColors = [
    '#007AFF', '#34C759', '#FF9500', '#FF3B30', 
    '#AF52DE', '#5856D6', '#8E44AD', '#E74C3C'
  ];

  const bookmarkId = params.id ? parseInt(params.id as string) : null;

  useEffect(() => {
    if (bookmarkId) {
      loadBookmarkDetails();
    }
  }, [bookmarkId]);

  const loadBookmarkDetails = async () => {
    if (!bookmarkId) return;
    
    try {
      setLoading(true);
      
      // Load bookmark info and files in parallel
      console.log(`📁 Loading bookmark details for ID: ${bookmarkId}`);
      const [bookmarkResponse, filesResponse] = await Promise.all([
        apiClient.getBookmarks(),
        apiClient.getBookmarkFiles(bookmarkId)
      ]);
      
      console.log(`📁 Bookmark response:`, bookmarkResponse);
      console.log(`📁 Files response:`, filesResponse);
      
      if (bookmarkResponse.success && bookmarkResponse.data) {
        const bookmarksData = Array.isArray(bookmarkResponse.data) 
          ? bookmarkResponse.data 
          : (bookmarkResponse.data.bookmarks || []);
        
        const foundBookmark = bookmarksData.find((b: Bookmark) => b.id === bookmarkId);
        if (foundBookmark) {
          setBookmark(foundBookmark);
          setEditName(foundBookmark.name);
          setEditDescription(foundBookmark.description || '');
          setEditColor(foundBookmark.color);
        }
      }
      
      if (filesResponse.success && filesResponse.data) {
        const filesData = filesResponse.data;
        console.log(`📁 Bookmark files loaded:`, filesData);
        
        // Map backend field names to frontend interface
        const mappedFiles = filesData.map((file: any) => ({
          id: file.id.toString(),
          name: file.filename || file.original_filename || 'Unknown file',
          type: file.file_type || file.file_kind || 'document',
          category: file.file_kind || file.file_type,
          size: file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : undefined,
          created_at: file.created_at,
          status: 'processed' // Assume processed for bookmark files
        }));
        
        setFiles(mappedFiles);
      }
      
    } catch (error) {
      console.error('Failed to load bookmark details:', error);
      Alert.alert('Error', 'Failed to load bookmark details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBookmarkDetails();
  };

  const handleEditBookmark = async () => {
    if (!bookmark || !editName.trim()) {
      Alert.alert('Error', 'Bookmark name is required');
      return;
    }

    try {
      const response = await apiClient.updateBookmark(bookmark.id, {
        name: editName.trim(),
        description: editDescription.trim(),
        color: editColor
      });

      if (response.success) {
        setBookmark(prev => prev ? {
          ...prev,
          name: editName.trim(),
          description: editDescription.trim(),
          color: editColor
        } : null);
        setShowEditModal(false);
        Alert.alert('Success', 'Bookmark updated successfully');
      } else {
        Alert.alert('Error', response.message || 'Failed to update bookmark');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update bookmark');
    }
  };

  const handleDeleteBookmark = () => {
    if (!bookmark) return;

    Alert.alert(
      'Delete Bookmark',
      `Are you sure you want to delete "${bookmark.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiClient.deleteBookmark(bookmark.id);
              if (response.success) {
                Alert.alert('Success', 'Bookmark deleted successfully', [
                  { text: 'OK', onPress: () => router.back() }
                ]);
              } else {
                Alert.alert('Error', response.message || 'Failed to delete bookmark');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete bookmark');
            }
          }
        }
      ]
    );
  };

  const handleRemoveFile = (fileId: string) => {
    if (!bookmark) return;

    Alert.alert(
      'Remove File',
      'Are you sure you want to remove this file from the bookmark?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiClient.removeFileFromBookmark(bookmark.id, parseInt(fileId));
              if (response.success) {
                setFiles(prev => prev.filter(f => f.id !== fileId));
                setBookmark(prev => prev ? { ...prev, file_count: prev.file_count - 1 } : null);
                Alert.alert('Success', 'File removed from bookmark');
              } else {
                Alert.alert('Error', response.message || 'Failed to remove file');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove file');
            }
          }
        }
      ]
    );
  };

  const loadAvailableFiles = async () => {
    try {
      setLoadingAvailableFiles(true);
      console.log('📁 Starting to load available files...');
      let allFiles: any[] = [];
      let page = 1;
      const perPage = 100;
      let hasMore = true;
      
      // Load files in batches until we get all files
      while (hasMore) {
        const response = await apiClient.getFiles(page, perPage);
        console.log(`📁 API Response for page ${page}:`, response);
        
        if (response.success && response.files) {
          const filesData = response.files;
          console.log(`📁 Found ${filesData.length} files on page ${page}`);
          console.log(`📁 Sample file data:`, filesData[0]);
          
          allFiles = allFiles.concat(filesData);
          
          // Check if we have more files to load
          // If we got fewer files than perPage, we've reached the end
          hasMore = filesData.length === perPage;
          page++;
        } else {
          console.log('📁 No more files or error:', response);
          hasMore = false;
        }
      }
      
      // Map backend field names to frontend interface
      const mappedFiles = allFiles.map((file: any) => ({
        id: file.id.toString(),
        name: file.filename || file.original_filename || 'Unknown file',
        type: file.file_type || file.file_kind || 'document',
        category: file.file_kind || file.file_type,
        size: file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : undefined,
        created_at: file.created_at,
        status: 'processed' // Assume processed for available files
      }));
      
      // Filter out files that are already in the bookmark
      const bookmarkFileIds = new Set(files.map(f => f.id));
      const available = mappedFiles.filter((f: Document) => !bookmarkFileIds.has(f.id));
      setAvailableFiles(available);
      console.log(`📁 Total files loaded: ${allFiles.length}`);
      console.log(`📁 Files already in bookmark: ${bookmarkFileIds.size}`);
      console.log(`📁 Available files for bookmark: ${available.length}`);
      console.log(`📁 Available files:`, available);
    } catch (error) {
      console.error('Failed to load available files:', error);
      Alert.alert('Error', 'Failed to load available files');
    } finally {
      setLoadingAvailableFiles(false);
    }
  };

  const handleShowAddFilesModal = () => {
    console.log('📁 Opening add files modal...');
    loadAvailableFiles();
    setShowAddFilesModal(true);
  };

  const handleAddSelectedFiles = async () => {
    if (!bookmark || selectedFiles.size === 0) return;

    try {
      const fileIds = Array.from(selectedFiles).map(id => parseInt(id));
      const response = await apiClient.addFilesToBookmark(bookmark.id, fileIds);
      
      if (response.success) {
        // Reload bookmark details to get updated file list
        await loadBookmarkDetails();
        setSelectedFiles(new Set());
        setShowAddFilesModal(false);
        Alert.alert('Success', `${fileIds.length} file(s) added to bookmark`);
      } else {
        Alert.alert('Error', response.message || 'Failed to add files');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add files');
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: themeColors.textSecondary,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: themeColors.text,
      marginTop: 16,
      marginBottom: 24,
    },
    backButton: {
      backgroundColor: '#007AFF',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    backButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: themeColors.headerBackground || themeColors.card,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: themeColors.text,
      flex: 1,
      marginHorizontal: 16,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerIconButton: {
      padding: 4,
    },
    bookmarkInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: themeColors.card,
      marginBottom: 8,
    },
    colorIndicator: {
      width: 16,
      height: 16,
      borderRadius: 8,
      marginRight: 12,
    },
    bookmarkDetails: {
      flex: 1,
    },
    bookmarkName: {
      fontSize: 20,
      fontWeight: '600',
      color: themeColors.text,
      marginBottom: 4,
    },
    bookmarkDescription: {
      fontSize: 14,
      color: themeColors.textSecondary,
      marginBottom: 4,
    },
    fileCount: {
      fontSize: 14,
      color: '#007AFF',
      fontWeight: '500',
    },
    filesList: {
      flex: 1,
      paddingHorizontal: 16,
    },
    fileItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: themeColors.card,
      borderRadius: 8,
      marginBottom: 8,
    },
    availableFileItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: themeColors.card,
      borderRadius: 8,
      marginBottom: 8,
    },
    selectedFileItem: {
      backgroundColor: themeColors.surface,
      borderWidth: 1,
      borderColor: '#007AFF',
    },
    fileInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    fileDetails: {
      marginLeft: 12,
      flex: 1,
    },
    fileName: {
      fontSize: 16,
      fontWeight: '500',
      color: themeColors.text,
      marginBottom: 2,
    },
    fileMeta: {
      fontSize: 14,
      color: themeColors.textSecondary,
    },
    fileTimestamp: {
      fontSize: 12,
      color: themeColors.textSecondary,
      marginTop: 2,
    },
    removeButton: {
      padding: 4,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 48,
    },
    emptyStateTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: themeColors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyStateDescription: {
      fontSize: 14,
      color: themeColors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 32,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: themeColors.card,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: themeColors.text,
    },
    modalCancelButton: {
      fontSize: 16,
      color: '#007AFF',
    },
    modalSaveButton: {
      fontSize: 16,
      fontWeight: '600',
      color: '#007AFF',
    },
    disabledButton: {
      color: themeColors.textLight,
    },
    modalContent: {
      padding: 16,
    },
    inputGroup: {
      marginBottom: 24,
    },
    inputLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: themeColors.text,
      marginBottom: 8,
    },
    textInput: {
      borderWidth: 1,
      borderColor: themeColors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      backgroundColor: themeColors.surface,
      color: themeColors.text,
    },
    textArea: {
      height: 80,
      textAlignVertical: 'top',
    },
    colorPicker: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    colorOption: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    selectedColor: {
      borderColor: themeColors.text,
    },
    availableFilesList: {
      flex: 1,
      paddingHorizontal: 16,
    },
  }), [themeColors]);

  const handleFilePress = async (file: Document) => {
    setSelectedDocument(file);
    setShowDocumentViewer(true);
  };

  const renderFileItem = ({ item }: { item: Document }) => (
    <TouchableOpacity 
      style={dynamicStyles.fileItem}
      onPress={() => handleFilePress(item)}
      activeOpacity={0.7}
    >
      <View style={dynamicStyles.fileInfo}>
        <Ionicons 
          name={item.type === 'form' ? 'document-text' : 'document'} 
          size={24} 
          color="#007AFF" 
        />
        <View style={dynamicStyles.fileDetails}>
          <Text style={dynamicStyles.fileName} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
          <Text style={dynamicStyles.fileMeta}>
            {item.category || item.type} • {item.size || 'No size info'}
          </Text>
          {item.created_at && (
            <Text style={dynamicStyles.fileTimestamp}>
              {formatTimestampToLocal(item.created_at)}
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={dynamicStyles.removeButton}
        onPress={(e) => {
          e.stopPropagation();
          handleRemoveFile(item.id);
        }}
      >
        <Ionicons name="close-circle" size={24} color="#FF3B30" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderAvailableFileItem = ({ item }: { item: Document }) => (
    <TouchableOpacity
      style={[
        dynamicStyles.availableFileItem,
        selectedFiles.has(item.id) && dynamicStyles.selectedFileItem
      ]}
      onPress={() => toggleFileSelection(item.id)}
    >
      <View style={dynamicStyles.fileInfo}>
        <Ionicons 
          name={item.type === 'form' ? 'document-text' : 'document'} 
          size={24} 
          color="#007AFF" 
        />
        <View style={dynamicStyles.fileDetails}>
          <Text style={dynamicStyles.fileName} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
          <Text style={dynamicStyles.fileMeta}>
            {item.category || item.type} • {item.size || 'No size info'}
          </Text>
          {item.created_at && (
            <Text style={dynamicStyles.fileTimestamp}>
              {formatTimestampToLocal(item.created_at)}
            </Text>
          )}
        </View>
      </View>
      {selectedFiles.has(item.id) && (
        <Ionicons name="checkmark-circle" size={24} color="#34C759" />
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={dynamicStyles.loadingText}>Loading bookmark...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!bookmark) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.errorContainer}>
          <Ionicons name="bookmark-outline" size={64} color={themeColors.textLight} />
          <Text style={dynamicStyles.errorTitle}>Bookmark not found</Text>
          <TouchableOpacity style={dynamicStyles.backButton} onPress={() => router.back()}>
            <Text style={dynamicStyles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle} numberOfLines={1}>{bookmark.name}</Text>
        <View style={dynamicStyles.headerActions}>
          <TouchableOpacity onPress={handleShowAddFilesModal} style={dynamicStyles.headerIconButton}>
            <Ionicons name="add" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowEditModal(true)} style={dynamicStyles.headerIconButton}>
            <Ionicons name="create-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteBookmark} style={dynamicStyles.headerIconButton}>
            <Ionicons name="trash-outline" size={24} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={dynamicStyles.bookmarkInfo}>
        <View style={[dynamicStyles.colorIndicator, { backgroundColor: bookmark.color }]} />
        <View style={dynamicStyles.bookmarkDetails}>
          <Text style={dynamicStyles.bookmarkName}>{bookmark.name}</Text>
          {bookmark.description && (
            <Text style={dynamicStyles.bookmarkDescription}>{bookmark.description}</Text>
          )}
          <Text style={dynamicStyles.fileCount}>{bookmark.file_count} file(s)</Text>
        </View>
      </View>

      <FlatList
        data={files}
        renderItem={renderFileItem}
        keyExtractor={(item) => item.id}
        style={dynamicStyles.filesList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={dynamicStyles.emptyState}>
            <Ionicons name="document-outline" size={48} color={themeColors.textLight} />
            <Text style={dynamicStyles.emptyStateTitle}>No files in this bookmark</Text>
            <Text style={dynamicStyles.emptyStateDescription}>
              Add files to organize them in this bookmark
            </Text>
          </View>
        }
      />

      {/* Edit Bookmark Modal */}
      <Modal visible={showEditModal} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={dynamicStyles.modalContainer} edges={['left', 'right', 'bottom']}>
          <View style={[dynamicStyles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <Text style={dynamicStyles.modalCancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={dynamicStyles.modalTitle}>Edit Bookmark</Text>
            <TouchableOpacity onPress={handleEditBookmark}>
              <Text style={dynamicStyles.modalSaveButton}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={dynamicStyles.modalContent}>
            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.inputLabel}>Name</Text>
              <TextInput
                style={dynamicStyles.textInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Bookmark name"
                placeholderTextColor={themeColors.textLight}
                maxLength={50}
              />
            </View>

            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.inputLabel}>Description</Text>
              <TextInput
                style={[dynamicStyles.textInput, dynamicStyles.textArea]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Optional description"
                placeholderTextColor={themeColors.textLight}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>

            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.inputLabel}>Color</Text>
              <View style={dynamicStyles.colorPicker}>
                {bookmarkColors.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      dynamicStyles.colorOption,
                      { backgroundColor: color },
                      editColor === color && dynamicStyles.selectedColor
                    ]}
                    onPress={() => setEditColor(color)}
                  />
                ))}
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Add Files Modal */}
      <Modal visible={showAddFilesModal} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={dynamicStyles.modalContainer} edges={['left', 'right', 'bottom']}>
          <View style={[dynamicStyles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => {
              setShowAddFilesModal(false);
              setSelectedFiles(new Set());
            }}>
              <Text style={dynamicStyles.modalCancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={dynamicStyles.modalTitle}>Add Files</Text>
            <TouchableOpacity 
              onPress={handleAddSelectedFiles}
              disabled={selectedFiles.size === 0}
            >
              <Text style={[
                dynamicStyles.modalSaveButton,
                selectedFiles.size === 0 && dynamicStyles.disabledButton
              ]}>
                Add ({selectedFiles.size})
              </Text>
            </TouchableOpacity>
          </View>

           {loadingAvailableFiles ? (
             <View style={dynamicStyles.loadingContainer}>
               <ActivityIndicator size="large" color="#007AFF" />
               <Text style={dynamicStyles.loadingText}>Loading your files...</Text>
             </View>
           ) : (
             <FlatList
               data={availableFiles}
               renderItem={renderAvailableFileItem}
               keyExtractor={(item) => item.id}
               style={dynamicStyles.availableFilesList}
               ListEmptyComponent={
                 <View style={dynamicStyles.emptyState}>
                   <Ionicons name="document-outline" size={48} color={themeColors.textLight} />
                   <Text style={dynamicStyles.emptyStateTitle}>No available files</Text>
                   <Text style={dynamicStyles.emptyStateDescription}>
                     All your files are already in this bookmark
                   </Text>
                 </View>
               }
             />
           )}
        </SafeAreaView>
      </Modal>

      {/* Document Viewer */}
      {showDocumentViewer && selectedDocument && (
        <DocumentViewer
          fileId={selectedDocument.id}
          fileName={selectedDocument.name}
          fileType={selectedDocument.type}
          fileCategory={selectedDocument.category}
          onClose={() => {
            setShowDocumentViewer(false);
            setSelectedDocument(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

