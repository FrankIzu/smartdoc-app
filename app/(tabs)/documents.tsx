import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
type FilterOption = 'all' | 'documents' | 'receipts' | 'forms';

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
    if (status === 'processing') return 'sync';
    
    // First check category (file_kind) for specific icons
    if (category) {
      switch (category) {
        case 'receipts': return 'receipt-outline';
        case 'forms': return 'list-outline';
        case 'documents': return 'document-text-outline';
        default: break;
      }
    }
    
    // Fallback to type-based icons
    switch (type) {
      case 'pdf': return 'document-text';
      case 'doc': return 'document';
      case 'image': return 'image';
      default: return 'document-outline';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed': return '#34C759';
      case 'processing': return '#FF9500';
      case 'error': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  const getTypeColor = (type: string, category?: string) => {
    // First check category (file_kind) for specific colors
    if (category) {
      switch (category) {
        case 'receipts': return '#FF9500'; // Orange for receipts
        case 'forms': return '#34C759'; // Green for forms
        case 'documents': return '#007AFF'; // Blue for documents
        default: break;
      }
    }
    
    // Fallback to type-based colors
    switch (type) {
      case 'pdf': return '#FF3B30';
      case 'doc': return '#007AFF';
      case 'image': return '#34C759';
      default: return '#8E8E93';
    }
  };

  const filteredAndSortedDocuments = documents
    .filter(doc => {
      // Search filter
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           doc.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
                           (doc.category?.toLowerCase().includes(searchQuery.toLowerCase()) || false);
      
      // File kind filter - handle mobile app filter names to backend category mapping
      let matchesFilter = filterBy === 'all';
      
      if (!matchesFilter && doc.category) {
        const categoryLower = doc.category.toLowerCase();
        switch (filterBy) {
          case 'documents':
            matchesFilter = categoryLower === 'document' || categoryLower === 'documents';
            break;
          case 'receipts':
            matchesFilter = categoryLower === 'receipt' || categoryLower === 'receipts';
            break;
          case 'forms':
            matchesFilter = categoryLower === 'form' || categoryLower === 'forms';
            break;
          default:
            // Direct match for any other filter values
            matchesFilter = doc.category === filterBy;
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
      console.log('📂 Documents API response:', response);
      
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
          category: file.file_kind || 'documents', // Use file_kind with fallback
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
      Alert.alert('Processing', 'This document is still being processed. Please try again later.');
      return;
    }
    
    setSelectedDocument(document);
    setShowOptionsModal(true);
  };

  const handleViewDocument = () => {
    setShowOptionsModal(false);
    Alert.alert('View Document', `Opening ${selectedDocument?.name}...`);
  };

  const handleShareDocument = async () => {
    setShowOptionsModal(false);
    if (!selectedDocument) return;
    
    try {
      await Share.share({
        message: `Check out this document: ${selectedDocument.name}`,
        title: selectedDocument.name,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share document');
    }
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
          onPress: () => {
            setDocuments(docs => docs.filter(d => d.id !== selectedDocument.id));
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
          <Text style={styles.documentName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.documentMeta}>
            <Text style={styles.documentSize}>{item.size}</Text>
            <Text style={styles.documentDate}>
              {item.uploadDate.toLocaleDateString()}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>
            {item.status === 'processing' ? 'Processing' : 'Ready'}
          </Text>
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
              router.push('/(tabs)/chat');
            }}>
              <Ionicons name="chatbubble-ellipses" size={24} color="#34C759" />
              <Text style={styles.modalOptionText}>Ask AI about this document</Text>
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