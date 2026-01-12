import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService as api } from '../../services/api';
import { useChatStore } from '../../stores/chatStore';
import { removeFileExtension } from '../../utils/fileUtils';
import ProcessingMessageDisplay from '../components/ProcessingMessageDisplay';

interface ChatParticipant {
  id: number;
  username: string;
  email: string;
}

interface Chat {
  id: number;
  title: string;
  type: 'ai_assistant' | 'user_direct' | 'workspace' | 'document_focused' | 'bookmark_focused';
  participants: ChatParticipant[];
  last_message: string;
  updated_at: string;
  created_at: string;
  unread_count?: number;
  workspace?: Workspace;
  document_context?: Document;
  bookmark_collection?: string;
  bookmark_context?: Bookmark;
}

interface ChatMessage {
  id: number;
  content: string;
  sender: ChatParticipant | null;
  is_own_message: boolean;
  created_at: string;
  document_context?: {
    id: number;
    name: string;
    type: string;
  };
}

interface Workspace {
  id: number;
  name: string;
  description?: string;
  slug: string;
  owner_id: number;
  is_personal: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count: number;
  user_role: 'owner' | 'admin' | 'member' | 'viewer';
  can_manage: boolean;
  can_invite: boolean;
  can_edit: boolean;
}

interface Document {
  id: number;
  name: string;
  type: string;
  category?: string;
  size?: string;
}

interface Bookmark {
  id: number;
  name: string;
  description?: string;
  file_count: number;
  documents: Document[];
}

interface ChatsResponse {
  success: boolean;
  chats: Chat[];
  count: number;
}

interface MessagesResponse {
  success: boolean;
  messages: ChatMessage[];
  count: number;
}

// Create default Chat Assistant outside component to avoid recreation
const DEFAULT_CHAT_ASSISTANT: Chat = {
  id: -1,
  title: 'Chat Assistant',
  type: 'ai_assistant',
  participants: [{ id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }],
  last_message: 'Ask me anything about your documents',
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  unread_count: 0
};

