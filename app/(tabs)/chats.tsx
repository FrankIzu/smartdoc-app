// Polyfill for URL in React Native (required for socket.io)
import 'react-native-url-polyfill/auto';

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
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
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, STORAGE_KEYS } from '../../constants/Config';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService as api } from '../../services/api';
import { useChatStore } from '../../stores/chatStore';
import { removeFileExtension } from '../../utils/fileUtils';
import { secureStorage } from '../../utils/storage';
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

// Create default ChatGD Assistant outside component to avoid recreation
const DEFAULT_CHAT_ASSISTANT: Chat = {
  id: -1,
  title: 'ChatGD Assistant',
  type: 'ai_assistant',
  participants: [{ id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }],
  last_message: 'Ask me anything about your documents',
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  unread_count: 0
};

// Storage key for persisting chat contexts
const CHAT_CONTEXTS_KEY = '@grabdocs_chat_contexts';

// Helper: Save document/bookmark/user/workspace chat contexts to AsyncStorage
const savePersistedChatContexts = async (chats: Chat[]) => {
  try {
    const contextsToSave: Record<number, {
      type: string;
      title: string;
      document_context?: Document;
      bookmark_context?: Bookmark;
      participants?: ChatParticipant[];
      workspace?: Workspace;
    }> = {};
    
    chats.forEach(chat => {
      // Save contexts for document, bookmark, user_direct, and workspace chats
      if (chat.type === 'document_focused' || 
          chat.type === 'bookmark_focused' || 
          chat.type === 'user_direct' || 
          chat.type === 'workspace') {
        contextsToSave[chat.id] = {
          type: chat.type,
          title: chat.title,
          document_context: chat.document_context,
          bookmark_context: chat.bookmark_context,
          participants: chat.participants,
          workspace: chat.workspace
        };
      }
    });
    
    await AsyncStorage.setItem(CHAT_CONTEXTS_KEY, JSON.stringify(contextsToSave));
    console.log('💾 Saved', Object.keys(contextsToSave).length, 'chat contexts to AsyncStorage:', 
      Object.entries(contextsToSave).map(([id, ctx]) => ({ 
        id, 
        type: ctx.type, 
        title: ctx.title 
      }))
    );
  } catch (error) {
    console.error('❌ Failed to save chat contexts:', error);
  }
};

// Helper: Load persisted chat contexts from AsyncStorage
const loadPersistedChatContexts = async (): Promise<Map<number, {
  type: string;
  title: string;
  document_context?: Document;
  bookmark_context?: Bookmark;
  participants?: ChatParticipant[];
  workspace?: Workspace;
}>> => {
  try {
    const stored = await AsyncStorage.getItem(CHAT_CONTEXTS_KEY);
    if (!stored) {
      console.log('💾 No persisted chat contexts found');
      return new Map();
    }
    
    const parsed = JSON.parse(stored);
    const contextsMap = new Map();
    Object.entries(parsed).forEach(([chatId, context]) => {
      contextsMap.set(Number(chatId), context);
    });
    
    console.log('💾 Loaded', contextsMap.size, 'chat contexts from AsyncStorage');
    return contextsMap;
  } catch (error) {
    console.error('❌ Failed to load chat contexts:', error);
    return new Map();
  }
};

