import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentViewer from '../../components/DocumentViewer';
import ExternalFilePicker from '../../components/ExternalFilePicker';
import LoadingDots from '../../components/LoadingDots';
import QuickFormViewer from '../../components/QuickFormViewer';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';
import { ExternalFile } from '../../services/externalFileServices';
import { useFileStore } from '../../stores/fileStore';
import { removeFileExtension } from '../../utils/fileUtils';
import { useAuth } from '../context/auth';

interface Document {
  id: string;
  name: string;
  type: string; // Now supports more specific types like 'docx', 'xlsx', 'pptx', 'txt', etc.
  size: string;
  uploadDate: Date;
  status: 'processed' | 'processing' | 'pending' | 'error';
  tags: string[];
  category?: string;
  file_kind?: string; // Store the raw file_kind from backend
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
type FilterOption = 'all' | 'documents' | 'receipts' | 'forms' | 'transcripts' | 'invoice' | 'meeting_notes' | 'meeting_chat' | 'meeting_summary' | 'spreadsheet' | 'picture' | 'pending' | 'unknown';

export default function QuickFilesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { uploadFromGallery } = useFileStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadTime, setLastLoadTime] = useState<number>(0);
  
  // Get workspaceId from route params if provided
  const workspaceId = params.workspaceId ? Number(params.workspaceId) : undefined;
  
  // Re-read params and reload when screen comes into focus (important for tab navigation)
  // This ensures workspaceId is properly read when navigating from workspace details
  // Add debounce to prevent excessive reloads
  const lastLoadTimeRef = useRef<number>(0);
  const RELOAD_DEBOUNCE_MS = 2000; // Don't reload if less than 2 seconds since last load
  
  useFocusEffect(
    useCallback(() => {
      const currentWorkspaceId = params.workspaceId ? Number(params.workspaceId) : undefined;
      console.log('📁 Documents screen focused - workspaceId from params:', params.workspaceId, 'parsed:', currentWorkspaceId);
      // Force reload documents when screen comes into focus to ensure correct workspace filtering
      if (user) {
        const now = Date.now();
        if (now - lastLoadTimeRef.current > RELOAD_DEBOUNCE_MS) {
          lastLoadTimeRef.current = now;
          loadDocuments(true);
        }
      }
    }, [params.workspaceId, user, loadDocuments])
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showExternalFilePicker, setShowExternalFilePicker] = useState(false);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [showQuickFormViewer, setShowQuickFormViewer] = useState(false);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  
  // Kebab menu state
  const [showKebabMenu, setShowKebabMenu] = useState(false);
  const [selectedDocumentForMenu, setSelectedDocumentForMenu] = useState<Document | null>(null);
  
  // Category selection modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categorizingReceipt, setCategorizingReceipt] = useState(false);
  
  // Payment status selection modal states
  const [showPaymentStatusModal, setShowPaymentStatusModal] = useState(false);
  const [updatingPaymentStatus, setUpdatingPaymentStatus] = useState(false);
  
  // Receipt categories (must match backend validation)
  const receiptCategories = [
    'Uncategorized',
    'Advertising',
    'Supplies',
    'Professional Services',
    'Personal',
    'Rent and Lease',
    'Education and Training',
    'Cars and Truck',
    'Travel',
    'Office Expenses',
    'Meals and Entertainment',
    'Contractors',
    'Employee Benefit',
    'Banking',
    'Other Expenses'
  ];
  
  // Invoice payment statuses (must match backend validation)
  const paymentStatuses = [
    'Paid',
    'Unpaid',
    'Partial'
  ];

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
    workspaceId?: number;
  } | null>(null);

  const CACHE_DURATION = 30000; // 30 seconds cache
  const AUTO_REFRESH_INTERVAL = 60000; // Auto-refresh every 60 seconds
  
  // Polling for pending files (classification polling)
  const classificationPollingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleGalleryUpload = async () => {
    try {
      console.log('🖼️ Starting gallery upload from files screen...');
      
      const success = await uploadFromGallery();
      if (success) {
        // Immediately reload files to show them with pending status
        console.log('📁 Upload complete, immediately reloading files to show pending status...');
        loadDocuments(true); // Force refresh immediately
        // Don't show alert immediately - files will appear with pending status
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

  const getFileIcon = (type: string, status: string, fileKind?: string) => {
    // Show spinning icon for pending or processing status
    if (status === 'pending' || status === 'processing') return 'time-outline';
    if (status === 'error') return 'alert-circle-outline';
    
    // Handle form type specifically
    if (type === 'form') return 'clipboard-outline';
    
    // Use file_kind to determine icon (file_kind is the file type: receipt, invoice, document, spreadsheet, picture, etc.)
    if (fileKind) {
      const kind = fileKind.toLowerCase().trim();
      switch (kind) {
        case 'receipt':
        case 'receipts':
          return 'receipt-outline'; // Receipt-specific icon
        case 'invoice':
        case 'invoices':
          return 'document-text-outline'; // Invoice icon (document with text)
        case 'form':
        case 'forms':
          return 'clipboard-outline'; // Form-specific icon (clipboard for forms)
        case 'document':
        case 'documents':
          return 'document-outline';
        case 'transcript':
        case 'transcripts':
          return 'mic-outline'; // Microphone icon for transcripts
        case 'meeting_notes':
        case 'meeting_upload':
          return 'document-text-outline'; // Document icon for meeting notes
        case 'meeting_chat':
          return 'chatbubbles-outline'; // Chat bubbles icon for meeting chat
        case 'meeting_summary':
        case 'ai_summary':
          return 'sparkles-outline'; // Sparkles icon for AI summaries
        case 'spreadsheet':
        case 'spreadsheets':
          return 'grid-outline'; // Grid icon for spreadsheets
        case 'picture':
        case 'image':
        case 'images':
          return 'image-outline'; // Image icon for pictures
        case 'unknown':
          return 'help-circle-outline';
        default:
          // If file_kind doesn't match, fall through to file type check
          break;
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

  const getTypeColor = (type: string, fileKind?: string) => {
    // Handle form type specifically
    if (type === 'form') return '#3b82f6'; // Blue for forms
    
    // Use file_kind to determine color (file_kind is the file type: receipt, invoice, document, spreadsheet, picture, etc.)
    if (fileKind) {
      const kind = fileKind.toLowerCase().trim();
      switch (kind) {
        case 'receipt':
        case 'receipts':
          return '#10b981'; // Emerald green for receipts
        case 'invoice':
        case 'invoices':
          return '#2563eb'; // Blue for invoices
        case 'form':
        case 'forms':
          return '#3b82f6'; // Blue for forms
        case 'document':
        case 'documents':
          return '#6366f1'; // Indigo for documents
        case 'transcript':
        case 'transcripts':
          return '#8b5cf6'; // Purple for transcripts
        case 'meeting_notes':
        case 'meeting_upload':
          return '#a855f7'; // Violet for meeting notes
        case 'meeting_chat':
          return '#3b82f6'; // Blue for meeting chat
        case 'meeting_summary':
        case 'ai_summary':
          return '#10b981'; // Green for AI summaries
        case 'spreadsheet':
        case 'spreadsheets':
          return '#10b981'; // Green for spreadsheets
        case 'picture':
        case 'image':
        case 'images':
          return '#ec4899'; // Pink for pictures/images
        case 'unknown':
          return '#64748b'; // Gray for unknown
        default:
          // If file_kind doesn't match, fall through to file type check
          break;
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
      case 'pending':
        return 'pending';
      case 'receipt':
      case 'receipts':
        return 'receipts';
      case 'invoice':
      case 'invoices':
        return 'invoice';
      case 'form':
      case 'forms':
        return 'forms';
      case 'document':
      case 'documents':
        return 'documents';
      case 'transcript':
      case 'transcripts':
        return 'transcripts';
      case 'meeting_notes':
      case 'meeting_upload':
        return 'meeting_notes';
      case 'meeting_chat':
        return 'meeting_chat';
      case 'meeting_summary':
      case 'ai_summary':
        return 'meeting_summary';
      case 'spreadsheet':
      case 'spreadsheets':
        return 'spreadsheet';
      case 'picture':
      case 'image':
      case 'images':
        return 'picture';
      default:
        return 'unknown';
    }
  };

  // Calculate which categories have files
  const availableCategories = useMemo(() => {
    const categoryCounts = new Map<FilterOption, number>();
    
    // Always include 'all' if there are any documents
    if (documents.length > 0) {
      categoryCounts.set('all', documents.length);
    }
    
    // Count files by category
    documents.forEach(doc => {
      // Check for pending status first
      if (doc.status === 'pending') {
        categoryCounts.set('pending', (categoryCounts.get('pending') || 0) + 1);
      }
      
      // Count by normalized file_kind (not category - category is for receipt categorization like "Supplies", "Rent", etc.)
      // Use file_kind to determine the file type (receipt, invoice, document, etc.)
      const category = normalizeCategory(doc.file_kind) as FilterOption;
      if (category !== 'pending') {
        categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      }
    });
    
    // Return only categories that have at least one file, sorted with custom order
    const categories = Array.from(categoryCounts.entries())
      .filter(([_, count]) => count > 0)
      .map(([category]) => category);
    
    // Define the desired order for filter tabs
    const categoryOrder: FilterOption[] = [
      'all',
      'documents',
      'receipts',
      'invoice',
      'meeting_summary',
      'forms',
      'transcripts',
      'meeting_notes',
      'meeting_chat',
      'spreadsheet',
      'picture',
      'pending',
      'unknown',
    ];
    
    // Sort: use predefined order, then alphabetically for any not in the list
    return categories.sort((a, b) => {
      const indexA = categoryOrder.indexOf(a);
      const indexB = categoryOrder.indexOf(b);
      
      // If both are in the predefined order, sort by their position
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      // If only A is in the order, A comes first
      if (indexA !== -1) return -1;
      // If only B is in the order, B comes first
      if (indexB !== -1) return 1;
      // If neither is in the order, sort alphabetically
      return a.localeCompare(b);
    });
  }, [documents]);

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
        // Use file_kind to determine file type (receipt, invoice, document, etc.)
        // doc.category is for receipt categorization (Supplies, Rent, etc.), not file type
        const fileTypeCategory = normalizeCategory(doc.file_kind).toLowerCase();
        switch (filterBy) {
          case 'documents':
            return fileTypeCategory === 'documents';
          case 'receipts':
            return fileTypeCategory === 'receipts';
          case 'forms':
            return fileTypeCategory === 'forms';
          case 'transcripts':
            return fileTypeCategory === 'transcripts';
          case 'invoice':
            return fileTypeCategory === 'invoice';
          case 'meeting_notes':
            return fileTypeCategory === 'meeting_notes';
          case 'meeting_chat':
            return fileTypeCategory === 'meeting_chat';
          case 'meeting_summary':
            return fileTypeCategory === 'meeting_summary';
          case 'spreadsheet':
            return fileTypeCategory === 'spreadsheet';
          case 'picture':
            return fileTypeCategory === 'picture';
          case 'pending':
            return fileTypeCategory === 'pending' || doc.status === 'pending';
          case 'unknown':
            return fileTypeCategory === 'unknown';
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
    // Cache key includes workspaceId to avoid showing wrong workspace files
    if (!forceRefresh && apiCache && 
        (now - apiCache.timestamp) < CACHE_DURATION &&
        apiCache.searchQuery === searchQuery &&
        apiCache.filterBy === filterBy &&
        apiCache.workspaceId === workspaceId) {
      console.log('📁 Using cached documents for workspaceId:', workspaceId);
      setDocuments(apiCache.data);
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);
    
    try {
      // Test backend connectivity (non-blocking, don't wait for it)
      // Run health check in background without blocking data load
      apiClient.testConnectivity().catch((error) => {
        console.warn('Connectivity test failed (non-blocking):', error);
      });
      
      // Load data immediately without waiting for health check
      let response;
      
      // If forms filter is selected, load recent forms instead of documents
      if (filterBy === 'forms') {
        try {
          console.log('📝 Loading recent forms for user...');
          // Use API client's built-in timeout (30 seconds) instead of creating artificial timeout
          response = await apiClient.getForms();
          console.log('✅ Forms response:', response);
        } catch (err) {
          console.error('Forms endpoint failed:', err);
          throw err;
        }
      } else {
        try {
          // Try the new getDocuments method first
          // Pass workspaceId to filter files by workspace
          console.log('📁 Loading documents with workspaceId:', workspaceId);
          // Use API client's built-in timeout (30 seconds) instead of creating artificial timeout
          response = await apiClient.getDocuments(1, 50, undefined, undefined, workspaceId);
          console.log('📁 Documents response received:', response?.success, 'Files count:', (response as any)?.data?.length || (response as any)?.files?.length || 0);
        } catch (err) {
          console.warn('Documents endpoint failed, trying files endpoint:', err);
          try {
            console.log('📁 Falling back to getFiles with workspaceId:', workspaceId);
            // Use API client's built-in timeout (30 seconds) instead of creating artificial timeout
            response = await apiClient.getFiles(1, 50, undefined, undefined, workspaceId);
            console.log('📁 Files response received:', response?.success, 'Files count:', (response as any)?.files?.length || 0);
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
            workspaceId,
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
            // Determine status: pending if file_kind is 'pending' or processing_status is 'pending'/'processing'
            const isPending = doc.file_kind?.toLowerCase() === 'pending' || 
                             doc.processing_status === 'pending' || 
                             doc.processing_status === 'processing';
            const status = isPending ? 'pending' as const : 
                          doc.processing_status === 'error' ? 'error' as const :
                          'processed' as const;
            
            return {
              id: String(doc.id),
              name: removeFileExtension(originalName),
              type: getFileTypeFromExtension(doc.original_filename || doc.filename),
              size: formatFileSize(doc.file_size),
              uploadDate: new Date(doc.created_at),
              status: status,
              tags: [],
              category: doc.receipt_category || undefined, // Use receipt_category for the actual category (Supplies, Rent, etc.)
              file_kind: doc.file_kind, // Store raw file_kind to check for receipts
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
            workspaceId,
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
  }, [searchQuery, filterBy, workspaceId]); // Add dependencies including workspaceId

  const getFileTypeFromExtension = (filename: string | null | undefined): string => {
    if (!filename || typeof filename !== 'string') {
      return 'other';
    }
    
    const ext = filename.toLowerCase().split('.').pop();
    if (!ext) return 'other';
    
    // PDF files
    if (ext === 'pdf') return 'pdf';
    
    // Word documents
    if (['doc', 'docx'].includes(ext)) return 'docx';
    
    // Excel spreadsheets
    if (['xls', 'xlsx'].includes(ext)) return 'xlsx';
    
    // PowerPoint presentations
    if (['ppt', 'pptx'].includes(ext)) return 'pptx';
    
    // Text files
    if (['txt', 'rtf', 'md'].includes(ext)) return 'txt';
    
    // Image files
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'heif'].includes(ext)) return 'image';
    
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
      loadDocuments(true); // Force refresh when workspaceId changes
    }
  }, [user, workspaceId, loadDocuments]);

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

  // Polling for pending files (classification polling)
  useEffect(() => {
    // Check if there are any pending files
    const hasPendingFiles = documents.some(doc => doc.status === 'pending');
    
    if (hasPendingFiles) {
      // Start polling for file updates
      if (!classificationPollingIntervalRef.current) {
        console.log('🔄 Starting classification polling for pending files...');
        classificationPollingIntervalRef.current = setInterval(async () => {
          try {
            // Reload files to check for updated file_kind
            await loadDocuments(true); // Force refresh
            
            // Check current documents state after reload
            setDocuments(currentDocs => {
              const stillPending = currentDocs.some(doc => doc.status === 'pending');
              
              if (!stillPending) {
                // No more pending files, stop polling
                console.log('✅ All files processed, stopping classification polling');
                if (classificationPollingIntervalRef.current) {
                  clearInterval(classificationPollingIntervalRef.current);
                  classificationPollingIntervalRef.current = null;
                }
              }
              
              return currentDocs; // Return unchanged, loadDocuments already updated it
            });
          } catch (error) {
            console.error('Error polling for file updates:', error);
          }
        }, 3000); // Poll every 3 seconds
      }
    } else {
      // No pending files, stop polling if it's running
      if (classificationPollingIntervalRef.current) {
        console.log('🛑 No pending files, stopping classification polling');
        clearInterval(classificationPollingIntervalRef.current);
        classificationPollingIntervalRef.current = null;
      }
    }
    
    return () => {
      if (classificationPollingIntervalRef.current) {
        clearInterval(classificationPollingIntervalRef.current);
        classificationPollingIntervalRef.current = null;
      }
    };
  }, [documents, loadDocuments]);

  const handleDocumentPress = async (document: Document) => {
    if (document.status === 'processing' || document.status === 'pending') {
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

    // If the document is a form (either by type or category), open quick form viewer
    if (
      document.type === 'form' ||
      document.category?.toLowerCase() === 'form' ||
      document.category?.toLowerCase() === 'forms'
    ) {
      // Open quick form viewer instead of form builder
      setSelectedDocument(document);
      setShowQuickFormViewer(true);
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
      console.log('📤 Sharing document:', selectedDocumentForMenu.id, selectedDocumentForMenu.name);
      
      // Get file download info
      const fileInfo = await apiClient.downloadFile(parseInt(selectedDocumentForMenu.id));
      console.log('📤 File download info:', fileInfo);
      
      if (!fileInfo.url) {
        throw new Error('Failed to get file download URL');
      }
      
      // Get the filename with extension
      const filename = fileInfo.filename || selectedDocumentForMenu.name;
      const fileExtension = filename.split('.').pop() || 'pdf';
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      
      // Get cache directory (fallback to document directory if cache is not available)
      const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!cacheDir) {
        throw new Error('Unable to access file system directories');
      }
      
      // Create a local file path in the cache directory
      const fileUri = `${cacheDir}${sanitizedFilename}`;
      console.log('📤 Downloading file to:', fileUri);
      
      // Get auth token for download
      let authHeaders = {};
      try {
        const { secureStorage } = await import('../../utils/storage');
        const { STORAGE_KEYS } = await import('../../constants/Config');
        const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (token) {
          authHeaders = { 'Authorization': `Bearer ${token}` };
        }
      } catch (error) {
        console.warn('📤 Could not get auth token for download:', error);
      }
      
      // Download the file
      const downloadResult = await FileSystem.downloadAsync(fileInfo.url, fileUri, {
        headers: authHeaders
      });
      
      console.log('📤 File downloaded to:', downloadResult.uri);
      
      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        // Share the actual file
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: getMimeType(fileExtension),
          dialogTitle: `Share ${selectedDocumentForMenu.name}`,
        });
        console.log('📤 File shared successfully');
      } else {
        // Fallback to text sharing if file sharing not available
        console.log('📤 File sharing not available, falling back to URL sharing');
        if (Platform.OS === 'ios' || Platform.OS === 'android') {
          await Share.share({
            message: `Check out this document: ${selectedDocumentForMenu.name}\n\n${fileInfo.url}`,
            url: fileInfo.url,
            title: selectedDocumentForMenu.name,
          });
        } else {
          Alert.alert('Share Link', fileInfo.url);
        }
      }
      
      // Clean up: delete the cached file after a delay
      setTimeout(async () => {
        try {
          const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
            console.log('📤 Cleaned up cached file');
          }
        } catch (error) {
          console.warn('📤 Failed to clean up cached file:', error);
        }
      }, 60000); // Delete after 1 minute
      
    } catch (error: any) {
      console.error('📤 Share error:', error);
      Alert.alert('Error', error.message || 'Failed to share document');
    }
    setShowKebabMenu(false);
  };

  const getMimeType = (extension: string): string => {
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
    };
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
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
    // Pass fileId, fileName (from Files screen), and workspaceId when in a workspace
    const q = `fileId=${selectedDocumentForMenu.id}&fileName=${encodeURIComponent(selectedDocumentForMenu.name || '')}${workspaceId ? `&workspaceId=${workspaceId}` : ''}`;
    router.push(`/(tabs)/chats?${q}`);
    setShowKebabMenu(false);
  };
  
  const handleCategorizeReceipt = () => {
    if (!selectedDocumentForMenu) return;
    setShowKebabMenu(false);
    setShowCategoryModal(true);
  };
  
  const handleSelectCategory = async (category: string) => {
    if (!selectedDocumentForMenu) return;
    
    setCategorizingReceipt(true);
    try {
      const response = await apiClient.categorizeReceipt(parseInt(selectedDocumentForMenu.id), category);
      if (response.success) {
        Alert.alert('Success', `Receipt categorized as "${category}"`);
        // Update the document in the local state
        setDocuments(prev => prev.map(doc => 
          doc.id === selectedDocumentForMenu.id ? { ...doc, category } : doc
        ));
        setShowCategoryModal(false);
        setSelectedDocumentForMenu(null);
        // Reload documents to get updated data
        loadDocuments(true);
      } else {
        Alert.alert('Error', response.message || 'Failed to categorize receipt');
      }
    } catch (error) {
      console.error('Error categorizing receipt:', error);
      Alert.alert('Error', 'Failed to categorize receipt');
    } finally {
      setCategorizingReceipt(false);
    }
  };
  
  const handleUpdatePaymentStatus = () => {
    if (!selectedDocumentForMenu) return;
    setShowKebabMenu(false);
    setShowPaymentStatusModal(true);
  };
  
  const handleSelectPaymentStatus = async (paymentStatus: string) => {
    if (!selectedDocumentForMenu) return;
    
    setUpdatingPaymentStatus(true);
    try {
      const response = await apiClient.updateInvoicePaymentStatus(parseInt(selectedDocumentForMenu.id), paymentStatus);
      if (response.success) {
        Alert.alert('Success', `Invoice payment status updated to "${paymentStatus}"`);
        setShowPaymentStatusModal(false);
        setSelectedDocumentForMenu(null);
        // Reload documents to get updated data
        loadDocuments(true);
      } else {
        Alert.alert('Error', response.message || 'Failed to update payment status');
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
      Alert.alert('Error', 'Failed to update payment status');
    } finally {
      setUpdatingPaymentStatus(false);
    }
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
    // Show for files that are currently processing or pending
    if (document.status === 'processing' || document.status === 'pending') {
      return true;
    }
    
    // Show for files that recently completed processing
    if (document.status === 'processed' && recentlyCompletedFiles.has(document.id)) {
      return true;
    }
    
    return false;
  };

  const handleUploadFromFiles = async () => {
    try {
      // Use the fileStore's built-in upload method which handles state properly
      const fileStore = useFileStore.getState();
      const success = await fileStore.uploadFromDocuments();
      
      if (success) {
        // Immediately reload files to show them with pending status
        console.log('📁 Upload complete, immediately reloading files to show pending status...');
        loadDocuments(true); // Refresh documents list immediately
        // Don't show alert immediately - files will appear with pending status
      }
    } catch (error) {
      console.error('Document upload error:', error);
      Alert.alert('Error', 'Failed to upload files. Please try again.');
    }
  };


  // Component for document icon with spinning animation for pending files
  const DocumentIcon = React.memo(({ item }: { item: Document }) => {
    const spinAnim = useRef(new Animated.Value(0)).current;
    const isPending = item.status === 'pending' || item.status === 'processing';
    
    useEffect(() => {
      if (isPending) {
        // Start spinning animation
        Animated.loop(
          Animated.timing(spinAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          })
        ).start();
      } else {
        // Stop animation
        spinAnim.setValue(0);
      }
    }, [isPending, spinAnim]);
    
    const spin = spinAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });
    
    return (
      <Animated.View style={[dynamicStyles.documentIcon, isPending && { transform: [{ rotate: spin }] }]}>
        <Ionicons 
          name={getFileIcon(item.type, item.status, item.file_kind) as any} 
          size={24} 
          color={getTypeColor(item.type, item.file_kind)} 
        />
      </Animated.View>
    );
  });

  const renderDocument = ({ item }: { item: Document }) => (
    <TouchableOpacity
      style={dynamicStyles.documentItem}
      onPress={() => handleDocumentPress(item)}
      onLongPress={(event) => handleKebabMenuPress(item, event)}
    >
      <DocumentIcon item={item} />
      
        <View style={dynamicStyles.documentInfo}>
        <Text style={dynamicStyles.documentName} numberOfLines={1} ellipsizeMode="tail">
            {item.name}
          </Text>
        <Text style={dynamicStyles.documentMeta}>
          {item.file_kind ? `${item.file_kind.replace(/_/g, ' ')} • ` : ''}{item.size} • {item.uploadDate.toLocaleDateString()}
          {item.category && ` • ${item.category}`}
            </Text>
        </View>
        
        {/* Kebab Menu Button */}
        <TouchableOpacity
          style={dynamicStyles.kebabButton}
          onPress={(event) => {
            event.stopPropagation();
            handleKebabMenuPress(item, event);
          }}
        >
          <Ionicons name="ellipsis-vertical" size={20} color="#666" />
        </TouchableOpacity>
    </TouchableOpacity>
  );

  const FilterButton = ({ option, label }: { option: FilterOption; label: string }) => (
    <TouchableOpacity
      style={[dynamicStyles.filterButton, filterBy === option && dynamicStyles.filterButtonActive]}
      onPress={() => setFilterBy(option)}
    >
      <Text style={[dynamicStyles.filterButtonText, filterBy === option && dynamicStyles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      marginRight: 12,
      padding: 4,
    },
    headerTitleContainer: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
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
      backgroundColor: colors.card,
      marginHorizontal: 16,
      marginTop: 16,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
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
      backgroundColor: colors.surface,
    },
    filterButtonActive: {
      backgroundColor: '#007AFF',
    },
    filterButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
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
      color: colors.textSecondary,
      marginRight: 8,
    },
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: colors.surface,
    },
    sortButtonText: {
      fontSize: 14,
      color: colors.text,
      marginRight: 4,
    },
    documentsList: {
      flex: 1,
      paddingHorizontal: 12,
    },
    documentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
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
      color: colors.text,
      marginBottom: 2,
    },
    documentMeta: {
      fontSize: 11,
      color: colors.textSecondary,
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
      color: colors.textSecondary,
      marginTop: 16,
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textLight,
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
      color: colors.text,
      marginTop: 16,
    },
    loadingSubtext: {
      fontSize: 14,
      color: colors.textLight,
      marginTop: 4,
    },
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
      backgroundColor: colors.card,
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
      color: colors.text,
      marginLeft: 12,
      fontWeight: '500',
    },
    bookmarkModalContainer: {
      backgroundColor: colors.card,
      borderRadius: 20,
      width: '90%',
      maxWidth: 400,
      maxHeight: '80%',
      overflow: 'hidden',
    },
    bookmarkModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    bookmarkModalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    bookmarkModalContent: {
      padding: 16,
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
      borderBottomColor: colors.border,
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
      color: colors.text,
    },
    bookmarkItemText: {
      fontSize: 16,
      color: colors.text,
      marginLeft: 12,
      flex: 1,
    },
    
    // Category Modal Styles
    categoryModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    categoryModalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '70%',
      paddingBottom: 20,
    },
    categoryModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    categoryModalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    categoryList: {
      maxHeight: 400,
    },
    categoryModalItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    categoryItemText: {
      fontSize: 16,
      color: colors.text,
    },
    categoryModalLoading: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      justifyContent: 'center',
      alignItems: 'center',
    },
  }), [colors]);

  // Loading state with bouncing dots
  if (loading && documents.length === 0) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <Text style={dynamicStyles.headerTitle}>Files</Text>
          <View style={dynamicStyles.headerActions}>
            <TouchableOpacity style={dynamicStyles.headerButton}>
              <Ionicons name="cloud-upload" size={24} color="#007AFF" />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.headerButton}>
              <Ionicons name="camera" size={24} color="#007AFF" />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.headerButton}>
              <Ionicons name="images" size={24} color="#5856D6" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={dynamicStyles.loadingContainer}>
          <LoadingDots size={12} color="#007AFF" duration={800} />
          <Text style={dynamicStyles.loadingText}>Loading your files...</Text>
          <Text style={dynamicStyles.loadingSubtext}>This will only take a moment</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container}>
      {/* Error message display */}
      {error && (
        <View style={{ backgroundColor: '#fee2e2', padding: 12, margin: 12, borderRadius: 8 }}>
          <Text style={{ color: '#b91c1c', fontWeight: 'bold' }}>{error}</Text>
        </View>
      )}
      
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity 
          style={dynamicStyles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={dynamicStyles.headerTitleContainer}>
          <Text style={dynamicStyles.headerTitle}>
            {workspaceId ? 'Workspace Files' : 'Files'}
          </Text>
          {isAutoRefreshing && (
            <View style={dynamicStyles.autoRefreshIndicator}>
              <Ionicons name="sync" size={16} color="#007AFF" />
              <Text style={dynamicStyles.autoRefreshText}>Syncing...</Text>
            </View>
          )}
        </View>
        <View style={dynamicStyles.headerActions}>
          <TouchableOpacity 
            style={dynamicStyles.headerButton}
            onPress={handleUploadFromFiles}
          >
            <Ionicons name="document" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={dynamicStyles.headerButton}
            onPress={() => router.push('/scanner')}
          >
            <Ionicons name="camera" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={dynamicStyles.headerButton}
            onPress={handleGalleryUpload}
          >
            <Ionicons name="images" size={24} color="#5856D6" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[dynamicStyles.headerButton, refreshing && dynamicStyles.refreshingButton]}
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
      <View style={dynamicStyles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={dynamicStyles.searchIcon} />
        <TextInput
          style={dynamicStyles.searchInput}
          placeholder="Search files, tags, or categories..."
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
      <View style={dynamicStyles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={availableCategories.map(category => {
            const labels: Record<FilterOption, string> = {
              'all': 'All',
              'documents': 'Documents',
              'receipts': 'Receipts',
              'invoice': 'Invoices',
              'forms': 'Forms',
              'transcripts': 'Transcripts',
              'meeting_notes': 'Meeting Notes',
              'meeting_chat': 'Meeting Chat',
              'meeting_summary': 'AI Summary',
              'spreadsheet': 'Spreadsheets',
              'picture': 'Pictures',
              'pending': 'Pending',
              'unknown': 'Unknown',
            };
            return { option: category, label: labels[category] || category };
          })}
          renderItem={({ item }) => (
            <FilterButton option={item.option} label={item.label} />
          )}
          keyExtractor={(item) => item.option}
          contentContainerStyle={dynamicStyles.filtersContent}
        />
      </View>

      {/* Sort Options */}
      <View style={dynamicStyles.sortContainer}>
        <Text style={dynamicStyles.sortLabel}>Sort by:</Text>
        <TouchableOpacity
          style={dynamicStyles.sortButton}
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
          <Text style={dynamicStyles.sortButtonText}>
            {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Files List */}
      <FlatList
        data={filteredAndSortedDocuments}
        renderItem={renderDocument}
        keyExtractor={(item) => item.id}
        style={dynamicStyles.documentsList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={dynamicStyles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={64} color="#ccc" />
            <Text style={dynamicStyles.emptyText}>
              {searchQuery ? 'No files match your search' : 'No files yet'}
            </Text>
            <Text style={dynamicStyles.emptySubtext}>
              {searchQuery 
                ? 'Try adjusting your search terms or filters to find what you\'re looking for' 
                : 'Start by uploading your first file using the upload button above'
              }
            </Text>
            {!searchQuery && (
              <TouchableOpacity 
                style={dynamicStyles.uploadButton}
                onPress={handleUploadFromFiles}
              >
                <Ionicons name="document" size={20} color="#fff" />
                <Text style={dynamicStyles.uploadButtonText}>Upload Files</Text>
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

      {/* Quick Form Viewer */}
      {showQuickFormViewer && selectedDocument && (
        <QuickFormViewer
          formId={selectedDocument.id}
          formName={selectedDocument.name}
          onClose={() => {
            setShowQuickFormViewer(false);
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


      {/* Kebab Menu Modal */}
      <Modal
        visible={showKebabMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseKebabMenu}
      >
        <TouchableOpacity
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseKebabMenu}
        >
          <View style={dynamicStyles.kebabMenuContainer}>
            <TouchableOpacity
              style={dynamicStyles.kebabMenuItem}
              onPress={handleViewDocument}
            >
              <Ionicons name="eye-outline" size={20} color="#007AFF" />
              <Text style={dynamicStyles.kebabMenuText}>View</Text>
            </TouchableOpacity>
            
            {/* Show View Responses option for forms */}
            {selectedDocumentForMenu?.type === 'form' && (
              <TouchableOpacity
                style={dynamicStyles.kebabMenuItem}
                onPress={handleViewFormResponses}
              >
                <Ionicons name="clipboard-outline" size={20} color="#8B5CF6" />
                <Text style={dynamicStyles.kebabMenuText}>View Responses</Text>
              </TouchableOpacity>
            )}
            
            {/* Show Categorize option for receipts - check file_kind */}
            {selectedDocumentForMenu?.file_kind?.toLowerCase() === 'receipt' && (
              <TouchableOpacity
                style={dynamicStyles.kebabMenuItem}
                onPress={handleCategorizeReceipt}
              >
                <Ionicons name="pricetag-outline" size={20} color="#FF9500" />
                <Text style={dynamicStyles.kebabMenuText}>Categorize</Text>
              </TouchableOpacity>
            )}
            
            {/* Show Update Payment Status option for invoices - check file_kind */}
            {selectedDocumentForMenu?.file_kind?.toLowerCase() === 'invoice' && (
              <TouchableOpacity
                style={dynamicStyles.kebabMenuItem}
                onPress={handleUpdatePaymentStatus}
              >
                <Ionicons name="card-outline" size={20} color="#2563EB" />
                <Text style={dynamicStyles.kebabMenuText}>Update Payment Status</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={dynamicStyles.kebabMenuItem}
              onPress={handleShareDocument}
            >
              <Ionicons name="share-outline" size={20} color="#10B981" />
              <Text style={dynamicStyles.kebabMenuText}>Share</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={dynamicStyles.kebabMenuItem}
              onPress={() => {
                console.log('🗑️ Delete button pressed in kebab menu');
                handleDeleteDocument();
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[dynamicStyles.kebabMenuText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={dynamicStyles.kebabMenuItem}
              onPress={handleChatDocument}
            >
              <Ionicons name="chatbubble-outline" size={20} color="#4F46E5" />
              <Text style={dynamicStyles.kebabMenuText}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={dynamicStyles.kebabMenuItem}
              onPress={handleShowBookmarkModal}
            >
              <Ionicons name="bookmark-outline" size={20} color="#FF9500" />
              <Text style={dynamicStyles.kebabMenuText}>Add to Bookmark</Text>
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
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowBookmarkModal(false)}
        >
          <View style={dynamicStyles.bookmarkModalContainer}>
            <View style={dynamicStyles.bookmarkModalHeader}>
              <Text style={dynamicStyles.bookmarkModalTitle}>Add to Bookmark</Text>
              <TouchableOpacity
                onPress={() => setShowBookmarkModal(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={dynamicStyles.bookmarkList}>
              {bookmarks.map((bookmark) => (
                <TouchableOpacity
                  key={bookmark.id}
                  style={dynamicStyles.bookmarkItem}
                  onPress={() => handleAddToBookmark(bookmark)}
                >
                  <View style={[dynamicStyles.bookmarkColor, { backgroundColor: bookmark.color }]} />
                  <Text style={dynamicStyles.bookmarkName}>{bookmark.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      
      {/* Category Selection Modal */}
      <Modal
        visible={showCategoryModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={dynamicStyles.categoryModalOverlay}>
          <View style={dynamicStyles.categoryModalContent}>
            <View style={dynamicStyles.categoryModalHeader}>
              <Text style={dynamicStyles.categoryModalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={dynamicStyles.categoryList}>
              {receiptCategories.map((category) => (
                <TouchableOpacity
                  key={category}
                  style={dynamicStyles.categoryModalItem}
                  onPress={() => handleSelectCategory(category)}
                  disabled={categorizingReceipt}
                >
                  <Text style={dynamicStyles.categoryItemText}>{category}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            {categorizingReceipt && (
              <View style={dynamicStyles.categoryModalLoading}>
                <ActivityIndicator size="large" color="#007AFF" />
              </View>
            )}
          </View>
        </View>
      </Modal>
      
      {/* Payment Status Selection Modal */}
      <Modal
        visible={showPaymentStatusModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPaymentStatusModal(false)}
      >
        <View style={dynamicStyles.categoryModalOverlay}>
          <View style={dynamicStyles.categoryModalContent}>
            <View style={dynamicStyles.categoryModalHeader}>
              <Text style={dynamicStyles.categoryModalTitle}>Update Payment Status</Text>
              <TouchableOpacity
                onPress={() => setShowPaymentStatusModal(false)}
                disabled={updatingPaymentStatus}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={dynamicStyles.categoryList}>
              {paymentStatuses.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={dynamicStyles.categoryModalItem}
                  onPress={() => handleSelectPaymentStatus(status)}
                  disabled={updatingPaymentStatus}
                >
                  <Text style={dynamicStyles.categoryItemText}>{status}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            {updatingPaymentStatus && (
              <View style={dynamicStyles.categoryModalLoading}>
                <ActivityIndicator size="large" color="#007AFF" />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
