import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentViewer from '../../components/DocumentViewer';
import ExternalFilePicker from '../../components/ExternalFilePicker';
import LoadingDots from '../../components/LoadingDots';
import { apiClient } from '../../services/api';
import { ExternalFile } from '../../services/externalFileServices';
import { useFileStore } from '../../stores/fileStore';
import { removeFileExtension } from '../../utils/fileUtils';
import { useAuth } from '../context/auth';

interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'image' | 'other' | 'form';
  size: string;
  uploadDate: Date;
  status: 'processed' | 'processing' | 'error';
  tags: string[];
  category?: string;
  formData?: any; // Store original form data for form-specific actions
  responseCount?: number; // Number of responses for forms
}

interface ApiDocument {
  id: number;
  original_filename: string;
  filename?: string;
  file_size: number;
  file_type?: string;
  created_at: string;
  receipt_category?: string;
  file_path?: string;
  mime_type?: string;
  file_kind?: string;
}

type SortOption = 'name' | 'date' | 'size' | 'type';
type FilterOption = 'all' | 'documents' | 'receipts' | 'forms' | 'transcripts' | 'unknown';

export default function QuickFilesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { uploadFromGallery } = useFileStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadTime, setLastLoadTime] = useState<number>(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showExternalFilePicker, setShowExternalFilePicker] = useState(false);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  
  // Kebab menu state
  const [showKebabMenu, setShowKebabMenu] = useState(false);
  const [selectedDocumentForMenu, setSelectedDocumentForMenu] = useState<Document | null>(null);

  // Bookmark state
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [selectedBookmark, setSelectedBookmark] = useState<any>(null);

  // Status indicator state for recently completed files
  const [recentlyCompletedFiles, setRecentlyCompletedFiles] = useState<Set<string>>(new Set());

  // Cache for API responses to reduce loading time
  const [apiCache, setApiCache] = useState<{
    data: Document[];
    timestamp: number;
    searchQuery: string;
    filterBy: FilterOption;
  } | null>(null);

  const CACHE_DURATION = 30000; // 30 seconds cache
  const AUTO_REFRESH_INTERVAL = 60000; // Auto-refresh every 60 seconds

  const handleGalleryUpload = async () => {
    try {
      console.log('🖼️ Starting gallery upload from quick files screen...');
      
      const success = await uploadFromGallery();
      if (success) {
        Alert.alert('Success', 'Photos uploaded successfully!');
        // Refresh documents list
        loadDocuments(true); // Force refresh
      } else {
        // Get the error from the file store
        const fileStore = useFileStore.getState();
        const errorMessage = fileStore.error || 'Failed to upload photos. Please try again.';
        
        Alert.alert('Upload Failed', errorMessage, [
          { text: 'Try Again', onPress: () => handleGalleryUpload() },
          { text: 'Cancel', style: 'cancel' }
        ]);
      }
    } catch (error: any) {
      console.error('Gallery upload error:', error);
      Alert.alert('Error', error.message || 'Failed to upload photos. Please try again.');
    }
  };

  const getFileIcon = (type: string, status: string, category?: string) => {
    if (status === 'processing') return 'time-outline';
    if (status === 'error') return 'alert-circle-outline';
    
    // Handle form type specifically
    if (type === 'form') return 'clipboard-outline';
    
    // Use category-specific icons when available
    if (category) {
      switch (category.toLowerCase()) {
        case 'receipt':
        case 'receipts':
          return 'receipt-outline'; // Receipt-specific icon
        case 'form':
        case 'forms':
          return 'clipboard-outline'; // Form-specific icon (clipboard for forms)
        case 'document':
        case 'documents':
          return 'document-outline';
        case 'transcript':
        case 'transcripts':
          return 'mic-outline'; // Microphone icon for transcripts
        case 'unknown':
          return 'help-circle-outline';
      }
    }
    
    // Fallback to file type icons
    switch (type) {
      case 'pdf': return 'document-outline';
      case 'doc': return 'document-text-outline';
      case 'image': return 'image-outline';
      default: return 'document-outline';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed': return '#22c55e'; // Green for processed
      case 'processing': return '#f59e0b'; // Orange for processing
      case 'error': return '#ef4444'; // Red for error
      default: return '#64748b'; // Gray for unknown
    }
  };

  const getTypeColor = (type: string, category?: string) => {
    // Handle form type specifically
    if (type === 'form') return '#3b82f6'; // Blue for forms
    
    // Use category-specific colors when available
    if (category) {
      switch (category.toLowerCase()) {
        case 'receipt':
        case 'receipts':
          return '#10b981'; // Emerald green for receipts
        case 'form':
        case 'forms':
          return '#3b82f6'; // Blue for forms
        case 'document':
        case 'documents':
          return '#6366f1'; // Indigo for documents
        case 'transcript':
        case 'transcripts':
          return '#8b5cf6'; // Purple for transcripts
        case 'unknown':
          return '#64748b'; // Gray for unknown
      }
    }
    
    // Fallback to file type colors
    switch (type) {
      case 'pdf': return '#ef4444'; // Red for PDF
      case 'doc': return '#2563eb'; // Blue for documents
      case 'image': return '#059669'; // Green for images
      default: return '#64748b'; // Gray for others
    }
  };

  const normalizeCategory = (fileKind: string | null | undefined): string => {
    if (!fileKind) return 'unknown';
    
    const kind = fileKind.toLowerCase().trim();
    
    // Map backend file_kind values to frontend categories
    switch (kind) {
      case 'receipt':
      case 'receipts':
        return 'receipts';
      case 'form':
      case 'forms':
        return 'forms';
      case 'document':
      case 'documents':
        return 'documents';
      case 'transcript':
      case 'transcripts':
        return 'transcripts';
      default:
        return 'unknown';
    }
  };

  // Memoized filtered and sorted documents for better performance
  const filteredAndSortedDocuments = useMemo(() => {
    let filtered = documents;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc => 
        (doc.name?.toLowerCase() || '').includes(query) ||
        (doc.category?.toLowerCase() || '').includes(query) ||
        (doc.tags || []).some(tag => (tag?.toLowerCase() || '').includes(query))
      );
    }

    // Apply category filter
        if (filterBy !== 'all') {
      filtered = filtered.filter(doc => {
        const category = doc.category?.toLowerCase() || 'unknown';
          switch (filterBy) {
          case 'documents':
            return category === 'documents';
            case 'receipts':
            return category === 'receipts';
            case 'forms':
            return category === 'forms';
            case 'unknown':
            return category === 'unknown';
            default:
            return true;
          }
      });
        }
        
    // Apply sorting
    filtered.sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return (a.name || '').localeCompare(b.name || '');
          case 'date':
            return b.uploadDate.getTime() - a.uploadDate.getTime();
          case 'size':
          return parseInt(b.size) - parseInt(a.size);
          case 'type':
            return (a.type || '').localeCompare(b.type || '');
          default:
            return 0;
        }
      });

    return filtered;
  }, [documents, searchQuery, filterBy, sortBy]);

  // Optimized loadDocuments function with caching
  const loadDocuments = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    
    // Check cache first (unless force refresh)
    if (!forceRefresh && apiCache && 
        (now - apiCache.timestamp) < CACHE_DURATION &&
        apiCache.searchQuery === searchQuery &&
        apiCache.filterBy === filterBy) {
      setDocuments(apiCache.data);
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);
    
    try {
      // Test backend connectivity with timeout
      let connectivityTest;
      try {
        const connectivityPromise = apiClient.testConnectivity();
        const connectivityTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 5000)
        );
        
        connectivityTest = await Promise.race([connectivityPromise, connectivityTimeout]);
      } catch (error) {
        console.warn('Connectivity test failed, proceeding with data load:', error);
        connectivityTest = { success: false, message: 'Connection test failed' };
      }
      
      // Try to load data even if connectivity test fails
      let response;
      
      // If forms filter is selected, load recent forms instead of documents
      if (filterBy === 'forms') {
        try {
          console.log('📝 Loading recent forms for user...');
          const formsPromise = apiClient.getForms();
          const formsTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API timeout')), 10000)
          );
          
          response = await Promise.race([formsPromise, formsTimeout]);
          console.log('✅ Forms response:', response);
        } catch (err) {
          console.error('Forms endpoint failed:', err);
          throw err;
        }
      } else {
        try {
          // Try the new getDocuments method first with timeout
          const documentsPromise = apiClient.getDocuments();
          const documentsTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API timeout')), 10000)
          );
          
          response = await Promise.race([documentsPromise, documentsTimeout]);
        } catch (err) {
          console.warn('Documents endpoint failed, trying files endpoint:', err);
          try {
            const filesPromise = apiClient.getFiles(1, 50);
            const filesTimeout = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('API timeout')), 10000)
            );
            
            response = await Promise.race([filesPromise, filesTimeout]);
          } catch (fallbackErr) {
            console.error('Both endpoints failed:', fallbackErr);
            throw fallbackErr;
          }
        }
      }
      
      // Handle forms data differently from documents
      if (filterBy === 'forms') {
        const formsArray = (response as any).forms || (response as any).data || [];
        if (Array.isArray(formsArray)) {
          const mappedForms = formsArray.map((form: any) => {
            return {
              id: String(form.id),
              name: form.name || form.title || 'Untitled Form',
              type: 'form' as const,
              size: `Form • ${form.response_count || 0} responses`,
              uploadDate: new Date(form.created_at || form.updated_at),
              status: 'processed' as const,
              tags: [],
              category: 'forms' as const,
              formData: form, // Store original form data for form-specific actions
              responseCount: form.response_count || 0,
            };
          });
          
          setDocuments(mappedForms);
          setLastLoadTime(now);
          
          // Update cache
          setApiCache({
            data: mappedForms,
            timestamp: now,
            searchQuery,
            filterBy,
          });
        } else {
          setDocuments([]);
          setError('No forms found or API returned unexpected format.');
        }
      } else {
        // Handle documents data (non-forms)
        const docsArray = (response as any).data || (response as any).files || (response as any).documents || [];
        if (Array.isArray(docsArray)) {
          const mappedDocs = docsArray.map((doc: ApiDocument) => {
            const originalName = doc.original_filename || doc.filename || 'Untitled';
            return {
              id: String(doc.id),
              name: removeFileExtension(originalName),
              type: getFileTypeFromExtension(doc.original_filename || doc.filename),
              size: formatFileSize(doc.file_size),
              uploadDate: new Date(doc.created_at),
              status: 'processed' as const,
              tags: [],
              category: normalizeCategory(doc.file_kind),
            };
          });
          
          setDocuments(mappedDocs);
          setLastLoadTime(now);
          
          // Update cache
          setApiCache({
            data: mappedDocs,
            timestamp: now,
            searchQuery,
            filterBy,
          });
        } else {
          setDocuments([]);
          setError('No documents found or API returned unexpected format.');
        }
      }
    } catch (err: any) {
      console.error('Unexpected error in loadDocuments:', err);
      setDocuments([]);
      if (err.message?.includes('CORS') || err.message?.includes('Network error')) {
        setError(`Connection Error: ${err.message}`);
      } else {
        setError(`Failed to load documents: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterBy]); // Add dependencies

  const getFileTypeFromExtension = (filename: string | null | undefined): 'pdf' | 'doc' | 'image' | 'other' => {
    if (!filename || typeof filename !== 'string') {
      return 'other';
    }
    
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext || '')) return 'doc';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext || '')) return 'image';
    return 'other';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDocuments(true); // Force refresh
    setRefreshing(false);
  }, [loadDocuments]);

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user, loadDocuments]);

  // Monitor document status changes to show completion indicators
  useEffect(() => {
    documents.forEach(doc => {
      // If a document was previously processing and is now processed, mark it as recently completed
      if (doc.status === 'processed') {
        // For now, we'll assume all loaded documents are processed
        // In a real implementation, you'd track the previous status
        // This is a simplified version
      }
    });
  }, [documents]);

  // Auto-refresh documents periodically when user is authenticated
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      console.log('🔄 Auto-refreshing documents...');
      setIsAutoRefreshing(true);
      await loadDocuments(true); // Force refresh to bypass cache
      setTimeout(() => setIsAutoRefreshing(false), 1000); // Show indicator for 1 second
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [user, loadDocuments]);

  const handleDocumentPress = async (document: Document) => {
    if (document.status === 'processing') {
      Alert.alert('Document Processing', `"${document.name}" is still being processed. Please wait a few moments and try again.`);
      return;
    }

    // Remove green dot if file was recently completed
    if (document.status === 'processed' && recentlyCompletedFiles.has(document.id)) {
      setRecentlyCompletedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(document.id);
        return newSet;
      });
    }

    // If the document is a form (either by type or category), open form builder
    if (
      document.type === 'form' ||
      document.category?.toLowerCase() === 'form' ||
      document.category?.toLowerCase() === 'forms'
    ) {
      // For recent forms, we have the form data, so we can open the form builder with the form ID
      if (document.formData) {
        router.push(`/forms/builder?formId=${document.id}&formName=${encodeURIComponent(document.name)}`);
      } else {
        // For legacy form files, use fileId
        router.push(`/forms/builder?fileId=${document.id}`);
      }
      return;
    }

    // If the document is a transcript, show transcript viewer
    if (
      document.category?.toLowerCase() === 'transcript' ||
      document.category?.toLowerCase() === 'transcripts'
    ) {
      // For now, open in document viewer - can be enhanced later with transcript-specific viewer
      setSelectedDocument(document);
      setShowDocumentViewer(true);
      return;
    }

    setSelectedDocument(document);
    setShowDocumentViewer(true);
  };

  const handleKebabMenuPress = (document: Document, event: any) => {
    // Remove green dot if file was recently completed
    if (document.status === 'processed' && recentlyCompletedFiles.has(document.id)) {
      setRecentlyCompletedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(document.id);
        return newSet;
      });
    }

    setSelectedDocumentForMenu(document);
    setShowKebabMenu(true);
  };

  const handleViewDocument = () => {
    if (selectedDocumentForMenu) {
      setSelectedDocument(selectedDocumentForMenu);
      setShowDocumentViewer(true);
      setShowKebabMenu(false);
    }
  };

  const handleShareDocument = async () => {
    if (!selectedDocumentForMenu) return;

    try {
      const response = await apiClient.shareFile(parseInt(selectedDocumentForMenu.id));
      if (response.success) {
        Alert.alert('Success', 'Document shared successfully!');
      } else {
        Alert.alert('Error', response.message || 'Failed to share document');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to share document');
    }
    setShowKebabMenu(false);
  };

  const handleDeleteDocument = () => {
    if (!selectedDocumentForMenu) return;

    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${selectedDocumentForMenu.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiClient.deleteFile(parseInt(selectedDocumentForMenu.id));
              if (response.success) {
                setDocuments(prev => prev.filter(doc => doc.id !== selectedDocumentForMenu.id));
                Alert.alert('Success', 'Document deleted successfully!');
              } else {
                Alert.alert('Error', response.message || 'Failed to delete document');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete document');
            }
            setShowKebabMenu(false);
          },
        },
      ]
    );
  };

  const handleCloseKebabMenu = () => {
    setShowKebabMenu(false);
    setSelectedDocumentForMenu(null);
  };

  const handleViewFormResponses = () => {
    if (!selectedDocumentForMenu) return;
    
    // Navigate to form builder responses tab
    router.push(`/forms/builder?formId=${selectedDocumentForMenu.id}&formName=${encodeURIComponent(selectedDocumentForMenu.name)}&tab=responses`);
    setShowKebabMenu(false);
  };

  const handleChatDocument = () => {
    if (!selectedDocumentForMenu) return;
    
    router.push(`/(tabs)/chats?fileId=${selectedDocumentForMenu.id}`);
      setShowKebabMenu(false);
  };

  const loadBookmarks = async () => {
    try {
      const response = await apiClient.getBookmarks();
      if (response.success && response.data) {
        // Handle both response structures: data.bookmarks or data as array
        const bookmarksData = Array.isArray(response.data) 
          ? response.data 
          : (response.data.bookmarks || []);
        
        console.log('Bookmarks loaded:', bookmarksData.length);
        setBookmarks(bookmarksData);
      } else {
        console.log('Failed to load bookmarks:', response.message);
        // No fallback data needed, only load real data from backend db
        setBookmarks([]);
      }
    } catch (error) {
      console.log('Error loading bookmarks:', error);
      // No fallback data needed, only load real data from backend db
      setBookmarks([]);
    }
  };

  const handleAddToBookmark = async (bookmark: any) => {
    if (!selectedDocumentForMenu) return;

    try {
      const response = await apiClient.addFileToBookmark(bookmark.id, parseInt(selectedDocumentForMenu.id));
      if (response.success) {
        Alert.alert('Success', `"${selectedDocumentForMenu.name}" added to "${bookmark.name}"`);
        setShowBookmarkModal(false);
        setShowKebabMenu(false);
      } else {
        Alert.alert('Error', response.message || 'Failed to add file to bookmark');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add file to bookmark');
    }
  };

  const handleShowBookmarkModal = () => {
    loadBookmarks();
    setShowBookmarkModal(true);
    setShowKebabMenu(false);
  };

  const handleExternalFileImport = (file: ExternalFile) => {
    console.log('External file import:', file);
    // Handle external file import logic here
  };

  const handleImportSuccess = () => {
    loadDocuments(true);
    setShowExternalFilePicker(false);
  };

  const markFileAsRecentlyCompleted = (fileId: string) => {
    setRecentlyCompletedFiles(prev => new Set([...prev, fileId]));
    
    // Remove the green dot after 3 hours
    setTimeout(() => {
      setRecentlyCompletedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    }, 3 * 60 * 60 * 1000); // 3 hours in milliseconds
  };

  const shouldShowStatusIndicator = (document: Document) => {
    // Show for files that are currently processing
    if (document.status === 'processing') {
      return true;
    }
    
    // Show for files that recently completed processing
    if (document.status === 'processed' && recentlyCompletedFiles.has(document.id)) {
      return true;
    }
    
    return false;
  };

  const handleUploadFromFiles = () => {
    setShowUploadOptions(false);
    DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', 'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      multiple: true,
    }).then((result) => {
      if (!result.canceled && result.assets) {
        const fileStore = useFileStore.getState();
        
        const files = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
          size: asset.size,
        }));
        
        fileStore.uploadFiles(files).then((success) => {
          if (success) {
            Alert.alert('Success', 'Files uploaded successfully!');
            loadDocuments(true); // Refresh documents list
          }
        });
      }
    });
  };

  const handleUploadFromPhotos = () => {
    setShowUploadOptions(false);
    handleGalleryUpload();
  };

  const handleUploadFromDropbox = () => {
    setShowUploadOptions(false);
    setShowExternalFilePicker(true);
  };

  const handleUploadFromGoogleDrive = () => {
    setShowUploadOptions(false);
    setShowExternalFilePicker(true);
  };

  const renderDocument = ({ item }: { item: Document }) => (
    <TouchableOpacity
      style={styles.documentItem}
      onPress={() => handleDocumentPress(item)}
      onLongPress={(event) => handleKebabMenuPress(item, event)}
    >
      <View style={styles.documentIcon}>
          <Ionicons 
            name={getFileIcon(item.type, item.status, item.category) as any} 
            size={24} 
          color={getTypeColor(item.type, item.category)} 
          />
        </View>
      
        <View style={styles.documentInfo}>
        <Text style={styles.documentName} numberOfLines={2}>
            {item.name}
          </Text>
        <Text style={styles.documentMeta}>
          {item.size} • {item.uploadDate.toLocaleDateString()}
            </Text>
        </View>
        
        {/* Kebab Menu Button */}
        <TouchableOpacity
          style={styles.kebabButton}
          onPress={(event) => {
            event.stopPropagation();
            handleKebabMenuPress(item, event);
          }}
        >
          <Ionicons name="ellipsis-vertical" size={20} color="#666" />
        </TouchableOpacity>
        
      {shouldShowStatusIndicator(item) && (
        <View style={styles.documentActions}>
          <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(item.status) }]} />
        </View>
      )}
    </TouchableOpacity>
  );

  const FilterButton = ({ option, label }: { option: FilterOption; label: string }) => (
    <TouchableOpacity
      style={[styles.filterButton, filterBy === option && styles.filterButtonActive]}
      onPress={() => setFilterBy(option)}
    >
      <Text style={[styles.filterButtonText, filterBy === option && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  // Loading state with bouncing dots
  if (loading && documents.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Quick Files</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerButton}>
              <Ionicons name="cloud-upload" size={24} color="#007AFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton}>
              <Ionicons name="cloud-download" size={24} color="#10B981" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton}>
              <Ionicons name="camera" size={24} color="#007AFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton}>
              <Ionicons name="images" size={24} color="#5856D6" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.loadingContainer}>
          <LoadingDots size={12} color="#007AFF" duration={800} />
          <Text style={styles.loadingText}>Loading your quick files...</Text>
          <Text style={styles.loadingSubtext}>This will only take a moment</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Error message display */}
      {error && (
        <View style={{ backgroundColor: '#fee2e2', padding: 12, margin: 12, borderRadius: 8 }}>
          <Text style={{ color: '#b91c1c', fontWeight: 'bold' }}>{error}</Text>
        </View>
      )}
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Quick Files</Text>
          {isAutoRefreshing && (
            <View style={styles.autoRefreshIndicator}>
              <Ionicons name="sync" size={16} color="#007AFF" />
              <Text style={styles.autoRefreshText}>Syncing...</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => setShowUploadOptions(true)}
          >
            <Ionicons name="cloud-upload" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => setShowExternalFilePicker(true)}
          >
            <Ionicons name="cloud-download" size={24} color="#10B981" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => router.push('/scanner' as any)}
          >
            <Ionicons name="camera" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={handleGalleryUpload}
          >
            <Ionicons name="images" size={24} color="#5856D6" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.headerButton, refreshing && styles.refreshingButton]}
            onPress={onRefresh}
            disabled={refreshing}
          >
            <Ionicons 
              name="refresh" 
              size={24} 
              color={refreshing ? "#999" : "#007AFF"} 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search quick files, tags, or categories..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { option: 'all' as FilterOption, label: 'All' },
            { option: 'documents' as FilterOption, label: 'Documents' },
            { option: 'receipts' as FilterOption, label: 'Receipts' },
            { option: 'forms' as FilterOption, label: 'Forms' },
            { option: 'transcripts' as FilterOption, label: 'Transcripts' },
            { option: 'unknown' as FilterOption, label: 'Unknown' },
          ]}
          renderItem={({ item }) => (
            <FilterButton option={item.option} label={item.label} />
          )}
          keyExtractor={(item) => item.option}
          contentContainerStyle={styles.filtersContent}
        />
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            Alert.alert('Sort Options', 'Choose sorting option:', [
              { text: 'Name', onPress: () => setSortBy('name') },
              { text: 'Date', onPress: () => setSortBy('date') },
              { text: 'Size', onPress: () => setSortBy('size') },
              { text: 'Type', onPress: () => setSortBy('type') },
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
        >
          <Text style={styles.sortButtonText}>
            {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Quick Files List */}
      <FlatList
        data={filteredAndSortedDocuments}
        renderItem={renderDocument}
        keyExtractor={(item) => item.id}
        style={styles.documentsList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No quick files match your search' : 'No quick files yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery 
                ? 'Try adjusting your search terms or filters to find what you\'re looking for' 
                : 'Start by uploading your first file using the upload button above'
              }
            </Text>
            {!searchQuery && (
              <TouchableOpacity 
                style={styles.uploadButton}
                onPress={() => setShowUploadOptions(true)}
              >
                <Ionicons name="cloud-upload" size={20} color="#fff" />
                <Text style={styles.uploadButtonText}>Upload File</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

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

      {/* External File Picker */}
      <ExternalFilePicker
        visible={showExternalFilePicker}
        onClose={() => setShowExternalFilePicker(false)}
        onFileImport={handleExternalFileImport}
        onImportSuccess={handleImportSuccess}
      />

      {/* Upload Options Modal */}
      <Modal
        visible={showUploadOptions}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowUploadOptions(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUploadOptions(false)}
        >
          <View style={styles.uploadOptionsContainer}>
            <View style={styles.uploadOptionsHeader}>
              <Text style={styles.uploadOptionsTitle}>Upload Document</Text>
              <TouchableOpacity onPress={() => setShowUploadOptions(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.uploadOptionsContent}>
              <TouchableOpacity
                style={styles.uploadOption}
                onPress={handleUploadFromFiles}
              >
                <View style={[styles.uploadOptionIcon, { backgroundColor: '#007AFF' }]}>
                  <Ionicons name="document" size={24} color="#fff" />
                </View>
                <View style={styles.uploadOptionText}>
                  <Text style={styles.uploadOptionTitle}>Files</Text>
                  <Text style={styles.uploadOptionSubtitle}>Upload from your device</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.uploadOption}
                onPress={handleUploadFromPhotos}
              >
                <View style={[styles.uploadOptionIcon, { backgroundColor: '#5856D6' }]}>
                  <Ionicons name="images" size={24} color="#fff" />
                </View>
                <View style={styles.uploadOptionText}>
                  <Text style={styles.uploadOptionTitle}>Photos</Text>
                  <Text style={styles.uploadOptionSubtitle}>Upload from your photo gallery</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.uploadOption}
                onPress={handleUploadFromDropbox}
              >
                <View style={[styles.uploadOptionIcon, { backgroundColor: '#0061FF' }]}>
                  <Ionicons name="logo-dropbox" size={24} color="#fff" />
                </View>
                <View style={styles.uploadOptionText}>
                  <Text style={styles.uploadOptionTitle}>Dropbox</Text>
                  <Text style={styles.uploadOptionSubtitle}>Import from Dropbox</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.uploadOption}
                onPress={handleUploadFromGoogleDrive}
              >
                <View style={[styles.uploadOptionIcon, { backgroundColor: '#4285F4' }]}>
                  <Ionicons name="logo-google" size={24} color="#fff" />
                </View>
                <View style={styles.uploadOptionText}>
                  <Text style={styles.uploadOptionTitle}>Google Drive</Text>
                  <Text style={styles.uploadOptionSubtitle}>Import from Google Drive</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Kebab Menu Modal */}
      <Modal
        visible={showKebabMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseKebabMenu}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseKebabMenu}
        >
          <View style={styles.kebabMenuContainer}>
            <TouchableOpacity
              style={styles.kebabMenuItem}
              onPress={handleViewDocument}
            >
              <Ionicons name="eye-outline" size={20} color="#007AFF" />
              <Text style={styles.kebabMenuText}>View</Text>
            </TouchableOpacity>
            
            {/* Show View Responses option for forms */}
            {selectedDocumentForMenu?.type === 'form' && (
              <TouchableOpacity
                style={styles.kebabMenuItem}
                onPress={handleViewFormResponses}
              >
                <Ionicons name="clipboard-outline" size={20} color="#8B5CF6" />
                <Text style={styles.kebabMenuText}>View Responses</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.kebabMenuItem}
              onPress={handleShareDocument}
            >
              <Ionicons name="share-outline" size={20} color="#10B981" />
              <Text style={styles.kebabMenuText}>Share</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.kebabMenuItem}
              onPress={() => {
                console.log('🗑️ Delete button pressed in kebab menu');
                handleDeleteDocument();
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.kebabMenuText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.kebabMenuItem}
              onPress={handleChatDocument}
            >
              <Ionicons name="chatbubble-outline" size={20} color="#4F46E5" />
              <Text style={styles.kebabMenuText}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.kebabMenuItem}
              onPress={handleShowBookmarkModal}
            >
              <Ionicons name="bookmark-outline" size={20} color="#FF9500" />
              <Text style={styles.kebabMenuText}>Add to Bookmark</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bookmark Selection Modal */}
      <Modal
        visible={showBookmarkModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBookmarkModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowBookmarkModal(false)}
        >
          <View style={styles.bookmarkModalContainer}>
            <View style={styles.bookmarkModalHeader}>
              <Text style={styles.bookmarkModalTitle}>Add to Bookmark</Text>
              <TouchableOpacity
                onPress={() => setShowBookmarkModal(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.bookmarkList}>
              {bookmarks.map((bookmark) => (
                <TouchableOpacity
                  key={bookmark.id}
                  style={styles.bookmarkItem}
                  onPress={() => handleAddToBookmark(bookmark)}
                >
                  <View style={[styles.bookmarkColor, { backgroundColor: bookmark.color }]} />
                  <Text style={styles.bookmarkName}>{bookmark.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
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
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  autoRefreshIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  autoRefreshText: {
    fontSize: 12,
    color: '#007AFF',
    marginLeft: 4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  refreshingButton: {
    opacity: 0.5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  filtersContainer: {
    marginTop: 16,
  },
  filtersContent: {
    paddingHorizontal: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  sortButtonText: {
    fontSize: 14,
    color: '#333',
    marginRight: 4,
  },
  documentsList: {
    flex: 1,
    paddingHorizontal: 12,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  documentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  documentMeta: {
    fontSize: 11,
    color: '#666',
  },
  documentActions: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 8,
    marginRight: 8,
  },
  statusIndicator: {
    width: '100%',
    height: '100%',
    borderRadius: 5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    maxWidth: 250,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  uploadButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  // Kebab menu styles
  kebabButton: {
    padding: 6,
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kebabMenuContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  kebabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  kebabMenuText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    fontWeight: '500',
  },
  // Upload options modal styles
  uploadOptionsContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  uploadOptionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  uploadOptionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  uploadOptionsContent: {
    padding: 16,
  },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  uploadOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  uploadOptionText: {
    flex: 1,
    marginRight: 10,
  },
  uploadOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  uploadOptionSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  // Bookmark modal styles
  bookmarkModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  bookmarkModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  bookmarkModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  bookmarkList: {
    padding: 16,
  },
  bookmarkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  bookmarkColor: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 12,
  },
  bookmarkName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
}); 