export default function ChatsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colors = useThemeColors();
  
  const [chats, setChats] = useState<Chat[]>([DEFAULT_CHAT_ASSISTANT]); // Initialize with Chat Assistant
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null); // User profile for determining is_own_message
  
  // Streaming state for fake character-by-character animation
  const [streamingMessageIndex, setStreamingMessageIndex] = useState<number | null>(null);
  const streamingIntervalRef = useRef<number | null>(null);
  const contentBufferRef = useRef<string>('');
  const displayedCharsRef = useRef<number>(0);
  const isPreviewPhaseRef = useRef<boolean>(true);
  const isStreamingRef = useRef<boolean>(false);
  const isFakeStreamingRef = useRef<boolean>(false); // Track if we're in fake streaming mode
  
  // Message ID counter to ensure uniqueness
  const messageIdCounterRef = useRef<number>(0);
  
  // Helper function to generate unique message IDs
  const generateUniqueMessageId = (): number => {
    // Combine timestamp, counter, and random to ensure uniqueness
    messageIdCounterRef.current += 1;
    return Date.now() * 1000 + messageIdCounterRef.current + Math.floor(Math.random() * 1000);
  };
  
  // Enhanced chat functionality state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [users, setUsers] = useState<ChatParticipant[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [newChatType, setNewChatType] = useState<'ai_assistant' | 'user_direct' | 'workspace' | 'document_focused' | 'bookmark_focused'>('ai_assistant');
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedUser, setSelectedUser] = useState<ChatParticipant | null>(null);
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null);
  
  // Search functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredChats, setFilteredChats] = useState<Chat[]>([DEFAULT_CHAT_ASSISTANT]); // Initialize with Chat Assistant
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [filteredWorkspaces, setFilteredWorkspaces] = useState<Workspace[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<ChatParticipant[]>([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState<Bookmark[]>([]);
  
  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      // Cleanup streaming interval when component unmounts
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
        streamingIntervalRef.current = null;
      }
    };
  }, []);
  

  
  // Quick chat type selector
  const [showQuickChatTypes, setShowQuickChatTypes] = useState(false);
  
  // Search type selector for AI Assistant
  const [showSearchTypeMenu, setShowSearchTypeMenu] = useState(false);
  const [selectedSearchType, setSelectedSearchType] = useState<'exact' | 'refined' | 'expanded'>('refined');

  // Mention system state
  const [showMentionModal, setShowMentionModal] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [selectedMention, setSelectedMention] = useState<any>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  
  // Text input height state
  const [textInputHeight, setTextInputHeight] = useState(40);
  
  // Animation and abort controller refs
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const messagesRef = useRef<FlatList>(null);

  // Animation states (removed bouncing balls)

  // Progress tracking state
  const [progressData, setProgressData] = useState<{
    progress: number;
    status: string;
    message: string;
    phase?: string;
    category?: string;
    subcategory?: string;
  } | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const progressEventSourceRef = useRef<EventSource | null>(null);

  // Handle document context from navigation
  useEffect(() => {
    if (params.documentId && params.documentName) {
      const documentContext: Document = {
        id: parseInt(params.documentId as string),
        name: params.documentName as string,
        type: params.documentType as string || 'other',
        category: params.documentCategory as string,
      };
      
      // Create a document-focused chat
      const documentChat: Chat = {
        id: Date.now(),
        title: `Chat about ${documentContext.name}`,
        type: 'document_focused',
        participants: [{ id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }],
        last_message: `Ready to answer questions about ${documentContext.name}`,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        unread_count: 0,
        document_context: documentContext
      };
      
      // Add the chat to the list and select it
      setChats(prev => {
        const chatAssistant = prev.find(chat => chat.id === -1); // Find the default Chat Assistant
        const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default Chat Assistant
        
        if (chatAssistant) {
          // Chat Assistant exists, add new chat after it
          return [chatAssistant, documentChat, ...otherChats];
        } else {
          // No Chat Assistant found, add new chat at beginning
          return [documentChat, ...prev];
        }
      });
      setSelectedChat(documentChat);
      
      // Don't show welcome message - just show empty chat
      setMessages([]);
      
      // Clear the params to prevent re-triggering
      router.setParams({});
    }
  }, [params.documentId, params.documentName, params.documentType, params.documentCategory]);

  // Handle fileId parameter from documents screen
  useEffect(() => {
    const handleFileIdContext = async () => {
      if (params.fileId && !loading) { // Only proceed if chats are loaded
        try {
          // Check if a document chat for this file already exists
          const existingDocumentChat = chats.find(chat => 
            chat.type === 'document_focused' && 
            chat.document_context?.id === parseInt(params.fileId as string)
          );
          
          if (existingDocumentChat) {
            // If document chat already exists, just select it
            setSelectedChat(existingDocumentChat);
            setSelectedMention({
              id: existingDocumentChat.document_context!.id,
              type: 'file',
              name: existingDocumentChat.document_context!.name,
              data: existingDocumentChat.document_context!
            });
            router.setParams({});
            return;
          }
          
          // Fetch document details using the fileId
          const response = await (api as any).getFileById(parseInt(params.fileId as string));
          
          if (response.success && response.files && response.files.length > 0) {
            const documentData = response.files[0];
            const documentContext: Document = {
              id: documentData.id,
              name: documentData.original_filename || documentData.filename,
              type: documentData.file_type || 'other',
              category: documentData.category,
              size: documentData.file_size ? `${(documentData.file_size / 1024 / 1024).toFixed(2)} MB` : undefined,
            };
            
            // Create a document-focused chat
            const documentChat: Chat = {
              id: Date.now(),
              title: `Chat about ${documentContext.name}`,
              type: 'document_focused',
              participants: [{ id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }],
              last_message: `Ready to answer questions about ${documentContext.name}`,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              unread_count: 0,
              document_context: documentContext
            };
            
                      // Add the chat to the list and select it
          setChats(prev => {
            const chatAssistant = prev.find(chat => chat.id === -1); // Find the default Chat Assistant
            const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default Chat Assistant
            
            if (chatAssistant) {
              // Chat Assistant exists, add new chat after it, preserve all other chats
              return [chatAssistant, documentChat, ...otherChats];
            } else {
              // No Chat Assistant found, add new chat at beginning, preserve all existing chats
              return [documentChat, ...prev];
            }
          });
            setSelectedChat(documentChat);
            
            // Set the document as the selected mention for the chat
            setSelectedMention({
              id: documentContext.id,
              type: 'file',
              name: documentContext.name,
              data: documentContext
            });
            
            // Don't show welcome message - just show empty chat
            setMessages([]);
            
            // Clear the params to prevent re-triggering
            router.setParams({});
          } else {
            console.error('Failed to fetch document details:', response.message);
            // Fallback: create a generic chat
            const fallbackChat: Chat = {
              id: Date.now(),
              title: 'Chat about Document',
              type: 'document_focused',
              participants: [{ id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }],
              last_message: 'Ready to answer questions about your document',
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              unread_count: 0,
            };
            
            setChats(prev => {
              const chatAssistant = prev.find(chat => chat.id === -1); // Find the default Chat Assistant
              const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default Chat Assistant
              
              if (chatAssistant) {
                return [chatAssistant, fallbackChat, ...otherChats];
              } else {
                return [fallbackChat, ...prev];
              }
            });
            setSelectedChat(fallbackChat);
            
            // Set a generic document mention for fallback
            setSelectedMention({
              id: parseInt(params.fileId as string),
              type: 'file',
              name: 'Document',
              data: { id: parseInt(params.fileId as string), name: 'Document', type: 'other' }
            });
            
            const welcomeMessage: ChatMessage = {
              id: generateUniqueMessageId(),
              content: 'Hello! I\'m your Chat Assistant. I\'m ready to help you with questions about your document. The document has been automatically added to this chat. What would you like to know?',
              sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
              is_own_message: false,
              created_at: new Date().toISOString(),
            };
            setMessages([welcomeMessage]);
            
            router.setParams({});
          }
        } catch (error) {
          console.error('Error fetching document details:', error);
          // Fallback: create a generic chat
          const fallbackChat: Chat = {
            id: Date.now(),
            title: 'Chat about Document',
            type: 'document_focused',
            participants: [{ id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }],
            last_message: 'Ready to answer questions about your document',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            unread_count: 0,
          };
          
          setChats(prev => {
            const chatAssistant = prev.find(chat => chat.id === -1); // Find the default Chat Assistant
            const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default Chat Assistant
            
            if (chatAssistant) {
              return [chatAssistant, fallbackChat, ...otherChats];
            } else {
              return [fallbackChat, ...prev];
            }
          });
          setSelectedChat(fallbackChat);
          
          // Set a generic document mention for fallback
          setSelectedMention({
            id: parseInt(params.fileId as string),
            type: 'file',
            name: 'Document',
            data: { id: parseInt(params.fileId as string), name: 'Document', type: 'other' }
          });
          
          const welcomeMessage: ChatMessage = {
            id: generateUniqueMessageId(),
            content: 'Hello! I\'m your Chat Assistant. I\'m ready to help you with questions about your document. The document has been automatically added to this chat. What would you like to know?',
            sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
            is_own_message: false,
            created_at: new Date().toISOString(),
          };
          setMessages([welcomeMessage]);
          
          router.setParams({});
        }
      }
    };

    handleFileIdContext();
  }, [params.fileId, loading]);

  // Handle bookmark context from navigation
  useEffect(() => {
    if (params.bookmark_id && params.bookmark_name) {
      const bookmarkContext: Bookmark = {
        id: parseInt(params.bookmark_id as string),
        name: params.bookmark_name as string,
        description: params.bookmark_description as string,
        file_count: parseInt(params.bookmark_file_count as string) || 0,
        documents: []
      };
      
      // Create a bookmark-focused chat
      const bookmarkChat: Chat = {
        id: Date.now(),
        title: `Chat about ${bookmarkContext.name}`,
        type: 'bookmark_focused',
        participants: [{ id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }],
        last_message: `Ready to answer questions about ${bookmarkContext.name}`,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        unread_count: 0,
        bookmark_context: bookmarkContext
      };
      
      // Add the chat to the list and select it
      setChats(prev => {
        const chatAssistant = prev.find(chat => chat.id === -1); // Find the default Chat Assistant
        const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default Chat Assistant
        
        if (chatAssistant) {
          // Chat Assistant exists, add new chat after it
          return [chatAssistant, bookmarkChat, ...otherChats];
        } else {
          // No Chat Assistant found, add new chat at beginning
          return [bookmarkChat, ...prev];
        }
      });
      setSelectedChat(bookmarkChat);
      
      // Don't show welcome message - just show empty chat
      setMessages([]);
      
      // Clear the params to prevent re-triggering
      router.setParams({});
    }
  }, [params.bookmark_id, params.bookmark_name, params.bookmark_description, params.bookmark_file_count]);

  // Handle workspace context from navigation
  useEffect(() => {
    if (params.workspaceId && params.workspaceName) {
      const workspaceContext: Workspace = {
        id: parseInt(params.workspaceId as string),
        name: params.workspaceName as string,
        description: params.workspaceDescription as string || '',
        slug: params.workspaceSlug as string || '',
        owner_id: parseInt(params.workspaceOwnerId as string) || 0,
        is_personal: params.workspaceIsPersonal === 'true',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        member_count: parseInt(params.workspaceMemberCount as string) || 0,
        user_role: (params.workspaceUserRole as any) || 'member',
        can_manage: params.workspaceCanManage === 'true',
        can_invite: params.workspaceCanInvite === 'true',
        can_edit: params.workspaceCanEdit === 'true'
      };
      
      // Create a workspace-focused chat
      const workspaceChat: Chat = {
        id: Date.now(),
        title: `Chat in ${workspaceContext.name}`,
        type: 'workspace',
        participants: [{ id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }],
        last_message: `Ready to chat in ${workspaceContext.name} workspace`,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        unread_count: 0,
        workspace: workspaceContext
      };
      
      // Add the chat to the list and select it
      setChats(prev => {
        const chatAssistant = prev.find(chat => chat.id === -1); // Find the default Chat Assistant
        const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default Chat Assistant
        
        if (chatAssistant) {
          // Chat Assistant exists, add new chat after it
          return [chatAssistant, workspaceChat, ...otherChats];
        } else {
          // No Chat Assistant found, add new chat at beginning
          return [workspaceChat, ...prev];
        }
      });
      setSelectedChat(workspaceChat);
      
      // Don't show welcome message - just show empty chat
      setMessages([]);
      
      // Clear the params to prevent re-triggering
      router.setParams({});
    }
  }, [params.workspaceId, params.workspaceName, params.workspaceDescription, params.workspaceSlug, params.workspaceOwnerId, params.workspaceIsPersonal, params.workspaceMemberCount, params.workspaceUserRole, params.workspaceCanManage, params.workspaceCanInvite, params.workspaceCanEdit]);

  const startBounceAnimation = () => {
    // Keep only the button bounce animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1.1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopBounceAnimation = () => {
    // Stop button animation
    bounceAnim.stopAnimation();
    bounceAnim.setValue(1);
  };

  // Stop message processing
  const stopProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSendingMessage(false);
    stopBounceAnimation();
  };

  // Progress tracking functions - removed, only using bouncing dots
  // const startProgressTracking = (taskId: string) => { ... };
  // const stopProgressTracking = () => { ... };

  useEffect(() => {
    loadChats();
    loadWorkspaces();
    loadDocuments();
    loadUsers();
    loadBookmarks();
  }, []);

  // Refresh chat list when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      // Load user profile first (needed for determining is_own_message)
      const loadUserProfile = async () => {
        try {
          const response = await api.getUserProfile();
          if (response) {
            setUserProfile(response);
          }
        } catch (error: any) {
          // Handle timeout and connection errors gracefully
          if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            console.warn('⚠️ User profile request timed out - will retry on next focus');
          } else if (error.message?.includes('Failed to fetch')) {
            console.warn('⚠️ User profile request failed - backend may be unavailable');
          } else {
            console.error('Failed to load user profile:', error);
          }
          // Don't set userProfile to null - keep existing value if available
        }
      };
      
      // Refresh chat list when screen comes into focus
      loadUserProfile();
      loadChats();
    }, [])
  );

  // Cleanup effect to abort any ongoing requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      stopBounceAnimation();
      // stopProgressTracking(); // Removed - only using bouncing dots now
    };
  }, []);

  // Track previous selectedChat to detect when returning from conversation
  const prevSelectedChatRef = useRef<Chat | null>(null);
  
  // Re-sort chats when returning from a conversation (selectedChat becomes null)
  useEffect(() => {
    // Only sort when transitioning from a chat to null (returning from conversation)
    // This ensures sorting happens when user returns to list, not when switching tabs
    if (prevSelectedChatRef.current !== null && selectedChat === null) {
      // User returned from conversation, re-sort the chats by last message timestamp
      setChats(prevChats => {
        if (prevChats.length === 0) return prevChats;
        return sortChatsByLastMessage(prevChats);
      });
    }
    // Update the ref for next comparison
    prevSelectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // Filter data based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      // Sort chats by last message timestamp (most recent first) but keep Chat Assistant at the top
      const finalChats = sortChatsByLastMessage(chats);
      
      setFilteredChats(finalChats);
      
      setFilteredDocuments(documents);
      setFilteredWorkspaces(workspaces);
      setFilteredUsers(users);
      setFilteredBookmarks(bookmarks);
    } else {
      const query = searchQuery.toLowerCase();
      const filteredChatsList = chats.filter(chat => {
        if (!chat || typeof chat !== 'object') return false;
        const title = String(chat.title || '').toLowerCase();
        const lastMessage = String(chat.last_message || '').toLowerCase();
        return title.includes(query) || lastMessage.includes(query);
      });
      
      // Sort filtered chats by last message timestamp (most recent first)
      const finalFilteredChats = sortChatsByLastMessage(filteredChatsList);
      
      setFilteredChats(finalFilteredChats);
      
      setFilteredDocuments(documents.filter(doc => 
        doc.name.toLowerCase().includes(query) ||
        (doc.category && doc.category.toLowerCase().includes(query))
      ));
      setFilteredWorkspaces(workspaces.filter(ws => 
        ws.name.toLowerCase().includes(query) ||
        (ws.description && ws.description.toLowerCase().includes(query))
      ));
      setFilteredUsers(users.filter(user => 
        user.username.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      ));
      setFilteredBookmarks(bookmarks.filter(bookmark => 
        bookmark.name.toLowerCase().includes(query) ||
        (bookmark.description && bookmark.description.toLowerCase().includes(query))
      ));
    }
  }, [searchQuery, chats, documents, workspaces, users, bookmarks]);

  // Filter mention results based on query
  useEffect(() => {
    const query = mentionQuery.toLowerCase();
    let results: any[] = [];

    if (query.trim()) {
      // Filter documents/files with flexible search
      const documentResults = documents.filter(doc => {
        const fileName = doc.name.toLowerCase();
        const category = (doc.category || '').toLowerCase();
        const type = (doc.type || '').toLowerCase();
        
        // Check for exact match, partial match, and word boundaries
        return fileName.includes(query) ||
               category.includes(query) ||
               type.includes(query) ||
               // Check if query matches start of any word in filename
               fileName.split(/[\s\-_.]/).some(word => word.startsWith(query)) ||
               // Check if query is an acronym (e.g., "ass" for "Assignment")
               fileName.split(/[\s\-_.]/).map(word => word.charAt(0)).join('').includes(query);
      }).map(doc => ({
        type: 'file',
        id: doc.id,
        name: doc.name,
        subtitle: doc.category || doc.type || 'Document',
        data: doc
      }));

      // Filter users
      const userResults = users.filter(user => 
        user.username.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      ).map(user => ({
        type: 'user',
        id: user.id,
        name: user.username,
        subtitle: user.email,
        data: user
      }));

      // Filter workspaces
      const workspaceResults = workspaces.filter(ws => 
        ws.name.toLowerCase().includes(query) ||
        (ws.description && ws.description.toLowerCase().includes(query))
      ).map(ws => ({
        type: 'workspace',
        id: ws.id,
        name: ws.name,
        subtitle: `${ws.member_count} members`,
        data: ws
      }));

      // Filter bookmarks
      const bookmarkResults = bookmarks.filter(bookmark => 
        bookmark.name.toLowerCase().includes(query) ||
        (bookmark.description && bookmark.description.toLowerCase().includes(query))
      ).map(bookmark => ({
        type: 'bookmark',
        id: bookmark.id,
        name: bookmark.name,
        subtitle: `${bookmark.file_count} files`,
        data: bookmark
      }));

      // Combine all results, prioritize files first (most relevant for AI), then users, workspaces, bookmarks
      results = [...documentResults, ...userResults, ...workspaceResults, ...bookmarkResults];
      
      // Debug logging for file search
      if (query.trim() && documentResults.length === 0 && documents.length > 0) {
        console.log(`🔍 No files found for query "${query}". Available files:`, documents.map(d => d.name));
      }
    } else {
      // Show recent/popular items when no query - prioritize recent files
      const recentDocuments = documents.slice(0, 5).map(doc => ({
        type: 'file',
        id: doc.id,
        name: doc.name,
        subtitle: doc.category || doc.type || 'Document',
        data: doc
      }));

      const recentUsers = (users || []).slice(0, 2).map(user => ({
        type: 'user',
        id: user.id,
        name: user.username,
        subtitle: user.email,
        data: user
      }));

      const recentWorkspaces = (workspaces || []).slice(0, 2).map(ws => ({
        type: 'workspace',
        id: ws.id,
        name: ws.name,
        subtitle: `${ws.member_count} members`,
        data: ws
      }));

      const recentBookmarks = (bookmarks || []).slice(0, 2).map(bookmark => ({
        type: 'bookmark',
        id: bookmark.id,
        name: bookmark.name,
        subtitle: `${bookmark.file_count} files`,
        data: bookmark
      }));

      results = [...recentDocuments, ...recentUsers, ...recentWorkspaces, ...recentBookmarks];
    }

    setMentionResults(results);
  }, [mentionQuery, users, bookmarks, workspaces, documents]);

  // Helper function to get last message timestamp in user's local timezone for sorting
  const getLastMessageTimestamp = (chat: Chat): number => {
    try {
      // Convert the date string to a Date object
      // JavaScript's new Date() automatically converts UTC to local timezone
      const date = new Date(chat.updated_at || chat.created_at || new Date().toISOString());
      
      if (isNaN(date.getTime())) {
        // If invalid date, return 0 so it sorts to the bottom
        return 0;
      }
      
      // Return the timestamp in local timezone (getTime() returns milliseconds since epoch)
      // The Date object already represents the time in local timezone
      return date.getTime();
    } catch (error) {
      if (__DEV__) {
        console.log('❌ Error getting last message timestamp:', error, 'for chat:', chat.id);
      }
      return 0;
    }
  };

  // Helper function to sort chats by last message timestamp
  const sortChatsByLastMessage = (chatsToSort: Chat[]): Chat[] => {
    const validChats = chatsToSort.filter(chat => chat && typeof chat === 'object');
    
    // Separate Chat Assistant from other chats
    const chatAssistant = validChats.find(chat => chat.id === -1);
    const otherChats = validChats.filter(chat => chat.id !== -1);
    
    // Sort other chats by last message timestamp (most recent first)
    // Use helper function to ensure dates are converted to user's local timezone
    const sortedOtherChats = [...otherChats].sort((a, b) => {
      const timestampA = getLastMessageTimestamp(a);
      const timestampB = getLastMessageTimestamp(b);
      return timestampB - timestampA;
    });
    
    // Always put Chat Assistant first, then other chats
    return chatAssistant ? [chatAssistant, ...sortedOtherChats] : [DEFAULT_CHAT_ASSISTANT, ...sortedOtherChats];
  };

  const loadChats = async (limit: number = 50, offset: number = 0) => {
    try {
      setLoading(true);
      
      // Try to load chat histories from backend (AI chats) with pagination
      const { fetchChatHistories } = useChatStore.getState();
      await fetchChatHistories(limit, offset);
      
      // Get the loaded histories from the store
      const { histories, error } = useChatStore.getState();
      
      if (error) {
        console.error('Chat store error:', error);
      }
      
      // Load user chats (SAME endpoint as web chat.tsx - user-to-user and workspace only)
      let userChats: Chat[] = [];
      try {
        const userChatsResponse = await api.getChats();
        if (userChatsResponse.success && (userChatsResponse as any).chats) {
          // Web chat.tsx returns: { success: true, chats: Chat[] }
          userChats = (userChatsResponse as any).chats.map((chat: any) => ({
            id: chat.id,
            title: chat.display_name || 'Untitled Chat',
            type: chat.type === 'direct' ? 'user_direct' as const : 'workspace' as const,
            participants: chat.participants || [],
            last_message: chat.latest_message?.content || 'No messages yet',
            updated_at: chat.last_message_at || new Date().toISOString(),
            created_at: chat.created_at || new Date().toISOString(),
            unread_count: chat.unread_count || 0,
            workspace: chat.workspace_id ? { id: chat.workspace_id, name: chat.display_name, slug: '' } as Workspace : undefined,
          }));
          
          console.log('📱 Loaded', userChats.length, 'user chats from web endpoint');
        }
      } catch (userChatError) {
        console.log('Failed to load user chats:', userChatError);
      }
      
      // Convert chat histories to the expected format, excluding any existing "Chat Assistant" chats
      let convertedChats: Chat[] = [];
      
      try {
        if (Array.isArray(histories)) {
          convertedChats = histories
            .filter(history => history && history.id !== -1) // Only filter out the actual default chat (ID -1)
            .map(history => {
              try {
                // Handle both new format (messages array) and existing format (conversation_data)
                const messages = (history as any).messages || (history as any).conversation_data || [];
                let lastMessage = 'No messages yet';
                
                if (Array.isArray(messages) && messages.length > 0) {
                  const lastMsg = messages[messages.length - 1];
                  if (lastMsg && typeof lastMsg === 'object') {
                    lastMessage = String((lastMsg as any).content || (lastMsg as any).message || 'No messages yet');
                  } else if (typeof lastMsg === 'string') {
                    lastMessage = String(lastMsg);
                  }
                }
                
                // Determine chat type based on selected context
                let chatType: 'ai_assistant' | 'document_focused' | 'bookmark_focused' | 'workspace' | 'user_direct' = 'ai_assistant';
                
                const historyData = history as any; // Type assertion for backend data
                
                // Debug: Log the first few chats to see what data we're getting
                if (history.id <= 5) {
                  console.log('🔍 Chat data for ID', history.id, ':', {
                    title: history.title,
                    selected_files: historyData.selected_files,
                    selected_bookmarks: historyData.selected_bookmarks,
                    selected_workspaces: historyData.selected_workspaces,
                    selected_users: historyData.selected_users
                  });
                }
                
                // Determine chat type based on selected context
                if (historyData.selected_files && historyData.selected_files.length > 0) {
                  chatType = 'document_focused';
                } else if (historyData.selected_bookmarks && historyData.selected_bookmarks.length > 0) {
                  chatType = 'bookmark_focused';
                } else if (historyData.selected_workspaces && historyData.selected_workspaces.length > 0) {
                  chatType = 'workspace';
                } else if (historyData.selected_users && historyData.selected_users.length > 0) {
                  chatType = 'user_direct';
                } else {
                  // Fallback: Try to infer chat type from title or conversation data
                  const title = String(history.title || '').toLowerCase();
                  const messages = historyData.conversation_data || [];
                  
                  // Check if title contains keywords that might indicate chat type
                  if (title.includes('document') || title.includes('file') || title.includes('pdf') || title.includes('doc')) {
                    chatType = 'document_focused';
                  } else if (title.includes('bookmark') || title.includes('collection')) {
                    chatType = 'bookmark_focused';
                  } else if (title.includes('workspace') || title.includes('team')) {
                    chatType = 'workspace';
                  } else if (title.includes('user') || title.includes('direct') || title.includes('message')) {
                    chatType = 'user_direct';
                  }
                  // Default remains 'ai_assistant'
                }
                
                // Debug: Log the determined chat type
                if (history.id <= 5) {
                  console.log('🎯 Chat type for ID', history.id, ':', chatType);
                }
                
                // Handle timestamp formatting for chat timestamps
                // Use last_message_at for chat listings (when last message was sent)
                // Use created_at for chat creation time
                let updatedAt = (history as any).last_message_at || history.updated_at || new Date().toISOString();
                let createdAt = history.created_at || new Date().toISOString();
                
                // Don't add timezone indicators - treat as local time
                // The backend timestamps are already in the correct format
                
                // Debug: Log the timestamps being used
                if (__DEV__ && history.id <= 5) {
                  console.log('🕐 Chat timestamp debug:', {
                    id: history.id,
                    title: history.title,
                    lastMessageAt: (history as any).last_message_at,
                    originalUpdatedAt: history.updated_at,
                    originalCreatedAt: history.created_at,
                    processedUpdatedAt: updatedAt,
                    processedCreatedAt: createdAt
                  });
                }
                
                return {
                  id: Number(history.id) || Math.random(),
                  title: String(history.title || 'Untitled Chat'),
                  type: chatType,
                  participants: [{ id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }],
                  last_message: String(lastMessage || 'No messages yet'),
                  updated_at: String(updatedAt),
                  created_at: String(createdAt),
                  unread_count: 0,
                  // Store context data for future use
                  document_context: historyData.selected_files && historyData.selected_files.length > 0 ? {
                    id: historyData.selected_files[0],
                    name: String(history.title || 'Document'),
                    type: 'other'
                  } : undefined,
                  bookmark_context: historyData.selected_bookmarks && historyData.selected_bookmarks.length > 0 ? {
                    id: historyData.selected_bookmarks[0],
                    name: String(history.title || 'Bookmark'),
                    file_count: 0
                  } : undefined
                };
              } catch (itemError) {
                console.error('Error processing chat history item:', itemError);
                return null;
              }
            })
            .filter(Boolean) as Chat[]; // Remove null items
        }
      } catch (conversionError) {
        console.error('Error converting chat histories:', conversionError);
        convertedChats = [];
      }
      
      // Combine AI chats and user chats, removing duplicates by ID
      const allChatsCombined = [...convertedChats, ...userChats];
      
      // Remove duplicates based on chat ID
      const uniqueChatsMap = new Map<number, Chat>();
      allChatsCombined.forEach(chat => {
        if (!uniqueChatsMap.has(chat.id)) {
          uniqueChatsMap.set(chat.id, chat);
        } else {
          // If duplicate found, keep the one with more recent last message timestamp
          const existing = uniqueChatsMap.get(chat.id)!;
          const existingTimestamp = getLastMessageTimestamp(existing);
          const newTimestamp = getLastMessageTimestamp(chat);
          if (newTimestamp > existingTimestamp) {
            uniqueChatsMap.set(chat.id, chat);
          }
        }
      });
      
      // Sort all chats by last message timestamp (most recent first), but keep Chat Assistant at top
      // Use helper function to ensure dates are converted to user's local timezone
      const allChatsArray = Array.from(uniqueChatsMap.values());
      const allChats = sortChatsByLastMessage(allChatsArray);
      
      console.log('📱 Loaded chats:', {
        total: allChats.length,
        aiChats: convertedChats.length,
        userChats: userChats.length,
        defaultChat: DEFAULT_CHAT_ASSISTANT,
        otherChats: allChats.length - 1, // Excluding Chat Assistant
      });
      setChats(allChats);
      
    } catch (error) {
      console.error('Failed to load chats:', error);
      // Fallback: just show default Chat Assistant
      setChats([DEFAULT_CHAT_ASSISTANT]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadWorkspaces = async () => {
    try {
      const response = await (api as any).getMobileWorkspaces();
      if (response.success && response.data) {
        // Handle both response structures: data.workspaces or data as array
        const workspacesData = Array.isArray(response.data) 
          ? response.data 
          : (response.data.workspaces || []);
        
        console.log('Workspaces loaded:', workspacesData.length);
        setWorkspaces(workspacesData);
      } else {
        console.log('Workspaces API returned no data');
        setWorkspaces([]);
      }
    } catch (error) {
      console.log('Failed to load workspaces:', error);
      setWorkspaces([]);
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await api.getFiles(1, 50); // Get up to 50 recent files for mentions
      if (response.success) {
        const docs = response.files?.map((file: any) => ({
          id: file.id,
          name: removeFileExtension(file.original_filename || file.filename),
          type: file.file_type,
          category: file.file_kind || file.category,
          size: file.file_size
        })) || [];
        setDocuments(docs);
        // console.log(`📄 Loaded ${docs.length} documents for mentions:`, docs.map(d => d.name));
      } else {
        setDocuments([]);
      }
    } catch (error) {
      console.log('Failed to load documents:', error);
      setDocuments([]);
    }
  };

  const loadUsers = async () => {
    try {
      // Use web chat.tsx search endpoint to get users
      const response = await api.searchUsersForChat('');
      if (response.success && (response as any).users) {
        setUsers((response as any).users);
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.log('Failed to load users:', error);
      setUsers([]);
    }
  };

  const loadBookmarks = async () => {
    try {
      // Add timeout handling - if request takes too long, cancel it
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Bookmarks request taking too long, may timeout');
      }, 25000); // Warn at 25 seconds
      
      const response = await (api as any).getBookmarks();
      clearTimeout(timeoutId);
      
      if (response.success && response.data) {
        // Handle both response structures: data.bookmarks or data as array
        const bookmarksData = Array.isArray(response.data) 
          ? response.data 
          : (response.data.bookmarks || []);
        
        console.log('Bookmarks loaded:', bookmarksData.length);
        setBookmarks(bookmarksData);
      } else {
        console.log('Bookmarks API returned no data');
        setBookmarks([]);
      }
    } catch (error: any) {
      // Handle timeout errors gracefully
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        console.warn('⚠️ Bookmarks request timed out - this is non-critical, continuing without bookmarks');
      } else {
        console.log('Failed to load bookmarks:', error);
      }
      setBookmarks([]);
    }
  };

  const loadMessages = async (chatId: number) => {
    setMessagesLoading(true);
    
    try {
      // If it's the Chat Assistant (id: -1), show welcome message
      if (chatId === -1) {
        const welcomeMessage: ChatMessage = {
          id: generateUniqueMessageId(),
          content: 'Hello! I\'m your Chat Assistant. I can help you with questions about your documents, analyze files, and provide insights. How can I help you today?',
          sender: { id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' },
          is_own_message: false,
          created_at: new Date().toISOString(), // This is fine for Chat Assistant as it's always current
        };
        setMessages([welcomeMessage]);
        return;
      }
      
      // FIRST: Check the chat type from the local chats array
      // This is the most reliable way to determine if it's a user chat or AI chat
      const chat = chats.find(c => c.id === chatId);
      
      // Check if this chat exists in the chat store (AI assistant chats)
      // CRITICAL: All chats from /api/v1/mobile/chat/history are AI assistant chats
      // Compare IDs robustly to handle string/number mismatches
      const { histories, currentHistory } = useChatStore.getState();
      const chatExistsInStore = (histories && histories.length > 0 && histories.some(h => {
        const historyId = typeof h.id === 'string' ? parseInt(String(h.id), 10) : Number(h.id);
        const targetId = typeof chatId === 'string' ? parseInt(String(chatId), 10) : Number(chatId);
        return !isNaN(historyId) && !isNaN(targetId) && historyId === targetId;
      })) || 
      (currentHistory && (() => {
        const currentId = typeof currentHistory.id === 'string' ? parseInt(String(currentHistory.id), 10) : Number(currentHistory.id);
        const targetId = typeof chatId === 'string' ? parseInt(String(chatId), 10) : Number(chatId);
        return !isNaN(currentId) && !isNaN(targetId) && currentId === targetId;
      })());
      
      // Determine if this is an AI chat based on type or store presence
      // CRITICAL LOGIC:
      // 1. If chat exists in store (from /api/v1/mobile/chat/history), it's ALWAYS an AI chat - NEVER use user-chat endpoint
      // 2. If chat type is 'ai_assistant', 'document_focused', or 'bookmark_focused', it's ALWAYS an AI chat
      // 3. If chat type is 'user_direct' or 'workspace', it's a user chat - use user-chat endpoint
      // 4. FALLBACK: If chat not found in local array AND not explicitly user/workspace type, assume it's an AI chat
      //    (This handles cases where chat history is loaded but chat list hasn't been updated yet)
      const isAIChat = chatExistsInStore || 
                       (chat && (chat.type === 'ai_assistant' || chat.type === 'document_focused' || chat.type === 'bookmark_focused')) ||
                       (!chat); // If chat not found in local array, assume AI chat (safer default)
      
      console.log(`🔍 [loadMessages] Chat ${chatId} check:`, {
        chatFound: !!chat,
        chatType: chat?.type,
        chatExistsInStore,
        isAIChat,
        historiesCount: histories?.length || 0,
        historyIds: histories?.slice(0, 10).map(h => h.id) || [],
        willUseUserChatEndpoint: !isAIChat && chat && (chat.type === 'user_direct' || chat.type === 'workspace')
      });
      
      // Only use user-chat endpoint for actual user/workspace chats that are NOT AI chats
      // AI assistant chats (ai_assistant, document_focused, bookmark_focused) are document queries and should use chat store
      // IMPORTANT: Only use user-chat endpoint if chat is EXPLICITLY a user/workspace chat AND not an AI chat
      if (!isAIChat && chat && (chat.type === 'user_direct' || chat.type === 'workspace')) {
          // Load user chat messages using web endpoint (same as web chat.tsx)
          try {
            const response = await api.getChatMessages(chatId);
            if (response.success && (response as any).messages) {
              // Web chat.tsx returns: { success: true, messages: ChatMessage[] }
              const convertedMessages: ChatMessage[] = (response as any).messages.map((msg: any) => ({
                id: msg.id,
                content: msg.content || '',
                sender: msg.sender || null,
                is_own_message: msg.sender_id === userProfile?.id,
                created_at: msg.created_at || new Date().toISOString(),
                document_context: msg.metadata?.attachments?.[0] ? {
                  id: msg.metadata.attachments[0].file_id,
                  name: msg.metadata.attachments[0].name,
                  type: msg.metadata.attachments[0].mimeType || 'other'
                } : undefined
              }));
              
              setMessages(convertedMessages);
            } else {
              setMessages([]);
            }
          } catch (error: any) {
            console.error(`❌ Failed to load messages for chat ${chatId}:`, error.message || error);
            // If chat doesn't exist, clear messages and refresh chat list
            if (error.message?.includes('Chat not found') || error.message?.includes('404') || error.response?.status === 404) {
              console.warn(`⚠️ Chat ${chatId} not found in user-chat endpoint, trying chat store instead`);
              // If it's a 404, it might be an AI assistant chat that was misclassified
              // Try loading from chat store instead
              try {
                const { fetchChatConversation } = useChatStore.getState();
                await fetchChatConversation(chatId);
                const { currentHistory: fallbackHistory } = useChatStore.getState();
                if (fallbackHistory && fallbackHistory.messages.length > 0) {
                  const convertedMessages: ChatMessage[] = fallbackHistory.messages.map((msg, index) => {
                    const backendMsg = msg as any;
                    let timestamp = backendMsg.created_at || backendMsg.timestamp;
                    // Use backend message ID if available, otherwise generate unique ID
                    const backendMessageId = backendMsg.message_id || backendMsg.id;
                    const messageId = backendMessageId ? backendMessageId : generateUniqueMessageId();
                    return {
                      id: typeof messageId === 'number' ? messageId : generateUniqueMessageId(),
                      content: msg.content || '',
                      sender: msg.role === 'user' ? null : { id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' },
                      is_own_message: msg.role === 'user',
                      created_at: timestamp || new Date().toISOString(),
                    };
                  });
                  setMessages(convertedMessages);
                } else {
                  setMessages([]);
                }
              } catch (storeError) {
                console.error(`❌ Failed to load from chat store for chat ${chatId}:`, storeError);
                setMessages([]);
                // Refresh the chat list to remove stale chat IDs
                loadChats();
              }
            } else {
              setMessages([]);
            }
          }
          return;
      }
      
      // If chat is an AI chat, or not found in local list, or exists in chat store, use chat store
      // AI assistant chats (ai_assistant, document_focused, bookmark_focused) are document queries, NOT user chats
      if (isAIChat) {
        console.log(`📚 Chat ${chatId} is an AI assistant chat (type: ${chat?.type || 'unknown'}, in store: ${chatExistsInStore}) - using chat store`);
      } else if (!chat) {
        // Chat not found in local array - if it's not explicitly a user chat, try chat store first
        // This handles the case where chat history is loaded but chat list hasn't been updated yet
        console.log(`⚠️ Chat ${chatId} not found in local list, trying chat store first (might be AI assistant chat)...`);
      } else {
        console.log(`⚠️ Chat ${chatId} found but type is ${chat.type} - isAIChat=${isAIChat}, will ${isAIChat ? 'use chat store' : 'use user-chat endpoint'}`);
      }
      
      // Use the chat store to load the specific conversation (for AI chats/document queries)
      // console.log('🔄 Loading messages for chat ID:', chatId);
      const { fetchChatConversation } = useChatStore.getState();
      await fetchChatConversation(chatId);
      
      // Get the current history from the store
      const { currentHistory: storeHistory } = useChatStore.getState();
      console.log('📋 Current history from store:', storeHistory);
      
      if (storeHistory && storeHistory.messages.length > 0) {
        // Convert chat store messages to the expected format
        const convertedMessages: ChatMessage[] = storeHistory.messages.map((msg, index) => {
          // Use actual message timestamp from backend - the backend provides 'created_at' field
          // Use type assertion to access backend response fields
          const backendMsg = msg as any;
          let timestamp = backendMsg.created_at || backendMsg.timestamp;
          
          // Debug: Log the message timestamp
          if (__DEV__ && index < 3) {
            // console.log('🕐 Message timestamp debug:', {
            //   index,
            //   created_at: backendMsg.created_at,
            //   timestamp: backendMsg.timestamp,
            //   finalTimestamp: timestamp
            // });
          }
          
          // Use backend message ID if available, otherwise generate unique ID
          // Backend messages may have message_id field
          const backendMessageId = backendMsg.message_id || backendMsg.id;
          const messageId = backendMessageId ? backendMessageId : generateUniqueMessageId();
          
          return {
            id: typeof messageId === 'number' ? messageId : generateUniqueMessageId(),
            content: msg.content || '',
            sender: msg.role === 'user' ? null : { id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' },
            is_own_message: msg.role === 'user',
            created_at: timestamp || new Date().toISOString(),
          };
        });
        
        setMessages(convertedMessages);
      } else {
        // For empty chats, don't show any welcome message - just show empty chat
        setMessages([]);
      }
    } catch (error: any) {
      console.error('Failed to load messages:', error);
      
      // If it's a 404, the chat might not exist anymore - refresh chat list
      if (error.message?.includes('Chat not found') || error.message?.includes('404') || error.response?.status === 404) {
        console.warn(`⚠️ Chat ${chatId} not found, refreshing chat list`);
        setMessages([]);
        loadChats();
      } else {
        // Show error message for other errors
        const errorMessage: ChatMessage = {
          id: generateUniqueMessageId(),
          content: 'Failed to load messages. Please try again.',
          sender: null,
          is_own_message: false,
          created_at: new Date().toISOString(),
        };
        setMessages([errorMessage]);
      }
    } finally {
      setMessagesLoading(false);
    }
  };

  // Helper function to start/continue character streaming
  const startOrContinueStreaming = (assistantMsgIndex: number) => {
    console.log('🎬 startOrContinueStreaming called, isStreaming:', isStreamingRef.current, 'contentBuffer length:', contentBufferRef.current.length, 'displayedChars:', displayedCharsRef.current, 'isFakeStreaming:', isFakeStreamingRef.current);
    
    // If already streaming with an interval, clear it first to restart
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
      console.log('🔄 Cleared existing streaming interval');
    }
    
    // Don't start if buffer is empty
    if (!contentBufferRef.current || contentBufferRef.current.length === 0) {
      console.log('⏸️ Content buffer is empty, skipping');
      return;
    }
    
    // Don't start if we've already displayed all content (unless it's fake streaming that needs to continue)
    if (displayedCharsRef.current >= contentBufferRef.current.length && !isFakeStreamingRef.current) {
      console.log('⏸️ All content already displayed, skipping');
      return;
    }
    
    console.log('🚀 Starting new streaming interval...');
    isStreamingRef.current = true;
    
    // Get dynamic speeds based on current phase
    const getCurrentSpeed = () => {
      if (isPreviewPhaseRef.current) {
        return { charsPerInterval: 2, intervalMs: 30 }; // Preview: SLOWER TYPING (67 chars/sec)
      } else {
        return { charsPerInterval: 2, intervalMs: 30 }; // Refinement: FAST (67 chars/sec)
      }
    };
    
    streamingIntervalRef.current = setInterval(() => {
      // Check if we have more content to display
      if (displayedCharsRef.current >= contentBufferRef.current.length) {
        // No more content available yet, keep waiting (silently)
        return;
      }
      
      // Get current speed settings
      const { charsPerInterval } = getCurrentSpeed();
      
      // Display next batch of characters
      const endIndex = Math.min(displayedCharsRef.current + charsPerInterval, contentBufferRef.current.length);
      const displayText = contentBufferRef.current.slice(0, endIndex);
      displayedCharsRef.current = endIndex;
      
      console.log(`📝 Streaming ${isPreviewPhaseRef.current ? 'PREVIEW' : 'REFINEMENT'}: ${displayedCharsRef.current}/${contentBufferRef.current.length} chars`);
      
      // Update UI with current content
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages[assistantMsgIndex]) {
          newMessages[assistantMsgIndex] = {
            ...newMessages[assistantMsgIndex],
            content: displayText
          };
          console.log(`🔄 Updated message ${assistantMsgIndex} with content: "${displayText.substring(0, 50)}..."`);
        } else {
          // Create new assistant message if it doesn't exist
          const assistantMessage: ChatMessage = {
            id: generateUniqueMessageId(),
            content: displayText,
            sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
            is_own_message: false,
            created_at: new Date().toISOString()
          };
          newMessages.push(assistantMessage);
          console.log(`🔄 Created new assistant message with content: "${displayText.substring(0, 50)}..."`);
        }
        return newMessages;
      });
    }, 5) as unknown as number; // Fixed interval - speed is controlled by charsPerInterval
  };
  
  // Helper function to stop streaming and finalize
  const stopStreaming = (assistantMsgIndex: number, isFinal: boolean) => {
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }
    isStreamingRef.current = false;
    
    if (isFinal) {
      console.log(`✅ Streaming complete - displayed all ${displayedCharsRef.current} characters`);
      // Final update with complete state
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages[assistantMsgIndex]) {
          newMessages[assistantMsgIndex] = {
            ...newMessages[assistantMsgIndex],
            content: contentBufferRef.current
          };
        } else {
          // Create new assistant message if it doesn't exist
          const assistantMessage: ChatMessage = {
            id: generateUniqueMessageId(),
            content: contentBufferRef.current,
            sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
            is_own_message: false,
            created_at: new Date().toISOString()
          };
          newMessages.push(assistantMessage);
        }
        return newMessages;
      });
    }
  };

  const sendMessage = async () => {
    if (!selectedChat || !newMessage.trim()) return;

    // Declare assistantMessageIndex outside try-catch so it's accessible in both
    let assistantMessageIndex = 0;

    try {
      setSendingMessage(true);
      startBounceAnimation();
      
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();
      
      // Add user message immediately for better UX
      const userMessage: ChatMessage = {
        id: generateUniqueMessageId(),
        content: newMessage.trim(),
        sender: null,
        is_own_message: true,
        created_at: new Date().toISOString(),
      };
      
      // Save message text before clearing
      const messageText = newMessage.trim();
      
      // Calculate assistant message index: it will be at messages.length after user message is added
      assistantMessageIndex = messages.length;
      
      // Add user message
      setMessages(prev => [...prev, userMessage]);
      setNewMessage('');

      // Reset streaming state
      contentBufferRef.current = '';
      displayedCharsRef.current = 0;
      isPreviewPhaseRef.current = true;
      isStreamingRef.current = false;
      isFakeStreamingRef.current = false;

      // For AI assistant chats, use streaming
      if (selectedChat.type === 'ai_assistant' || selectedChat.type === 'document_focused' || selectedChat.type === 'bookmark_focused') {
        // Initialize state for fake streaming from ProcessingMessageDisplay component
        // The ProcessingMessageDisplay will show looping messages until real content arrives
        contentBufferRef.current = '';
        displayedCharsRef.current = 0;
        isPreviewPhaseRef.current = true;
        isFakeStreamingRef.current = true; // Enable fake streaming display (ProcessingMessageDisplay)
        isStreamingRef.current = false;
        
         // Create placeholder assistant message - fake streaming from file will populate it
          const placeholderMessage: ChatMessage = {
            id: generateUniqueMessageId(),
            content: '', // Fake streaming from file will populate this
            sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
            is_own_message: false,
            created_at: new Date().toISOString()
          };
        setMessages(prev => {
          assistantMessageIndex = prev.length; // Update to correct index after user message is added
          console.log('📝 Created placeholder message at index', assistantMessageIndex, 'fake streaming from file will handle display');
          return [...prev, placeholderMessage];
        });
        
        // Don't start streaming here - fake streaming from file is already running
        // Build context for AI
        let chatContext = userMessage.content;
        
        if (selectedChat.type === 'document_focused' && selectedChat.document_context) {
          chatContext = `Document: ${selectedChat.document_context.name}\nQuestion: ${userMessage.content}`;
        } else if (selectedChat.type === 'bookmark_focused' && selectedChat.bookmark_context) {
          chatContext = `Bookmark Collection: ${selectedChat.bookmark_context.name} (${selectedChat.bookmark_context.file_count} files)\nDescription: ${selectedChat.bookmark_context.description}\nQuestion: ${userMessage.content}`;
        }
        
        // Add mention context if available
        if (selectedMention) {
          console.log('📎 Persistent mention active:', selectedMention);
          chatContext += `\n\nContext: This message mentions a ${selectedMention.type} called "${selectedMention.name}".`;
        }
        
        // Build search filters based on context
        let searchFilters = {};
        
        if (selectedMention) {
          if (selectedMention.type === 'bookmark') {
            // Filter to only search within this bookmark's documents
            const bookmarkDocumentIds = selectedMention.data.documents?.map((doc: any) => doc.id) || [];
            searchFilters = {
              bookmark_id: selectedMention.id,
              document_ids: bookmarkDocumentIds,
              context_type: 'bookmark'
            };
          } else if (selectedMention.type === 'workspace') {
            searchFilters = {
              workspace_id: selectedMention.id,
              context_type: 'workspace'
            };
          } else if (selectedMention.type === 'file') {
            searchFilters = {
              document_ids: [selectedMention.id],
              context_type: 'document'
            };
          } else if (selectedMention.type === 'user') {
            searchFilters = {
              user_id: selectedMention.id,
              context_type: 'user'
            };
          }
        } else if (selectedChat.type === 'bookmark_focused' && selectedChat.bookmark_context) {
          // Use bookmark context from the chat
          searchFilters = {
            bookmark_id: selectedChat.bookmark_context.id,
            context_type: 'bookmark'
          };
        } else if (selectedChat.type === 'document_focused' && selectedChat.document_context) {
          // Use document context from the chat
          searchFilters = {
            document_ids: [selectedChat.document_context.id],
            context_type: 'document'
          };
        }
        
        // Build search filters for streaming
        let streamFilters: any = {};
        if (selectedMention) {
          const documentIds = selectedMention.type === 'bookmark' 
            ? selectedMention.data.documents?.map((doc: any) => doc.id) || []
            : selectedMention.type === 'file' 
            ? [selectedMention.id]
            : undefined;
            
          streamFilters = {
            context_type: selectedMention.type,
            context_id: selectedMention.id,
            document_ids: documentIds
          };
        } else {
          // Use general chat endpoint for AI assistant with context filters and search type
          streamFilters = {
            search_type: selectedSearchType, // Add selected search type
            ...searchFilters // Include any context filters (bookmark, document, etc.)
          };
        }
        
        // CRITICAL: Add chat_history_id if this is an existing chat (not the default chat assistant)
        // This ensures conversation history is loaded for context and pronoun resolution
        if (selectedChat && selectedChat.id && selectedChat.id !== -1) {
          streamFilters.chat_history_id = selectedChat.id;
          console.log('📋 [MOBILE] Adding chat_history_id to filters:', selectedChat.id);
        }

        // Use SSE streaming for AI chat
        await (api as any).sendChatMessageStream(
          chatContext,
          streamFilters,
          abortControllerRef.current?.signal,
          (type: string, data: any) => {
            // Handle different SSE event types
            switch (type) {
              case 'status':
              case 'started':
              case 'understanding':
              case 'understood':
              case 'searching':
              case 'search_results':
              case 'refining':
              case 'synthesizing':
                // Status events - don't update content, let fake streaming from file handle it
                // Just ensure message exists (fake streaming will populate content)
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (!newMessages[assistantMessageIndex]) {
                    // Only create message if it doesn't exist - don't update content
                    const assistantMessage: ChatMessage = {
                      id: generateUniqueMessageId(),
                      content: '', // Fake streaming from file will populate this
                      sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
                      is_own_message: false,
                      created_at: new Date().toISOString()
                    };
                    newMessages.push(assistantMessage);
                  }
                  // Don't update content - let fake streaming from file continue
                  return newMessages;
                });
                break;

              case 'instant_preview':
                // Instant preview received - replace fake streaming with real content
                const instantContent = data.content || '';
                console.log('⚡ INSTANT preview received:', instantContent.substring(0, 50));
                
                // Replace fake content with real content
                contentBufferRef.current = instantContent;
                displayedCharsRef.current = 0;
                isPreviewPhaseRef.current = true;
                isFakeStreamingRef.current = false; // Real content arrived, stop fake streaming
                
                // Display first chunk immediately
                const initialCharsToShow = Math.min(20, instantContent.length);
                const initialContent = instantContent.slice(0, initialCharsToShow);
                displayedCharsRef.current = initialCharsToShow;
                
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages[assistantMessageIndex]) {
                    newMessages[assistantMessageIndex] = {
                      ...newMessages[assistantMessageIndex],
                      content: initialContent,
                      is_own_message: false, // Explicitly set to false for assistant messages
                      sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }
                    };
                  } else {
                    // Create new assistant message
                    const assistantMessage: ChatMessage = {
                      id: generateUniqueMessageId(),
                      content: initialContent,
                      sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
                      is_own_message: false,
                      created_at: new Date().toISOString()
                    };
                    newMessages.push(assistantMessage);
                  }
                  return newMessages;
                });
                
                // Continue streaming with real content
                startOrContinueStreaming(assistantMessageIndex);
                break;

              case 'fallback_response':
                // Handle non-streaming response - replace fake streaming with real content
                console.log('📝 Received fallback response:', data.content);
                isFakeStreamingRef.current = false; // Real content arrived, stop fake streaming
                contentBufferRef.current = data.content || '';
                displayedCharsRef.current = 0;
                
                // Display content with streaming animation
                startOrContinueStreaming(assistantMessageIndex);
                
                // Stop streaming after content is fully displayed
                setTimeout(() => {
                  stopStreaming(assistantMessageIndex, true);
                }, (data.content?.length || 0) * 50 + 1000);
                break;

              case 'error':
                // Handle streaming errors gracefully with user-friendly messages
                console.error('❌ Streaming error:', data.error);
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages[assistantMessageIndex]) {
                    newMessages[assistantMessageIndex] = {
                      ...newMessages[assistantMessageIndex],
                      content: data.content || 'Sorry, there was an error processing your request. Please try again.',
                      is_own_message: false, // Explicitly set to false for assistant messages
                      sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }
                    };
                  }
                  return newMessages;
                });
                break;

              case 'chunk':
              case 'preview_chunk':
                // Template preview chunk - replace fake streaming with real content
                const previewChunkContent = data.content || '';
                console.log('📦 Template preview chunk received:', previewChunkContent.substring(0, 50), 'chunk_index:', data.chunk_index);
                
                // Replace fake content with real content
                isFakeStreamingRef.current = false; // Real content arrived, stop fake streaming
                
                // Check if first chunk or append
                if (data.chunk_index === 0 || contentBufferRef.current.length === 0) {
                  // First chunk - replace fake/instant preview
                  console.log('📦 First chunk - replacing content buffer with:', previewChunkContent);
                  contentBufferRef.current = previewChunkContent;
                  displayedCharsRef.current = 0;
                  
                  // CRITICAL: Ensure message exists and is visible
                  setMessages(prev => {
                    const newMessages = [...prev];
                    if (!newMessages[assistantMessageIndex]) {
                      // Create message if it doesn't exist
                      const assistantMessage: ChatMessage = {
                        id: generateUniqueMessageId(),
                        content: previewChunkContent, // Set initial content immediately
                        sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
                        is_own_message: false,
                        created_at: new Date().toISOString()
                      };
                      newMessages.push(assistantMessage);
                      console.log('📦 Created missing assistant message at index', assistantMessageIndex, 'with content:', previewChunkContent);
                      return newMessages;
                    } else {
                      // Update existing message immediately with first chunk
                      newMessages[assistantMessageIndex] = {
                        ...newMessages[assistantMessageIndex],
                        content: previewChunkContent
                      };
                      console.log('📦 Updated existing message with first chunk');
                      return newMessages;
                    }
                  });
                } else {
                  // Subsequent chunks - append
                  contentBufferRef.current += previewChunkContent;
                }
                
                // CRITICAL: Force restart streaming to ensure content is displayed
                // Stop fake streaming and start real streaming
                isFakeStreamingRef.current = false;
                console.log('📦 Starting streaming with real content:', contentBufferRef.current.substring(0, 50));
                startOrContinueStreaming(assistantMessageIndex);
                break;

              case 'preview_complete':
                console.log('✅ Preview complete');
                // Ensure preview is fully displayed before moving to refinement
                if (displayedCharsRef.current < contentBufferRef.current.length) {
                  // Still streaming preview, let it finish
                  console.log('⏳ Preview still streaming, waiting for completion...');
                } else {
                  console.log('✅ Preview fully displayed, ready for refinement');
                }
                break;

              case 'refinement_chunk':
                const refinementChunkContent = data.content || '';
                console.log('🔄 Refinement chunk received');
                
                // Replace fake content if still in fake streaming mode
                isFakeStreamingRef.current = false; // Real content arrived, stop fake streaming
                
                if (data.chunk_index === 0) {
                  // First refinement chunk - ensure preview is fully displayed first
                  const waitForPreviewComplete = () => {
                    if (displayedCharsRef.current >= contentBufferRef.current.length && isPreviewPhaseRef.current) {
                      // Preview is complete, start refinement
                      console.log('🔄 Starting refinement phase');
                      contentBufferRef.current = refinementChunkContent;
                      displayedCharsRef.current = 0;
                      isPreviewPhaseRef.current = false;
                      startOrContinueStreaming(assistantMessageIndex);
                    } else {
                      // Still streaming preview, wait a bit more
                      setTimeout(waitForPreviewComplete, 100);
                    }
                  };
                  waitForPreviewComplete();
                } else {
                  // Subsequent chunks - append
                  contentBufferRef.current += refinementChunkContent;
                }
                break;

              case 'complete':
                console.log('✅ Stream complete');
                console.log('✅ Final content buffer:', contentBufferRef.current);
                
                // CRITICAL: Ensure message exists and has final content
                setMessages(prev => {
                  const newMessages = [...prev];
                  const finalContent = data.response || contentBufferRef.current || '';
                  
                  if (newMessages[assistantMessageIndex]) {
                    // Update existing message with final content
                    newMessages[assistantMessageIndex] = {
                      ...newMessages[assistantMessageIndex],
                      content: finalContent || contentBufferRef.current
                    };
                    console.log('✅ Updated message with final content:', finalContent.substring(0, 50));
                  } else {
                    // Create message if it doesn't exist (shouldn't happen, but safety check)
                    const assistantMessage: ChatMessage = {
                      id: generateUniqueMessageId(),
                      content: finalContent || contentBufferRef.current,
                      sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
                      is_own_message: false,
                      created_at: new Date().toISOString()
                    };
                    newMessages.push(assistantMessage);
                    console.log('✅ Created missing message with final content');
                  }
                  return newMessages;
                });
                
                // Update content buffer with final response if provided
                if (data.response) {
                  console.log('✅ Complete event has response field:', data.response.substring(0, 50), 'length:', data.response.length);
                  contentBufferRef.current = data.response;
                  displayedCharsRef.current = data.response.length;
                  
                  // CRITICAL: Immediately update message with final response
                  setMessages(prev => {
                    const newMessages = [...prev];
                    if (newMessages[assistantMessageIndex]) {
                      newMessages[assistantMessageIndex] = {
                        ...newMessages[assistantMessageIndex],
                        content: data.response
                      };
                      console.log('✅ Immediately updated message with complete response:', data.response.substring(0, 50));
                    } else {
                      console.error('❌ Assistant message not found at index', assistantMessageIndex);
                    }
                    return newMessages;
                  });
                }
                
                // Stop streaming and finalize
                setTimeout(() => {
                  stopStreaming(assistantMessageIndex, true);
                  
                  // Auto-scroll to bottom
                  setTimeout(() => {
                    messagesRef.current?.scrollToEnd({ animated: true });
                  }, 100);
                }, 500);
                break;

              default:
                console.log('Unknown SSE event type:', type);
            }
          }
        );

        // After streaming completes, update chat list
        setChats(prev => prev.map(chat => 
          chat.id === selectedChat?.id 
            ? { ...chat, last_message: contentBufferRef.current.substring(0, 50) + '...', updated_at: new Date().toISOString() }
            : chat
        ));
      } else if (selectedChat.type === 'user_direct') {
        // Send direct message using web endpoint (same as web chat.tsx)
        const response = await api.sendChatMessageToChat(messageText, selectedChat.id);
        
        if (response.success && (response as any).message) {
          // Web chat.tsx returns: { success: true, message: ChatMessage }
          const newMsg = (response as any).message;
          setMessages(prev => [...prev, {
            id: newMsg.id,
            content: newMsg.content,
            sender: newMsg.sender,
            is_own_message: true,
            created_at: newMsg.created_at || new Date().toISOString()
          }]);
          
          // Update chat list
          setChats(prev => prev.map(chat => 
            chat.id === selectedChat.id 
              ? { ...chat, last_message: newMsg.content.substring(0, 50), updated_at: newMsg.created_at || new Date().toISOString() }
              : chat
          ));
        }
      } else if (selectedChat.type === 'workspace') {
        // Send workspace message using web endpoint (same as web chat.tsx)
        const response = await api.sendChatMessageToChat(messageText, selectedChat.id);
        
        if (response.success && (response as any).message) {
          // Web chat.tsx returns: { success: true, message: ChatMessage }
          const newMsg = (response as any).message;
          setMessages(prev => [...prev, {
            id: newMsg.id,
            content: newMsg.content,
            sender: newMsg.sender,
            is_own_message: true,
            created_at: newMsg.created_at || new Date().toISOString()
          }]);
          
          // Update chat list
          setChats(prev => prev.map(chat => 
            chat.id === selectedChat.id 
              ? { ...chat, last_message: newMsg.content.substring(0, 50), updated_at: newMsg.created_at || new Date().toISOString() }
              : chat
          ));
        }
      } else {
        // Fallback to general chat (non-streaming)
        const response = await (api as any).sendChatMessage(messageText, {}, abortControllerRef.current?.signal);
        
        if (response.success && (response.response || response.data?.response)) {
          const responseText = response.response || response.data?.response || 'No response received';
          
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[assistantMessageIndex] = {
              ...newMessages[assistantMessageIndex],
              content: responseText,
              is_own_message: false, // Explicitly set to false for assistant messages
              sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }
            };
            return newMessages;
          });
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request was aborted');
        // Stop fake streaming if it was active
        if (isFakeStreamingRef.current) {
          stopStreaming(assistantMessageIndex, false);
          isFakeStreamingRef.current = false;
        }
        // Don't show error for aborted requests
        return;
      }
      console.error('Failed to send message:', error);
      
      // Determine user-friendly error message based on error type
      let fallbackResponse = "I apologize, but I'm experiencing some technical difficulties right now. Let me try to help you with a general response based on your question.\n\n" +
        "Based on your query, I can provide some general guidance, though I may not have access to your specific documents at the moment. " +
        "Please try again in a moment, or feel free to rephrase your question if you'd like to continue our conversation.";
      
      if (error.message?.includes('Network request timed out') || 
          error.message?.includes('timeout') ||
          error.message?.includes('ECONNABORTED') ||
          error.message?.includes('TypeError: Network request timed out')) {
        fallbackResponse = "⚠️ Connection timed out. Please check your internet connection and try again.\n\n" +
          "I'm unable to process your request right now due to a connection timeout. This usually happens when:\n" +
          "• Your internet connection is slow or unstable\n" +
          "• The server is temporarily busy\n\n" +
          "Please try again in a moment.";
      } else if (error.message?.includes('Network Error') || 
                 error.message?.includes('ERR_NETWORK') ||
                 error.message?.includes('fetch')) {
        fallbackResponse = "🌐 Unable to connect to the server. Please check your internet connection.\n\n" +
          "I'm unable to reach the server right now. This usually means:\n" +
          "• Your internet connection is not working\n" +
          "• The server is temporarily unavailable\n" +
          "• There might be a network configuration issue\n\n" +
          "Please check your connection and try again.";
      } else if (error.message?.includes('No response from server')) {
        fallbackResponse = "🔌 No response from server. Please check your connection and try again.\n\n" +
          "The server didn't respond to your request. This could be due to:\n" +
          "• Server maintenance or downtime\n" +
          "• Network connectivity issues\n" +
          "• Server overload\n\n" +
          "Please try again in a few moments.";
      }
      
      // Replace fake streaming with error fallback content
      isFakeStreamingRef.current = false; // No longer fake, this is the final content
      contentBufferRef.current = fallbackResponse;
      displayedCharsRef.current = 0;
      isPreviewPhaseRef.current = true;
      isStreamingRef.current = true;
      
      // Continue streaming with error message
      startOrContinueStreaming(assistantMessageIndex);
      
      // Stop streaming after content is fully displayed
      setTimeout(() => {
        stopStreaming(assistantMessageIndex, true);
      }, fallbackResponse.length * 50 + 1000); // 50ms per character + 1 second buffer
      
    } finally {
      setSendingMessage(false);
      stopBounceAnimation();
      abortControllerRef.current = null;
      // Keep selected mention active for the entire chat session
      // It will only be cleared when user explicitly removes it or switches chats
    }
  };

  const selectChat = (chat: Chat) => {
    // Abort any ongoing requests when switching chats
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Stop streaming if active
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }
    isStreamingRef.current = false;
    
    setSendingMessage(false);
    stopBounceAnimation();
    
    setSelectedChat(chat);
    loadMessages(chat.id);
    // Clear any existing mention when switching chats
    setSelectedMention(null);
  };

  const goBackToChats = () => {
    // Abort any ongoing requests when leaving chat
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Stop streaming if active
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }
    isStreamingRef.current = false;
    
    setSendingMessage(false);
    stopBounceAnimation();
    
    setSelectedChat(null);
    setMessages([]);
    // Clear any existing mention when leaving chat
    setSelectedMention(null);
  };

  // Mention functionality
  const handleMentionInput = (text: string) => {
    const atIndex = text.lastIndexOf('@');
    
    if (atIndex !== -1) {
      // User has @ in the text
      const afterAt = text.slice(atIndex + 1);
      const spaceIndex = afterAt.indexOf(' ');
      
      if (spaceIndex === -1 || spaceIndex > 0) {
        // No space after @ or space is not immediately after @
        const query = spaceIndex === -1 ? afterAt : afterAt.slice(0, spaceIndex);
        setMentionQuery(query);
        setShowMentionModal(true);
      } else {
        // Space immediately after @, hide modal
        setShowMentionModal(false);
        setMentionQuery('');
      }
    } else {
      // No @ in text, hide mention modal
      setShowMentionModal(false);
      setMentionQuery('');
    }
    
    setNewMessage(text);
  };

  const selectMention = (item: any) => {
    // Set the selected mention (replace any previous one)
    setSelectedMention({
      type: item.type,
      id: item.id,
      name: item.name,
      data: item.data
    });
    
    // Clear the textbox since the mention is now shown in the chip above
    setNewMessage('');
    setShowMentionModal(false);
    setMentionQuery('');
  };

  const removeMention = () => {
    setSelectedMention(null);
    // Remove mention from message
    const atIndex = newMessage.lastIndexOf('@');
    if (atIndex !== -1) {
      const beforeMention = newMessage.slice(0, atIndex);
      const afterMention = newMessage.slice(atIndex).split(' ').slice(1).join(' ');
      setNewMessage(beforeMention + afterMention);
    }
  };

  const getMentionIcon = (type: string) => {
    switch (type) {
      case 'user': return 'person';
      case 'bookmark': return 'bookmark';
      case 'file': return 'document-text';
      case 'workspace': return 'business';
      default: return 'at-circle';
    }
  };

  const getMentionColor = (type: string) => {
    switch (type) {
      case 'user': return '#007AFF';
      case 'bookmark': return '#FF9500';
      case 'file': return '#34C759';
      case 'workspace': return '#5856D6';
      default: return '#666';
    }
  };

  const truncateFilename = (name: string, maxLength: number = 40) => {
    const nameWithoutExtension = removeFileExtension(name);
    if (nameWithoutExtension.length <= maxLength) {
      return nameWithoutExtension;
    }
    return nameWithoutExtension.substring(0, maxLength - 3) + '...';
  };

  const createQuickChat = (type: 'ai_assistant' | 'user_direct' | 'workspace' | 'document_focused' | 'bookmark_focused') => {
    setShowQuickChatTypes(false);
    
    // Create new chat immediately for all types
    const newChat: Chat = {
      id: Date.now(),
      title: getChatTypeInfo(type).name,
      type: type,
      participants: [{ id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' }],
      last_message: `New ${getChatTypeInfo(type).name.toLowerCase()} - ready to chat`,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      unread_count: 0
    };
    
    // Add context based on type
    if (type === 'document_focused') {
      // For document focused, we'll need to select a document
      // For now, create a placeholder that can be updated when document is selected
      newChat.document_context = {
        id: 0,
        name: 'Select a document',
        type: 'document'
      };
    } else if (type === 'bookmark_focused') {
      // For bookmark focused, we'll need to select a bookmark
      newChat.bookmark_context = {
        id: 0,
        name: 'Select a bookmark collection',
        description: 'Choose a bookmark collection to focus on',
        file_count: 0,
        documents: []
      };
    } else if (type === 'workspace') {
      // For workspace, we'll need to select a workspace
      newChat.workspace = {
        id: 0,
        name: 'Select a workspace',
        description: 'Choose a workspace to chat in',
        slug: '',
        owner_id: 0,
        is_personal: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        member_count: 0,
        user_role: 'member',
        can_manage: false,
        can_invite: false,
        can_edit: false
      };
    }
    
    // Add the new chat to the list and select it
    // Ensure Chat Assistant always remains first
    // Check if a chat with the same ID already exists before adding
    setChats(prev => {
      const existingChat = prev.find(chat => chat.id === newChat.id);
      if (existingChat) {
        // Chat already exists, just select it instead of creating a duplicate
        console.log(`⚠️ Chat ${newChat.id} already exists, selecting existing chat instead of creating duplicate`);
        return prev;
      }
      
      const chatAssistant = prev.find(chat => chat.id === -1); // Find the default Chat Assistant
      const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default Chat Assistant
      
      if (chatAssistant) {
        // Chat Assistant exists, add new chat after it
        return [chatAssistant, newChat, ...otherChats];
      } else {
        // No Chat Assistant found, add new chat at beginning
        return [newChat, ...prev];
      }
    });
    setSelectedChat(newChat);
    setMessages([]);
    
    // Load welcome message for the new chat
    loadMessages(newChat.id);
  };

  const getChatTypeInfo = (type: string) => {
    switch (type) {
      case 'ai_assistant':
        return { 
          name: 'Quick Chat', 
          icon: 'chatbubbles' as const, 
          color: '#007AFF',
          description: 'Chat with Assistant about your documents'
        };
      case 'document_focused':
        return { 
          name: 'Document Chat', 
          icon: 'document-text' as const, 
          color: '#34C759',
          description: 'Focus on a specific document'
        };
      case 'workspace':
        return { 
          name: 'Workspace Chat', 
          icon: 'people' as const, 
          color: '#FF9500',
          description: 'Team messaging and collaboration'
        };
      case 'user_direct':
        return { 
          name: 'Direct Message', 
          icon: 'person' as const, 
          color: '#FF3B30',
          description: 'Private conversation with a user'
        };
      case 'bookmark_focused':
        return { 
          name: 'Bookmark Collection', 
          icon: 'bookmark' as const, 
          color: '#AF52DE',
          description: 'Chat about bookmarked files'
        };
      default:
        return { 
          name: 'Chat', 
          icon: 'chatbubble' as const, 
          color: '#007AFF',
          description: 'General chat'
        };
    }
  };

  const createNewChat = async () => {
    try {
      let newChat: Chat;
      
      switch (newChatType) {
        case 'ai_assistant':
          newChat = {
            id: Date.now(),
            title: 'AI Assistant',
            type: 'ai_assistant',
            participants: [{ id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' }],
            last_message: 'Ask me anything about your documents',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            unread_count: 0
          };
          break;
          
        case 'document_focused':
          if (!selectedDocument) {
            Alert.alert('Error', 'Please select a document to focus on');
            return;
          }
          newChat = {
            id: Date.now(),
            title: `Chat about ${selectedDocument.name}`,
            type: 'document_focused',
            participants: [{ id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' }],
            last_message: `Ready to answer questions about ${selectedDocument.name}`,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            unread_count: 0,
            document_context: selectedDocument
          };
          break;
          
        case 'workspace':
          if (!selectedWorkspace) {
            Alert.alert('Error', 'Please select a workspace');
            return;
          }
          
          // Create workspace chat using web endpoint (same as web chat.tsx)
          try {
            const response = await api.startUserChat({
              type: 'workspace',
              workspace_id: selectedWorkspace.id
            });
            
            if (response.success && (response as any).chat) {
              // Web chat.tsx returns: { success: true, chat: Chat, existing: boolean }
              newChat = {
                id: (response as any).chat.id,
                title: (response as any).chat.display_name || `${selectedWorkspace.name} Team Chat`,
                type: 'workspace',
                participants: (response as any).chat.participants || [],
                last_message: (response as any).chat.latest_message?.content || 'Start a team conversation',
                updated_at: (response as any).chat.last_message_at || new Date().toISOString(),
                created_at: (response as any).chat.created_at || new Date().toISOString(),
                unread_count: 0,
                workspace: selectedWorkspace
              };
            } else {
              Alert.alert('Error', 'Failed to create workspace chat');
              return;
            }
          } catch (error) {
            console.error('Failed to create workspace chat:', error);
            Alert.alert('Error', 'Failed to create workspace chat');
            return;
          }
          break;
          
        case 'user_direct':
          if (!selectedUser) {
            Alert.alert('Error', 'Please select a user to message');
            return;
          }
          
          // Create user direct chat using web endpoint (same as web chat.tsx)
          try {
            const response = await api.startUserChat({
              type: 'direct',
              user_id: selectedUser.id
            });
            
            if (response.success && (response as any).chat) {
              // Web chat.tsx returns: { success: true, chat: Chat, existing: boolean }
              newChat = {
                id: (response as any).chat.id,
                title: (response as any).chat.display_name || `Chat with ${selectedUser.username}`,
                type: 'user_direct',
                participants: (response as any).chat.participants || [selectedUser],
                last_message: (response as any).chat.latest_message?.content || 'Start a conversation',
                updated_at: (response as any).chat.last_message_at || new Date().toISOString(),
                created_at: (response as any).chat.created_at || new Date().toISOString(),
                unread_count: 0
              };
            } else {
              Alert.alert('Error', 'Failed to create direct chat');
              return;
            }
          } catch (error) {
            console.error('Failed to create direct chat:', error);
            Alert.alert('Error', 'Failed to create direct chat');
            return;
          }
          break;
          
        case 'bookmark_focused':
          if (!selectedBookmark) {
            Alert.alert('Error', 'Please select a bookmark collection');
            return;
          }
          newChat = {
            id: Date.now(),
            title: `Chat about ${selectedBookmark.name}`,
            type: 'bookmark_focused',
            participants: [{ id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' }],
            last_message: `Ready to answer questions about ${selectedBookmark.name} collection`,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            unread_count: 0,
            bookmark_context: selectedBookmark
          };
          break;
          
        default:
          return;
      }
      
      // Check if a chat with the same ID already exists before adding
      setChats(prev => {
        const existingChat = prev.find(chat => chat.id === newChat.id);
        if (existingChat) {
          // Chat already exists, just select it instead of creating a duplicate
          console.log(`⚠️ Chat ${newChat.id} already exists, selecting existing chat instead of creating duplicate`);
          return prev;
        }
        return [newChat, ...prev];
      });
      setShowNewChatModal(false);
      setSelectedChat(newChat);
      
      // Reset selections
      setSelectedDocument(null);
      setSelectedWorkspace(null);
      setSelectedUser(null);
      setSelectedBookmark(null);
      setNewChatType('ai_assistant');
      
    } catch (error) {
      Alert.alert('Error', 'Failed to create new chat');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    // Always refresh the chat list when pulling to refresh
    loadChats();
  };

  const formatMessageTime = (dateString: string) => {
    try {
      // Dates from backend are in UTC (with 'Z' suffix)
      // JavaScript's new Date() automatically converts UTC to local timezone
      const date = new Date(dateString);
      
      if (isNaN(date.getTime())) {
        if (__DEV__) {
          console.log('❌ Failed to parse timestamp:', dateString);
        }
        return 'Invalid Date';
      }
      
      // Format using local time (already converted from UTC by new Date())
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      if (__DEV__) {
        console.log('❌ Error formatting message time:', error, 'for timestamp:', dateString);
      }
      return 'Invalid Date';
    }
  };

  const formatChatTime = (dateString: string) => {
    try {
      // Dates from backend are in UTC (with 'Z' suffix)
      // JavaScript's new Date() automatically converts UTC to local timezone
      const date = new Date(dateString);
      
      if (isNaN(date.getTime())) {
        if (__DEV__) {
          console.log('❌ Failed to parse chat timestamp:', dateString);
        }
        return 'Unknown';
      }
      
      // Format using local time (already converted from UTC by new Date())
      return formatRelativeDate(date);
    } catch (error) {
      if (__DEV__) {
        console.log('❌ Error formatting chat time:', error, 'for timestamp:', dateString);
      }
      return 'Unknown';
    }
  };

  const formatRelativeDate = (date: Date) => {
    const now = new Date();
    
    // Calculate difference in minutes (both dates are in local timezone)
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    // If the date is in the future (more than 1 minute), show the actual date
    // This handles edge cases where dates might be slightly in the future due to clock skew
    if (diffInMinutes < -1) {
      const currentYear = now.getFullYear();
      const dateYear = date.getFullYear();
      
      if (dateYear === currentYear) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }
    
    // Less than 1 minute
    if (diffInMinutes < 1) return 'Now';
    
    // Less than 1 hour
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    
    // Less than 24 hours
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    
    // Check if it's yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    // Check if it's within the last 7 days
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    if (date > weekAgo) {
      // Show day name (e.g., "Monday", "Tuesday")
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    
    // Older than a week - show date
    const currentYear = now.getFullYear();
    const dateYear = date.getFullYear();
    
    if (dateYear === currentYear) {
      // Same year - show month and day (e.g., "Aug 23")
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      // Different year - show month, day, and year (e.g., "Aug 23, 2024")
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const renderChatItem = ({ item }: { item: Chat }) => {
    // Safety check for item
    if (!item) {
      return null;
    }

    // Debug: Log the first few chat items being rendered
    // if (item.id <= 5) {
    //   console.log('🎨 Rendering chat item:', {
    //     id: item.id,
    //     title: item.title,
    //     type: item.type
    //   });
    // }

    const getChatIcon = () => {
      switch (item.type) {
        case 'ai_assistant':
          return { name: 'chatbubbles' as const, color: '#007AFF' };
        case 'document_focused':
          return { name: 'document-text' as const, color: '#34C759' };
        case 'workspace':
          return { name: 'people' as const, color: '#FF9500' };
        case 'user_direct':
          return { name: 'person' as const, color: '#FF3B30' };
        case 'bookmark_focused':
          return { name: 'bookmark' as const, color: '#AF52DE' };
        default:
          console.log('⚠️ Unknown chat type:', item.type, 'for chat:', item.id);
          return { name: 'chatbubble' as const, color: '#007AFF' };
      }
    };

    const { name: iconName, color } = getChatIcon();

    // Ensure all text values are properly stringified
    const safeTitle = String(item.title || 'Untitled Chat');
    const safeLastMessage = String(item.last_message || 'No messages');
    const safeUpdatedAt = String(item.updated_at || new Date().toISOString());
    const safeUnreadCount = Number(item.unread_count || 0);

    return (
      <TouchableOpacity style={dynamicStyles.chatItem} onPress={() => selectChat(item)}>
        <View style={[dynamicStyles.chatAvatar, { backgroundColor: `${color}20` }]}>
          <Ionicons name={iconName} size={24} color={color} />
        </View>
        <View style={dynamicStyles.chatContent}>
          <View style={dynamicStyles.chatItemHeader}>
            <Text style={dynamicStyles.chatTitle} numberOfLines={1}>
              {safeTitle}
            </Text>
            <Text style={dynamicStyles.chatTime}>
              {formatChatTime(safeUpdatedAt)}
            </Text>
          </View>
          <View style={dynamicStyles.chatFooter}>
            <Text style={dynamicStyles.lastMessage} numberOfLines={2}>
              {safeLastMessage}
            </Text>
            {safeUnreadCount > 0 && (
              <View style={dynamicStyles.unreadBadge}>
                <Text style={dynamicStyles.unreadText}>
                  {String(safeUnreadCount)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Helper function to render message content with proper list formatting
  const renderMessageContent = (content: string, isOwnMessage: boolean) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: { type: 'bullet' | 'numbered' | null; items: string[] } = { type: null, items: [] };
    
    const flushList = () => {
      if (currentList.items.length > 0) {
        if (currentList.type === 'bullet') {
          elements.push(
            <View key={`list-${elements.length}`} style={{ marginVertical: 4 }}>
              {currentList.items.map((item, idx) => (
                <View key={idx} style={{ flexDirection: 'row', marginBottom: 6, paddingLeft: 4, flexShrink: 1 }}>
                  <Text style={[
                    dynamicStyles.messageText,
                    isOwnMessage ? dynamicStyles.ownMessageText : dynamicStyles.otherMessageText,
                    { marginRight: 8, flexShrink: 0 }
                  ]}>•</Text>
                  <Text style={[
                    dynamicStyles.messageText,
                    isOwnMessage ? dynamicStyles.ownMessageText : dynamicStyles.otherMessageText,
                    { flex: 1, flexShrink: 1, minWidth: 0 }
                  ]}>{item.trim()}</Text>
                </View>
              ))}
            </View>
          );
        } else if (currentList.type === 'numbered') {
          elements.push(
            <View key={`list-${elements.length}`} style={{ marginVertical: 4 }}>
              {currentList.items.map((item, idx) => (
                <View key={idx} style={{ flexDirection: 'row', marginBottom: 6, paddingLeft: 4, flexShrink: 1 }}>
                  <Text style={[
                    dynamicStyles.messageText,
                    isOwnMessage ? dynamicStyles.ownMessageText : dynamicStyles.otherMessageText,
                    { marginRight: 8, minWidth: 20, flexShrink: 0 }
                  ]}>{idx + 1}.</Text>
                  <Text style={[
                    dynamicStyles.messageText,
                    isOwnMessage ? dynamicStyles.ownMessageText : dynamicStyles.otherMessageText,
                    { flex: 1, flexShrink: 1, minWidth: 0 }
                  ]}>{item.trim()}</Text>
                </View>
              ))}
            </View>
          );
        }
        currentList = { type: null, items: [] };
      }
    };

    lines.forEach((line, lineIdx) => {
      const trimmedLine = line.trim();
      
      // Check for bullet list item (- or *)
      if (/^[-*]\s+/.test(trimmedLine)) {
        if (currentList.type !== 'bullet') {
          flushList();
          currentList.type = 'bullet';
        }
        currentList.items.push(trimmedLine.replace(/^[-*]\s+/, ''));
        return;
      }
      
      // Check for numbered list item (1. 2. etc.)
      if (/^\d+\.\s+/.test(trimmedLine)) {
        if (currentList.type !== 'numbered') {
          flushList();
          currentList.type = 'numbered';
        }
        currentList.items.push(trimmedLine.replace(/^\d+\.\s+/, ''));
        return;
      }
      
      // Not a list item - flush current list and add as regular text
      flushList();
      
      if (trimmedLine) {
        elements.push(
          <Text 
            key={`line-${lineIdx}`}
            style={[
              dynamicStyles.messageText,
              isOwnMessage ? dynamicStyles.ownMessageText : dynamicStyles.otherMessageText,
              lineIdx > 0 ? { marginTop: 6 } : {}
            ]}
          >
            {line}
          </Text>
        );
      } else if (lineIdx < lines.length - 1) {
        // Empty line (but not the last one) - add spacing
        elements.push(<View key={`spacer-${lineIdx}`} style={{ height: 4 }} />);
      }
    });
    
    // Flush any remaining list
    flushList();
    
    return <View style={{ flexShrink: 1 }}>{elements}</View>;
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    // Determine if assistant responses should use bubbles based on chat type
    // User messages always have bubbles, but assistant responses don't need bubbles in document/bookmark chats
    const isDocumentOrBookmarkChat = selectedChat && (
      selectedChat.type === 'document_focused' || 
      selectedChat.type === 'bookmark_focused' ||
      selectedChat.type === 'ai_assistant'
    );
    
    // Handle processing message (negative ID indicates processing)
    if (item.id === -1) {
      if (isDocumentOrBookmarkChat) {
        // No bubbles for assistant processing in document/bookmark chats
        return (
          <View style={dynamicStyles.messageContainerNoBubble}>
            <ProcessingMessageDisplay
              isProcessing={true}
              hasRealData={false}
              processingType="general"
              onComplete={() => {}}
            />
          </View>
        );
      } else {
        // Bubbles for user/workspace chats - no timestamp for processing messages
        return (
          <View style={[
            dynamicStyles.messageContainer,
            dynamicStyles.otherMessage
          ]}>
            <View style={[
              dynamicStyles.messageBubble,
              dynamicStyles.otherBubble
            ]}>
              <ProcessingMessageDisplay
                isProcessing={true}
                hasRealData={false}
                processingType="general"
                onComplete={() => {}}
              />
              {/* No timestamp for processing messages - only show one streaming indicator */}
            </View>
          </View>
        );
      }
    }

    // User messages always have bubbles
    if (item.is_own_message) {
      return (
        <View style={[
          dynamicStyles.messageContainer,
          dynamicStyles.ownMessage
        ]}>
          <View style={[
            dynamicStyles.messageBubble,
            dynamicStyles.ownBubble
          ]}>
            {renderMessageContent(item.content, item.is_own_message)}
            <Text style={[
              dynamicStyles.messageTime,
              dynamicStyles.ownMessageTime
            ]}>
              {formatMessageTime(item.created_at)}
            </Text>
          </View>
        </View>
      );
    } else {
      // Assistant messages: no bubbles for document/bookmark chats, bubbles for user/workspace chats
      // Only show content if it exists - processing is handled by id: -1 message
      const hasContent = item.content && item.content.trim().length > 0;
      
      if (isDocumentOrBookmarkChat) {
        // No bubbles for assistant responses (ChatGPT style)
        // Don't show empty messages - processing is handled by id: -1 message
        if (!hasContent) {
          return null; // Don't render empty messages
        }
        
        return (
          <View style={[
            dynamicStyles.messageContainerNoBubble,
            dynamicStyles.otherMessageNoBubble
          ]}>
            {renderMessageContent(item.content, item.is_own_message)}
            <Text style={[
              dynamicStyles.messageTimeNoBubble,
              dynamicStyles.otherMessageTimeNoBubble
            ]}>
              {formatMessageTime(item.created_at)}
            </Text>
          </View>
        );
      } else {
        // Bubbles for assistant messages in user/workspace chats
        // Don't show empty messages - processing is handled by id: -1 message
        if (!hasContent) {
          return null; // Don't render empty messages
        }
        
        return (
          <View style={[
            dynamicStyles.messageContainer,
            dynamicStyles.otherMessage
          ]}>
            <View style={[
              dynamicStyles.messageBubble,
              dynamicStyles.otherBubble
            ]}>
              {renderMessageContent(item.content, item.is_own_message)}
              <Text style={[
                dynamicStyles.messageTime,
                dynamicStyles.otherMessageTime
              ]}>
                {formatMessageTime(item.created_at)}
              </Text>
            </View>
          </View>
        );
      }
    }
  };

  const renderChatsList = () => {
    return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity 
          style={dynamicStyles.backButton} 
          onPress={() => router.push('/(tabs)')}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>ChatGD</Text>
        <TouchableOpacity style={dynamicStyles.newChatButton} onPress={() => setShowNewChatModal(true)}>
          <Ionicons name="add" size={20} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Search Box with Chat Types */}
      <View style={dynamicStyles.searchInputContainer}>
        <View style={dynamicStyles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#666" style={dynamicStyles.searchIcon} />
          <TextInput
            style={dynamicStyles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search chats..."
            placeholderTextColor="#999"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={dynamicStyles.searchIcon}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={dynamicStyles.loadingText}>Loading chats...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          renderItem={renderChatItem}
          keyExtractor={(item) => String(item?.id || Math.random())}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          style={dynamicStyles.chatsList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
          onTouchStart={() => setShowQuickChatTypes(false)}
        />
      )}
    </SafeAreaView>
    );
  };

  const renderChatMessages = () => (
    <SafeAreaView style={dynamicStyles.container} edges={['top', 'bottom']}>
      {/* Chat Header */}
      <View style={dynamicStyles.chatHeader}>
        <TouchableOpacity 
          style={dynamicStyles.backButton} 
          onPress={() => {
            // Go back to chat list, or home if no chat selected
            if (selectedChat) {
              // Re-sort chats when returning from conversation
              setSelectedChat(null);
              // The useEffect watching selectedChat will handle the sorting
            } else {
              router.push('/(tabs)');
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        
        <View style={dynamicStyles.chatHeaderInfo}>
          <Text style={dynamicStyles.chatTitle}>{selectedChat?.title || 'Chat'}</Text>
          <Text style={dynamicStyles.chatSubtitle}>
            {selectedChat?.type === 'ai_assistant' ? 'Chat Assistant' : 
             selectedChat?.type === 'document_focused' ? 'Document Chat' :
             selectedChat?.type === 'bookmark_focused' ? 'Bookmark Chat' :
             selectedChat?.type === 'workspace' ? 'Workspace Chat' :
             selectedChat?.type === 'user_direct' ? 'Direct Message' : 'Chat'}
          </Text>
        </View>

        {/* Search Type Menu for AI Assistant */}
        {selectedChat?.type === 'ai_assistant' && (
          <TouchableOpacity 
            style={dynamicStyles.searchTypeButton} 
            onPress={handleSearchTypeMenuPress}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView 
        style={dynamicStyles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {messagesLoading ? (
          <View style={dynamicStyles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={dynamicStyles.loadingText}>Loading messages...</Text>
          </View>
        ) : (
          <>
            <FlatList
              ref={messagesRef}
              data={sendingMessage ? [...messages, {
                id: -1, // Use negative ID for processing message
                content: 'Processing your request...',
                is_own_message: false,
                created_at: new Date().toISOString(),
                user_id: 0,
                sender: { id: 0, username: 'AI Assistant', email: 'ai@grabdocs.com' }
              } as ChatMessage] : messages}
              renderItem={renderMessageItem}
              keyExtractor={(item) => item.id.toString()}
              style={dynamicStyles.messagesList}
              contentContainerStyle={dynamicStyles.messagesContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: true })}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onTouchStart={() => setShowQuickChatTypes(false)}
            />
            

            {/* Progress tracking removed - only showing bouncing dots */}
          </>
        )}

        {/* Selected Mention Display */}
        {selectedMention && (
          <View style={dynamicStyles.mentionDisplay}>
            <View style={dynamicStyles.mentionChip}>
              <Ionicons 
                name={getMentionIcon(selectedMention.type) as keyof typeof Ionicons.glyphMap} 
                size={16} 
                color={getMentionColor(selectedMention.type)} 
              />
              <Text style={dynamicStyles.mentionText}>
                {selectedMention.type}: {selectedMention.type === 'file' ? truncateFilename(selectedMention.name) : selectedMention.name}
              </Text>
              <TouchableOpacity onPress={removeMention} style={dynamicStyles.removeMentionButton}>
                <Ionicons name="close" size={16} color="#666" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Chat Types Dropdown */}
        {showQuickChatTypes && selectedChat?.type === 'ai_assistant' && (
          <View style={dynamicStyles.quickChatTypesContainer}>
            {(['ai_assistant', 'workspace', 'user_direct', 'bookmark_focused'] as const).map((type, index, array) => {
              const typeInfo = getChatTypeInfo(type);
              const isLastItem = index === array.length - 1;
              return (
                <TouchableOpacity
                  key={`quick-chat-${type}`}
                  style={[
                    dynamicStyles.quickChatTypeItem,
                    isLastItem && { borderBottomWidth: 0 }
                  ]}
                  onPress={() => createQuickChat(type)}
                >
                  <View style={[dynamicStyles.quickChatTypeIcon, { backgroundColor: `${typeInfo.color}20` }]}>
                    <Ionicons name={typeInfo.icon} size={20} color={typeInfo.color} />
                  </View>
                  <View style={dynamicStyles.quickChatTypeContent}>
                    <Text style={dynamicStyles.quickChatTypeName}>{typeInfo.name}</Text>
                    <Text style={dynamicStyles.quickChatTypeDescription}>{typeInfo.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Inline Mention Dropdown - Above text input */}
        {showMentionModal && (
          <View style={dynamicStyles.mentionDropdown}>
            <FlatList
              data={mentionResults}
              keyExtractor={(item, index) => `${item.type}-${item.id}-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={dynamicStyles.mentionDropdownItem}
                  onPress={() => selectMention(item)}
                >
                  <View style={[dynamicStyles.mentionDropdownIcon, { backgroundColor: `${getMentionColor(item.type)}20` }]}>
                    <Ionicons 
                      name={getMentionIcon(item.type) as keyof typeof Ionicons.glyphMap} 
                      size={16} 
                      color={getMentionColor(item.type)} 
                    />
                  </View>
                  <View style={dynamicStyles.mentionDropdownContent}>
                    <Text style={dynamicStyles.mentionDropdownTitle}>
                      {item.type === 'file' ? truncateFilename(item.name) : item.name}
                    </Text>
                    <Text style={dynamicStyles.mentionDropdownSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Text style={dynamicStyles.mentionDropdownType}>{item.type}</Text>
                </TouchableOpacity>
              )}
              style={dynamicStyles.mentionDropdownList}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={dynamicStyles.mentionDropdownEmpty}>
                  <Text style={dynamicStyles.mentionDropdownEmptyText}>
                    {mentionQuery.trim() ? 'No results found' : 'Type to search...'}
                  </Text>
                </View>
              }
            />
          </View>
        )}

        <View style={dynamicStyles.inputContainer}>
          <TextInput
            style={[dynamicStyles.messageInput, { height: Math.max(40, Math.min(120, textInputHeight)) }]}
            value={newMessage}
            onChangeText={handleMentionInput}
            placeholder="Ask questions from your documents"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={1000}
            onContentSizeChange={(event) => {
              const { height } = event.nativeEvent.contentSize;
              setTextInputHeight(height);
            }}
          />
          <Animated.View
            style={[
              {
                transform: [{ scale: bounceAnim }],
              },
            ]}
          >
            <TouchableOpacity
              style={[
                dynamicStyles.sendButton,
                ((!newMessage.trim() && !sendingMessage) || sendingMessage) && { opacity: 0.5 }
              ]}
              onPress={sendMessage}
              disabled={sendingMessage || !newMessage.trim()}
            >
              {sendingMessage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  // New Chat Modal Component
  const renderNewChatModal = () => (
    <Modal
      visible={showNewChatModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity onPress={() => setShowNewChatModal(false)}>
            <Text style={{ color: '#007AFF', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={dynamicStyles.headerTitle}>New Chat</Text>
          <TouchableOpacity onPress={createNewChat}>
            <Text style={{ color: '#007AFF', fontSize: 16, fontWeight: '600' }}>Create</Text>
          </TouchableOpacity>
        </View>

              <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 20}
      >
          <ScrollView 
            style={{ flex: 1, padding: 16 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
          {/* Chat Type Selection */}
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Chat Type</Text>
          
          <TouchableOpacity 
            style={[dynamicStyles.optionItem, newChatType === 'ai_assistant' && dynamicStyles.selectedOption]}
            onPress={() => setNewChatType('ai_assistant')}
          >
            <Ionicons name="chatbubbles" size={24} color="#007AFF" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={dynamicStyles.optionTitle}>Chat Assistant</Text>
              <Text style={dynamicStyles.optionSubtitle}>Chat with AI about your documents and meeting transcripts</Text>
            </View>
            {newChatType === 'ai_assistant' && (
              <Ionicons name="checkmark" size={24} color="#007AFF" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[dynamicStyles.optionItem, newChatType === 'document_focused' && dynamicStyles.selectedOption]}
            onPress={() => setNewChatType('document_focused')}
          >
            <Ionicons name="document-text" size={24} color="#34C759" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={dynamicStyles.optionTitle}>Document Focus</Text>
              <Text style={dynamicStyles.optionSubtitle}>Ask questions about a specific document</Text>
            </View>
            {newChatType === 'document_focused' && (
              <Ionicons name="checkmark" size={24} color="#34C759" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[dynamicStyles.optionItem, newChatType === 'workspace' && dynamicStyles.selectedOption]}
            onPress={() => setNewChatType('workspace')}
          >
            <Ionicons name="people" size={24} color="#FF9500" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={dynamicStyles.optionTitle}>Workspace Chat</Text>
              <Text style={dynamicStyles.optionSubtitle}>Message all team members in a workspace</Text>
            </View>
            {newChatType === 'workspace' && (
              <Ionicons name="checkmark" size={24} color="#FF9500" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[dynamicStyles.optionItem, newChatType === 'user_direct' && dynamicStyles.selectedOption]}
            onPress={() => setNewChatType('user_direct')}
          >
            <Ionicons name="person" size={24} color="#FF3B30" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={dynamicStyles.optionTitle}>Direct Message</Text>
              <Text style={dynamicStyles.optionSubtitle}>Send a private message to another user</Text>
            </View>
            {newChatType === 'user_direct' && (
              <Ionicons name="checkmark" size={24} color="#FF3B30" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[dynamicStyles.optionItem, newChatType === 'bookmark_focused' && dynamicStyles.selectedOption]}
            onPress={() => setNewChatType('bookmark_focused')}
          >
            <Ionicons name="bookmark" size={24} color="#AF52DE" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={dynamicStyles.optionTitle}>Bookmark Collection</Text>
              <Text style={dynamicStyles.optionSubtitle}>Chat about a specific bookmark collection</Text>
            </View>
            {newChatType === 'bookmark_focused' && (
              <Ionicons name="checkmark" size={24} color="#AF52DE" />
            )}
          </TouchableOpacity>

          {/* Document Selection for Document-Focused Chat */}
          {newChatType === 'document_focused' && (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Select Document</Text>
              
              {/* Search for documents */}
              <View style={dynamicStyles.searchInputContainer}>
                <Ionicons name="search" size={16} color="#666" style={dynamicStyles.searchIcon} />
                <TextInput
                  style={[dynamicStyles.searchInput, { fontSize: 14 }]}
                  placeholder="Search documents..."
                  placeholderTextColor="#999"
                />
              </View>
              
              <ScrollView style={{ maxHeight: 200, marginTop: 8 }}>
                {filteredDocuments.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={[dynamicStyles.optionItem, selectedDocument?.id === doc.id && dynamicStyles.selectedOption]}
                    onPress={() => setSelectedDocument(doc)}
                  >
                    <Ionicons name="document" size={20} color="#666" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={dynamicStyles.optionTitle}>{doc.name}</Text>
                      <Text style={dynamicStyles.optionSubtitle}>{doc.type} • {doc.size}</Text>
                    </View>
                    {selectedDocument?.id === doc.id && (
                      <Ionicons name="checkmark" size={20} color="#34C759" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Workspace Selection for Workspace Chat */}
          {newChatType === 'workspace' && (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Select Workspace</Text>
              
              {/* Search for workspaces */}
              <View style={dynamicStyles.searchInputContainer}>
                <Ionicons name="search" size={16} color="#666" style={dynamicStyles.searchIcon} />
                <TextInput
                  style={[dynamicStyles.searchInput, { fontSize: 14 }]}
                  placeholder="Search workspaces..."
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={{ marginTop: 8 }}>
                {filteredWorkspaces.map((workspace) => (
                  <TouchableOpacity
                    key={workspace.id}
                    style={[dynamicStyles.optionItem, selectedWorkspace?.id === workspace.id && dynamicStyles.selectedOption]}
                    onPress={() => setSelectedWorkspace(workspace)}
                  >
                    <Ionicons name="business" size={20} color="#FF9500" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={dynamicStyles.optionTitle}>{workspace.name}</Text>
                      <Text style={dynamicStyles.optionSubtitle}>{workspace.member_count} members</Text>
                    </View>
                    {selectedWorkspace?.id === workspace.id && (
                      <Ionicons name="checkmark" size={20} color="#FF9500" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* User Selection for Direct Message */}
          {newChatType === 'user_direct' && (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Select User</Text>
              
              {/* Search for users */}
              <View style={dynamicStyles.searchInputContainer}>
                <Ionicons name="search" size={16} color="#666" style={dynamicStyles.searchIcon} />
                <TextInput
                  style={[dynamicStyles.searchInput, { fontSize: 14 }]}
                  placeholder="Search users..."
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={{ marginTop: 8 }}>
                {filteredUsers.length === 0 ? (
                  <Text style={{ color: '#666', fontStyle: 'italic' }}>No users available for direct messaging</Text>
                ) : (
                  filteredUsers.map((user) => (
                    <TouchableOpacity
                      key={user.id}
                      style={[dynamicStyles.optionItem, selectedUser?.id === user.id && dynamicStyles.selectedOption]}
                      onPress={() => setSelectedUser(user)}
                    >
                      <Ionicons name="person-circle" size={20} color="#FF3B30" />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={dynamicStyles.optionTitle}>{user.username}</Text>
                        <Text style={dynamicStyles.optionSubtitle}>{user.email}</Text>
                      </View>
                      {selectedUser?.id === user.id && (
                        <Ionicons name="checkmark" size={20} color="#FF3B30" />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>
          )}

          {/* Bookmark Selection for Bookmark-Focused Chat */}
          {newChatType === 'bookmark_focused' && (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Select Bookmark Collection</Text>
              
              {/* Search for bookmarks */}
              <View style={dynamicStyles.searchInputContainer}>
                <Ionicons name="search" size={16} color="#666" style={dynamicStyles.searchIcon} />
                <TextInput
                  style={[dynamicStyles.searchInput, { fontSize: 14 }]}
                  placeholder="Search bookmarks..."
                  placeholderTextColor="#999"
                />
              </View>
              
              <ScrollView style={{ maxHeight: 200, marginTop: 8 }}>
                {filteredBookmarks.map((bookmark) => (
                  <TouchableOpacity
                    key={bookmark.id}
                    style={[dynamicStyles.optionItem, selectedBookmark?.id === bookmark.id && dynamicStyles.selectedOption]}
                    onPress={() => setSelectedBookmark(bookmark)}
                  >
                    <Ionicons name="bookmark" size={20} color="#AF52DE" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={dynamicStyles.optionTitle}>{bookmark.name}</Text>
                      <Text style={dynamicStyles.optionSubtitle}>{bookmark.file_count} files • {bookmark.description}</Text>
                    </View>
                    {selectedBookmark?.id === bookmark.id && (
                      <Ionicons name="checkmark" size={20} color="#AF52DE" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );

  const handleSearchTypeSelect = (searchType: 'exact' | 'refined' | 'expanded') => {
    setSelectedSearchType(searchType);
    setShowSearchTypeMenu(false);
  };

  const handleSearchTypeMenuPress = () => {
    setShowSearchTypeMenu(!showSearchTypeMenu);
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    newChatButton: {
      padding: 4,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 6,
      color: colors.textSecondary,
    },
    chatsList: {
      flex: 1,
    },
    chatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    chatAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    chatContent: {
      flex: 1,
    },
    chatItemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 3,
    },
    chatTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    chatTime: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    chatFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    lastMessage: {
      fontSize: 14,
      color: colors.textSecondary,
      flex: 1,
    },
    unreadBadge: {
      backgroundColor: '#007AFF',
      borderRadius: 8,
      minWidth: 18,
      height: 18,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 6,
    },
    unreadText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: 'bold',
    },
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    backButton: {
      padding: 6,
      marginRight: 6,
    },
    chatHeaderInfo: {
      flex: 1,
    },
    chatSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    searchTypeButton: {
      padding: 6,
    },
    chatContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    messagesList: {
      flex: 1,
    },
    messagesContent: {
      paddingVertical: 10,
    },
    messageContainer: {
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    messageContainerNoBubble: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      maxWidth: '100%',
      flexShrink: 1,
      // Removed alignSelf - let parent container control alignment
    },
    ownMessage: {
      alignItems: 'flex-end',
    },
    otherMessage: {
      alignItems: 'flex-start',
    },
    ownMessageNoBubble: {
      alignItems: 'flex-end',
      paddingLeft: 60,
    },
    otherMessageNoBubble: {
      alignItems: 'flex-start',
      paddingRight: 60,
    },
    messageBubble: {
      maxWidth: '80%',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      marginVertical: 2,
      overflow: 'hidden', // Keep hidden to prevent overflow, but allow text to wrap
      flexShrink: 1,
      // Removed alignSelf - let parent container control alignment
    },
    ownBubble: {
      backgroundColor: '#007AFF',
    },
    otherBubble: {
      backgroundColor: colors.surface,
    },
  messageText: {
    fontSize: 15,
    lineHeight: 23, // Increased from 20 to 23 for better readability (1.53 ratio)
    flexWrap: 'wrap',
    flexShrink: 1,
    wordWrap: 'break-word',
    maxWidth: '100%',
    includeFontPadding: false, // Remove extra padding on Android
    textAlignVertical: 'top', // Align text to top for better multi-line display
  },
    ownMessageText: {
      color: '#fff',
    },
    otherMessageText: {
      color: colors.text,
    },
    messageTime: {
      fontSize: 11,
      marginTop: 4,
      alignSelf: 'flex-end',
    },
    ownMessageTime: {
      color: 'rgba(255, 255, 255, 0.7)',
    },
    otherMessageTime: {
      color: colors.textSecondary,
    },
    messageTimeNoBubble: {
      fontSize: 11,
      marginTop: 4,
      alignSelf: 'flex-start',
    },
    ownMessageTimeNoBubble: {
      color: colors.textSecondary,
    },
    otherMessageTimeNoBubble: {
      color: colors.textSecondary,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 8,
      paddingBottom: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
    },
    messageInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
      fontSize: 16,
      color: colors.text,
      marginRight: 8,
      minHeight: 40,
      maxHeight: 120,
    },
    sendButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#007AFF',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchTypeMenuContainer: {
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
    searchTypeMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    selectedSearchTypeItem: {
      backgroundColor: colors.surface,
    },
    searchTypeText: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    selectedSearchTypeText: {
      color: '#007AFF',
    },
    // Modal styles
    optionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginBottom: 4,
    },
    selectedOption: {
      backgroundColor: colors.surface,
    },
    optionTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 2,
    },
    optionSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 8,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 8,
      fontSize: 14,
      color: colors.text,
    },
    searchIcon: {
      marginRight: 8,
    },
    mentionDisplay: {
      marginBottom: 8,
    },
    mentionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      alignSelf: 'flex-start',
    },
    mentionText: {
      fontSize: 12,
      color: colors.text,
      marginLeft: 6,
      marginRight: 6,
    },
    removeMentionButton: {
      padding: 2,
    },
    quickChatTypesContainer: {
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingVertical: 8,
    },
    quickChatTypeItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    quickChatTypeIcon: {
      marginRight: 12,
    },
    quickChatTypeContent: {
      flex: 1,
    },
    quickChatTypeName: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    quickChatTypeDescription: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    mentionDropdown: {
      position: 'absolute',
      bottom: 52,
      left: 0,
      right: 0,
      maxHeight: 200,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    mentionDropdownList: {
      maxHeight: 200,
    },
    mentionDropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    mentionDropdownIcon: {
      marginRight: 12,
    },
    mentionDropdownContent: {
      flex: 1,
    },
    mentionDropdownTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    mentionDropdownSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    mentionDropdownType: {
      fontSize: 10,
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    mentionDropdownEmpty: {
      padding: 16,
      alignItems: 'center',
    },
    mentionDropdownEmptyText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    sendButtonNormal: {
      backgroundColor: '#007AFF',
    },
    sendButtonProcessing: {
      backgroundColor: '#999',
    },
    sendButtonDisabled: {
      backgroundColor: '#ccc',
    },
  }), [colors]);

  // Show chat list or individual chat based on selection
  return (
    <>
      {selectedChat ? renderChatMessages() : renderChatsList()}
      {renderNewChatModal()}
      {/* Search Type Menu Modal */}
      <Modal
        visible={showSearchTypeMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSearchTypeMenu(false)}
      >
        <TouchableOpacity
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSearchTypeMenu(false)}
        >
          <View style={dynamicStyles.searchTypeMenuContainer}>
            {(['exact', 'refined', 'expanded'] as const).map((type) => {
              const isSelected = selectedSearchType === type;
              
              return (
                <TouchableOpacity
                  key={type}
                  style={[dynamicStyles.searchTypeMenuItem, isSelected && dynamicStyles.selectedSearchTypeItem]}
                  onPress={() => handleSearchTypeSelect(type)}
                >
                  <Text style={[dynamicStyles.searchTypeText, isSelected && dynamicStyles.selectedSearchTypeText]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={16} color="#007AFF" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  newChatButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 6,
    color: '#666',
  },
  chatsList: {
    flex: 1,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  chatAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  chatContent: {
    flex: 1,
  },
  chatItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  chatTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  chatTime: {
    fontSize: 11,
    color: '#666',
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 6,
    marginRight: 6,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  chatSubtitle: {
    fontSize: 11,
    color: '#666',
  },
  searchTypeButton: {
    padding: 6,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 6,
  },
  messageContainer: {
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    marginVertical: 2,
    overflow: 'hidden', // Keep hidden to prevent overflow, but allow text to wrap
    flexShrink: 1, // Allow bubble to shrink if needed
    // Removed alignSelf - let parent container control alignment
  },
  ownBubble: {
    backgroundColor: '#007AFF',
  },
  otherBubble: {
    backgroundColor: '#f0f0f0',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 23, // Increased from 20 to 23 for better readability (1.53 ratio)
    flexWrap: 'wrap',
    flexShrink: 1,
    wordWrap: 'break-word',
    maxWidth: '100%', // Don't exceed bubble width
    includeFontPadding: false, // Remove extra padding on Android
    textAlignVertical: 'top', // Align text to top for better multi-line display
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#000',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherMessageTime: {
    color: '#666',
  },
  messageTimeNoBubble: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  ownMessageTimeNoBubble: {
    color: '#666',
  },
  otherMessageTimeNoBubble: {
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    color: '#000',
    marginRight: 8,
    minHeight: 40,
    maxHeight: 120,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonNormal: {
    backgroundColor: '#007AFF',
  },
  sendButtonProcessing: {
    backgroundColor: '#FF3B30',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  newChatModal: {
    flex: 1,
    backgroundColor: '#fff',
  },
  newChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  newChatTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  closeButton: {
    padding: 8,
  },
  newChatContent: {
    flex: 1,
    padding: 16,
  },
  chatTypeSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  chatTypeOptions: {
    gap: 8,
  },
  chatTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedChatTypeOption: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f8ff',
  },
  chatTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatTypeContent: {
    flex: 1,
  },
  chatTypeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  chatTypeDescription: {
    fontSize: 12,
    color: '#666',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  selectedOption: {
    backgroundColor: '#f0f8ff',
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  disabledButtonText: {
    color: '#999',
  },
  // Mention styles
  mentionDisplay: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  mentionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  mentionText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 8,
    flex: 1,
  },
  removeMentionButton: {
    marginLeft: 8,
    padding: 2,
  },
  mentionDropdown: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: 120,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mentionDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  mentionDropdownIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  mentionDropdownContent: {
    flex: 1,
  },
  mentionDropdownTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  mentionDropdownType: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  mentionDropdownList: {
    maxHeight: 120,
  },
  mentionDropdownEmpty: {
    padding: 16,
    alignItems: 'center',
  },
  mentionDropdownEmptyText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  mentionDropdownName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  mentionDropdownSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  quickChatTypesContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickChatTypeItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  quickChatTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  quickChatTypeContent: {
    flex: 1,
  },
  quickChatTypeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  quickChatTypeDescription: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchTypeMenuContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchTypeMenuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  searchTypeMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectedSearchTypeItem: {
    backgroundColor: '#f0f8ff',
  },
  searchTypeText: {
    fontSize: 14,
    color: '#333',
  },
  selectedSearchTypeText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  searchTypeDescription: {
    fontSize: 12,
    color: '#666',
  },
  // Processing message styles (handled by ProcessingMessageDisplay component)
  processingText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
}); 