export default function ChatsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colors = useThemeColors();
  
  const [chats, setChats] = useState<Chat[]>([DEFAULT_CHAT_ASSISTANT]); // Initialize with ChatGD Assistant
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
  const currentChatIdRef = useRef<number | null>(null); // Track current chat ID to handle chat_history_id updates
  const loadedChatIdRef = useRef<number | null>(null); // Track which chat's messages are currently loaded to prevent unnecessary reloads
  
  // Keyboard height tracking for mention dropdown positioning
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const inputContainerRef = useRef<View>(null);
  const [inputContainerY, setInputContainerY] = useState(0);
  
  // Helper function to generate unique message IDs
  const generateUniqueMessageId = (): number => {
    // Combine timestamp, counter, and random to ensure uniqueness
    messageIdCounterRef.current += 1;
    return Date.now() * 1000 + messageIdCounterRef.current + Math.floor(Math.random() * 1000);
  };

  // Helper function to deduplicate messages by ID
  const deduplicateMessages = (messages: ChatMessage[]): ChatMessage[] => {
    const seen = new Map<number | string, ChatMessage>();
    const result: ChatMessage[] = [];
    
    messages.forEach((msg, index) => {
      const key = msg.id;
      // If we've seen this ID before, keep the first occurrence (or regenerate ID for duplicates)
      if (seen.has(key)) {
        // Generate a unique ID for duplicate messages
        const uniqueId = generateUniqueMessageId();
        result.push({ ...msg, id: uniqueId });
      } else {
        seen.set(key, msg);
        result.push(msg);
      }
    });
    
    return result;
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
  const [filteredChats, setFilteredChats] = useState<Chat[]>([DEFAULT_CHAT_ASSISTANT]); // Initialize with ChatGD Assistant
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [filteredWorkspaces, setFilteredWorkspaces] = useState<Workspace[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<ChatParticipant[]>([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState<Bookmark[]>([]);
  
  // Modal search states (separate from main chat search)
  const [modalUserSearch, setModalUserSearch] = useState('');
  const [modalWorkspaceSearch, setModalWorkspaceSearch] = useState('');
  const [modalDocumentSearch, setModalDocumentSearch] = useState('');
  const [modalBookmarkSearch, setModalBookmarkSearch] = useState('');
  
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

  // WebSocket for user chats (user_direct and workspace only)
  const socketRef = useRef<Socket | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ [userId: number]: string }>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /** Chat IDs where the user explicitly removed the document/bookmark/workspace context. Persisted so we don't restore on reload. */
  const contextRemovedChatIdsRef = useRef<Set<number>>(new Set());

  // Load persisted "context explicitly removed" set on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await secureStorage.getItem(STORAGE_KEYS.CONTEXT_REMOVED_CHAT_IDS);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) contextRemovedChatIdsRef.current = new Set(arr.map((n: any) => Number(n)));
        }
      } catch (_) {}
    })();
  }, []);

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
      // Backend will create chat history when first message is sent
      const documentChat: Chat = {
        id: -2,
        title: `Document: ${truncateFilename(documentContext.name)}`,
        type: 'document_focused',
        participants: [{ id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }],
        last_message: `Ready to answer questions about ${documentContext.name}`,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        unread_count: 0,
        document_context: documentContext
      };
      
      // Add the chat to the list and select it
      setChats(prev => {
        const chatAssistant = prev.find(chat => chat.id === -1); // Find the default ChatGD Assistant
        const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default ChatGD Assistant
        
        let updatedChats: Chat[];
        if (chatAssistant) {
          // ChatGD Assistant exists, add new chat after it
          updatedChats = [chatAssistant, documentChat, ...otherChats];
        } else {
          // No ChatGD Assistant found, add new chat at beginning
          updatedChats = [documentChat, ...prev];
        }
        
        // Persist document context immediately
        savePersistedChatContexts(updatedChats);
        return updatedChats;
      });
      setSelectedChat(documentChat);
      
      // Don't show welcome message - just show empty chat
      setMessages([]);
      loadedChatIdRef.current = documentChat.id; // Track that we've set empty messages for this chat
      
      // Clear the params to prevent re-triggering
      router.setParams({});
    }
  }, [params.documentId, params.documentName, params.documentType, params.documentCategory]);

  // Handle fileId parameter from documents screen (fileName passed from Files to keep display name)
  useEffect(() => {
    const handleFileIdContext = async () => {
      if (!params.fileId || loading) return;
      const fileIdNum = parseInt(String(params.fileId), 10);
      if (!Number.isFinite(fileIdNum)) {
        console.warn('⚠️ [CHATS] Invalid fileId param:', params.fileId);
        return;
      }
      const workspaceIdNum = params.workspaceId != null ? parseInt(String(params.workspaceId), 10) : undefined;
      let fileNameFromParams: string | null = null;
      if (typeof params.fileName === 'string' && params.fileName.trim() !== '') {
        try { fileNameFromParams = decodeURIComponent(String(params.fileName).trim()); } catch { fileNameFromParams = String(params.fileName).trim(); }
      }

      try {
        // Check if a document chat for this file already exists
        const existingDocumentChat = chats.find(chat =>
          chat.type === 'document_focused' && chat.document_context?.id === fileIdNum
        );
        if (existingDocumentChat) {
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

        // Fetch document details; pass workspaceId when file was opened from a workspace
        // so /api/v1/mobile/get-file can use the same visibility as workspace list endpoints.
        const response = await api.getFileById(fileIdNum, Number.isFinite(workspaceIdNum) ? workspaceIdNum : undefined) as { success?: boolean; message?: string; file?: { id: number; original_filename?: string; filename?: string; file_type?: string; file_kind?: string; category?: string; file_size?: number } };
          if (response.success && response.file) {
            const documentData = response.file;
            // Prefer name from Files screen (params), then API, then fallback
            const displayName = fileNameFromParams || documentData.original_filename || documentData.filename || 'Untitled';
            const documentContext: Document = {
              id: documentData.id,
              name: displayName,
              type: documentData.file_type || 'other',
              category: documentData.file_kind || documentData.category,
              size: documentData.file_size ? `${(documentData.file_size / 1024 / 1024).toFixed(2)} MB` : undefined,
            };
            
            // Create a document-focused chat
            // Backend will create chat history when first message is sent
            const documentChat: Chat = {
              id: -2,
              title: `Document: ${truncateFilename(documentContext.name)}`,
              type: 'document_focused',
              participants: [{ id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }],
              last_message: `Ready to answer questions about ${documentContext.name}`,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              unread_count: 0,
              document_context: documentContext
            };
            
                      // Add the chat to the list and select it
          setChats(prev => {
            const chatAssistant = prev.find(chat => chat.id === -1); // Find the default ChatGD Assistant
            const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default ChatGD Assistant
            
            let updatedChats: Chat[];
            if (chatAssistant) {
              // ChatGD Assistant exists, add new chat after it, preserve all other chats
              updatedChats = [chatAssistant, documentChat, ...otherChats];
            } else {
              // No ChatGD Assistant found, add new chat at beginning, preserve all existing chats
              updatedChats = [documentChat, ...prev];
            }
            
            // Persist document context immediately
            savePersistedChatContexts(updatedChats);
            return updatedChats;
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
            loadedChatIdRef.current = documentChat.id; // Track that we've set empty messages for this chat
            
            // Clear the params to prevent re-triggering
            router.setParams({});
          } else {
            console.warn(`⚠️ [CHATS] API returned unsuccessful response for fileId ${fileIdNum}:`, response.message || 'Unknown error');
            const fallbackName = fileNameFromParams || 'Document';
            // Backend will create chat history when first message is sent
            const fallbackChat: Chat = {
              id: -2,
              title: `Document: ${truncateFilename(fallbackName)}`,
              type: 'document_focused',
              participants: [{ id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }],
              last_message: `Ready to answer questions about ${fallbackName}`,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              unread_count: 0,
              document_context: { id: fileIdNum, name: fallbackName, type: 'other' }
            };
            
            setChats(prev => {
              const chatAssistant = prev.find(chat => chat.id === -1); // Find the default ChatGD Assistant
              const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default ChatGD Assistant
              
              let updatedChats: Chat[];
              if (chatAssistant) {
                updatedChats = [chatAssistant, fallbackChat, ...otherChats];
              } else {
                updatedChats = [fallbackChat, ...prev];
              }
              
              // Persist document context immediately
              savePersistedChatContexts(updatedChats);
              return updatedChats;
            });
            setSelectedChat(fallbackChat);
            
            setSelectedMention({
              id: fileIdNum,
              type: 'file',
              name: fallbackName,
              data: { id: fileIdNum, name: fallbackName, type: 'other' }
            });
            
            const welcomeMessage: ChatMessage = {
              id: generateUniqueMessageId(),
              content: 'Hello! I\'m your ChatGD Assistant. I\'m ready to help you with questions about your document. The document has been automatically added to this chat. What would you like to know?',
              sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
              is_own_message: false,
              created_at: new Date().toISOString(),
            };
            setMessages([welcomeMessage]);
            loadedChatIdRef.current = fallbackChat.id; // Track that we've loaded this chat
            
            router.setParams({});
          }
        } catch (error: any) {
          const errorMessage = error?.message || error?.response?.data?.message || error?.toString() || 'Unknown error';
          const statusCode = error?.response?.status;
          // Log as warning since we have a fallback (e.g. file in workspace but get-file uses stricter visibility)
          console.warn(`⚠️ [CHATS] Could not fetch document details for fileId ${fileIdNum}${statusCode ? ` (HTTP ${statusCode})` : ''}:`, errorMessage);
          
          const fallbackName = fileNameFromParams || 'Document';
          // Backend will create chat history when first message is sent
          const fallbackChat: Chat = {
            id: -2,
          title: `Document: ${truncateFilename(fallbackName)}`,
          type: 'document_focused',
          participants: [{ id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }],
          last_message: `Ready to answer questions about ${fallbackName}`,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          unread_count: 0,
          document_context: { id: fileIdNum, name: fallbackName, type: 'other' }
        };
        
        setChats(prev => {
            const chatAssistant = prev.find(chat => chat.id === -1); // Find the default ChatGD Assistant
            const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default ChatGD Assistant
            
            if (chatAssistant) {
              return [chatAssistant, fallbackChat, ...otherChats];
            } else {
              return [fallbackChat, ...prev];
            }
          });
          setSelectedChat(fallbackChat);
          
          setSelectedMention({
            id: fileIdNum,
            type: 'file',
            name: fallbackName,
            data: { id: fileIdNum, name: fallbackName, type: 'other' }
          });
          
          const welcomeMessage: ChatMessage = {
            id: generateUniqueMessageId(),
            content: 'Hello! I\'m your ChatGD Assistant. I\'m ready to help you with questions about your document. The document has been automatically added to this chat. What would you like to know?',
            sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
            is_own_message: false,
            created_at: new Date().toISOString(),
          };
          setMessages([welcomeMessage]);
          loadedChatIdRef.current = fallbackChat.id; // Track that we've loaded this chat
          
          router.setParams({});
        }
    };

    handleFileIdContext();
  }, [params.fileId, params.fileName, params.workspaceId, loading]);

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
      // Backend will create chat history when first message is sent
      const bookmarkChat: Chat = {
        id: -2,
        title: `Chat about ${bookmarkContext.name}`,
        type: 'bookmark_focused',
        participants: [{ id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }],
        last_message: `Ready to answer questions about ${bookmarkContext.name}`,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        unread_count: 0,
        bookmark_context: bookmarkContext
      };
      
      // Add the chat to the list and select it
      setChats(prev => {
        const chatAssistant = prev.find(chat => chat.id === -1); // Find the default ChatGD Assistant
        const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default ChatGD Assistant
        
        if (chatAssistant) {
          // ChatGD Assistant exists, add new chat after it
          return [chatAssistant, bookmarkChat, ...otherChats];
        } else {
          // No ChatGD Assistant found, add new chat at beginning
          return [bookmarkChat, ...prev];
        }
      });
      setSelectedChat(bookmarkChat);
      
      // Don't show welcome message - just show empty chat
      setMessages([]);
      loadedChatIdRef.current = bookmarkChat.id; // Track that we've set empty messages for this chat
      
      // Clear the params to prevent re-triggering
      router.setParams({});
    }
  }, [params.bookmark_id, params.bookmark_name, params.bookmark_description, params.bookmark_file_count]);

  // Handle workspace context from navigation
  useEffect(() => {
    if (params.workspaceId && params.workspaceName) {
      const workspaceId = parseInt(params.workspaceId as string);
      const workspaceName = params.workspaceName as string;
      
      // Start/find the real workspace chat via API
      const startWorkspaceChat = async () => {
        try {
          const response = await api.startUserChat({
            type: 'workspace',
            workspace_id: workspaceId
          });
          
          if (response.success && (response as any).chat) {
            const chatData = (response as any).chat;
            
            // Navigate to user-chat screen with the workspace chat
            router.push({
              pathname: '/user-chat',
              params: {
                chatId: chatData.id.toString(),
                chatType: 'workspace',
                workspaceId: workspaceId.toString(),
                workspaceName: workspaceName
              }
            });
          } else {
            console.error('Failed to start workspace chat:', response);
            Alert.alert('Error', 'Failed to start workspace chat. Please try again.');
          }
        } catch (error: any) {
          console.error('Error starting workspace chat:', error);
          Alert.alert('Error', error.message || 'Failed to start workspace chat. Please try again.');
        } finally {
          // Clear the params to prevent re-triggering
          router.setParams({});
        }
      };
      
      startWorkspaceChat();
    }
  }, [params.workspaceId, params.workspaceName]);

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

  // Initialize WebSocket for user chats (must be defined before useFocusEffect)
  const initializeSocket = React.useCallback(async () => {
    try {
      const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) return;

      const socket = io(API_BASE_URL, {
        auth: { token },
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 20000,
      });

      socket.on('connect', () => {
        console.log('✅ [CHATS] Socket connected');
        setIsSocketConnected(true);
        
        // Join user room first (required for receiving messages)
        // Note: userProfile comes from useChatStore, need to get it from there
        // We'll join user room in a separate useEffect when userProfile is available
        console.log('🔌 [CHATS] Socket connected, will join user room when userProfile is available');
        
        // Use state setter to get latest selectedChat
        setSelectedChat(currentChat => {
          // Rejoin chat room if we have a selected chat
          if (currentChat && (currentChat.type === 'user_direct' || currentChat.type === 'workspace')) {
            console.log('🔌 [CHATS] Rejoining chat room after reconnect:', currentChat.id);
            socket.emit('join_chat_room', { chat_id: currentChat.id });
            console.log('🔌 [CHATS] Emitted join_chat_room for chat:', currentChat.id);
          }
          return currentChat;
        });
      });

      socket.on('disconnect', () => {
        console.log('❌ [CHATS] Socket disconnected');
        setIsSocketConnected(false);
      });

      // Listen for new messages (only for user chats)
      socket.on('new_chat_message', (data: any) => {
        console.log('📨 [CHATS] New message received:', data);
        // Use state setter with function form to access latest selectedChat
        setSelectedChat(currentChat => {
          if (currentChat && (currentChat.type === 'user_direct' || currentChat.type === 'workspace')) {
            if (data.chat_id === currentChat.id) {
              const isOwnMessage = !!(userProfile?.id && data.message.sender_id && data.message.sender_id === userProfile.id);
              
              const newMsg: ChatMessage = {
                id: data.message.id,
                content: data.message.content,
                sender: data.message.sender,
                is_own_message: isOwnMessage,
                created_at: data.message.created_at,
              };
              
              // Prevent duplicates
              setMessages(prev => {
                const existingIndex = prev.findIndex(msg => msg.id === newMsg.id);
                if (existingIndex !== -1) {
                  console.log('⚠️ [CHATS] Duplicate message detected, skipping:', newMsg.id);
                  return prev;
                }
                console.log('✅ [CHATS] Adding new message:', newMsg.id);
                return [...prev, newMsg];
              });
              
              // Update chat list
              setChats(prev => prev.map(chat => 
                chat.id === data.chat_id 
                  ? { ...chat, last_message: data.message.content.substring(0, 50), updated_at: data.message.created_at }
                  : chat
              ));
            }
          }
          return currentChat;
        });
      });

      // Listen for typing indicators
      socket.on('chat_typing', (data: any) => {
        console.log('⌨️ [CHATS] Typing event received:', data);
        
        // Validate required fields exist
        if (!data || data.chat_id == null || data.user_id == null) {
          console.warn('⚠️ [CHATS] Ignoring malformed typing event - missing chat_id or user_id:', data);
          return;
        }
        
        // Use state setters with function form to access latest values
        setSelectedChat(currentChat => {
          if (currentChat && (currentChat.type === 'user_direct' || currentChat.type === 'workspace')) {
            if (data.chat_id === currentChat.id && data.user_id !== userProfile?.id) {
              if (data.is_typing) {
                // Try to get username from multiple sources (same as web)
                let displayName: string | null = null;
                
                // 1. Check participants first
                const participant = currentChat?.participants?.find((p: any) => 
                  p.id === data.user_id || p.user_id === data.user_id
                );
                
                if (participant) {
                  const user = (participant as any).user || participant;
                  if (user.firstName && user.lastName) {
                    displayName = `${user.firstName} ${user.lastName}`.trim();
                  } else if (user.username) {
                    displayName = user.username;
                  } else if (user.name) {
                    displayName = user.name;
                  }
                }
                
                // 2. Check messages for sender info (fallback) - use state setter to get latest
                if (!displayName) {
                  setMessages(currentMessages => {
                    if (currentMessages.length > 0) {
                      const reversed = [...currentMessages].reverse();
                      const matchedMsg = reversed.find((m) => 
                        m.sender && (m.sender.id === data.user_id || (m.sender as any).user_id === data.user_id)
                      );
                      if (matchedMsg && matchedMsg.sender) {
                        const sender = matchedMsg.sender as any;
                        if (sender.firstName && sender.lastName) {
                          displayName = `${sender.firstName} ${sender.lastName}`.trim();
                        } else if (sender.username) {
                          displayName = sender.username;
                        } else if (sender.name) {
                          displayName = sender.name;
                        }
                      }
                    }
                    return currentMessages;
                  });
                }
                
                // 3. Fallback to users list (already loaded for mentions) - use state setter to get latest
                if (!displayName) {
                  setUsers(currentUsers => {
                    const userFromList = currentUsers.find((u: any) => u.id === data.user_id) as any;
                    if (userFromList) {
                      if (userFromList.firstName && userFromList.lastName) {
                        displayName = `${userFromList.firstName} ${userFromList.lastName}`.trim();
                      } else if (userFromList.username) {
                        displayName = userFromList.username;
                      }
                    }
                    return currentUsers;
                  });
                }
                
                const username = displayName || 'Someone';
                console.log('⌨️ [CHATS] Setting typing user:', username, 'for user_id:', data.user_id);
                setTypingUsers(prev => ({ ...prev, [data.user_id]: username }));
              } else {
                console.log('⌨️ [CHATS] Removing typing user:', data.user_id);
                setTypingUsers(prev => {
                  const updated = { ...prev };
                  delete updated[data.user_id];
                  return updated;
                });
              }
            }
          }
          return currentChat;
        });
      });

      socket.on('error', (error: any) => {
        console.error('[CHATS] Socket error:', error);
      });

      socket.on('connect_error', (error: any) => {
        console.warn('[CHATS] Socket connection error:', error.message);
      });

      socketRef.current = socket;
    } catch (error) {
      console.warn('[CHATS] Failed to initialize socket:', error);
    }
  }, [userProfile]); // Removed selectedChat - handle room joining separately

      // Track keyboard height for mention dropdown positioning
      useEffect(() => {
        const keyboardWillShowListener = Keyboard.addListener(
          Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
          (e) => {
            setKeyboardHeight(e.endCoordinates.height);
          }
        );
        const keyboardWillHideListener = Keyboard.addListener(
          Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
          () => {
            setKeyboardHeight(0);
          }
        );

        return () => {
          keyboardWillShowListener.remove();
          keyboardWillHideListener.remove();
        };
      }, []);

      // Join/leave chat room when user chat is selected
      useEffect(() => {
        if (selectedChat && (selectedChat.type === 'user_direct' || selectedChat.type === 'workspace') && socketRef.current && isSocketConnected) {
          console.log('🔌 [CHATS] Joining chat room:', selectedChat.id, 'socket connected:', socketRef.current.connected);
          socketRef.current.emit('join_chat_room', { chat_id: selectedChat.id });
          console.log('🔌 [CHATS] Emitted join_chat_room event for chat:', selectedChat.id);
          return () => {
            if (socketRef.current && isSocketConnected) {
              console.log('🔌 [CHATS] Leaving chat room:', selectedChat.id);
              socketRef.current.emit('leave_chat_room', { chat_id: selectedChat.id });
            }
          };
        } else {
          console.log('⚠️ [CHATS] Cannot join chat room:', {
            hasSelectedChat: !!selectedChat,
            chatType: selectedChat?.type,
            hasSocket: !!socketRef.current,
            isSocketConnected,
            socketConnected: socketRef.current?.connected
          });
        }
      }, [selectedChat, isSocketConnected]);

  useEffect(() => {
    // Load all data in parallel for better performance
    Promise.all([
      loadChats(),
      loadWorkspaces(),
      loadDocuments(),
      loadUsers(),
      loadBookmarks()
    ]).then(() => {
      console.log('✅ Initial mention data loaded successfully');
    }).catch(error => {
      console.error('❌ Error loading initial data:', error);
    });
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
      
      // Initialize socket and load chats in parallel (user profile can load separately)
      initializeSocket();
      Promise.all([
        loadUserProfile(),
        loadChats()
      ]).catch(error => {
        console.error('Error refreshing data on focus:', error);
      });
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
      // Sort chats by last message timestamp (most recent first) but keep ChatGD Assistant at the top
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
  
  // Filtered lists for new chat modal (separate from main search)
  const modalFilteredUsers = useMemo(() => {
    if (!modalUserSearch.trim()) return users;
    const query = modalUserSearch.toLowerCase();
    return users.filter(user => 
      user.username.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  }, [modalUserSearch, users]);
  
  const modalFilteredWorkspaces = useMemo(() => {
    if (!modalWorkspaceSearch.trim()) return workspaces;
    const query = modalWorkspaceSearch.toLowerCase();
    return workspaces.filter(ws => 
      ws.name.toLowerCase().includes(query) ||
      (ws.description && ws.description.toLowerCase().includes(query))
    );
  }, [modalWorkspaceSearch, workspaces]);
  
  const modalFilteredDocuments = useMemo(() => {
    if (!modalDocumentSearch.trim()) return documents;
    const query = modalDocumentSearch.toLowerCase();
    return documents.filter(doc => 
      doc.name.toLowerCase().includes(query) ||
      (doc.category && doc.category.toLowerCase().includes(query))
    );
  }, [modalDocumentSearch, documents]);
  
  const modalFilteredBookmarks = useMemo(() => {
    if (!modalBookmarkSearch.trim()) return bookmarks;
    const query = modalBookmarkSearch.toLowerCase();
    return bookmarks.filter(bookmark => 
      bookmark.name.toLowerCase().includes(query) ||
      (bookmark.description && bookmark.description.toLowerCase().includes(query))
    );
  }, [modalBookmarkSearch, bookmarks]);

  // Filter mention results based on query
  useEffect(() => {
    const query = mentionQuery.toLowerCase();
    let results: any[] = [];

    // Debug: Log data availability when mention query changes
    if (showMentionModal) {
      console.log('📋 @ Mention modal open, data availability:', {
        documents: documents.length,
        users: users.length,
        workspaces: workspaces.length,
        bookmarks: bookmarks.length,
        query: query
      });
    }

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
    
    // Debug: Log results when they change
    if (showMentionModal) {
      if (results.length > 0) {
        // Count results by type
        const documentsCount = results.filter(r => r.type === 'file').length;
        const usersCount = results.filter(r => r.type === 'user').length;
        const workspacesCount = results.filter(r => r.type === 'workspace').length;
        const bookmarksCount = results.filter(r => r.type === 'bookmark').length;
        
        console.log(`📋 @ Mention results: ${results.length} items found`, {
          documents: documentsCount,
          users: usersCount,
          workspaces: workspacesCount,
          bookmarks: bookmarksCount
        });
      } else {
        console.log('⚠️ @ Mention modal open but no results found', {
          documentsAvailable: documents.length,
          usersAvailable: users.length,
          workspacesAvailable: workspaces.length,
          bookmarksAvailable: bookmarks.length,
          query: query || '(empty - showing recent)'
        });
      }
    }
  }, [mentionQuery, users, bookmarks, workspaces, documents, showMentionModal]);

  // Helper: get "last activity" timestamp for ordering. Prefer last_message_at, updated_at, then created_at.
  const getLastMessageTimestamp = (chat: Chat): number => {
    try {
      const raw = (chat as any).last_message_at || chat.updated_at || chat.created_at || new Date().toISOString();
      const date = new Date(raw);
      if (isNaN(date.getTime())) return 0;
      return date.getTime();
    } catch (error) {
      if (__DEV__) console.log('❌ Error getting last message timestamp:', error, 'for chat:', chat.id);
      return 0;
    }
  };

  // Sort chat list: ChatGD Assistant (id === -1) always first; all others by last activity (most recent first).
  const sortChatsByLastMessage = (chatsToSort: Chat[]): Chat[] => {
    const validChats = chatsToSort.filter(chat => chat && typeof chat === 'object');
    const chatAssistant = validChats.find(chat => chat.id === -1);
    const otherChats = validChats.filter(chat => chat.id !== -1);
    const sortedOtherChats = [...otherChats].sort((a, b) => getLastMessageTimestamp(b) - getLastMessageTimestamp(a));
    return chatAssistant ? [chatAssistant, ...sortedOtherChats] : [DEFAULT_CHAT_ASSISTANT, ...sortedOtherChats];
  };

  const loadChats = async (limit: number = 50, offset: number = 0) => {
    try {
      setLoading(true);
      
      // Load persisted chat contexts from AsyncStorage FIRST (survives app restart)
      const persistedContexts = await loadPersistedChatContexts();
      
      // Try to load chat histories from backend (AI chats) with pagination
      const { fetchChatHistories } = useChatStore.getState();
      await fetchChatHistories(limit, offset);
      
      // Get the loaded histories from the store
      const { histories, error, clearError } = useChatStore.getState();
      
      if (error) {
        console.warn('AI chat history unavailable:', error, '- showing user chats and cached data');
        clearError(); // avoid stale error; we degrade to user chats + persisted contexts
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
      
      // Convert chat histories to the expected format, excluding any existing "ChatGD Assistant" chats
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
                
                // Determine chat type: top-level selected_* first, then persistent_context (backend often stores only there), then title heuristic
                const persistentContext = historyData.persistent_context || historyData.persistentContext;
                if (historyData.selected_files && historyData.selected_files.length > 0) {
                  chatType = 'document_focused';
                } else if (historyData.selected_bookmarks && historyData.selected_bookmarks.length > 0) {
                  chatType = 'bookmark_focused';
                } else if (historyData.selected_workspaces && historyData.selected_workspaces.length > 0) {
                  chatType = 'workspace';
                } else if (historyData.selected_users && historyData.selected_users.length > 0) {
                  chatType = 'user_direct';
                } else if (persistentContext?.context_file_ids?.length > 0 || persistentContext?.selected_files?.length > 0) {
                  chatType = 'document_focused';
                } else if (persistentContext?.context_bookmark_ids?.length > 0 || persistentContext?.selected_bookmarks?.length > 0) {
                  chatType = 'bookmark_focused';
                } else {
                  // Fallback: infer from title
                  const title = String(history.title || '').toLowerCase();
                  if (title.includes('document') || title.includes('file') || title.includes('pdf') || title.includes('doc') || title.includes('chat about')) {
                    chatType = 'document_focused';
                  } else if (title.includes('bookmark') || title.includes('collection')) {
                    chatType = 'bookmark_focused';
                  } else if (title.includes('workspace') || title.includes('team')) {
                    chatType = 'workspace';
                  } else if (title.includes('user') || title.includes('direct') || title.includes('message')) {
                    chatType = 'user_direct';
                  }
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
                
                // For document_focused: title is "Document: {filename}" when we have file context; else use history.title
                const resolveTitle = (): string => {
                  if (chatType === 'document_focused') {
                    const pc = historyData.persistent_context || historyData.persistentContext;
                    const ids = pc?.context_file_ids || pc?.selected_files || historyData.selected_files;
                    if (ids && ids.length > 0) {
                      const name = historyData.selected_file_names?.[0] || historyData.selected_file_name || `Document ${ids[0]}`;
                      return `Document: ${truncateFilename(name)}`;
                    }
                  }
                  return String(history.title || 'Untitled Chat');
                };

                return {
                  id: Number(history.id) || Math.random(),
                  title: resolveTitle(),
                  type: chatType,
                  participants: [{ id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }],
                  last_message: String(lastMessage || 'No messages yet'),
                  updated_at: String(updatedAt),
                  created_at: String(createdAt),
                  unread_count: 0,
                  // Store context data for future use
                  // Priority: persistent_context (most up-to-date) > selected_files/selected_bookmarks (initial context)
                  document_context: (() => {
                    const persistentContext = historyData.persistent_context || historyData.persistentContext;
                    const contextFileIds = persistentContext?.context_file_ids || persistentContext?.selected_files || historyData.selected_files;
                    if (contextFileIds && contextFileIds.length > 0) {
                      return {
                        id: contextFileIds[0],
                        name: historyData.selected_file_names?.[0] || historyData.selected_file_name || `Document ${contextFileIds[0]}`,
                        type: 'other' as const
                      };
                    }
                    return undefined;
                  })(),
                  bookmark_context: (() => {
                    const persistentContext = historyData.persistent_context || historyData.persistentContext;
                    const contextBookmarkIds = persistentContext?.context_bookmark_ids || persistentContext?.selected_bookmarks || historyData.selected_bookmarks;
                    if (contextBookmarkIds && contextBookmarkIds.length > 0) {
                      return {
                        id: contextBookmarkIds[0],
                        name: String(history.title || 'Bookmark'),
                        file_count: 0
                      };
                    }
                    return undefined;
                  })()
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
      
      // CRITICAL: Preserve document_focused type and document_context from existing local state
      // This prevents losing document chat status when backend doesn't return full context
      // Build map from: 1) Persisted AsyncStorage contexts, 2) Current in-memory state
      const existingChatsMap = new Map<number, Chat>();
      
      // First, add persisted contexts from AsyncStorage (survives app restart)
      persistedContexts.forEach((context: any, chatId: number) => {
        if (context.type === 'document_focused' || 
            context.type === 'bookmark_focused' || 
            context.type === 'user_direct' || 
            context.type === 'workspace') {
          // Create a minimal Chat object from persisted context
          existingChatsMap.set(chatId, {
            id: chatId,
            title: context.title,
            type: context.type as any,
            participants: context.participants || [],
            last_message: '',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            document_context: context.document_context,
            bookmark_context: context.bookmark_context,
            workspace: context.workspace
          });
        }
      });
      
      // Then, add/overwrite with current in-memory state (most recent)
      chats.forEach(chat => {
        if (chat.type === 'document_focused' || 
            chat.type === 'bookmark_focused' || 
            chat.type === 'user_direct' || 
            chat.type === 'workspace') {
          existingChatsMap.set(chat.id, chat);
        }
      });
      console.log('🔒 Preserving', existingChatsMap.size, 'chat contexts (document/bookmark/user/workspace) from persisted + in-memory');
      
      // Remove duplicates based on chat ID, preserving local document/bookmark context
      const uniqueChatsMap = new Map<number, Chat>();
      allChatsCombined.forEach(chat => {
        if (!uniqueChatsMap.has(chat.id)) {
          // Check if we have local context for this chat
          const localChat = existingChatsMap.get(chat.id);
          if (localChat && (localChat.type === 'document_focused' || 
                            localChat.type === 'bookmark_focused' || 
                            localChat.type === 'user_direct' || 
                            localChat.type === 'workspace')) {
            // Preserve type and context from local state
            // Backend might not return persistent_context consistently
            console.log(`🔒 Preserving ${localChat.type} for chat ${chat.id}:`, {
              title: localChat.title,
              backendType: chat.type,
              backendTitle: chat.title,
              hasDocContext: !!localChat.document_context,
              hasBookmarkContext: !!localChat.bookmark_context,
              hasWorkspace: !!localChat.workspace
            });
            uniqueChatsMap.set(chat.id, {
              ...chat,
              type: localChat.type,
              title: localChat.title, // Keep original title
              document_context: localChat.document_context,
              bookmark_context: localChat.bookmark_context,
              participants: localChat.participants,
              workspace: localChat.workspace
            });
          } else {
            if (chat.id > 0) { // Don't log for default chat (-1)
              console.log(`📋 No preserved context for chat ${chat.id}, using backend data:`, {
                type: chat.type,
                title: chat.title
              });
            }
            uniqueChatsMap.set(chat.id, chat);
          }
        } else {
          // If duplicate found, keep the one with more recent last message timestamp
          const existing = uniqueChatsMap.get(chat.id)!;
          const existingTimestamp = getLastMessageTimestamp(existing);
          const newTimestamp = getLastMessageTimestamp(chat);
          if (newTimestamp > existingTimestamp) {
            // Check if we should preserve local context
            const localChat = existingChatsMap.get(chat.id);
            if (localChat && (localChat.type === 'document_focused' || 
                              localChat.type === 'bookmark_focused' || 
                              localChat.type === 'user_direct' || 
                              localChat.type === 'workspace')) {
              console.log(`🔒 Preserving ${localChat.type} for chat ${chat.id} (newer):`, localChat.title);
              uniqueChatsMap.set(chat.id, {
                ...chat,
                type: localChat.type,
                title: localChat.title,
                document_context: localChat.document_context,
                bookmark_context: localChat.bookmark_context,
                participants: localChat.participants,
                workspace: localChat.workspace
              });
            } else {
              uniqueChatsMap.set(chat.id, chat);
            }
          }
        }
      });
      
      // Sort all chats by last message timestamp (most recent first), but keep ChatGD Assistant at top
      // Use helper function to ensure dates are converted to user's local timezone
      const allChatsArray = Array.from(uniqueChatsMap.values());
      const allChats = sortChatsByLastMessage(allChatsArray);
      
      console.log('📱 Loaded chats:', {
        total: allChats.length,
        aiChats: convertedChats.length,
        userChats: userChats.length,
        defaultChat: DEFAULT_CHAT_ASSISTANT,
        otherChats: allChats.length - 1, // Excluding ChatGD Assistant
      });
      setChats(allChats);
      
      // Persist document/bookmark chat contexts to AsyncStorage
      savePersistedChatContexts(allChats);
      
    } catch (error) {
      console.error('Failed to load chats:', error);
      // Fallback: just show default ChatGD Assistant
      setChats([DEFAULT_CHAT_ASSISTANT]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadWorkspaces = async () => {
    try {
      const response = await Promise.race([
        (api as any).getMobileWorkspaces(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
      ]);
      
      if (response && (response as any).success && (response as any).data) {
        // Handle both response structures: data.workspaces or data as array
        const workspacesData = Array.isArray((response as any).data) 
          ? (response as any).data 
          : ((response as any).data.workspaces || []);
        
        console.log('✅ Loaded', workspacesData.length, 'workspaces');
        setWorkspaces(workspacesData);
      } else {
        console.warn('⚠️ Workspaces API unavailable');
        setWorkspaces([]);
      }
    } catch (error: any) {
      if (error?.message === 'timeout' || error?.message?.includes('timeout')) {
        console.warn('⚠️ Workspace loading timed out - workspace chats unavailable');
      } else {
        console.warn('⚠️ Failed to load workspaces:', error?.message);
      }
      setWorkspaces([]);
    }
  };

  const loadDocuments = async () => {
    try {
      console.log('📄 Loading documents for @ mentions...');
      // Use getDocuments which uses the mobile endpoint and handles errors gracefully
      const response = await api.getDocuments(1, 50); // Get up to 50 recent files for mentions
      console.log('📄 Documents API response:', { 
        success: response?.success, 
        hasFiles: !!(response?.files), 
        hasData: !!(response?.data),
        filesCount: response?.files?.length || response?.data?.length || 0
      });
      
      if (response && (response.success !== false)) {
        // Handle different response formats (files or data array)
        const files = response.files || response.data || [];
        const docs = Array.isArray(files) ? files.map((file: any) => ({
          id: file.id,
          name: removeFileExtension(file.original_filename || file.filename || file.name),
          type: file.file_type || file.type,
          category: file.file_kind || file.category,
          size: file.file_size || file.size
        })) : [];
        setDocuments(docs);
        console.log(`✅ Loaded ${docs.length} documents for @ mentions`);
      } else {
        console.warn('⚠️ Documents API returned unsuccessful response');
        setDocuments([]);
      }
    } catch (error: any) {
      console.error('❌ Failed to load documents for @ mentions:', error?.message || error);
      setDocuments([]);
    }
  };

  const loadUsers = async () => {
    try {
      console.log('👥 Loading workspace users for direct messages and @ mentions...');
      
      // Use workspace users endpoint - gets all users from workspaces you have access to
      const response = await Promise.race([
        (api as any).getWorkspaceUsers(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
      ]);
      
      // Handle timeout or failed response gracefully
      if (!response || (response as any).success === false) {
        console.warn('⚠️ Workspace users API unavailable - trying fallback endpoint');
        
        // Fallback: Try the search users endpoint
        try {
          const fallbackResponse = await Promise.race([
            api.searchUsersForChat(''),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
          ]);
          
          if (fallbackResponse && (fallbackResponse as any).users) {
            setUsers((fallbackResponse as any).users);
            console.log(`✅ Loaded ${(fallbackResponse as any).users.length} users from fallback`);
            return;
          }
        } catch (fallbackError) {
          console.warn('⚠️ Fallback also failed - user chat features limited');
        }
        
        setUsers([]);
        return;
      }
      
      console.log('👥 Workspace users API response:', { 
        success: (response as any)?.success, 
        hasUsers: !!(response as any)?.users,
        hasData: !!(response as any)?.data,
        usersCount: (response as any)?.users?.length || (response as any)?.data?.length || 0
      });
      
      // Handle different response formats
      let usersList: any[] = [];
      if ((response as any)?.users) {
        usersList = (response as any).users;
      } else if ((response as any)?.data) {
        // Handle case where users are in data array
        usersList = Array.isArray((response as any).data) ? (response as any).data : [];
      } else if (Array.isArray(response)) {
        // Handle case where response is directly an array
        usersList = response as any[];
      }
      
      if (usersList.length > 0) {
        setUsers(usersList);
        console.log(`✅ Loaded ${usersList.length} workspace users`);
      } else {
        console.warn('⚠️ No workspace users found - you may not be part of any workspaces yet');
        setUsers([]);
      }
    } catch (error: any) {
      // Don't log full error stack for timeouts - just warn
      if (error?.message === 'timeout' || error?.message?.includes('timeout')) {
        console.warn('⚠️ Workspace users loading timed out - direct messaging unavailable');
      } else {
        console.warn('⚠️ Failed to load workspace users:', error?.message);
      }
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

  const loadMessages = async (chatId: number, forceReload: boolean = false) => {
    // CRITICAL: Prevent unnecessary reloads - only load if switching to a different chat or force reload is requested
    if (!forceReload && loadedChatIdRef.current === chatId && messages.length > 0) {
      console.log(`⏭️ [loadMessages] Skipping reload - messages already loaded for chat ${chatId}`);
      return;
    }
    
    setMessagesLoading(true);
    
    try {
      // If it's the ChatGD Assistant (id: -1), show welcome message
      if (chatId === -1) {
        const welcomeMessage: ChatMessage = {
          id: generateUniqueMessageId(),
          content: 'Hello! I\'m your ChatGD Assistant. I can help you with questions about your documents, analyze files, and provide insights. How can I help you today?',
          sender: { id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' },
          is_own_message: false,
          created_at: new Date().toISOString(), // This is fine for ChatGD Assistant as it's always current
        };
        setMessages([welcomeMessage]);
        loadedChatIdRef.current = chatId; // Track that we've loaded this chat
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
              
              // Deduplicate messages before setting to prevent duplicate key errors
              const deduplicatedMessages = deduplicateMessages(convertedMessages);
              setMessages(deduplicatedMessages);
              loadedChatIdRef.current = chatId; // Track that we've loaded this chat
            } else {
              setMessages([]);
              loadedChatIdRef.current = chatId; // Track even empty chats to prevent reloads
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
                  // Deduplicate messages before setting to prevent duplicate key errors
                  const deduplicatedMessages = deduplicateMessages(convertedMessages);
                  setMessages(deduplicatedMessages);
                  loadedChatIdRef.current = chatId; // Track that we've loaded this chat
                } else {
                  setMessages([]);
                  loadedChatIdRef.current = chatId; // Track even empty chats to prevent reloads
                }
              } catch (storeError) {
                console.error(`❌ Failed to load from chat store for chat ${chatId}:`, storeError);
                setMessages([]);
                loadedChatIdRef.current = chatId; // Track even on error to prevent infinite retries
                // Refresh the chat list to remove stale chat IDs
                loadChats();
              }
            } else {
              setMessages([]);
              loadedChatIdRef.current = chatId; // Track even empty chats to prevent reloads
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
        
        // Deduplicate messages before setting to prevent duplicate key errors
        const deduplicatedMessages = deduplicateMessages(convertedMessages);
        setMessages(deduplicatedMessages);
        loadedChatIdRef.current = chatId; // Track that we've loaded this chat
      } else {
        // For empty chats, don't show any welcome message - just show empty chat
        setMessages([]);
        loadedChatIdRef.current = chatId; // Track even empty chats to prevent reloads
      }
    } catch (error: any) {
      console.error('Failed to load messages:', error);
      
      // If it's a 404, the chat might not exist anymore - refresh chat list
      if (error.message?.includes('Chat not found') || error.message?.includes('404') || error.response?.status === 404) {
        console.warn(`⚠️ Chat ${chatId} not found, refreshing chat list`);
        setMessages([]);
        loadedChatIdRef.current = chatId; // Track even on error to prevent infinite retries
        loadChats();
      } else {
        // Show error message for other errors - but preserve existing messages if any
        // Only replace if we don't have messages for this chat
        if (loadedChatIdRef.current !== chatId || messages.length === 0) {
          const errorMessage: ChatMessage = {
            id: generateUniqueMessageId(),
            content: 'Failed to load messages. Please try again.',
            sender: null,
            is_own_message: false,
            created_at: new Date().toISOString(),
          };
          setMessages([errorMessage]);
          loadedChatIdRef.current = chatId; // Track even on error
        }
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
    
    // Ensure displayedChars doesn't exceed buffer length (safety check)
    if (displayedCharsRef.current > contentBufferRef.current.length) {
      console.warn('⚠️ displayedChars exceeds buffer length, resetting:', displayedCharsRef.current, '>', contentBufferRef.current.length);
      displayedCharsRef.current = Math.min(displayedCharsRef.current, contentBufferRef.current.length);
    }
    
    // Don't start if we've already displayed all content (unless it's fake streaming that needs to continue)
    if (displayedCharsRef.current >= contentBufferRef.current.length && !isFakeStreamingRef.current) {
      console.log('⏸️ All content already displayed, skipping');
      return;
    }
    
    console.log('🚀 Starting new streaming interval...');
    isStreamingRef.current = true;
    
    streamingIntervalRef.current = setInterval(() => {
      // Check if we have more content to display
      if (displayedCharsRef.current >= contentBufferRef.current.length) {
        // All current content is displayed
        // Keep interval running to wait for more chunks (they might arrive)
        return;
      }
      
      // MATCH WEB: Display next 2-3 characters for smooth flow (upload.tsx line 4407)
      const charsToAdd = Math.min(3, contentBufferRef.current.length - displayedCharsRef.current);
      displayedCharsRef.current = displayedCharsRef.current + charsToAdd;
      
      // MATCH WEB: Extract display text using substring (upload.tsx line 4408)
      const displayText = contentBufferRef.current.substring(0, displayedCharsRef.current);
      
      console.log(`📝 Streaming ${isPreviewPhaseRef.current ? 'PREVIEW' : 'REFINEMENT'}: ${displayedCharsRef.current}/${contentBufferRef.current.length} chars`);
      
      // Update UI with current content (like web: flushSync update)
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
            sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
            is_own_message: false,
            created_at: new Date().toISOString()
          };
          newMessages.push(assistantMessage);
          console.log(`🔄 Created new assistant message with content: "${displayText.substring(0, 50)}..."`);
        }
        return newMessages;
      });
    }, 20) as unknown as number; // MATCH WEB: 20ms interval = 50fps (upload.tsx line 4441)
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
      // Final update: never clear already-shown content (fix mobile response clearing)
      const finalContent = (contentBufferRef.current && contentBufferRef.current.length > 0)
        ? contentBufferRef.current
        : '';
      setMessages(prev => {
        const newMessages = [...prev];
        const keepContent = finalContent || newMessages[assistantMsgIndex]?.content || '';
        if (newMessages[assistantMsgIndex]) {
          newMessages[assistantMsgIndex] = {
            ...newMessages[assistantMsgIndex],
            content: keepContent
          };
        } else {
          const assistantMessage: ChatMessage = {
            id: generateUniqueMessageId(),
            content: keepContent,
            sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
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
    console.log('📤 [CHATS-WEB] ===== sendMessage CALLED =====');
    console.log('📤 [CHATS-WEB] selectedChat:', selectedChat);
    console.log('📤 [CHATS-WEB] newMessage:', newMessage);
    console.log('📤 [CHATS-WEB] userProfile:', userProfile);
    
    if (!selectedChat || !newMessage.trim()) {
      console.log('⚠️ [CHATS-WEB] Cannot send - missing chat or empty message:', {
        hasSelectedChat: !!selectedChat,
        hasMessage: !!newMessage.trim(),
        messageLength: newMessage.trim().length
      });
      return;
    }
    
    // Update ref with current chat ID at the start of sending
    currentChatIdRef.current = selectedChat.id !== -1 ? Number(selectedChat.id) : null;

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

      // CRITICAL: Stop any existing streaming and clear state completely
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
        streamingIntervalRef.current = null;
      }
      
      // Reset streaming state completely to prevent leftover content
      contentBufferRef.current = '';
      displayedCharsRef.current = 0;
      isPreviewPhaseRef.current = true;
      isStreamingRef.current = false;
      isFakeStreamingRef.current = false;

      // For AI assistant chats, use streaming
      if (selectedChat.type === 'ai_assistant' || selectedChat.type === 'document_focused' || selectedChat.type === 'bookmark_focused') {
        // Initialize state for fake streaming from ProcessingMessageDisplay component
        // The ProcessingMessageDisplay will show looping messages until real content arrives
        // Ensure buffer is completely empty (double-check)
        contentBufferRef.current = '';
        displayedCharsRef.current = 0;
        isPreviewPhaseRef.current = true;
        isFakeStreamingRef.current = true; // Enable fake streaming display (ProcessingMessageDisplay)
        isStreamingRef.current = false;
        
         // Create placeholder assistant message - fake streaming from file will populate it
          const placeholderMessage: ChatMessage = {
            id: generateUniqueMessageId(),
            content: '', // Fake streaming from file will populate this
            sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
            is_own_message: false,
            created_at: new Date().toISOString()
          };
        setMessages(prev => {
          assistantMessageIndex = prev.length; // Update to correct index after user message is added
          console.log('📝 Created placeholder message at index', assistantMessageIndex, 'fake streaming from file will handle display');
          return [...prev, placeholderMessage];
        });
        
        // Don't start streaming here - fake streaming from file is already running
        // Send the raw query as-is, without adding Document:/Question:/Context: prefixes
        // The backend will handle context via document_ids in streamFilters
        const chatContext = userMessage.content;
        
        // Log mention context for debugging but don't modify the query
        if (selectedMention) {
          console.log('📎 Persistent mention active:', selectedMention);
        }
        
        // Check if context was explicitly removed for this chat
        const ctxRemoved = selectedChat.id != null && selectedChat.id !== -1 && contextRemovedChatIdsRef.current.has(Number(selectedChat.id));
        
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
            const id = Number(selectedMention.id);
            searchFilters = {
              context_file_ids: Number.isNaN(id) ? [] : [id],
              document_ids: Number.isNaN(id) ? [] : [id],
              context_type: 'document'
            };
          } else if (selectedMention.type === 'user') {
            searchFilters = {
              user_id: selectedMention.id,
              context_type: 'user'
            };
          }
        } else if (!ctxRemoved && selectedChat.type === 'bookmark_focused' && selectedChat.bookmark_context) {
          searchFilters = { bookmark_id: selectedChat.bookmark_context.id, context_type: 'bookmark' };
        } else if (!ctxRemoved && selectedChat.type === 'document_focused' && selectedChat.document_context) {
          const id = Number(selectedChat.document_context.id);
          searchFilters = Number.isNaN(id) ? {} : { 
            context_file_ids: [id],
            document_ids: [id],
            context_type: 'document' 
          };
        }
        
        // Build search filters for streaming with full context support (matching web implementation)
        let streamFilters: any = {};
        if (selectedMention) {
          const documentIds = selectedMention.type === 'bookmark' 
            ? selectedMention.data.documents?.map((doc: any) => doc.id) || []
            : selectedMention.type === 'file' 
            ? [selectedMention.id]
            : undefined;
            
          const fileIds = selectedMention.type === 'file' ? [Number(selectedMention.id)] : undefined;
          const bookmarkIds = selectedMention.type === 'bookmark' ? [Number(selectedMention.id)] : undefined;
          const workspaceIds = selectedMention.type === 'workspace' ? [Number(selectedMention.id)] : undefined;
          const userIds = selectedMention.type === 'user' ? [Number(selectedMention.id)] : undefined;
          
          streamFilters = {
            context_type: selectedMention.type,
            context_id: selectedMention.id,
            context_file_ids: fileIds,
            selected_files: fileIds, // match web
            document_ids: documentIds,
            // Include all context types for full web parity
            selected_bookmarks: bookmarkIds,
            context_bookmark_ids: bookmarkIds,
            selected_workspaces: workspaceIds,
            selected_users: userIds,
          };
        } else {
          // Use general chat endpoint for AI assistant with context filters and search type
          streamFilters = {
            search_type: selectedSearchType, // Add selected search type
            ...searchFilters // Include any context filters (bookmark, document, etc.)
          };
          
          // Also include context from selectedChat if available
          if (!ctxRemoved && selectedChat) {
            if (selectedChat.workspace?.id) {
              streamFilters.selected_workspaces = [Number(selectedChat.workspace.id)];
              streamFilters.active_workspace_id = Number(selectedChat.workspace.id);
            }
            if (selectedChat.bookmark_context?.id) {
              streamFilters.selected_bookmarks = [Number(selectedChat.bookmark_context.id)];
              streamFilters.context_bookmark_ids = [Number(selectedChat.bookmark_context.id)];
            }
          }
        }
        
        // Ensure context_file_ids and selected_files (numbers) when there is a file context — match web
        if (!streamFilters.context_file_ids) {
          if (selectedMention?.type === 'file') {
            const id = Number(selectedMention.id);
            if (!Number.isNaN(id)) {
              streamFilters.context_file_ids = [id];
              streamFilters.selected_files = [id];
            }
          } else if (!ctxRemoved && selectedChat?.document_context) {
            const id = Number(selectedChat.document_context.id);
            if (!Number.isNaN(id)) {
              streamFilters.context_file_ids = [id];
              streamFilters.selected_files = [id];
            }
          }
        } else {
          const ids = Array.isArray(streamFilters.context_file_ids)
            ? streamFilters.context_file_ids.map((x: any) => Number(x)).filter((n: number) => !Number.isNaN(n))
            : [];
          streamFilters.selected_files = ids.length ? ids : streamFilters.selected_files;
          streamFilters.context_file_ids = ids.length ? ids : streamFilters.context_file_ids;
        }
        if (streamFilters.context_file_ids && !streamFilters.document_ids) {
          streamFilters.document_ids = streamFilters.context_file_ids;
        }
        
        // CRITICAL: Add chat_history_id only if this is an existing chat from backend
        // Backend will create chat history automatically when chat_history_id is not provided
        // Temporary placeholder IDs (-2) indicate new chats that haven't been saved yet
        // Default assistant (-1) should not send chat_history_id
        if (selectedChat && selectedChat.id && selectedChat.id > 0) {
          // Only send chat_history_id for positive backend IDs
          // Backend creates new chat history when chat_history_id is omitted
          streamFilters.chat_history_id = selectedChat.id;
          console.log('📋 [MOBILE] Adding chat_history_id to filters:', selectedChat.id);
        } else {
          // New chat (placeholder ID -2) or default assistant (-1) - let backend create history
          console.log('📋 [MOBILE] Not sending chat_history_id - backend will create new chat history');
        }

        // Log what we're sending to match web behavior
        console.log('📤 [MOBILE] Sending chat request:', {
          message: chatContext.substring(0, 100),
          context_file_ids: streamFilters.context_file_ids,
          document_ids: streamFilters.document_ids,
          chat_history_id: streamFilters.chat_history_id,
          hasSelectedMention: !!selectedMention,
          selectedMentionType: selectedMention?.type,
          selectedChatType: selectedChat?.type,
          documentContextId: selectedChat?.document_context?.id
        });

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
                      sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
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
                // Handle both 'content' and 'response' fields (backend may use either)
                const instantContent = data.content || data.response || '';
                console.log('⚡ INSTANT preview received:', {
                  contentLength: instantContent.length,
                  preview: instantContent.substring(0, 50),
                  hasContent: !!data.content,
                  hasResponse: !!data.response,
                  fullData: Object.keys(data),
                  assistantMessageIndex
                });
                
                // Validate content exists
                if (!instantContent || instantContent.length === 0) {
                  console.warn('⚠️ instant_preview received but content is empty');
                  break;
                }
                
                // Replace fake content with real content
                contentBufferRef.current = instantContent;
                isPreviewPhaseRef.current = true;
                isFakeStreamingRef.current = false; // Real content arrived, stop fake streaming
                
                // Display first chunk immediately (match web behavior - show more for better UX)
                const initialCharsToShow = Math.min(50, instantContent.length); // Increased from 20 to 50 for better visibility
                const initialContent = instantContent.slice(0, initialCharsToShow);
                displayedCharsRef.current = initialCharsToShow;
                
                console.log('⚡ Displaying instant preview:', {
                  initialCharsToShow,
                  initialContent: initialContent.substring(0, 50),
                  totalLength: instantContent.length
                });
                
                setMessages(prev => {
                  const newMessages = [...prev];
                  // Ensure message exists at correct index
                  if (newMessages[assistantMessageIndex]) {
                    // Update existing message with instant preview content
                    newMessages[assistantMessageIndex] = {
                      ...newMessages[assistantMessageIndex],
                      content: initialContent, // Show initial preview immediately
                      is_own_message: false, // Explicitly set to false for assistant messages
                      sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }
                    };
                    console.log('⚡ Updated existing message at index', assistantMessageIndex, 'with instant preview');
                  } else {
                    // Create new assistant message if it doesn't exist
                    const assistantMessage: ChatMessage = {
                      id: generateUniqueMessageId(),
                      content: initialContent, // Show initial preview immediately
                      sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
                      is_own_message: false,
                      created_at: new Date().toISOString()
                    };
                    newMessages.push(assistantMessage);
                    console.log('⚡ Created new assistant message with instant preview at index', newMessages.length - 1);
                  }
                  return newMessages;
                });
                
                // Continue streaming with real content (will stream remaining chars)
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
                      sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }
                    };
                  }
                  return newMessages;
                });
                break;

              case 'chunk':
              case 'preview_chunk':
                // TEMPLATE PREVIEW: Show after search completes (replaces instant preview)
                // Matches web: upload.tsx lines 4671-4706
                const previewChunkContent = data.content || data.response || '';
                console.log('📦 Template preview chunk received:', {
                  chunk_index: data.chunk_index,
                  contentLength: previewChunkContent.length,
                  preview: previewChunkContent.substring(0, 50)
                });
                
                isFakeStreamingRef.current = false; // Real content arrived
                
                if (data.chunk_index === 0 || contentBufferRef.current.includes('Searching for')) {
                  // First chunk - REPLACE instant preview (like web)
                  console.log('📦 First preview chunk - replacing instant preview');
                  
                  // Stop existing display timer and reset (like web)
                  if (streamingIntervalRef.current) {
                    clearInterval(streamingIntervalRef.current);
                    streamingIntervalRef.current = null;
                  }
                  
                  // Reset buffer and display (like web: contentBuffer = previewChunkContent; displayedContent = '')
                  contentBufferRef.current = previewChunkContent;
                  displayedCharsRef.current = 0;
                  isPreviewPhaseRef.current = true;
                  
                  // Ensure message exists
                  setMessages(prev => {
                    const newMessages = [...prev];
                    if (!newMessages[assistantMessageIndex]) {
                      newMessages.push({
                        id: generateUniqueMessageId(),
                        content: '',
                        sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
                        is_own_message: false,
                        created_at: new Date().toISOString()
                      });
                    }
                    return newMessages;
                  });
                } else {
                  // Subsequent chunks - append (like web: contentBuffer += previewChunkContent)
                  contentBufferRef.current += previewChunkContent;
                  console.log('📦 Appended preview chunk', data.chunk_index, '- buffer now:', contentBufferRef.current.length);
                }
                
                // Display with smooth typing effect (like web: displayContentImmediately)
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
                // REFINEMENT (main response): Replace preview immediately
                // Matches web: upload.tsx lines 4714-4739
                const refinementChunkContent = data.content || data.response || '';
                console.log('🔄 Refinement chunk received', { 
                  chunk_index: data.chunk_index, 
                  contentLength: refinementChunkContent.length, 
                  preview: refinementChunkContent.substring(0, 40) 
                });
                
                isFakeStreamingRef.current = false;
                
                if (data.chunk_index === 0) {
                  // First refinement chunk - IMMEDIATE transition (like web, NO WAITING)
                  console.log('🔄 First refinement chunk - IMMEDIATE cutover from preview');
                  
                  // Stop preview display IMMEDIATELY (like web: clearInterval(displayTimer))
                  if (streamingIntervalRef.current) {
                    clearInterval(streamingIntervalRef.current);
                    streamingIntervalRef.current = null;
                  }
                  
                  // Reset for refinement phase (like web: contentBuffer = refinementChunkContent; displayedContent = '')
                  contentBufferRef.current = refinementChunkContent;
                  displayedCharsRef.current = 0;
                  isPreviewPhaseRef.current = false;
                  
                  // Restart display immediately (like web: displayContentImmediately)
                  startOrContinueStreaming(assistantMessageIndex);
                } else {
                  // Subsequent chunks - append (like web: contentBuffer += refinementChunkContent)
                  contentBufferRef.current += refinementChunkContent;
                  console.log('🔄 Appended refinement chunk', data.chunk_index, '- buffer now:', contentBufferRef.current.length);
                  
                  // Ensure streaming continues (like web: displayContentImmediately)
                  startOrContinueStreaming(assistantMessageIndex);
                }
                break;

              case 'complete':
                console.log('✅ Stream complete');
                console.log('✅ Final content buffer:', contentBufferRef.current);
                console.log('✅ Complete event data:', { 
                  hasResponse: !!data.response, 
                  chat_history_id: data.chat_history_id,
                  currentSelectedChatId: selectedChat?.id,
                  isPreviewPhase: isPreviewPhaseRef.current,
                  displayedChars: displayedCharsRef.current,
                  bufferLength: contentBufferRef.current.length
                });
                
                // CRITICAL: Handle chat_history_id from backend response
                // If backend returns a new chat_history_id, update selectedChat to use it
                // This prevents creating duplicate chats when user sends multiple messages
                const returnedChatId = data.chat_history_id ? Number(data.chat_history_id) : null;
                const currentChatId = selectedChat ? Number(selectedChat.id) : null;
                
                if (returnedChatId && returnedChatId !== -1) {
                  // Update ref to track current chat ID
                  currentChatIdRef.current = returnedChatId;
                  
                  if (returnedChatId !== currentChatId) {
                    console.log('🔄 Backend returned new chat_history_id:', returnedChatId, 'updating selectedChat from', currentChatId);
                    
                    // Update selectedChat to use the new chat_history_id
                    setSelectedChat(prev => {
                      if (prev) {
                        const updatedChat = {
                          ...prev,
                          id: returnedChatId
                        };
                        
                        console.log('🔄 Preserving chat context during ID update:', {
                          oldId: currentChatId,
                          newId: returnedChatId,
                          type: updatedChat.type,
                          title: updatedChat.title,
                          hasDocContext: !!updatedChat.document_context,
                          hasBookmarkContext: !!updatedChat.bookmark_context,
                          hasWorkspace: !!updatedChat.workspace
                        });
                        
                        // Also update the chat in the chats list immediately
                        setChats(prevChats => {
                          // Remove old chat with temp ID and add new chat with real ID
                          const chatsWithoutOld = prevChats.filter(chat => chat.id !== currentChatId);
                          const updatedChats = [updatedChat, ...chatsWithoutOld];
                          
                          console.log('🔄 Updated chats list:', {
                            removedId: currentChatId,
                            addedId: returnedChatId,
                            totalChats: updatedChats.length
                          });
                          
                          // CRITICAL: Persist the updated chat context immediately
                          // This ensures document/bookmark/workspace context is saved with the new ID
                          savePersistedChatContexts(updatedChats);
                          
                          return updatedChats;
                        });
                        
                        return updatedChat;
                      }
                      return prev;
                    });
                    
                    // Reload chat list to ensure the new chat appears with latest data from backend
                    setTimeout(() => {
                      loadChats();
                    }, 500);
                  } else {
                    console.log('✅ Chat history ID matches current chat:', returnedChatId);
                  }
                } else {
                  console.log('⚠️ No chat_history_id in response or it is -1');
                  // Keep current chat ID in ref
                  if (currentChatId) {
                    currentChatIdRef.current = currentChatId;
                  }
                }
                
                // Complete event - finalize (like web)
                // Buffer already has full content from chunks, just ensure phase is correct
                if (data.response != null && String(data.response).length > 0) {
                  // Backend included full response in complete event - use it
                  const resp = String(data.response);
                  console.log('✅ Complete with final response', { length: resp.length });
                  contentBufferRef.current = resp;
                  displayedCharsRef.current = 0;
                  isPreviewPhaseRef.current = false;
                  startOrContinueStreaming(assistantMessageIndex);
                } else {
                  // No response in complete - buffer already has content from chunks
                  console.log('✅ Complete without response - buffer has', contentBufferRef.current.length, 'chars');
                  isPreviewPhaseRef.current = false;
                  // Streaming should already be active, just ensure phase is correct
                }
                
                // Let streaming finish naturally (like web)
                // The streaming interval will stop automatically when displayedChars >= buffer.length
                break;

              default:
                console.log('⚠️ [CHATS] Unknown/unhandled SSE event type:', type, {
                  dataKeys: Object.keys(data || {}),
                  hasContent: !!(data?.content || data?.response),
                  preview: (data?.content || data?.response || '').substring(0, 100)
                });
                // Try to handle unknown events that might have content
                if (data?.content || data?.response) {
                  const unknownContent = data.content || data.response || '';
                  if (unknownContent.length > 0 && !isFakeStreamingRef.current) {
                    console.log('📝 [CHATS] Unknown event has content, treating as preview chunk');
                    contentBufferRef.current = unknownContent;
                    displayedCharsRef.current = 0;
                    isPreviewPhaseRef.current = true;
                    startOrContinueStreaming(assistantMessageIndex);
                  }
                }
            }
          }
        );

        // After streaming completes, update chat list
        // Use ref to get the latest chat ID (which might have been updated by the complete event handler)
        setTimeout(() => {
          const chatIdToUpdate = currentChatIdRef.current || selectedChat?.id;
          if (!chatIdToUpdate || chatIdToUpdate === -1) return;
          
          setChats(prev => {
            // Check if chat exists in list
            const existingChat = prev.find(chat => chat.id === chatIdToUpdate);
            if (existingChat) {
              // Update existing chat
              return prev.map(chat => 
                chat.id === chatIdToUpdate 
                  ? { ...chat, last_message: (contentBufferRef.current || '').substring(0, 50) + '...', updated_at: new Date().toISOString() }
                  : chat
              );
            } else {
              // Chat doesn't exist in list yet (might be a new chat), reload chat list
              console.log('🔄 Chat not found in list, reloading chat list...');
              loadChats();
              return prev;
            }
          });
        }, 600); // Wait a bit longer than the complete handler to ensure selectedChat is updated
      } else if (selectedChat.type === 'user_direct') {
        console.log('📤 [CHATS-WEB] ===== SENDING USER DIRECT MESSAGE =====');
        console.log('📤 [CHATS-WEB] Chat ID:', selectedChat.id);
        console.log('📤 [CHATS-WEB] Message text:', messageText);
        console.log('📤 [CHATS-WEB] User ID:', userProfile?.id);
        
        // Emit typing stopped (validate all required fields)
        if (socketRef.current && 
            userProfile && 
            selectedChat.id != null && 
            userProfile.id != null) {
          console.log('📤 [CHATS-WEB] Emitting typing stopped event');
          socketRef.current.emit('user_typing', { 
            chat_id: selectedChat.id,
            user_id: userProfile.id,
            is_typing: false
          });
        }
        
        // Send direct message using web endpoint (same as web chat.tsx)
        console.log('📤 [CHATS-WEB] Calling API to send user direct message...');
        const response = await api.sendChatMessageToChat(messageText, selectedChat.id);
        console.log('📤 [CHATS-WEB] API response received:', {
          success: response.success,
          hasMessage: !!(response as any).message,
          messageId: (response as any).message?.id,
          messageContent: (response as any).message?.content,
          senderId: (response as any).message?.sender_id
        });
        
        if (response.success && (response as any).message) {
          // Web chat.tsx returns: { success: true, message: ChatMessage }
          const newMsg = (response as any).message;
          console.log('📤 [CHATS-WEB] Message sent successfully, adding to UI');
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
          console.log('📤 [CHATS-WEB] User direct message successfully added to UI and chat list updated');
        } else {
          console.warn('⚠️ [CHATS-WEB] User direct message API call succeeded but no message in response');
        }
      } else if (selectedChat.type === 'workspace') {
        console.log('📤 [CHATS-WEB] ===== SENDING WORKSPACE MESSAGE =====');
        console.log('📤 [CHATS-WEB] Chat ID:', selectedChat.id);
        console.log('📤 [CHATS-WEB] Message text:', messageText);
        console.log('📤 [CHATS-WEB] User ID:', userProfile?.id);
        
        // Emit typing stopped (validate all required fields)
        if (socketRef.current && 
            userProfile && 
            selectedChat.id != null && 
            userProfile.id != null) {
          console.log('📤 [CHATS-WEB] Emitting typing stopped event');
          socketRef.current.emit('user_typing', { 
            chat_id: selectedChat.id,
            user_id: userProfile.id,
            is_typing: false
          });
        }
        
        // Send workspace message using web endpoint (same as web chat.tsx)
        console.log('📤 [CHATS-WEB] Calling API to send workspace message...');
        const response = await api.sendChatMessageToChat(messageText, selectedChat.id);
        console.log('📤 [CHATS-WEB] API response received:', {
          success: response.success,
          hasMessage: !!(response as any).message,
          messageId: (response as any).message?.id,
          messageContent: (response as any).message?.content,
          senderId: (response as any).message?.sender_id
        });
        
        if (response.success && (response as any).message) {
          // Web chat.tsx returns: { success: true, message: ChatMessage }
          const newMsg = (response as any).message;
          console.log('📤 [CHATS-WEB] Message sent successfully, adding to UI');
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
          console.log('📤 [CHATS-WEB] Workspace message successfully added to UI and chat list updated');
        } else {
          console.warn('⚠️ [CHATS-WEB] Workspace message API call succeeded but no message in response');
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
              sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }
            };
            return newMessages;
          });
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('📤 [CHATS-WEB] Request was aborted');
        // Stop fake streaming if it was active
        if (isFakeStreamingRef.current) {
          stopStreaming(assistantMessageIndex, false);
          isFakeStreamingRef.current = false;
        }
        // Don't show error for aborted requests
        return;
      }
      console.error('❌ [CHATS-WEB] Failed to send message:', error);
      console.error('❌ [CHATS-WEB] Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        chatType: selectedChat?.type,
        chatId: selectedChat?.id,
        messageText: newMessage?.trim() || 'N/A',
        userId: userProfile?.id
      });
      
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
      console.log('📤 [CHATS-WEB] Send operation completed (success or error)');
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
    
    // Load messages first, then restore context (persistent_context is loaded with messages)
    loadMessages(chat.id).then(() => {
      // Restore document/bookmark/workspace context from persistent_context or chat object unless the user explicitly removed it
      const explicitlyRemoved = chat.id != null && chat.id !== -1 && contextRemovedChatIdsRef.current.has(Number(chat.id));
      if (explicitlyRemoved) {
        setSelectedMention(null);
        return;
      }
      
      // First, try to restore from persistent_context (from backend - most up-to-date)
      const { currentHistory } = useChatStore.getState();
      const persistentContext = currentHistory?.persistent_context;
      
      if (persistentContext) {
        // Restore context from persistent_context (backend stored context)
        if (persistentContext.context_file_ids && persistentContext.context_file_ids.length > 0) {
          const fileId = persistentContext.context_file_ids[0];
          // First, try to use file name from chat's document_context if available
          const existingFileContext = chat.document_context;
          if (existingFileContext && existingFileContext.id === fileId && existingFileContext.name && 
              !existingFileContext.name.startsWith('Document ') && existingFileContext.name !== 'Document') {
            // Use existing name from chat object (already loaded)
            setSelectedMention({ 
              type: 'file', 
              id: fileId, 
              name: existingFileContext.name, 
              data: existingFileContext 
            });
            return; // Context restored from persistent_context using cached name
          }
          
          // Try to find file in loaded documents list
          const fileInList = documents.find(d => d.id === fileId);
          if (fileInList) {
            setSelectedMention({ 
              type: 'file', 
              id: fileId, 
              name: fileInList.name, 
              data: { id: fileId, name: fileInList.name, type: 'other' } 
            });
            return; // Context restored from persistent_context using loaded documents
          }
          
          // Only fetch from API if name is not available locally
          api.getFileById(fileId).then((response: any) => {
            if (response.success && response.file) {
              const fileName = response.file.original_filename || response.file.filename || `Document ${fileId}`;
              setSelectedMention({ 
                type: 'file', 
                id: fileId, 
                name: fileName, 
                data: { id: fileId, name: fileName, type: 'other' } 
              });
            } else {
              setSelectedMention({ type: 'file', id: fileId, name: `Document ${fileId}`, data: { id: fileId, name: `Document ${fileId}`, type: 'other' } });
            }
          }).catch(() => {
            setSelectedMention({ type: 'file', id: fileId, name: `Document ${fileId}`, data: { id: fileId, name: `Document ${fileId}`, type: 'other' } });
          });
          return; // Context restored from persistent_context
        } else if (persistentContext.context_bookmark_ids && persistentContext.context_bookmark_ids.length > 0) {
          const bookmarkId = persistentContext.context_bookmark_ids[0];
          // Try to find bookmark in loaded bookmarks
          const bookmark = bookmarks.find(b => b.id === bookmarkId);
          if (bookmark) {
            setSelectedMention({ type: 'bookmark', id: bookmarkId, name: bookmark.name, data: bookmark });
          } else if (chat.bookmark_context && chat.bookmark_context.id === bookmarkId) {
            // Use bookmark context from chat object if available
            setSelectedMention({ type: 'bookmark', id: bookmarkId, name: chat.bookmark_context.name, data: chat.bookmark_context });
          } else {
            // Only fetch from API if bookmark not found locally
            api.getBookmarks().then((response: any) => {
              if (response.success && response.data) {
                const bookmarkData = Array.isArray(response.data) ? response.data : (response.data.bookmarks || []);
                const foundBookmark = bookmarkData.find((b: any) => b.id === bookmarkId);
                if (foundBookmark) {
                  setSelectedMention({ type: 'bookmark', id: bookmarkId, name: foundBookmark.name, data: foundBookmark });
                }
              }
            }).catch(() => {
              // If fetch fails, try to use chat's bookmark_context as fallback
            });
          }
          return; // Context restored from persistent_context
        }
      }
      
      // Fallback: restore from local chat object (document_context, bookmark_context)
      if (chat.document_context) {
        // Capture document_context to avoid TypeScript issues in async callbacks
        const docContext = chat.document_context;
        // If the name looks like a query (contains common question words), try to find in loaded documents first
        const nameLooksLikeQuery = /^(what|how|why|when|where|summarize|explain|describe|tell me|show me)/i.test(docContext.name.trim());
        if (nameLooksLikeQuery || docContext.name === 'Document' || docContext.name.startsWith('Document ')) {
          // First, try to find file in loaded documents list (avoid API call)
          const fileInList = documents.find(d => d.id === docContext.id);
          if (fileInList) {
            setSelectedMention({ 
              type: 'file', 
              id: docContext.id, 
              name: fileInList.name, 
              data: { ...docContext, name: fileInList.name } 
            });
            // Update the chat's document_context too
            setChats(prev => prev.map(c => 
              c.id === chat.id && c.document_context 
                ? { ...c, document_context: { ...c.document_context, name: fileInList.name } }
                : c
            ));
          } else {
            // Only fetch from API if not found in loaded documents
            api.getFileById(docContext.id).then((response: any) => {
              if (response.success && response.file) {
                const actualName = response.file.original_filename || response.file.filename || docContext.name;
                setSelectedMention({ 
                  type: 'file', 
                  id: docContext.id, 
                  name: actualName, 
                  data: { ...docContext, name: actualName } 
                });
                // Update the chat's document_context too
                setChats(prev => prev.map(c => 
                  c.id === chat.id && c.document_context 
                    ? { ...c, document_context: { ...c.document_context, name: actualName } }
                    : c
                ));
              } else {
                // Fallback: use existing name even if it looks like a query
                setSelectedMention({ type: 'file', id: docContext.id, name: docContext.name, data: docContext });
              }
            }).catch(() => {
              // On error, use existing name
              setSelectedMention({ type: 'file', id: docContext.id, name: docContext.name, data: docContext });
            });
          }
        } else {
          // Name looks valid, use it directly
          setSelectedMention({ type: 'file', id: docContext.id, name: docContext.name, data: docContext });
        }
      } else if (chat.bookmark_context) {
        setSelectedMention({ type: 'bookmark', id: chat.bookmark_context.id, name: chat.bookmark_context.name, data: chat.bookmark_context });
      } else if (chat.workspace) {
        setSelectedMention({ type: 'workspace', id: chat.workspace.id, name: chat.workspace.name, data: chat.workspace });
      } else {
        setSelectedMention(null);
      }
    }).catch((error) => {
      console.error('Failed to load messages and restore context:', error);
      // On error, still try to restore from local chat object
      const explicitlyRemoved = chat.id != null && chat.id !== -1 && contextRemovedChatIdsRef.current.has(Number(chat.id));
      if (!explicitlyRemoved && chat.document_context) {
        setSelectedMention({ type: 'file', id: chat.document_context.id, name: chat.document_context.name, data: chat.document_context });
      } else if (!explicitlyRemoved && chat.bookmark_context) {
        setSelectedMention({ type: 'bookmark', id: chat.bookmark_context.id, name: chat.bookmark_context.name, data: chat.bookmark_context });
      } else {
        setSelectedMention(null);
      }
    });
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
    loadedChatIdRef.current = null; // Clear loaded chat ID when leaving chat
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
        console.log('📋 @ Mention modal should be visible now', {
          showMentionModal: true,
          mentionQuery: query,
          resultsCount: mentionResults.length,
          documents: documents.length,
          users: users.length,
          workspaces: workspaces.length,
          bookmarks: bookmarks.length
        });
        
        // Reload data if arrays are empty (data might not have loaded yet)
        if (documents.length === 0 && users.length === 0 && workspaces.length === 0 && bookmarks.length === 0) {
          console.log('📋 @ mention detected but data arrays are empty, reloading...');
          Promise.all([
            loadDocuments(),
            loadUsers(),
            loadWorkspaces(),
            loadBookmarks()
          ]).catch(error => {
            console.error('Error reloading mention data:', error);
          });
        }
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
    
    // Emit typing event for user chats (user_direct and workspace only)
    // Validate all required fields exist before emitting to prevent server errors
    if (selectedChat && 
        (selectedChat.type === 'user_direct' || selectedChat.type === 'workspace') && 
        socketRef.current && 
        userProfile && 
        selectedChat.id != null && 
        userProfile.id != null) {
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Emit typing started
      socketRef.current.emit('user_typing', { 
        chat_id: selectedChat.id,
        user_id: userProfile.id,
        is_typing: true
      });
      
      // Auto-stop typing after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        if (socketRef.current && 
            selectedChat && 
            userProfile && 
            selectedChat.id != null && 
            userProfile.id != null) {
          socketRef.current.emit('user_typing', { 
            chat_id: selectedChat.id,
            user_id: userProfile.id,
            is_typing: false
          });
        }
      }, 3000);
    }
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
    // If this is the chat's built-in context (document/bookmark/workspace), mark as explicitly removed so we don't restore on reload
    const chatId = selectedChat?.id != null && selectedChat.id !== -1 ? Number(selectedChat.id) : null;
    const isBuiltInContext = selectedChat && selectedMention && (
      (selectedChat.document_context && selectedMention.type === 'file' && selectedMention.id === selectedChat.document_context.id) ||
      (selectedChat.bookmark_context && selectedMention.type === 'bookmark' && selectedMention.id === selectedChat.bookmark_context.id) ||
      (selectedChat.workspace && selectedMention.type === 'workspace' && selectedMention.id === selectedChat.workspace.id)
    );
    if (chatId != null && isBuiltInContext) {
      contextRemovedChatIdsRef.current.add(chatId);
      secureStorage.setItem(STORAGE_KEYS.CONTEXT_REMOVED_CHAT_IDS, JSON.stringify([...contextRemovedChatIdsRef.current]));
    }
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
    // Backend will create chat history when first message is sent
    const newChat: Chat = {
      id: -2,
      title: getChatTypeInfo(type).name,
      type: type,
      participants: [{ id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }],
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
    // Ensure ChatGD Assistant always remains first
    // Check if a chat with the same ID already exists before adding
    setChats(prev => {
      const existingChat = prev.find(chat => chat.id === newChat.id);
      if (existingChat) {
        // Chat already exists, just select it instead of creating a duplicate
        console.log(`⚠️ Chat ${newChat.id} already exists, selecting existing chat instead of creating duplicate`);
        return prev;
      }
      
      const chatAssistant = prev.find(chat => chat.id === -1); // Find the default ChatGD Assistant
      const otherChats = prev.filter(chat => chat.id !== -1); // All chats except default ChatGD Assistant
      
      if (chatAssistant) {
        // ChatGD Assistant exists, add new chat after it
        return [chatAssistant, newChat, ...otherChats];
      } else {
        // No ChatGD Assistant found, add new chat at beginning
        return [newChat, ...prev];
      }
    });
    setSelectedChat(newChat);
    setMessages([]);
    loadedChatIdRef.current = null; // Reset loaded chat ID so loadMessages will load for new chat
    
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
          // Backend will create chat history when first message is sent
          // Use temporary placeholder ID (-2) to distinguish from default assistant (-1)
          newChat = {
            id: -2,
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
          // Backend will create chat history when first message is sent
          // Use temporary placeholder ID (-2) to distinguish from default assistant (-1)
          newChat = {
            id: -2,
            title: `Document: ${truncateFilename(selectedDocument.name)}`,
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
          // Backend will create chat history when first message is sent
          // Use temporary placeholder ID (-2) to distinguish from default assistant (-1)
          newChat = {
            id: -2,
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
        const updatedChats = [newChat, ...prev];
        // Persist chat context immediately for user_direct, workspace, document, and bookmark chats
        savePersistedChatContexts(updatedChats);
        return updatedChats;
      });
      setShowNewChatModal(false);
      setSelectedChat(newChat);
      
      // Reset selections and search states
      setSelectedDocument(null);
      setSelectedWorkspace(null);
      setSelectedUser(null);
      setSelectedBookmark(null);
      setNewChatType('ai_assistant');
      setModalUserSearch('');
      setModalWorkspaceSearch('');
      setModalDocumentSearch('');
      setModalBookmarkSearch('');
      
    } catch (error) {
      Alert.alert('Error', 'Failed to create new chat');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    // Always refresh the chat list when pulling to refresh
    loadChats();
  };

  const onRefreshMessages = async () => {
    if (!selectedChat) return;
    setRefreshing(true);
    try {
      await loadMessages(selectedChat.id, true); // Force reload on manual refresh
    } finally {
      setRefreshing(false);
    }
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
            <View key={`list-${elements.length}`} style={{ marginVertical: 1 }}>
              {currentList.items.map((item, idx) => (
                <View key={idx} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 4, flexShrink: 1 }}>
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
            <View key={`list-${elements.length}`} style={{ marginVertical: 1 }}>
              {currentList.items.map((item, idx) => (
                <View key={idx} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 4, flexShrink: 1 }}>
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
      // Assistant messages: no bubbles for document/bookmark/ai_assistant, bubbles for user/workspace
      const hasContent = item.content && item.content.trim().length > 0;
      
      if (isDocumentOrBookmarkChat) {
        // No bubbles (ChatGPT style). Fake streaming runs IN THIS SAME SLOT (above the time), then preview/refinement replace it.
        return (
          <View style={[
            dynamicStyles.messageContainerNoBubble,
            dynamicStyles.otherMessageNoBubble
          ]}>
            {hasContent
              ? renderMessageContent(item.content, item.is_own_message)
              : (
                  <ProcessingMessageDisplay
                    isProcessing={true}
                    hasRealData={false}
                    processingType="general"
                    onComplete={() => {}}
                  />
                )}
            <Text style={[
              dynamicStyles.messageTimeNoBubble,
              dynamicStyles.otherMessageTimeNoBubble
            ]}>
              {formatMessageTime(item.created_at)}
            </Text>
          </View>
        );
      } else {
        // User/workspace: we never add an empty assistant message, but guard anyway
        if (!hasContent) return null;
        
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
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>ChatGD</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity 
            style={dynamicStyles.newChatButton} 
            onPress={onRefresh}
            disabled={refreshing}
          >
            <Ionicons 
              name="refresh" 
              size={20} 
              color={refreshing ? "#999" : "#007AFF"} 
            />
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.newChatButton} onPress={() => setShowNewChatModal(true)}>
            <Ionicons name="add" size={20} color="#007AFF" />
          </TouchableOpacity>
        </View>
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
            // Go back to chat list, or previous screen if no chat selected
            if (selectedChat) {
              // Re-sort chats when returning from conversation
              setSelectedChat(null);
              // The useEffect watching selectedChat will handle the sorting
            } else {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        
        <View style={dynamicStyles.chatHeaderInfo}>
          <Text style={dynamicStyles.chatTitle}>{selectedChat?.title || 'Chat'}</Text>
          <Text style={dynamicStyles.chatSubtitle}>
            {selectedChat?.type === 'ai_assistant' ? 'ChatGD Assistant' : 
             selectedChat?.type === 'document_focused' ? 'Document Chat' :
             selectedChat?.type === 'bookmark_focused' ? 'Bookmark Chat' :
             selectedChat?.type === 'workspace' ? 'Workspace Chat' :
             selectedChat?.type === 'user_direct' ? 'Direct Message' : 'Chat'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity 
            style={dynamicStyles.searchTypeButton} 
            onPress={onRefreshMessages}
            disabled={refreshing || !selectedChat}
          >
            <Ionicons 
              name="refresh" 
              size={20} 
              color={refreshing || !selectedChat ? "#999" : "#007AFF"} 
            />
          </TouchableOpacity>
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
              data={messages}
              renderItem={renderMessageItem}
              keyExtractor={(item, index) => {
                // Use ID + index to ensure uniqueness even if IDs are duplicated
                // This prevents React key warnings when messages have duplicate IDs
                return `${item.id}-${index}`;
              }}
              style={dynamicStyles.messagesList}
              ListFooterComponent={
                // Typing Indicator for user chats
                selectedChat && (selectedChat.type === 'user_direct' || selectedChat.type === 'workspace') && Object.keys(typingUsers).length > 0 ? (
                  <View style={dynamicStyles.typingIndicator}>
                    <Text style={dynamicStyles.typingText}>
                      {Object.values(typingUsers).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing...
                    </Text>
                  </View>
                ) : null
              }
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
                {selectedMention.type === 'file' ? truncateFilename(selectedMention.name) : selectedMention.name}
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
          <View style={dynamicStyles.mentionDropdownWrapper} pointerEvents="box-none">
            <View style={dynamicStyles.mentionDropdown} pointerEvents="auto">
              {mentionResults.length > 0 ? (
                <FlatList
                  data={mentionResults}
                  keyExtractor={(item, index) => `${item.type}-${item.id}-${index}`}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={dynamicStyles.mentionDropdownItem}
                      onPress={() => selectMention(item)}
                      activeOpacity={0.7}
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
                />
              ) : (
                <View style={dynamicStyles.mentionDropdownEmpty}>
                  <Text style={dynamicStyles.mentionDropdownEmptyText}>
                    {mentionQuery.trim() ? 'No results found' : 'Type to search...'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View 
          ref={inputContainerRef}
          style={dynamicStyles.inputContainer}
          onLayout={(event) => {
            const { y } = event.nativeEvent.layout;
            setInputContainerY(y);
          }}
        >
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
          <TouchableOpacity onPress={() => {
            setShowNewChatModal(false);
            // Reset search states on cancel
            setModalUserSearch('');
            setModalWorkspaceSearch('');
            setModalDocumentSearch('');
            setModalBookmarkSearch('');
          }}>
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
              <Text style={dynamicStyles.optionTitle}>ChatGD Assistant</Text>
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
                  value={modalDocumentSearch}
                  onChangeText={setModalDocumentSearch}
                />
              </View>
              
              <ScrollView style={{ maxHeight: 200, marginTop: 8 }}>
                {modalFilteredDocuments.map((doc) => (
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
                  value={modalWorkspaceSearch}
                  onChangeText={setModalWorkspaceSearch}
                />
              </View>
              
              <View style={{ marginTop: 8 }}>
                {modalFilteredWorkspaces.map((workspace) => (
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
                  value={modalUserSearch}
                  onChangeText={setModalUserSearch}
                />
              </View>
              
              <View style={{ marginTop: 8 }}>
                {modalFilteredUsers.length === 0 ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Ionicons name="people-outline" size={48} color="#ccc" style={{ marginBottom: 8 }} />
                    <Text style={{ color: '#666', fontStyle: 'italic', textAlign: 'center' }}>
                      {users.length === 0 
                        ? 'No workspace users found.\nMake sure you are part of a workspace to message other users.' 
                        : 'No users match your search'}
                    </Text>
                  </View>
                ) : (
                  modalFilteredUsers.map((user) => (
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
                  value={modalBookmarkSearch}
                  onChangeText={setModalBookmarkSearch}
                />
              </View>
              
              <ScrollView style={{ maxHeight: 200, marginTop: 8 }}>
                {modalFilteredBookmarks.map((bookmark) => (
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
      position: 'relative', // Ensure absolute positioned children are relative to this
    },
    messagesList: {
      flex: 1,
    },
    messagesContent: {
      paddingVertical: 2, // Minimal vertical padding
    },
    messageContainer: {
      paddingHorizontal: 16,
      paddingVertical: 1, // Minimal vertical padding
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
      marginVertical: 0, // Minimal vertical margin
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
    fontSize: 16, // WhatsApp standard size
    lineHeight: 24, // 1.5x line height for better readability
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
      marginTop: 1,
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
    mentionDropdownWrapper: {
      position: 'absolute',
      // Position above input container: screen height - input Y position - input height - dropdown height
      // When keyboard is visible, KeyboardAvoidingView moves input up, so we adjust accordingly
      bottom: keyboardHeight > 0 
        ? keyboardHeight + 8 // When keyboard is visible, position above keyboard
        : 60, // When no keyboard, position above input (input is ~52px + padding)
      left: 0,
      right: 0,
      zIndex: 1000,
      elevation: 10, // For Android
      pointerEvents: 'box-none', // Allow touches to pass through wrapper
    },
    mentionDropdown: {
      maxHeight: 200,
      backgroundColor: colors.card || '#fff',
      borderTopWidth: 1,
      borderTopColor: colors.border || '#e0e0e0',
      borderRadius: 8,
      marginHorizontal: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 10, // For Android
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
    typingIndicator: {
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    typingText: {
      fontSize: 13,
      fontStyle: 'italic',
      color: '#666',
    },
  }), [colors, keyboardHeight]);

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
    paddingVertical: 2, // Minimal vertical padding
  },
  messageContainer: {
    paddingHorizontal: 12,
    paddingVertical: 1, // Minimal vertical padding
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
    marginVertical: 0, // Minimal vertical margin
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
    fontSize: 16, // WhatsApp standard size
    lineHeight: 24, // 1.5x line height for better readability
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
    marginTop: 1,
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
});