import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../../constants/Config';
import { apiClient } from '../../services/api';
import { useAuth } from '../context/auth';

interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'image' | 'other';
  size: string;
  uploadDate: Date;
  status: 'processed' | 'processing' | 'error';
  tags: string[];
  category?: string;
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
type FilterOption = 'all' | 'documents' | 'receipts' | 'forms' | 'unknown';

export default function DocumentsScreen() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showOptionsModal, setShowOptionsModal] = useState(false);

  const getFileIcon = (type: string, status: string, category?: string) => {
    if (status === 'processing') return 'time-outline';
    if (status === 'error') return 'alert-circle-outline';
    
    // Use category-specific icons when available
    if (category) {
      switch (category.toLowerCase()) {
        case 'receipt':
        case 'receipts':
          return 'receipt-outline'; // Receipt-specific icon
        case 'form':
        case 'forms':
          return 'document-text-outline'; // Form-specific icon
        case 'document':
        case 'documents':
          return 'document-outline';
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
      case 'unknown':
      case '':
        return 'unknown';
      default:
        // If it's not a recognized category, default to documents
        return 'documents';
    }
  };

  const filteredAndSortedDocuments = documents
    .filter(doc => {
      // Search filter
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           doc.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
                           (doc.category?.toLowerCase().includes(searchQuery.toLowerCase()) || false);
      
      // File kind filter with proper category mapping
      let matchesFilter = true;
      if (filterBy !== 'all') {
        switch (filterBy) {
          case 'receipts':
            matchesFilter = doc.category?.toLowerCase() === 'receipt' || doc.category?.toLowerCase() === 'receipts';
            break;
          case 'forms':
            matchesFilter = doc.category?.toLowerCase() === 'form' || doc.category?.toLowerCase() === 'forms';
            break;
          case 'documents':
            matchesFilter = doc.category?.toLowerCase() === 'document' || doc.category?.toLowerCase() === 'documents';
            break;
          case 'unknown':
            matchesFilter = !doc.category || 
                          doc.category === '' ||
                          doc.category.toLowerCase() === 'unknown';
            break;
          default:
            matchesFilter = true;
        }
      }
      
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
          return b.uploadDate.getTime() - a.uploadDate.getTime();
        case 'size':
          return parseFloat(b.size) - parseFloat(a.size);
        case 'type':
          return a.type.localeCompare(b.type);
        default:
          return 0;
      }
    });

  const loadDocuments = async () => {
    try {
      setLoading(true);
      console.log('📂 Loading documents with filters:', { searchQuery, filterBy });
      
      // Map filter option to the expected backend parameter
      const categoryFilter = filterBy === 'all' ? undefined : filterBy;
      console.log('📂 Sending category filter:', categoryFilter);
      
      const response = await apiClient.getFiles(1, 50, searchQuery || undefined, categoryFilter);
      //console.log('📂 Documents API response:', response);
      
      if (response.success) {
        // Handle different response structures
        let files: ApiDocument[] = [];
        
        if (response.files && Array.isArray(response.files)) {
          files = response.files;
        } else if (response.data && Array.isArray(response.data.files)) {
          files = response.data.files;
        } else if (response.data && Array.isArray(response.data)) {
          files = response.data;
        } else {
          console.warn('📂 Unexpected response structure:', response);
        }
        
        console.log('📂 Found files:', files.length);
        
        const transformedDocs: Document[] = files.map((file: ApiDocument) => ({
          id: file.id.toString(),
          name: file.original_filename || 'Unknown File',
          type: getFileTypeFromExtension(file.original_filename || ''),
          size: formatFileSize(file.file_size || 0),
          uploadDate: new Date(file.created_at),
          status: 'processed', // Assume processed for now
          tags: file.receipt_category ? [file.receipt_category] : [],
          category: normalizeCategory(file.file_kind), // Normalize category for consistent display
        }));
        
        console.log('📂 Sample transformed document:', transformedDocs[0]);
        console.log('📂 All categories found:', [...new Set(transformedDocs.map(d => d.category))]);
        
        console.log('📂 Transformed documents:', transformedDocs.length);
        setDocuments(transformedDocs);
      } else {
        console.warn('📂 API call failed:', response);
        setDocuments([]);
      }
    } catch (error) {
      console.error('📂 Failed to load documents:', error);
      Alert.alert('Error', 'Failed to load documents. Please try again.');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDocuments();
    setRefreshing(false);
  };

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user, searchQuery, filterBy]);

  const handleDocumentPress = (document: Document) => {
    if (document.status === 'processing') {
      Alert.alert('Document Processing', `"${document.name}" is still being processed. Please wait a few moments and try again.`);
      return;
    }
    
    setSelectedDocument(document);
    setShowOptionsModal(true);
  };

  const handleViewDocument = async () => {
    setShowOptionsModal(false);
    if (!selectedDocument) return;
    
    try {
      console.log('📄 Starting document view process...');
      console.log('📄 Selected document:', JSON.stringify(selectedDocument, null, 2));
      console.log('📄 User:', user ? 'authenticated' : 'not authenticated');
      console.log('📄 API_BASE_URL:', API_BASE_URL);
      
      // Check if user is authenticated
      if (!user) {
        console.log('📄 User not authenticated, showing alert');
        Alert.alert('Error', 'Please log in to view documents');
        return;
      }
      
      // Use the API service to get the download info with proper authentication
      try {
        console.log('📄 Getting download info via API service...');
        const downloadInfo = await apiClient.downloadFile(parseInt(selectedDocument.id));
        const downloadUrl = downloadInfo.url;
        
        console.log('📄 Got download URL from API:', downloadUrl);
        console.log('📄 File name:', downloadInfo.filename);
        
        // Try WebBrowser first
        console.log('📄 Attempting to open with WebBrowser...');
        const result = await WebBrowser.openBrowserAsync(downloadUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
        });
        
        console.log('📄 WebBrowser result received:', JSON.stringify(result, null, 2));
        
        // Handle different result types
        if (result.type === 'opened') {
          console.log('📄 Document opened successfully in WebBrowser');
          return; // Success, exit function
        } else if (result.type === 'locked') {
          console.log('📄 WebBrowser locked, trying alternative methods...');
          
          // Try using Linking API as fallback
          try {
            console.log('📄 Attempting to open with Linking API...');
            const canOpen = await Linking.canOpenURL(downloadUrl);
            console.log('📄 Linking can open URL:', canOpen);
            
            if (canOpen) {
              await Linking.openURL(downloadUrl);
              console.log('📄 Document opened successfully with Linking');
              Alert.alert('Success', 'Document opened in external app');
              return; // Success, exit function
            } else {
              console.log('📄 Linking cannot open URL, showing share option');
              Alert.alert(
                'Cannot View Document', 
                'Unable to open document viewer. Would you like to share the document instead?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Share Document',
                    onPress: () => {
                      setSelectedDocument(selectedDocument);
                      handleShareDocument();
                    }
                  }
                ]
              );
              return;
            }
          } catch (linkingError) {
            console.error('📄 Linking API failed:', linkingError);
            Alert.alert(
              'Cannot View Document',
              'Unable to open document. The document URL has been copied to your clipboard.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    // Copy URL to clipboard as last resort
                    Clipboard.setStringAsync(downloadUrl).then(() => {
                      console.log('📄 URL copied to clipboard as fallback');
                    }).catch(() => {
                      console.error('📄 Failed to copy URL to clipboard');
                    });
                  }
                }
              ]
            );
            return;
          }
        } else {
          console.log('📄 Unexpected WebBrowser result type:', result.type);
          // For other result types, show share option
          Alert.alert(
            'Document Viewer Issue',
            'There was an issue opening the document. Would you like to share it instead?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Share Document', 
                onPress: () => {
                  setSelectedDocument(selectedDocument);
                  handleShareDocument();
                }
              }
            ]
          );
        }
        
      } catch (apiError: any) {
        console.error('📄 API download error:', apiError);
        
        // Handle specific API errors
        if (apiError.message?.includes('401') || apiError.message?.includes('authentication') || apiError.message?.includes('Not authenticated')) {
          Alert.alert(
            'Authentication Required',
            'Your session has expired. Please log in again to view documents.',
            [
              { text: 'OK', style: 'default' },
              {
                text: 'Go to Login',
                onPress: () => {
                  router.push('/(auth)/sign-in');
                }
              }
            ]
          );
          return;
        } else if (apiError.message?.includes('404') || apiError.message?.includes('not found')) {
          Alert.alert(
            'File Not Found',
            'This document is no longer available. It may have been deleted.',
            [
              { text: 'OK', style: 'default' },
              {
                text: 'Refresh List',
                onPress: () => {
                  loadDocuments();
                }
              }
            ]
          );
          return;
        } else {
          // Generic API error - fallback to direct URL
          console.log('📄 API error, trying direct URL approach...');
          const directUrl = `${API_BASE_URL}/api/files/${selectedDocument.id}/download`;
          
          try {
            const result = await WebBrowser.openBrowserAsync(directUrl);
            if (result.type === 'opened') {
              console.log('📄 Direct URL opened successfully');
              return;
            }
          } catch (directError) {
            console.error('📄 Direct URL also failed:', directError);
          }
          
          Alert.alert(
            'Cannot View Document',
            'There was an error accessing the document. Please try again later.',
            [{ text: 'OK', style: 'default' }]
          );
        }
      }
      
    } catch (error: any) {
      console.error('📄 Complete error object:', error);
      console.error('📄 Error message:', error.message);
      console.error('📄 Error code:', error.code);
      console.error('📄 Error stack:', error.stack);
      
      // Provide more specific error messages based on error type
      let errorMessage = 'Failed to open document. Please try again.';
      
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network request failed')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.message?.includes('WebBrowser')) {
        errorMessage = 'Unable to open document viewer. Please try downloading the document instead.';
      } else if (error.status === 401 || error.message?.includes('401')) {
        errorMessage = 'Authentication error. Please log in again.';
      } else if (error.status === 404 || error.message?.includes('404')) {
        errorMessage = 'Document not found. It may have been deleted.';
      } else if (error.status === 500) {
        errorMessage = 'Server error. Please try again later.';
      } else {
        errorMessage = `Error: ${error.message || 'Unknown error occurred'}`;
      }
      
      console.log('📄 Showing error alert:', errorMessage);
      
      Alert.alert('Document View Error', errorMessage, [
        { text: 'OK', style: 'default' },
        {
          text: 'Try Share',
          style: 'default',
          onPress: () => {
            console.log('📄 User chose to try share instead');
            setSelectedDocument(selectedDocument);
            handleShareDocument();
          }
        }
      ]);
    }
  };

  const handleShareDocument = async () => {
    setShowOptionsModal(false);
    if (!selectedDocument) return;
    
    // Create download URL for the document (moved to top for scope)
    const downloadUrl = `${API_BASE_URL}/api/files/${selectedDocument.id}/download`;
    
    try {
      console.log('📤 Starting share process...');
      console.log('📤 Selected document:', JSON.stringify(selectedDocument, null, 2));
      console.log('📤 User:', user ? 'authenticated' : 'not authenticated');
      console.log('📤 API_BASE_URL:', API_BASE_URL);
      
      // Check if user is authenticated
      if (!user) {
        console.log('📤 User not authenticated, showing alert');
        Alert.alert('Error', 'Please log in to share documents');
        return;
      }
      
      console.log('📤 Final share URL:', downloadUrl);
      
      // Test Share API availability
      console.log('📤 Testing Share API...');
      try {
        // Test if Share is available by checking if the module exists
        console.log('📤 Share module available:', !!Share);
        console.log('📤 Share.share function:', typeof Share.share);
      } catch (shareTestError) {
        console.error('📤 Share API test failed:', shareTestError);
      }
      
      console.log('📤 Attempting to share...');
      
      // Use simple share without timeout - timeout was causing issues
      const shareResult = await Share.share({
        message: `Check out this document: ${selectedDocument.name}\n\nDownload: ${downloadUrl}`,
        title: selectedDocument.name,
      });
      
      console.log('📤 Share result received:', JSON.stringify(shareResult, null, 2));
      
      // Handle share result
      if (shareResult && shareResult.action === Share.sharedAction) {
        console.log('📤 Document shared successfully');
        if (shareResult.activityType) {
          console.log('📤 Shared via:', shareResult.activityType);
        } else {
          console.log('📤 Share completed without specific activity type');
        }
        // Show success message
        Alert.alert('Success', 'Document shared successfully!');
      } else if (shareResult && shareResult.action === Share.dismissedAction) {
        console.log('📤 Share dismissed by user');
      } else {
        console.log('📤 Unexpected share result:', shareResult);
      }
      
    } catch (error: any) {
      console.error('📤 Complete share error object:', error);
      console.error('📤 Error message:', error.message);
      console.error('📤 Error code:', error.code);
      console.error('📤 Error stack:', error.stack);
      
      // Provide specific error messages
      let errorMessage = 'Failed to share document';
      
      if (error.code === 'E_SHARING_UNAVAILABLE') {
        errorMessage = 'Sharing is not available on this device';
      } else if (error.message?.includes('network') || error.message?.includes('Network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message?.includes('permission')) {
        errorMessage = 'Permission denied. Please check your device settings.';
      } else {
        errorMessage = `Failed to share document: ${error.message || 'Unknown error'}`;
      }
      
      console.log('📤 Showing share error alert:', errorMessage);
      
      Alert.alert('Share Error', errorMessage, [
        { text: 'OK', style: 'default' },
        {
          text: 'Copy Link',
          style: 'default',
          onPress: () => {
            console.log('📤 User chose to copy link instead');
            // Fallback: copy link to clipboard
            Clipboard.setStringAsync(downloadUrl).then(() => {
              console.log('📤 Link copied to clipboard successfully');
              Alert.alert('Success', 'Download link copied to clipboard');
            }).catch((clipError) => {
              console.error('📤 Clipboard copy failed:', clipError);
              Alert.alert('Error', 'Failed to copy link to clipboard');
            });
          }
        }
      ]);
    }
  };

  const handleAutoCategorizFile = async () => {
    setShowOptionsModal(false);
    if (!selectedDocument) return;

    try {
      setLoading(true);
      const response = await apiClient.post(`/file/${selectedDocument.id}/auto-categorize`);
      
      if (response.data.success) {
        const categorization = response.data.categorization;
        Alert.alert(
          'File Categorized',
          `File categorized as "${categorization.subcategory}" with ${Math.round(categorization.confidence * 100)}% confidence`,
          [{ 
            text: 'OK', 
            onPress: () => {
              // Refresh the documents list to show updated category
              onRefresh();
            }
          }]
        );
      }
    } catch (error) {
      console.error('Auto-categorization failed:', error);
      Alert.alert('Error', 'Failed to categorize file. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToBookmark = () => {
    setShowOptionsModal(false);
    if (!selectedDocument) return;
    
    Alert.alert(
      'Add to Bookmark',
      'This feature allows you to organize files into bookmark collections. Navigate to the Bookmarks tab to create collections and manage your file organization.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Go to Bookmarks', 
          onPress: () => router.push('/(tabs)/bookmarks')
        }
      ]
    );
  };

  const handleDeleteDocument = () => {
    setShowOptionsModal(false);
    if (!selectedDocument) return;
    
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${selectedDocument.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Call API to delete the file
              await apiClient.deleteFile(parseInt(selectedDocument.id));
              
              // Remove from local state
            setDocuments(docs => docs.filter(d => d.id !== selectedDocument.id));
              Alert.alert('Success', 'Document deleted successfully');
            } catch (error) {
              console.error('Error deleting document:', error);
              Alert.alert('Error', 'Failed to delete document. Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderDocument = ({ item }: { item: Document }) => (
    <TouchableOpacity
      style={styles.documentCard}
      onPress={() => handleDocumentPress(item)}
    >
      <View style={styles.documentHeader}>
        <View style={[styles.fileIcon, { backgroundColor: getTypeColor(item.type, item.category) }]}>
          <Ionicons 
            name={getFileIcon(item.type, item.status, item.category) as any} 
            size={24} 
            color="#fff" 
          />
        </View>
        <View style={styles.documentInfo}>
          <Text 
            style={[
              styles.documentName, 
              item.status === 'processing' && { color: '#ef4444' } // Red color for processing files
            ]} 
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <View style={styles.documentMeta}>
            <Text style={styles.documentSize}>{item.size}</Text>
            <Text style={styles.documentDate}>
              {item.uploadDate.toLocaleDateString()}
            </Text>
            {item.status === 'processing' && (
              <Text style={[styles.documentDate, { color: '#ef4444', fontWeight: '600' }]}>
                Processing...
          </Text>
            )}
          </View>
        </View>
      </View>
      
      {item.category && (
        <View style={styles.categoryContainer}>
          <Text style={styles.categoryText}>{item.category}</Text>
        </View>
      )}
      
      {item.tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {item.tags.map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Documents</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => router.push('/documents/upload')}
          >
            <Ionicons name="cloud-upload" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/scanner')}
          >
            <Ionicons name="camera" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search documents, tags, or categories..."
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

      {/* Documents List */}
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
            <Text style={styles.emptyText}>No documents found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try adjusting your search or filters' : 'Upload your first document to get started'}
            </Text>
          </View>
        }
      />

      {/* Document Options Modal */}
      <Modal
        visible={showOptionsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptionsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedDocument?.name}
              </Text>
              <TouchableOpacity onPress={() => setShowOptionsModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.modalOption} onPress={handleViewDocument}>
              <Ionicons name="eye" size={24} color="#007AFF" />
              <Text style={styles.modalOptionText}>View Document</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.modalOption} onPress={handleShareDocument}>
              <Ionicons name="share" size={24} color="#007AFF" />
              <Text style={styles.modalOptionText}>Share</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.modalOption} onPress={() => {
              setShowOptionsModal(false);
              router.push('/(tabs)/chats');
            }}>
              <Ionicons name="chatbubble-ellipses" size={24} color="#34C759" />
              <Text style={styles.modalOptionText}>Ask AI about this document</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.modalOption} onPress={handleAutoCategorizFile}>
              <Ionicons name="pricetag" size={24} color="#FF9500" />
              <Text style={styles.modalOptionText}>Auto-Categorize</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.modalOption} onPress={handleAddToBookmark}>
              <Ionicons name="bookmark" size={24} color="#007AFF" />
              <Text style={styles.modalOptionText}>Add to Bookmark</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.modalOption, styles.modalOptionDanger]} onPress={handleDeleteDocument}>
              <Ionicons name="trash" size={24} color="#FF3B30" />
              <Text style={[styles.modalOptionText, styles.modalOptionTextDanger]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
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
    paddingHorizontal: 16,
  },
  documentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  documentMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  documentSize: {
    fontSize: 12,
    color: '#666',
  },
  documentDate: {
    fontSize: 12,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  categoryContainer: {
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 11,
    color: '#666',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    marginRight: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalOptionDanger: {
    borderBottomWidth: 0,
  },
  modalOptionText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 16,
  },
  modalOptionTextDanger: {
    color: '#FF3B30',
  },
}); 