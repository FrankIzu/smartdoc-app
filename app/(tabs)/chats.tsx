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
    Dimensions,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { RectButton, Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, STORAGE_KEYS } from '../../constants/Config';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService as api } from '../../services/api';
import { errorLogger } from '../../services/errorLogger';
import { useChatStore } from '../../stores/chatStore';
import { removeFileExtension } from '../../utils/fileUtils';
import { secureStorage } from '../../utils/storage';
import { useAuth } from '../context/auth';
import { AnimatedHeaderContainer } from '../components/AnimatedHeaderContainer';
import { ChatMessageFooter } from '../components/ChatMessageFooter';
import ProcessingMessageDisplay from '../components/ProcessingMessageDisplay';
import { TapToToggleHeaderView } from '../components/TapToToggleHeaderView';

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
  /** For user/workspace chats: id of the sender of the last message. Used to show unread badge only for receiver. */
  last_message_sender_id?: number | null;
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
  /** Sender user id (for user/workspace chats). Used at render to determine left/right so alignment is correct even before profile loads. */
  sender_id?: number | null;
  /** When true, message is preview/streaming placeholder - show in grey to indicate not final */
  is_preview?: boolean;
  /** Sources/citations used for this response (assistant messages) */
  citations?: Array<{ source_type?: string; source_name?: string; filename?: string; excerpt?: string; chunk_content?: string; document_id?: number; source_id?: string }> | null;
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
const FAVORITE_CHATS_KEY = '@grabdocs_favorite_chats';

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
      // CRITICAL: Save contexts for chats that have context OR the correct type
      // This ensures chats with bookmark_context but wrong type still get saved
      const hasContext = chat.bookmark_context || chat.document_context || chat.workspace;
      const hasCorrectType = chat.type === 'document_focused' || 
                             chat.type === 'bookmark_focused' || 
                             chat.type === 'user_direct' || 
                             chat.type === 'workspace';
      
      if (hasContext || hasCorrectType) {
        // Determine the correct type based on context if type is wrong
        const correctType = chat.bookmark_context ? 'bookmark_focused' :
                           chat.document_context ? 'document_focused' :
                           chat.workspace ? 'workspace' :
                           chat.type === 'user_direct' ? 'user_direct' :
                           chat.type;
        
        contextsToSave[chat.id] = {
          type: correctType,
          title: chat.title,
          document_context: chat.document_context,
          bookmark_context: chat.bookmark_context,
          participants: chat.participants,
          workspace: chat.workspace
        };
        
        // Log if we're fixing the type
        if (hasContext && !hasCorrectType) {
          console.log(`🔧 Saving chat ${chat.id} with context but fixing type from ${chat.type} to ${correctType}`);
        }
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
  const insets = useSafeAreaInsets();
  const { user: authUser } = useAuth();

  const [chats, setChats] = useState<Chat[]>([DEFAULT_CHAT_ASSISTANT]); // Initialize with ChatGD Assistant
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [isGoingBack, setIsGoingBack] = useState(false); // Track if user is going back to chat list
  const [userProfile, setUserProfile] = useState<any>(null); // User profile for determining is_own_message
  const userProfileRef = useRef<any>(null); // Ref to always have latest userProfile in WebSocket handlers
  // Current user id: auth is available immediately; profile may load later. Used so sent messages always show on the right.
  const currentUserIdRef = useRef<string | number | null>(null);
  currentUserIdRef.current = authUser?.id ?? userProfile?.data?.id ?? userProfile?.id ?? userProfileRef.current?.data?.id ?? userProfileRef.current?.id ?? null;
  const recentlySentMessageIdsRef = useRef<Set<number>>(new Set()); // Track recently sent message IDs to prevent duplicates
  const lastMessageSentTimeRef = useRef<number>(0); // Track when last message was sent to prevent reload
  const lastLoadTimeRef = useRef<number>(0); // Track last load time to prevent excessive reloads
  
  // Streaming state for fake character-by-character animation
  const [streamingMessageIndex, setStreamingMessageIndex] = useState<number | null>(null);
  const streamingMessageIndexRef = useRef<number | null>(null); // Ref to track streaming index immediately
  const streamingIntervalRef = useRef<number | null>(null);
  const contentBufferRef = useRef<string>('');
  const displayedCharsRef = useRef<number>(0);
  const isPreviewPhaseRef = useRef<boolean>(true);
  const isStreamingRef = useRef<boolean>(false);
  const isFakeStreamingRef = useRef<boolean>(false); // Track if we're in fake streaming mode
  const isStreamCompleteRef = useRef<boolean>(false); // Track if stream is complete (no more chunks will arrive)
  const citationsFromStreamRef = useRef<ChatMessage['citations']>(null); // Citations from stream complete event
  const lastStreamedMessageIndexRef = useRef<number | null>(null); // Track which message index was last streamed
  const lastStreamCompleteTimeRef = useRef<number>(0); // Track when streaming last completed
  
  // Message ID counter to ensure uniqueness
  const messageIdCounterRef = useRef<number>(0);
  const currentChatIdRef = useRef<number | null>(null); // Track current chat ID to handle chat_history_id updates
  const loadedChatIdRef = useRef<number | null>(null); // Track which chat's messages are currently loaded to prevent unnecessary reloads
  const selectedChatRef = useRef<Chat | null>(null); // Track selectedChat to preserve it across reloads
  const fileIdContextProcessedRef = useRef<Set<number>>(new Set()); // Track processed fileIds to prevent duplicate context setup
  const isSettingUpFileContextRef = useRef<boolean>(false); // Track if we're currently setting up file context to prevent unnecessary reloads
  const fileContextSetupStartTimeRef = useRef<number>(0); // Track when file context setup started
  const workspaceRequestRef = useRef<Promise<any> | null>(null); // Track in-flight workspace request to prevent duplicate calls
  const isPreservingContextRef = useRef<boolean>(false); // Track when we're preserving context to prevent loadChats from overwriting
  const contextPreservationTimeRef = useRef<number>(0); // Track when context was last preserved
  
  // Keep selectedChatRef in sync with selectedChat state
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);
  
  // Keyboard height tracking for mention dropdown positioning
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  /** Keyboard top (screenY) when visible - used to position input just above keyboard */
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const inputContainerRef = useRef<View>(null);
  const [inputContainerY, setInputContainerY] = useState(0);
  
  // Swipeable refs to manage open swipeables in chat list (only one open at a time)
  const chatSwipeableRefs = useRef<Map<number, Swipeable>>(new Map());
  const swipingChatId = useRef<number | null>(null);
  const [menuChatId, setMenuChatId] = useState<number | null>(null);
  const [favoriteChatIds, setFavoriteChatIds] = useState<Set<number>>(new Set());
  
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
  const [usersLoading, setUsersLoading] = useState(false);
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
  
  const messagesRef = useRef<SectionList>(null);

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
      // Allow context to be set immediately even if loading is true
      // This ensures the context shows up instantly when navigating from Files screen
      if (!params.fileId) return;
      const fileIdNum = parseInt(String(params.fileId), 10);
      if (!Number.isFinite(fileIdNum)) {
        console.warn('⚠️ [CHATS] Invalid fileId param:', params.fileId);
        return;
      }
      
      // Prevent duplicate processing of the same fileId
      if (fileIdContextProcessedRef.current.has(fileIdNum)) {
        return;
      }
      
      // CRITICAL: Set flag to prevent useFocusEffect from reloading everything
      // This prevents all the API calls from happening when user just added a file context
      isSettingUpFileContextRef.current = true;
      fileContextSetupStartTimeRef.current = Date.now();
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

        // OPTIMIZATION: Create document context immediately with available data (fileName from params)
        // This allows the context to show instantly while API call enriches it in the background
        const displayName = fileNameFromParams || 'Document';
        const initialDocumentContext: Document = {
          id: fileIdNum,
          name: displayName,
          type: 'other', // Will be updated when API call completes
        };
        
        // Create a document-focused chat immediately
        const documentChat: Chat = {
          id: -2,
          title: `Document: ${truncateFilename(displayName)}`,
          type: 'document_focused',
          participants: [{ id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' }],
          last_message: `Ready to answer questions about ${displayName}`,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          unread_count: 0,
          document_context: initialDocumentContext
        };
        
        // Add the chat to the list and select it immediately
        setChats(prev => {
          const chatAssistant = prev.find(chat => chat.id === -1);
          const otherChats = prev.filter(chat => chat.id !== -1);
          
          let updatedChats: Chat[];
          if (chatAssistant) {
            updatedChats = [chatAssistant, documentChat, ...otherChats];
          } else {
            updatedChats = [documentChat, ...prev];
          }
          
          // Persist document context immediately
          savePersistedChatContexts(updatedChats);
          return updatedChats;
        });
        
        setSelectedChat(documentChat);
        
        // Reset going back flag when setting up new chat from fileId
        setIsGoingBack(false);
        
        // Mark this fileId as processed BEFORE setting context to prevent duplicate processing
        fileIdContextProcessedRef.current.add(fileIdNum);
        
        // Set the document as the selected mention IMMEDIATELY - this shows the context right away
        // Set this synchronously in the same render cycle for instant display
        setSelectedMention({
          id: fileIdNum,
          type: 'file',
          name: displayName,
          data: initialDocumentContext
        });
        
        // Don't show welcome message - just show empty chat
        setMessages([]);
        loadedChatIdRef.current = documentChat.id;
        
        // Clear the params to prevent re-triggering (but context is already set)
        router.setParams({});
        
        // Reset the flag after a short delay to allow context setup to complete
        // This prevents useFocusEffect from interfering during setup
        setTimeout(() => {
          isSettingUpFileContextRef.current = false;
        }, 1000);
        
        // Now fetch document details in the background to enrich the context (file_type, category, size)
        // This happens asynchronously and updates the context when complete
        api.getFileById(fileIdNum, Number.isFinite(workspaceIdNum) ? workspaceIdNum : undefined).then((response: any) => {
          if (response.success && response.file) {
            const documentData = response.file;
            // Prefer name from Files screen (params), then API, then fallback
            const enrichedName = fileNameFromParams || documentData.original_filename || documentData.filename || displayName;
            const enrichedDocumentContext: Document = {
              id: documentData.id,
              name: enrichedName,
              type: documentData.file_type || 'other',
              category: documentData.file_kind || documentData.category,
              size: documentData.file_size ? `${(documentData.file_size / 1024 / 1024).toFixed(2)} MB` : undefined,
            };
            
            // Update the chat with enriched context
            setChats(prev => prev.map(chat => 
              chat.id === documentChat.id && chat.document_context
                ? { 
                    ...chat, 
                    document_context: enrichedDocumentContext,
                    title: `Document: ${truncateFilename(enrichedName)}`,
                    last_message: `Ready to answer questions about ${enrichedName}`
                  }
                : chat
            ));
            
            // Update selected mention with enriched data
            setSelectedMention({
              id: enrichedDocumentContext.id,
              type: 'file',
              name: enrichedDocumentContext.name,
              data: enrichedDocumentContext
            });
            
            // Update persisted contexts
            setChats(prev => {
              savePersistedChatContexts(prev);
              return prev;
            });
          }
        }).catch((error: any) => {
          // If API call fails, we already have the context set with fileName, so just log the error
          const errorMessage = error?.message || error?.response?.data?.message || error?.toString() || 'Unknown error';
          const statusCode = error?.response?.status;
          console.warn(`⚠️ [CHATS] Could not enrich document details for fileId ${fileIdNum}${statusCode ? ` (HTTP ${statusCode})` : ''}:`, errorMessage);
          // Context is already set with fileName, so no fallback needed
        });
        
        return; // Exit early since we've handled the immediate setup
      } catch (error: any) {
        // This catch block handles any synchronous errors
        const errorMessage = error?.message || error?.response?.data?.message || error?.toString() || 'Unknown error';
        const statusCode = error?.response?.status;
        console.warn(`⚠️ [CHATS] Error setting up document chat for fileId ${fileIdNum}${statusCode ? ` (HTTP ${statusCode})` : ''}:`, errorMessage);
        
        // Fallback: create chat with minimal context
        const fallbackName = fileNameFromParams || 'Document';
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
          const chatAssistant = prev.find(chat => chat.id === -1);
          const otherChats = prev.filter(chat => chat.id !== -1);
          
          if (chatAssistant) {
            return [chatAssistant, fallbackChat, ...otherChats];
          } else {
            return [fallbackChat, ...prev];
          }
        });
        setSelectedChat(fallbackChat);
        
        // Mark this fileId as processed
        fileIdContextProcessedRef.current.add(fileIdNum);
        
        setSelectedMention({
          id: fileIdNum,
          type: 'file',
          name: fallbackName,
          data: { id: fileIdNum, name: fallbackName, type: 'other' }
        });
        
        setMessages([]);
        loadedChatIdRef.current = fallbackChat.id;
        
        router.setParams({});
        
        // Reset the flag after a short delay
        setTimeout(() => {
          isSettingUpFileContextRef.current = false;
        }, 1000);
        
        return;
      }
    };

    handleFileIdContext();
    // Removed 'loading' from dependencies to allow immediate context setup
    // Context should show instantly when fileId params are available
  }, [params.fileId, params.fileName, params.workspaceId]);

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
    console.log('🛑 Stopping message processing...');
    
    // Abort the HTTP request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Stop streaming if active
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }
    
    // Reset streaming state
    isStreamingRef.current = false;
    isFakeStreamingRef.current = false;
    isStreamCompleteRef.current = false;
    contentBufferRef.current = '';
    displayedCharsRef.current = 0;
    
    // Remove any incomplete assistant message
    if (streamingMessageIndex !== null) {
      setMessages(prev => {
        const newMessages = [...prev];
        const assistantMsg = newMessages[streamingMessageIndex];
        // Only remove if it's empty or very short (incomplete)
        if (assistantMsg && (!assistantMsg.content || assistantMsg.content.trim().length < 10)) {
          newMessages.splice(streamingMessageIndex, 1);
        }
        return newMessages;
      });
      streamingMessageIndexRef.current = null; // Clear ref immediately
      setStreamingMessageIndex(null); // Clear streaming message index to stop ProcessingMessageDisplay
    }
    
    // CRITICAL: Reset sendingMessage state AFTER clearing streamingMessageIndex
    // This ensures ProcessingMessageDisplay receives isProcessing={false} and stops
    setSendingMessage(false);
    stopBounceAnimation();
    
    console.log('✅ Message processing stopped - fake streaming should now be inactive');
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
        // Use state setter with function form to access latest selectedChat and messages
        setSelectedChat(currentChat => {
          if (currentChat && (currentChat.type === 'user_direct' || currentChat.type === 'workspace')) {
            if (data.chat_id === currentChat.id) {
              // Get current userProfile from ref to ensure we have the latest value (not closure-stale)
              // Handle both formats: { id: ... } or { data: { id: ... } }
              const currentUserProfile = userProfileRef.current;
              const userId = currentUserProfile?.data?.id || currentUserProfile?.id;
              const senderId = data.message.sender_id;
              const messageId = data.message.id;
              
              // Check if this is our own message
              const isOwnMessage = !!(userId && senderId && 
                (senderId === userId || 
                 String(senderId) === String(userId)));
              
              console.log('📨 [CHATS] Message ownership check:', {
                senderId: senderId,
                userId: userId,
                userProfile: currentUserProfile,
                isOwnMessage: isOwnMessage,
                messageId: messageId
              });
              
              // Check for duplicates BEFORE processing - use setMessages to access current messages
              setMessages(prev => {
                // First check: Is this a recently sent message ID?
                if (recentlySentMessageIdsRef.current.has(messageId)) {
                  console.log('⏭️ [CHATS] Duplicate detected - recently sent message ID, skipping:', messageId);
                  return prev;
                }
                
                // Second check: exact ID match in current messages
                const existingById = prev.find(msg => msg.id === messageId);
                if (existingById) {
                  console.log('⏭️ [CHATS] Duplicate detected by ID, skipping:', messageId);
                  // Add to recently sent set to prevent future duplicates
                  recentlySentMessageIdsRef.current.add(messageId);
                  setTimeout(() => {
                    recentlySentMessageIdsRef.current.delete(messageId);
                  }, 10000);
                  return prev;
                }
                
                // Third check: content + timestamp - catches optimistic updates
                // Use larger time window (30 seconds) to account for timezone differences (EST vs UTC)
                const duplicateByContent = prev.find(msg => {
                  if (msg.content !== data.message.content) {
                    return false;
                  }
                  // Check if it's our own message (either flag is true or in recently sent set)
                  const isOwnMessage = msg.is_own_message === true || recentlySentMessageIdsRef.current.has(msg.id);
                  if (!isOwnMessage) {
                    return false;
                  }
                  // Normalize timestamps - ensure UTC parsing by appending Z if missing
                  const msgTimeStr = msg.created_at + (msg.created_at.includes('T') && !msg.created_at.match(/[Z+-]/) ? 'Z' : '');
                  const newMsgTimeStr = data.message.created_at + (data.message.created_at.includes('T') && !data.message.created_at.match(/[Z+-]/) ? 'Z' : '');
                  const msgTime = new Date(msgTimeStr).getTime();
                  const newMsgTime = new Date(newMsgTimeStr).getTime();
                  const timeDiff = Math.abs(msgTime - newMsgTime);
                  // Use 30 second window to account for EST/UTC differences and network delays
                  return timeDiff < 30000;
                });
                
                if (duplicateByContent) {
                  const msgTimeStr = duplicateByContent.created_at + (duplicateByContent.created_at.includes('T') && !duplicateByContent.created_at.match(/[Z+-]/) ? 'Z' : '');
                  const newMsgTimeStr = data.message.created_at + (data.message.created_at.includes('T') && !data.message.created_at.match(/[Z+-]/) ? 'Z' : '');
                  const timeDiff = Math.abs(new Date(msgTimeStr).getTime() - new Date(newMsgTimeStr).getTime());
                  console.log('⏭️ [CHATS] Duplicate detected by content+time, skipping:', messageId, 'existing:', duplicateByContent.id, 'timeDiff:', timeDiff, 'ms');
                  // Add to recently sent set to prevent future duplicates
                  recentlySentMessageIdsRef.current.add(messageId);
                  setTimeout(() => {
                    recentlySentMessageIdsRef.current.delete(messageId);
                  }, 10000);
                  return prev;
                }
                
                // Fourth check: If this is our own message, it was already added optimistically - skip it
                if (isOwnMessage) {
                  console.log('⏭️ [CHATS] Skipping own message from WebSocket (already added optimistically):', messageId);
                  // Also add to recently sent set to prevent future duplicates
                  recentlySentMessageIdsRef.current.add(messageId);
                  setTimeout(() => {
                    recentlySentMessageIdsRef.current.delete(messageId);
                  }, 10000);
                  return prev;
                }
                
                // This is a new received message - add it
                const newMsg: ChatMessage = {
                  id: messageId,
                  content: data.message.content,
                  sender: data.message.sender,
                  is_own_message: false, // This is a received message, not our own
                  created_at: data.message.created_at,
                };
                
                console.log('✅ [CHATS] Adding new received message from WebSocket:', newMsg.id);
                
                // Update chat list when adding new message
                setChats(prevChats => prevChats.map(chat => 
                  chat.id === data.chat_id 
                    ? { ...chat, last_message: data.message.content.substring(0, 50), updated_at: data.message.created_at }
                    : chat
                ));
                
                return [...prev, newMsg];
              });
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
            const userId = userProfileRef.current?.data?.id || userProfileRef.current?.id;
            if (data.chat_id === currentChat.id && data.user_id !== userId) {
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

      // Track keyboard for mention dropdown and so input sits just above keyboard
      useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const keyboardWillShowListener = Keyboard.addListener(showEvent, (e) => {
          setKeyboardHeight(e.endCoordinates.height);
          setKeyboardTop(e.endCoordinates.screenY);
        });
        const keyboardWillHideListener = Keyboard.addListener(hideEvent, () => {
          setKeyboardHeight(0);
          setKeyboardTop(null);
        });

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
        } else if (selectedChat) {
          console.log('⚠️ [CHATS] Cannot join chat room:', {
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

  // Reload users when direct chat modal opens
  useEffect(() => {
    if (showNewChatModal && newChatType === 'user_direct') {
      console.log('🔄 Direct chat modal opened - reloading users...', {
        currentUsersCount: users.length,
        modalUserSearch: modalUserSearch
      });
      loadUsers().catch(error => {
        console.error('❌ Failed to reload users for direct chat:', error);
      });
    }
  }, [showNewChatModal, newChatType]);

  // Refresh chat list when screen comes into focus
  // Add debounce to prevent excessive reloads when quickly switching screens
  const RELOAD_DEBOUNCE_MS = 1000; // Don't reload if less than 1 second since last load (reduced for better responsiveness)
  
  useFocusEffect(
    React.useCallback(() => {
      // CRITICAL: Skip reload if we're currently setting up file context
      // This prevents all the API calls from happening when user just added a file context
      // BUT: Only skip if it's been less than 2 seconds since we started setting up
      // This ensures that if user navigates away and back, it will refresh
      if (isSettingUpFileContextRef.current) {
        const timeSinceSetup = Date.now() - fileContextSetupStartTimeRef.current;
        if (timeSinceSetup < 2000) {
          console.log('⏭️ Skipping reload - file context is being set up (recent,', timeSinceSetup, 'ms ago)');
          return;
        } else {
          // Setup took too long, allow refresh
          console.log('🔄 Allowing reload - file context setup took longer than expected (', timeSinceSetup, 'ms)');
          isSettingUpFileContextRef.current = false;
        }
      }
      
      // CRITICAL: Skip reload if we're currently preserving context (going back from chat)
      // This prevents loadChats from overwriting context that was just saved
      if (isPreservingContextRef.current) {
        const timeSincePreservation = Date.now() - contextPreservationTimeRef.current;
        if (timeSincePreservation < 2000) {
          console.log('⏭️ Skipping reload - context is being preserved (recent,', timeSincePreservation, 'ms ago)');
          return;
        } else {
          // Preservation took longer than expected, allow reload
          console.log('🔄 Allowing reload - context preservation took longer than expected');
          isPreservingContextRef.current = false;
        }
      }
      
      // Debounce reloads to prevent excessive API calls when quickly switching screens
      // BUT: If it's been more than 5 seconds since last load, user likely navigated away and back
      // In that case, skip debounce and always refresh to get latest data
      // NOTE: This does NOT refresh every 5 seconds - it only checks when screen comes into focus
      const now = Date.now();
      const timeSinceLastLoad = now - lastLoadTimeRef.current;
      const shouldSkipDebounce = timeSinceLastLoad > 5000; // Skip debounce if more than 5 seconds (user navigated away)
      
      // Only apply debounce if it's been less than 5 seconds (user is quickly switching screens)
      if (!shouldSkipDebounce && timeSinceLastLoad < RELOAD_DEBOUNCE_MS) {
        console.log('⏭️ Skipping reload - too soon since last load (debounce active)');
        return;
      }
      
      if (shouldSkipDebounce) {
        console.log('🔄 Refreshing - user navigated back after', Math.round(timeSinceLastLoad / 1000), 'seconds');
      } else {
        console.log('🔄 Refreshing - screen came into focus');
      }
      
      lastLoadTimeRef.current = now;
      
      // Load user profile first (needed for determining is_own_message)
      const loadUserProfile = async () => {
        try {
          const response = await api.getUserProfile();
          if (response) {
            setUserProfile(response);
            userProfileRef.current = response; // Update ref as well
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
      
      // Load favorites from storage
      const loadFavorites = async () => {
        try {
          const stored = await AsyncStorage.getItem(FAVORITE_CHATS_KEY);
          if (stored) {
            const favoriteIds = JSON.parse(stored);
            setFavoriteChatIds(new Set(favoriteIds));
          }
        } catch (error) {
          console.error('Failed to load favorites:', error);
        }
      };
      
      // Initialize socket and load chats in parallel (user profile can load separately)
      initializeSocket();
      
      // Always reload chats when screen comes into focus to get latest data
      // Also reload workspaces, documents, users, and bookmarks to ensure all data is fresh
      console.log('🔄 Refreshing ChatGD screen - loading latest data...');
      Promise.all([
        loadUserProfile(),
        loadChats(),
        loadFavorites(),
        loadWorkspaces(),
        loadDocuments(),
        loadUsers(),
        loadBookmarks()
      ]).then(() => {
        console.log('✅ ChatGD screen refresh complete - all data loaded');
        // After chats are loaded, if there's a selected chat, reload its messages to get latest updates
        // BUT: Don't reload if a message was just sent (within last 3 seconds) to prevent duplicates
        // ALSO: Don't reload if we're setting up file context (temporary chat with id -2)
        const timeSinceLastMessage = Date.now() - lastMessageSentTimeRef.current;
        const shouldSkipReload = timeSinceLastMessage < 3000; // Skip if message sent within last 3 seconds
        
        const currentSelectedChat = selectedChatRef.current;
        // Skip auto-reload for temporary chats (id -2) created when adding file context
        const isTemporaryChat = currentSelectedChat && (currentSelectedChat.id === -2 || currentSelectedChat.id === -1);
        
        if (currentSelectedChat && currentSelectedChat.id && currentSelectedChat.id !== -1 && !isTemporaryChat) {
          if (shouldSkipReload) {
            console.log('⏭️ Skipping auto-reload - message was just sent (within 3 seconds)');
          } else {
            console.log('🔄 Auto-reloading messages for selected chat:', currentSelectedChat.id);
            loadMessages(currentSelectedChat.id, true).then(() => {
              // CRITICAL: Restore context after reloading messages to ensure it persists permanently
              // Find the updated chat from the chats list to get latest context
              setChats(prevChats => {
                const updatedChat = prevChats.find(c => c.id === currentSelectedChat.id);
                if (updatedChat) {
                  // Restore context using the helper function
                  restoreChatContext(updatedChat);
                } else {
                  // If chat not found in updated list, use current selected chat
                  restoreChatContext(currentSelectedChat);
                }
                return prevChats;
              });
            });
          }
        } else if (isTemporaryChat) {
          console.log('⏭️ Skipping auto-reload - temporary chat (file context being set up)');
        }
      }).catch(error => {
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
  
  // Re-sort chats when favorites change
  useEffect(() => {
    setChats(prev => {
      const sorted = sortChatsByLastMessage(prev);
      // Also update filteredChats if not searching
      if (!searchQuery.trim()) {
        setFilteredChats(sorted);
      }
      return sorted;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteChatIds.size]);

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
    if (!modalUserSearch.trim()) {
      return users;
    }
    
    const query = modalUserSearch.toLowerCase();
    const filtered = users.filter(user => 
      user.username.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
    
    return filtered;
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

  /** Section label for date grouping in conversation: Today, Yesterday, or "Monday, 10 Feb" (with year if different). */
  const getDateSectionLabel = (timestamp: number): string => {
    const d = new Date(timestamp);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (dayStart >= todayStart) return 'Today';
    if (dayStart >= yesterdayStart) return 'Yesterday';
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const dayMonth = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    if (d.getFullYear() !== now.getFullYear()) {
      return `${dayName}, ${dayMonth} ${d.getFullYear()}`;
    }
    return `${dayName}, ${dayMonth}`;
  };

  /** Messages grouped by date for conversation (oldest first: Monday, ..., Yesterday, Today). */
  const messageSections = useMemo(() => {
    const list = messages || [];
    const byLabel = new Map<string, ChatMessage[]>();
    for (const msg of list) {
      const ts = new Date(msg.created_at || 0).getTime();
      const label = getDateSectionLabel(ts);
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label)!.push(msg);
    }
    const sections: { title: string; data: ChatMessage[] }[] = [];
    const restLabels = Array.from(byLabel.keys()).filter(l => l !== 'Today' && l !== 'Yesterday');
    restLabels.sort((a, b) => {
      const dataA = byLabel.get(a)!;
      const dataB = byLabel.get(b)!;
      const maxTsA = Math.max(...dataA.map(m => new Date(m.created_at).getTime()));
      const maxTsB = Math.max(...dataB.map(m => new Date(m.created_at).getTime()));
      return maxTsA - maxTsB; // oldest first
    });
    restLabels.forEach(title => sections.push({ title, data: byLabel.get(title)! }));
    if (byLabel.has('Yesterday')) sections.push({ title: 'Yesterday', data: byLabel.get('Yesterday')! });
    if (byLabel.has('Today')) sections.push({ title: 'Today', data: byLabel.get('Today')! });
    return sections;
  }, [messages]);

  // Sort chat list: ChatGD Assistant (id === -1) always first; favorites right after; then all others by last activity (most recent first).
  const sortChatsByLastMessage = (chatsToSort: Chat[]): Chat[] => {
    const validChats = chatsToSort.filter(chat => chat && typeof chat === 'object');
    const chatAssistant = validChats.find(chat => chat.id === -1);
    const otherChats = validChats.filter(chat => chat.id !== -1);
    
    // Separate favorites and non-favorites
    const favoriteChats = otherChats.filter(chat => favoriteChatIds.has(chat.id));
    const nonFavoriteChats = otherChats.filter(chat => !favoriteChatIds.has(chat.id));
    
    // Sort favorites by last message timestamp
    const sortedFavorites = [...favoriteChats].sort((a, b) => getLastMessageTimestamp(b) - getLastMessageTimestamp(a));
    // Sort non-favorites by last message timestamp
    const sortedNonFavorites = [...nonFavoriteChats].sort((a, b) => getLastMessageTimestamp(b) - getLastMessageTimestamp(a));
    
    // Combine: ChatGD Assistant first, then favorites, then others
    const result: Chat[] = [];
    if (chatAssistant) {
      result.push(chatAssistant);
    } else {
      result.push(DEFAULT_CHAT_ASSISTANT);
    }
    result.push(...sortedFavorites);
    result.push(...sortedNonFavorites);
    
    return result;
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
            last_message_sender_id: chat.latest_message?.sender?.id ?? chat.latest_message?.sender_id ?? null,
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
                      const bookmarkId = contextBookmarkIds[0];
                      // Try to find bookmark in loaded bookmarks list first
                      const bookmarkInList = bookmarks.find(b => b.id === bookmarkId);
                      if (bookmarkInList) {
                        return bookmarkInList;
                      }
                      // Fallback to basic bookmark object
                      return {
                        id: bookmarkId,
                        name: historyData.selected_bookmark_names?.[0] || historyData.selected_bookmark_name || String(history.title || 'Bookmark'),
                        description: '',
                        file_count: 0,
                        documents: []
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
      
      // CRITICAL: Include temporary chats (id -2) from current chats list that have context
      // These are newly created bookmark/document chats that haven't been saved to backend yet
      const currentChatsWithContext = chats.filter(chat => 
        chat.id === -2 && (chat.bookmark_context || chat.document_context || chat.workspace)
      );
      if (currentChatsWithContext.length > 0) {
        console.log(`📋 Including ${currentChatsWithContext.length} temporary chats with context in load`);
        allChatsCombined.push(...currentChatsWithContext);
      }
      
      // CRITICAL: Preserve document_focused type and document_context from existing local state
      // This prevents losing document chat status when backend doesn't return full context
      // Build map from: 1) Persisted AsyncStorage contexts, 2) Current in-memory state
      const existingChatsMap = new Map<number, Chat>();
      
      // First, add persisted contexts from AsyncStorage (survives app restart)
      persistedContexts.forEach((context: any, chatId: number) => {
        // CRITICAL: Load ALL persisted contexts, even if type isn't set correctly
        // The type might be wrong but context exists
        if (context.type === 'document_focused' || 
            context.type === 'bookmark_focused' || 
            context.type === 'user_direct' || 
            context.type === 'workspace' ||
            context.bookmark_context ||
            context.document_context ||
            context.workspace) {
          // Determine correct type based on context
          const correctType = context.bookmark_context ? 'bookmark_focused' :
                             context.document_context ? 'document_focused' :
                             context.workspace ? 'workspace' :
                             context.type === 'user_direct' ? 'user_direct' :
                             (context.type as any);
          
          // Create a minimal Chat object from persisted context
          existingChatsMap.set(chatId, {
            id: chatId,
            title: context.title,
            type: correctType,
            participants: context.participants || [],
            last_message: '',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            document_context: context.document_context,
            bookmark_context: context.bookmark_context,
            workspace: context.workspace
          });
          
          console.log(`📖 Loaded persisted context for chat ${chatId}:`, {
            type: correctType,
            hasBookmark: !!context.bookmark_context,
            hasDocument: !!context.document_context,
            title: context.title
          });
        }
      });
      
      // Then, add/overwrite with current in-memory state (most recent)
      // CRITICAL: Include temporary chats (id -2) with context so they appear in the list
      // ALSO: Include ANY chat that has context, even if type isn't set correctly yet
      chats.forEach(chat => {
        if (chat.type === 'document_focused' || 
            chat.type === 'bookmark_focused' || 
            chat.type === 'user_direct' || 
            chat.type === 'workspace') {
          existingChatsMap.set(chat.id, chat);
        } else if (chat.id === -2 && (chat.bookmark_context || chat.document_context || chat.workspace)) {
          // Include temporary chats with context (they'll get real IDs when backend responds)
          existingChatsMap.set(chat.id, chat);
        } else if (chat.bookmark_context || chat.document_context || chat.workspace) {
          // CRITICAL: Include chats that have context even if type isn't set correctly
          // This catches cases where context exists but type was lost
          const chatWithCorrectType: Chat = {
            ...chat,
            type: (chat.bookmark_context ? 'bookmark_focused' :
                  chat.document_context ? 'document_focused' :
                  chat.workspace ? 'workspace' :
                  chat.type) as 'ai_assistant' | 'user_direct' | 'workspace' | 'document_focused' | 'bookmark_focused'
          };
          existingChatsMap.set(chat.id, chatWithCorrectType);
          console.log(`🔧 Found chat ${chat.id} with context but wrong type, fixing:`, {
            oldType: chat.type,
            newType: chatWithCorrectType.type,
            hasBookmark: !!chat.bookmark_context,
            bookmarkName: chat.bookmark_context?.name,
            hasDocument: !!chat.document_context
          });
        }
      });
      
      // CRITICAL: Also check AsyncStorage for any chats that might have been saved with real IDs
      // This handles the case where chat ID changed from -2 to real ID but we're loading before the transfer completed
      persistedContexts.forEach((context: any, chatId: number) => {
        // If we have a persisted context but the chat isn't in existingChatsMap yet, add it
        // This ensures we don't lose context when chat ID changes
        if (!existingChatsMap.has(chatId) && (context.bookmark_context || context.document_context || context.workspace)) {
          const correctType = context.bookmark_context ? 'bookmark_focused' :
                             context.document_context ? 'document_focused' :
                             context.workspace ? 'workspace' :
                             (context.type as any);
          
          existingChatsMap.set(chatId, {
            id: chatId,
            title: context.title,
            type: correctType,
            participants: context.participants || [],
            last_message: '',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            document_context: context.document_context,
            bookmark_context: context.bookmark_context,
            workspace: context.workspace
          });
          
          console.log(`📖 [LOAD] Found persisted context for chat ${chatId} not in current state:`, {
            type: correctType,
            hasBookmark: !!context.bookmark_context,
            bookmarkName: context.bookmark_context?.name
          });
        }
      });
      
      // CRITICAL: Build a map of bookmark contexts by bookmark ID to help match chats
      // This allows us to match chats even if the chat ID changed
      const bookmarkContextMap = new Map<number, { chatId: number; context: any }>();
      persistedContexts.forEach((context: any, chatId: number) => {
        if (context.bookmark_context?.id) {
          bookmarkContextMap.set(context.bookmark_context.id, { chatId, context });
        }
      });
      chats.forEach(chat => {
        if (chat.bookmark_context?.id && !bookmarkContextMap.has(chat.bookmark_context.id)) {
          bookmarkContextMap.set(chat.bookmark_context.id, { chatId: chat.id, context: { bookmark_context: chat.bookmark_context } });
        }
      });
      console.log('🔒 Preserving', existingChatsMap.size, 'chat contexts (document/bookmark/user/workspace) from persisted + in-memory');
      console.log('🔍 Bookmark context map has', bookmarkContextMap.size, 'entries');
      
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
              title: localChat.title || chat.title, // Prefer local title, fallback to backend
              document_context: localChat.document_context || chat.document_context,
              bookmark_context: localChat.bookmark_context || chat.bookmark_context,
              participants: localChat.participants || chat.participants,
              workspace: localChat.workspace || chat.workspace
            });
          } else {
            // CRITICAL: Always check persisted contexts and current state for EVERY chat
            // This ensures we don't lose context even if it's not in existingChatsMap yet
            let persistedContext = persistedContexts.get(chat.id);
            let currentStateChat = chats.find(c => c.id === chat.id);
            
            // CRITICAL: If we didn't find context for this chat ID, try multiple strategies:
            // 1. Check if there's a context saved for ID -2 (temporary ID)
            // 2. Check if backend has bookmark context in persistent_context that we can match
            // IMPORTANT: Exclude Chat Assistant (ID -1) from context matching
            if (!persistedContext && !currentStateChat && chat.id > 0 && chat.id !== -1 && !chat.bookmark_context && !chat.document_context) {
              // Strategy 1: Check for temporary ID -2
              const tempContext = persistedContexts.get(-2);
              if (tempContext && (tempContext.bookmark_context || tempContext.document_context)) {
                console.log(`🔄 [ID MATCH] Chat ${chat.id} might be migrated from chat -2, checking if we should transfer context...`);
                persistedContext = tempContext;
                console.log(`✅ [ID MATCH] Using context from ID -2 for chat ${chat.id}`, {
                  hasBookmark: !!tempContext.bookmark_context,
                  bookmarkName: tempContext.bookmark_context?.name
                });
              } else {
                // Strategy 2: Check if backend has bookmark context in persistent_context
                const historyData = chat as any;
                const backendPersistentContext = historyData.persistent_context || historyData.persistentContext;
                if (backendPersistentContext?.context_bookmark_ids?.length > 0) {
                  const bookmarkId = backendPersistentContext.context_bookmark_ids[0];
                  const matchedContext = bookmarkContextMap.get(bookmarkId);
                  if (matchedContext) {
                    console.log(`🔄 [MATCH] Chat ${chat.id} matches bookmark ${bookmarkId} from chat ${matchedContext.chatId}, transferring context`);
                    persistedContext = matchedContext.context;
                  }
                }
              }
            }
            
            // CRITICAL: Check persisted storage FIRST, then current state, then backend
            // Backend chat might not have context yet, but we saved it locally
            // IMPORTANT: Use || operator so we get the FIRST non-null value (persisted > state > backend)
            // CRITICAL: For Chat Assistant (ID -1), never use context - always clear it
            const bookmarkContext = chat.id === -1 ? undefined : (persistedContext?.bookmark_context || currentStateChat?.bookmark_context || chat.bookmark_context);
            const documentContext = chat.id === -1 ? undefined : (persistedContext?.document_context || currentStateChat?.document_context || chat.document_context);
            const workspaceContext = chat.id === -1 ? undefined : (persistedContext?.workspace || currentStateChat?.workspace || chat.workspace);
            
            const hasBookmarkContext = !!bookmarkContext;
            const hasDocumentContext = !!documentContext;
            const hasWorkspace = !!workspaceContext;
            
            // CRITICAL: If we have context from persisted or state but backend doesn't, log it
            if ((persistedContext?.bookmark_context || currentStateChat?.bookmark_context) && !chat.bookmark_context) {
              console.log(`⚠️ [WARNING] Chat ${chat.id} has bookmark context in storage/state but NOT in backend! Preserving it.`, {
                persistedBookmarkId: persistedContext?.bookmark_context?.id,
                stateBookmarkId: currentStateChat?.bookmark_context?.id,
                bookmarkName: persistedContext?.bookmark_context?.name || currentStateChat?.bookmark_context?.name
              });
            }
            
            // CRITICAL: Exclude Chat Assistant (ID -1) from all context type fixing
            // Chat Assistant should always stay as 'ai_assistant' type
            if (chat.id > 0 && chat.id !== -1) { // Don't process default chat (-1)
              console.log(`📋 Processing chat ${chat.id}:`, {
                backendType: chat.type,
                hasBookmarkContext,
                hasDocumentContext,
                hasPersistedContext: !!persistedContext,
                hasCurrentStateChat: !!currentStateChat,
                persistedBookmarkId: persistedContext?.bookmark_context?.id,
                stateBookmarkId: currentStateChat?.bookmark_context?.id,
                backendBookmarkId: chat.bookmark_context?.id
              });
              
              // CRITICAL: If we have bookmark/document context from ANY source, preserve it and fix the type
              // Priority: persistedContext > currentStateChat > backend chat
              if (hasBookmarkContext) {
                const source = persistedContext?.bookmark_context ? 'persisted' : 
                              currentStateChat?.bookmark_context ? 'state' : 
                              'backend';
                console.log(`🔧 [FIX] Setting chat ${chat.id} to bookmark_focused (context from ${source})`);
                uniqueChatsMap.set(chat.id, {
                  ...chat,
                  type: 'bookmark_focused',
                  bookmark_context: bookmarkContext,
                  title: persistedContext?.title || currentStateChat?.title || chat.title || (bookmarkContext?.name ? `Chat about ${bookmarkContext.name}` : `Bookmark: ${bookmarkContext?.name || 'Collection'}`)
                });
              } else if (hasDocumentContext) {
                const source = persistedContext?.document_context ? 'persisted' : 
                              currentStateChat?.document_context ? 'state' : 
                              'backend';
                console.log(`🔧 [FIX] Setting chat ${chat.id} to document_focused (context from ${source})`);
                uniqueChatsMap.set(chat.id, {
                  ...chat,
                  type: 'document_focused',
                  document_context: documentContext,
                  title: persistedContext?.title || currentStateChat?.title || chat.title || (documentContext?.name ? `Document: ${truncateFilename(documentContext.name)}` : chat.title)
                });
              } else if (hasWorkspace) {
                const source = persistedContext?.workspace ? 'persisted' : 
                              currentStateChat?.workspace ? 'state' : 
                              'backend';
                console.log(`🔧 [FIX] Setting chat ${chat.id} to workspace (context from ${source})`);
                uniqueChatsMap.set(chat.id, {
                  ...chat,
                  type: 'workspace',
                  workspace: workspaceContext,
                  title: persistedContext?.title || currentStateChat?.title || chat.title || (workspaceContext?.name ? workspaceContext.name : chat.title)
                });
              } else if (chat.type === 'ai_assistant' && (chat.document_context || chat.bookmark_context)) {
                // Fallback: If backend says 'ai_assistant' but has context, fix it
                // IMPORTANT: Exclude Chat Assistant (ID -1) - it should always stay ai_assistant
                if (chat.id === -1) {
                  // Chat Assistant should never have context - if it does, clear it
                  console.log(`⚠️ Chat Assistant (ID -1) has context, clearing it to preserve ai_assistant type`);
                  uniqueChatsMap.set(chat.id, {
                    ...chat,
                    document_context: undefined,
                    bookmark_context: undefined,
                    workspace: undefined,
                    type: 'ai_assistant' as const
                  });
                } else if (chat.document_context) {
                  console.log(`🔧 Fixing chat type from ai_assistant to document_focused for chat ${chat.id}`);
                  uniqueChatsMap.set(chat.id, {
                    ...chat,
                    type: 'document_focused',
                    title: chat.title || `Document: ${truncateFilename(chat.document_context.name)}`
                  });
                } else if (chat.bookmark_context) {
                  console.log(`🔧 Fixing chat type from ai_assistant to bookmark_focused for chat ${chat.id}`);
                  uniqueChatsMap.set(chat.id, {
                    ...chat,
                    type: 'bookmark_focused',
                    title: chat.title || `Bookmark: ${chat.bookmark_context.name}`
                  });
                } else {
                  uniqueChatsMap.set(chat.id, chat);
                }
              } else {
                uniqueChatsMap.set(chat.id, chat);
              }
            } else {
              // For Chat Assistant (ID -1) or other special IDs, preserve as-is
              // But ensure Chat Assistant never has context
              if (chat.id === -1 && (chat.bookmark_context || chat.document_context || chat.workspace)) {
                console.log(`⚠️ Chat Assistant (ID -1) has context, clearing it to preserve ai_assistant type`);
                uniqueChatsMap.set(chat.id, {
                  ...chat,
                  document_context: undefined,
                  bookmark_context: undefined,
                  workspace: undefined,
                  type: 'ai_assistant'
                });
              } else {
                uniqueChatsMap.set(chat.id, chat);
              }
            }
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
                title: localChat.title || chat.title,
                document_context: localChat.document_context || chat.document_context,
                bookmark_context: localChat.bookmark_context || chat.bookmark_context,
                participants: localChat.participants || chat.participants,
                workspace: localChat.workspace || chat.workspace
              });
            } else {
              // Check if backend chat type needs fixing
              // IMPORTANT: Exclude Chat Assistant (ID -1) from type fixing
              if (chat.id === -1 && (chat.bookmark_context || chat.document_context || chat.workspace)) {
                // Chat Assistant should never have context - clear it
                console.log(`⚠️ Chat Assistant (ID -1) has context in duplicate handling, clearing it`);
                uniqueChatsMap.set(chat.id, {
                  ...chat,
                  document_context: undefined,
                  bookmark_context: undefined,
                  workspace: undefined,
                  type: 'ai_assistant'
                });
              } else if (chat.type === 'ai_assistant' && chat.document_context && chat.id !== -1) {
                uniqueChatsMap.set(chat.id, {
                  ...chat,
                  type: 'document_focused',
                  title: chat.title || `Document: ${truncateFilename(chat.document_context.name)}`
                });
              } else if (chat.type === 'ai_assistant' && chat.bookmark_context && chat.id !== -1) {
                uniqueChatsMap.set(chat.id, {
                  ...chat,
                  type: 'bookmark_focused',
                  title: chat.title || `Bookmark: ${chat.bookmark_context.name}`
                });
              } else {
                uniqueChatsMap.set(chat.id, chat);
              }
            }
          }
        }
      });
      
      // Sort all chats by last message timestamp (most recent first), but keep ChatGD Assistant at top
      // Use helper function to ensure dates are converted to user's local timezone
      const allChatsArray = Array.from(uniqueChatsMap.values());
      
      // CRITICAL: Ensure temporary chats (id -2) with context are included in the list
      // These are newly created bookmark/document chats that should appear even before backend saves them
      const temporaryChatsWithContext = chats.filter(chat => 
        chat.id === -2 && (chat.bookmark_context || chat.document_context || chat.workspace) &&
        !allChatsArray.find(c => c.id === -2 && 
          ((c.bookmark_context?.id === chat.bookmark_context?.id) ||
           (c.document_context?.id === chat.document_context?.id))
        )
      );
      if (temporaryChatsWithContext.length > 0) {
        console.log(`📋 Adding ${temporaryChatsWithContext.length} temporary chats with context to list`);
        allChatsArray.push(...temporaryChatsWithContext);
      }
      
      const allChats = sortChatsByLastMessage(allChatsArray);
      
      // CRITICAL: Final verification - ensure all chats with context have correct type
      // IMPORTANT: Exclude Chat Assistant (ID -1) from type fixing - it should always be ai_assistant
      const finalChats = allChats.map(chat => {
        // Chat Assistant should never have context - if it does, clear it
        if (chat.id === -1) {
          if (chat.bookmark_context || chat.document_context || chat.workspace) {
            console.log(`⚠️ [FINAL FIX] Chat Assistant (ID -1) has context, clearing it to preserve ai_assistant type`);
            return {
              ...chat,
              document_context: undefined,
              bookmark_context: undefined,
              workspace: undefined,
              type: 'ai_assistant' as const
            };
          }
          return chat;
        }
        
        // If chat has bookmark_context but wrong type, fix it
        if (chat.bookmark_context && chat.type !== 'bookmark_focused') {
          console.log(`🔧 [FINAL FIX] Chat ${chat.id} has bookmark_context but type is ${chat.type}, fixing to bookmark_focused`);
          return {
            ...chat,
            type: 'bookmark_focused' as const
          };
        }
        // If chat has document_context but wrong type, fix it
        if (chat.document_context && chat.type !== 'document_focused') {
          console.log(`🔧 [FINAL FIX] Chat ${chat.id} has document_context but type is ${chat.type}, fixing to document_focused`);
          return {
            ...chat,
            type: 'document_focused' as const
          };
        }
        // If chat has workspace but wrong type, fix it
        if (chat.workspace && chat.type !== 'workspace') {
          console.log(`🔧 [FINAL FIX] Chat ${chat.id} has workspace but type is ${chat.type}, fixing to workspace`);
          return {
            ...chat,
            type: 'workspace' as const
          };
        }
        return chat;
      });
      
      // CRITICAL: Log bookmark chats to verify they're being preserved
      const bookmarkChats = finalChats.filter(c => c.type === 'bookmark_focused' || c.bookmark_context);
      console.log('📱 Loaded chats:', {
        total: finalChats.length,
        aiChats: convertedChats.length,
        userChats: userChats.length,
        bookmarkChats: bookmarkChats.length,
        bookmarkChatIds: bookmarkChats.map(c => ({ id: c.id, type: c.type, hasBookmark: !!c.bookmark_context, bookmarkName: c.bookmark_context?.name })),
        defaultChat: DEFAULT_CHAT_ASSISTANT,
        otherChats: finalChats.length - 1, // Excluding ChatGD Assistant
      });
      
      setChats(finalChats);
      
      // CRITICAL: Persist document/bookmark chat contexts to AsyncStorage
      // This ensures contexts survive app restarts and reloads
      savePersistedChatContexts(finalChats).then(() => {
        console.log('✅ Successfully persisted all chat contexts after loadChats');
      }).catch(error => {
        console.error('❌ Failed to persist chat contexts after loadChats:', error);
      });
      
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
    // Request deduplication: reuse in-flight request if one exists
    if (workspaceRequestRef.current) {
      console.log('🔄 Reusing existing workspace request');
      try {
        const response = await workspaceRequestRef.current;
        if (response && (response as any).success && (response as any).data) {
          const workspacesData = Array.isArray((response as any).data) 
            ? (response as any).data 
            : ((response as any).data.workspaces || []);
          setWorkspaces(workspacesData);
        }
      } catch (error) {
        // Error already handled by original request
      }
      return;
    }

    try {
      // Create request and store in ref for deduplication
      workspaceRequestRef.current = (api as any).getMobileWorkspaces();
      
      const response = await workspaceRequestRef.current;
      
      // Clear ref after request completes
      workspaceRequestRef.current = null;
      
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
      // Clear ref on error
      workspaceRequestRef.current = null;
      
      // Silently handle timeout - this is expected if backend is slow/unavailable
      // Timeout errors are already logged at API level, no need to log again here
      if (error?.message?.includes('timeout') || error?.message?.includes('exceeded')) {
        // Don't log timeout errors - they're handled gracefully
        setWorkspaces([]);
      } else {
        // Only log unexpected errors
        console.warn('⚠️ Failed to load workspaces:', error?.message);
        setWorkspaces([]);
      }
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
      setUsersLoading(true);
      console.log('👥 Loading all users from all workspaces for direct messages and @ mentions...');
      
      // Strategy 1: Try the workspace-users endpoint first (should get all users from all workspaces)
      let usersList: any[] = [];
      let usersLoaded = false;
      
      try {
        // Timeout is now handled in the API method itself (10s)
        const response = await (api as any).getWorkspaceUsers();
        
        const r = response as any;
        console.log('👥 Workspace users API response:', { 
          success: r?.success, 
          hasDataUsers: !!(r?.data?.users),
          usersCount: r?.data?.users?.length ?? r?.users?.length ?? (Array.isArray(r?.data) ? r.data.length : 0) ?? 0
        });
        
        if (response && r.success !== false) {
          // Backend returns { data: { users: [...] } } - handle that structure first
          if (r?.data?.users && Array.isArray(r.data.users)) {
            usersList = r.data.users;
          } else if (r?.users && Array.isArray(r.users)) {
            usersList = r.users;
          } else if (r?.data && Array.isArray(r.data)) {
            usersList = r.data;
          } else if (Array.isArray(response)) {
            usersList = response as any[];
          }
          
          if (usersList.length > 0) {
            usersLoaded = true;
            console.log(`✅ Loaded ${usersList.length} users from workspace-users endpoint`);
          }
        }
      } catch (error: any) {
        console.warn('⚠️ Workspace users endpoint failed:', error?.message);
      }
      
      // Strategy 2: If primary endpoint failed or returned empty, fetch from each workspace
      if (!usersLoaded || usersList.length === 0) {
        console.log('🔄 Fetching users from individual workspaces...');
        
        try {
          // REUSE existing workspaces state instead of calling API again
          // This prevents duplicate API calls and timeouts
          let workspacesData: any[] = [];
          
          if (workspaces.length > 0) {
            // Use existing workspaces from state
            workspacesData = workspaces;
            console.log(`📋 Using ${workspacesData.length} workspaces from state - fetching members from each...`);
          } else {
            // Reuse in-flight workspace request if loadWorkspaces is also loading (avoids duplicate API call)
            console.log('📋 Workspaces not in state, loading from API...');
            const workspacePromise = workspaceRequestRef.current ?? (api as any).getMobileWorkspaces();
            const workspacesResponse = await workspacePromise;

            if (workspacesResponse && (workspacesResponse as any).success && (workspacesResponse as any).data) {
              workspacesData = Array.isArray((workspacesResponse as any).data)
                ? (workspacesResponse as any).data
                : ((workspacesResponse as any).data.workspaces || []);
              console.log(`📋 Found ${workspacesData.length} workspaces from API - fetching members from each...`);
            }
          }
          
          if (workspacesData.length > 0) {
            
            // Fetch members from each workspace in parallel
            const memberPromises = workspacesData.map(async (workspace: any) => {
              try {
                const membersResponse = await Promise.race([
                  (api as any).getWorkspaceMembers(workspace.id),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
                ]);
                
                if (membersResponse && (membersResponse as any).success && (membersResponse as any).data) {
                  const membersData = (membersResponse as any).data.members || (membersResponse as any).data || [];
                  return Array.isArray(membersData) ? membersData : [];
                }
                return [];
              } catch (error: any) {
                console.warn(`⚠️ Failed to load members from workspace ${workspace.id}:`, error?.message);
                return [];
              }
            });
            
            const allMembersArrays = await Promise.all(memberPromises);
            
            // Flatten and deduplicate users by ID
            const allMembers = allMembersArrays.flat();
            const uniqueUsersMap = new Map<number, any>();
            
            allMembers.forEach((member: any) => {
              // Handle different member formats (user object or direct user data)
              const user = member.user || member;
              if (user && user.id) {
                if (!uniqueUsersMap.has(user.id)) {
                  uniqueUsersMap.set(user.id, {
                    id: user.id,
                    username: user.username || user.name || user.email?.split('@')[0] || 'Unknown',
                    email: user.email || '',
                    ...user
                  });
                }
              }
            });
            
            usersList = Array.from(uniqueUsersMap.values());
            console.log(`✅ Loaded ${usersList.length} unique users from ${workspacesData.length} workspaces`);
            usersLoaded = true;
          } else {
            console.log('⚠️ No workspaces available to fetch users from');
          }
        } catch (error: any) {
          console.warn('⚠️ Failed to load users from workspaces:', error?.message);
        }
      }
      
      // Strategy 3: Final fallback - try searchUsersForChat with empty query
      if (!usersLoaded || usersList.length === 0) {
        console.log('🔄 Trying searchUsersForChat as final fallback...');
        try {
          const fallbackResponse = await Promise.race([
            api.searchUsersForChat(''),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
          ]);
          
          const fr = fallbackResponse as any;
          console.log('👥 Fallback search users response:', { 
            success: fr?.success,
            hasUsers: !!(fr?.users || fr?.data?.users),
            usersCount: fr?.users?.length ?? fr?.data?.users?.length ?? (Array.isArray(fr?.data) ? fr.data.length : 0) ?? 0
          });
          
          // Handle different response formats from searchUsersForChat
          // Backend returns { success, users, workspaces } or possibly { success, data: { users } }
          let fallbackUsers: any[] = [];
          if (fr?.users && Array.isArray(fr.users)) {
            fallbackUsers = fr.users;
          } else if (fr?.data?.users && Array.isArray(fr.data.users)) {
            fallbackUsers = fr.data.users;
          } else if (fr?.data && Array.isArray(fr.data)) {
            fallbackUsers = fr.data;
          } else if (Array.isArray(fallbackResponse)) {
            fallbackUsers = fallbackResponse as any[];
          }
          
          if (fallbackUsers.length > 0) {
            usersList = fallbackUsers;
            console.log(`✅ Loaded ${fallbackUsers.length} users from searchUsersForChat fallback`);
            usersLoaded = true;
          }
        } catch (fallbackError: any) {
          console.warn('⚠️ Final fallback also failed:', fallbackError?.message);
        }
      }
      
      // Set the final users list
      if (usersList.length > 0) {
        setUsers(usersList);
        console.log(`✅ Successfully loaded ${usersList.length} total users for direct messaging`);
      } else {
        console.warn('⚠️ No users found - you may not be part of any workspaces yet');
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
    } finally {
      setUsersLoading(false);
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
    // ALSO: Don't reload if we're currently streaming or just finished streaming (preserve streamed content)
    // IMPORTANT: Always reload if messages.length === 0 (user navigated back to conversation)
    // ALSO: Don't reload if a message was just sent (within last 3 seconds) to prevent duplicates
    const timeSinceLastMessage = Date.now() - lastMessageSentTimeRef.current;
    const shouldSkipReloadDueToRecentSend = timeSinceLastMessage < 3000;
    
    const isCurrentlyStreaming = isStreamingRef.current || isStreamCompleteRef.current;
    if (!forceReload && loadedChatIdRef.current === chatId && messages.length > 0) {
      if (isCurrentlyStreaming) {
        console.log(`⏭️ [loadMessages] Skipping reload - currently streaming or just finished streaming for chat ${chatId}`);
        return;
      }
      if (shouldSkipReloadDueToRecentSend) {
        console.log(`⏭️ [loadMessages] Skipping reload - message was just sent (within 3 seconds) for chat ${chatId}`);
        return;
      }
      console.log(`⏭️ [loadMessages] Skipping reload - messages already loaded for chat ${chatId}`);
      return;
    }
    
    // CRITICAL: If messages are empty but we think this chat is loaded, force reload
    // This handles the case when user navigates away and back - messages were cleared but loadedChatIdRef might still match
    // BUT: Don't force reload if a message was just sent (to prevent duplicates)
    if (!forceReload && loadedChatIdRef.current === chatId && messages.length === 0) {
      if (shouldSkipReloadDueToRecentSend) {
        console.log(`⏭️ [loadMessages] Messages empty but message just sent - skipping reload to prevent duplicates`);
        return;
      }
      console.log(`🔄 [loadMessages] Messages empty for chat ${chatId} - forcing reload`);
      forceReload = true;
    }
    
    // If we're streaming and force reload is requested, wait a bit for streaming to complete
    if (forceReload && isCurrentlyStreaming) {
      console.log(`⏳ [loadMessages] Streaming in progress, waiting before reload...`);
      // Wait for streaming to complete (max 5 seconds)
      let waitCount = 0;
      while ((isStreamingRef.current || isStreamCompleteRef.current) && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      console.log(`✅ [loadMessages] Streaming completed, proceeding with reload`);
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
      
      // FIRST: Check the chat type from the local chats array (or selectedChatRef when loaded via context)
      // When opening user/workspace chat via context, the chat may not be in chats yet - use selectedChatRef
      const chat = chats.find(c => c.id === chatId);
      const selectedForId = selectedChatRef.current && Number(selectedChatRef.current.id) === Number(chatId)
        ? selectedChatRef.current
        : null;
      const effectiveChat = chat || selectedForId;
      
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
      // CRITICAL: Use effectiveChat (chat from list OR selectedChatRef) so user/workspace chats loaded via context still load messages
      const isAIChat = chatExistsInStore || 
                       (effectiveChat && (effectiveChat.type === 'ai_assistant' || effectiveChat.type === 'document_focused' || effectiveChat.type === 'bookmark_focused')) ||
                       (!effectiveChat); // If no chat found, assume AI chat (safer default)
      
      console.log(`🔍 [loadMessages] Chat ${chatId} check:`, {
        chatFound: !!chat,
        effectiveChatFromRef: !!selectedForId,
        chatType: effectiveChat?.type,
        chatExistsInStore,
        isAIChat,
        historiesCount: histories?.length || 0,
        historyIds: histories?.slice(0, 10).map(h => h.id) || [],
        willUseUserChatEndpoint: !isAIChat && effectiveChat && (effectiveChat.type === 'user_direct' || effectiveChat.type === 'workspace')
      });
      
      // Only use user-chat endpoint for actual user/workspace chats that are NOT AI chats
      // Use effectiveChat so when opening existing workspace/user chat (including via context), messages load
      if (!isAIChat && effectiveChat && (effectiveChat.type === 'user_direct' || effectiveChat.type === 'workspace')) {
          // Load user chat messages using web endpoint (same as web chat.tsx)
          try {
            const response = await api.getChatMessages(chatId);
            if (response.success && (response as any).messages) {
              // Web chat.tsx returns: { success: true, messages: ChatMessage[] }
              // Use auth user id first (available immediately); fallback to profile so sent messages are always on the right on first open
              const userId = currentUserIdRef.current ?? userProfileRef.current?.data?.id ?? userProfileRef.current?.id;
              const convertedMessages: ChatMessage[] = (response as any).messages.map((msg: any) => {
                const senderId = msg.sender_id != null ? msg.sender_id : null;
                const isOwn = !!(userId != null && senderId != null && (senderId === userId || String(senderId) === String(userId)));
                return {
                  id: msg.id,
                  content: msg.content || '',
                  sender: msg.sender || null,
                  is_own_message: isOwn,
                  sender_id: senderId,
                  created_at: msg.created_at || new Date().toISOString(),
                  document_context: msg.metadata?.attachments?.[0] ? {
                    id: msg.metadata.attachments[0].file_id,
                    name: msg.metadata.attachments[0].name,
                    type: msg.metadata.attachments[0].mimeType || 'other'
                  } : undefined
                };
              });
              
              // Deduplicate messages before setting to prevent duplicate key errors
              const deduplicatedMessages = deduplicateMessages(convertedMessages);
              
              // CRITICAL: If streaming is active or recently completed, DON'T merge - let streaming updates handle the UI
              // BUT: If messages are empty, we MUST load them (user navigated back to conversation)
              const isCurrentlyStreaming = isStreamingRef.current || isStreamCompleteRef.current;
              const recentlyCompleted = Date.now() - lastStreamCompleteTimeRef.current < 10000;
              const messagesAreEmpty = messages.length === 0;
              
              // CRITICAL: When switching chats or force reloading, REPLACE messages (don't merge)
              const isSwitchingChats = loadedChatIdRef.current !== null && loadedChatIdRef.current !== chatId;
              const shouldReplace = forceReload || isSwitchingChats || messagesAreEmpty;
              
              if ((isCurrentlyStreaming || recentlyCompleted) && !messagesAreEmpty && !shouldReplace) {
                console.log(`⏸️ [loadMessages] Streaming active or recently completed - skipping message update to preserve streamed content`);
                loadedChatIdRef.current = chatId;
                return;
              }
              
              // If messages are empty, always load them (user navigated back)
              if (messagesAreEmpty) {
                console.log(`🔄 [loadMessages] Messages empty - loading messages for chat ${chatId} (streaming check bypassed)`);
              }
              
              if (shouldReplace) {
                // Replace messages completely - this is a different chat or force reload
                // BUT: If messages were just sent, merge instead of replace to preserve optimistic updates
                const timeSinceLastMessage = Date.now() - lastMessageSentTimeRef.current;
                const shouldMergeInstead = timeSinceLastMessage < 3000 && messages.length > 0;
                
                if (shouldMergeInstead) {
                  console.log(`🔄 [loadMessages] Merging instead of replacing (message just sent) for chat ${chatId}`);
                  setMessages(prev => {
                    const mergedMessages = [...prev];
                    const existingIds = new Set(prev.map(m => m.id));
                    deduplicatedMessages.forEach(backendMsg => {
                      if (!existingIds.has(backendMsg.id)) {
                        mergedMessages.push(backendMsg);
                      }
                    });
                    return deduplicatedMessages.length > mergedMessages.length ? deduplicatedMessages : mergedMessages;
                  });
                } else {
                  console.log(`🔄 [loadMessages] Replacing messages for chat ${chatId} (forceReload: ${forceReload}, switching: ${isSwitchingChats}, empty: ${messagesAreEmpty})`);
                  setMessages(deduplicatedMessages);
                }
              } else {
                // Same chat, merge messages (for updates while viewing the same chat)
                console.log(`🔄 [loadMessages] Merging messages for chat ${chatId} (same chat, incremental update)`);
                setMessages(prev => {
                  const mergedMessages = [...prev];
                  const existingIds = new Set(prev.map(m => m.id));
                  deduplicatedMessages.forEach(backendMsg => {
                    if (!existingIds.has(backendMsg.id)) {
                      mergedMessages.push(backendMsg);
                    } else {
                      const existingIndex = mergedMessages.findIndex(m => m.id === backendMsg.id);
                      if (existingIndex >= 0) {
                        const existingMsg = mergedMessages[existingIndex];
                        const isRecentlyStreamed = lastStreamedMessageIndexRef.current === existingIndex && 
                                                 Date.now() - lastStreamCompleteTimeRef.current < 10000;
                        const backendIsEmpty = !backendMsg.content || backendMsg.content.trim().length === 0;
                        const existingIsLonger = existingMsg.content.length > backendMsg.content.length;
                        
                        const contentToUse = (isRecentlyStreamed || backendIsEmpty || existingIsLonger)
                          ? existingMsg.content 
                          : backendMsg.content;
                        
                        mergedMessages[existingIndex] = { ...backendMsg, content: contentToUse };
                      }
                    }
                  });
                  mergedMessages.sort((a, b) => {
                    const timeA = new Date(a.created_at).getTime();
                    const timeB = new Date(b.created_at).getTime();
                    return timeA - timeB;
                  });
                  return mergedMessages;
                });
              }
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
                
                // CRITICAL: Verify that fallbackHistory matches the chatId we're loading
                const fallbackHistoryId = fallbackHistory ? (typeof fallbackHistory.id === 'string' ? parseInt(String(fallbackHistory.id), 10) : Number(fallbackHistory.id)) : null;
                const fallbackTargetId = typeof chatId === 'string' ? parseInt(String(chatId), 10) : Number(chatId);
                const fallbackHistoryMatches = fallbackHistoryId !== null && !isNaN(fallbackHistoryId) && !isNaN(fallbackTargetId) && fallbackHistoryId === fallbackTargetId;
                
                if (fallbackHistory && fallbackHistory.messages.length > 0 && fallbackHistoryMatches) {
                  const refs = (fallbackHistory as any).references;
                  const convertedMessages: ChatMessage[] = fallbackHistory.messages.map((msg, index) => {
                    const backendMsg = msg as any;
                    let timestamp = backendMsg.created_at || backendMsg.timestamp;
                    // Use backend message ID if available, otherwise generate unique ID
                    const backendMessageId = backendMsg.message_id || backendMsg.id;
                    const messageId = backendMessageId ? backendMessageId : generateUniqueMessageId();
                    const key = backendMessageId != null ? String(backendMessageId) : null;
                    const citations =
                      backendMsg.role === 'assistant' && key && refs && refs[key]
                        ? (refs[key].citations ?? null)
                        : undefined;
                    return {
                      id: typeof messageId === 'number' ? messageId : generateUniqueMessageId(),
                      content: msg.content || '',
                      sender: msg.role === 'user' ? null : { id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' },
                      is_own_message: msg.role === 'user',
                      created_at: timestamp || new Date().toISOString(),
                      citations: citations ?? undefined,
                    };
                  });
                  // Deduplicate messages before setting to prevent duplicate key errors
                  const deduplicatedMessages = deduplicateMessages(convertedMessages);
                  
                  // CRITICAL: If streaming is active or recently completed, DON'T merge - let streaming updates handle the UI
                  // BUT: If messages are empty, we MUST load them (user navigated back to conversation)
                  const isCurrentlyStreaming = isStreamingRef.current || isStreamCompleteRef.current;
                  const recentlyCompleted = Date.now() - lastStreamCompleteTimeRef.current < 10000;
                  const messagesAreEmpty = messages.length === 0;
                  
                  // CRITICAL: When switching chats or force reloading, REPLACE messages (don't merge)
                  const isSwitchingChats = loadedChatIdRef.current !== null && loadedChatIdRef.current !== chatId;
                  const shouldReplace = forceReload || isSwitchingChats || messagesAreEmpty;
                  
                  if ((isCurrentlyStreaming || recentlyCompleted) && !messagesAreEmpty && !shouldReplace) {
                    console.log(`⏸️ [loadMessages] Streaming active or recently completed - skipping message update to preserve streamed content`);
                    loadedChatIdRef.current = chatId;
                    return;
                  }
                  
                  // If messages are empty, always load them (user navigated back)
                  if (messagesAreEmpty) {
                    console.log(`🔄 [loadMessages] Messages empty - loading messages for chat ${chatId} (streaming check bypassed)`);
                  }
                  
                  if (shouldReplace) {
                    // Replace messages completely - this is a different chat or force reload
                    console.log(`🔄 [loadMessages] Replacing messages for chat ${chatId} (forceReload: ${forceReload}, switching: ${isSwitchingChats}, empty: ${messagesAreEmpty})`);
                    setMessages(deduplicatedMessages);
                  } else {
                    // Same chat, merge messages (for updates while viewing the same chat)
                    console.log(`🔄 [loadMessages] Merging messages for chat ${chatId} (same chat, incremental update)`);
                    setMessages(prev => {
                      const mergedMessages = [...prev];
                      const existingIds = new Set(prev.map(m => m.id));
                      deduplicatedMessages.forEach(backendMsg => {
                        if (!existingIds.has(backendMsg.id)) {
                          mergedMessages.push(backendMsg);
                        } else {
                          const existingIndex = mergedMessages.findIndex(m => m.id === backendMsg.id);
                          if (existingIndex >= 0) {
                            const existingMsg = mergedMessages[existingIndex];
                            const contentToUse = existingMsg.content.length > backendMsg.content.length 
                              ? existingMsg.content 
                              : backendMsg.content;
                            mergedMessages[existingIndex] = { ...backendMsg, content: contentToUse };
                          }
                        }
                      });
                      mergedMessages.sort((a, b) => {
                        const timeA = new Date(a.created_at).getTime();
                        const timeB = new Date(b.created_at).getTime();
                        return timeA - timeB;
                      });
                      return mergedMessages;
                    });
                  }
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
      console.log('📋 Current history from store:', storeHistory, 'for chatId:', chatId);
      
      // CRITICAL: Verify that currentHistory matches the chatId we're loading
      // This prevents showing messages from a different chat
      const historyId = storeHistory ? (typeof storeHistory.id === 'string' ? parseInt(String(storeHistory.id), 10) : Number(storeHistory.id)) : null;
      const targetId = typeof chatId === 'string' ? parseInt(String(chatId), 10) : Number(chatId);
      const historyMatches = historyId !== null && !isNaN(historyId) && !isNaN(targetId) && historyId === targetId;
      
      if (storeHistory && storeHistory.messages.length > 0 && historyMatches) {
        // Convert chat store messages to the expected format; merge references into assistant messages
        const refs = storeHistory.references;
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
          const key = backendMessageId != null ? String(backendMessageId) : null;
          const citations =
            backendMsg.role === 'assistant' && key && refs && refs[key]
              ? (refs[key].citations ?? undefined)
              : undefined;
          
          return {
            id: typeof messageId === 'number' ? messageId : generateUniqueMessageId(),
            content: msg.content || '',
            sender: msg.role === 'user' ? null : { id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' },
            is_own_message: msg.role === 'user',
            created_at: timestamp || new Date().toISOString(),
            citations,
          };
        });
        
        // Deduplicate messages before setting to prevent duplicate key errors
        const deduplicatedMessages = deduplicateMessages(convertedMessages);
        
        // CRITICAL: If streaming is active or recently completed, DON'T merge - let streaming updates handle the UI
        // Only merge if streaming is NOT active to avoid overwriting streamed content
        // BUT: If messages are empty, we MUST load them (user navigated back to conversation)
        const isCurrentlyStreaming = isStreamingRef.current || isStreamCompleteRef.current;
        const recentlyCompleted = Date.now() - lastStreamCompleteTimeRef.current < 10000; // Within 10 seconds of completion
        const messagesAreEmpty = messages.length === 0;
        
        if ((isCurrentlyStreaming || recentlyCompleted) && !messagesAreEmpty) {
          console.log(`⏸️ [loadMessages] Streaming active or recently completed - skipping message update to preserve streamed content`);
          // Don't update messages while streaming or right after - streaming interval will handle updates
          loadedChatIdRef.current = chatId; // Still track that we've loaded this chat
          return;
        }
        
        // If messages are empty, always load them (user navigated back)
        if (messagesAreEmpty) {
          console.log(`🔄 [loadMessages] Messages empty - loading messages for chat ${chatId} (streaming check bypassed)`);
        }
        
        // CRITICAL: When switching chats or force reloading, REPLACE messages (don't merge)
        // This prevents messages from one chat appearing in another
        const isSwitchingChats = loadedChatIdRef.current !== null && loadedChatIdRef.current !== chatId;
        const shouldReplace = forceReload || isSwitchingChats || messages.length === 0;
        
        if (shouldReplace) {
          // Replace messages completely - this is a different chat or force reload
          console.log(`🔄 [loadMessages] Replacing messages for chat ${chatId} (forceReload: ${forceReload}, switching: ${isSwitchingChats}, empty: ${messages.length === 0})`);
          setMessages(deduplicatedMessages);
        } else {
          // Same chat, merge messages (for updates while viewing the same chat)
          console.log(`🔄 [loadMessages] Merging messages for chat ${chatId} (same chat, incremental update)`);
          setMessages(prev => {
            // Merge: keep existing messages, add backend messages that aren't already present
            const mergedMessages = [...prev];
            const existingIds = new Set(prev.map(m => m.id));
            
            // Add backend messages that aren't already in the list
            deduplicatedMessages.forEach(backendMsg => {
              if (!existingIds.has(backendMsg.id)) {
                mergedMessages.push(backendMsg);
              } else {
                // Update existing message with backend data (but preserve content if it's longer - might be streamed)
                const existingIndex = mergedMessages.findIndex(m => m.id === backendMsg.id);
                if (existingIndex >= 0) {
                  const existingMsg = mergedMessages[existingIndex];
                  // CRITICAL: Preserve existing content if:
                  // 1. It's longer than backend content (likely streamed)
                  // 2. Backend content is empty or very short (backend hasn't saved yet)
                  // 3. This is the recently streamed message
                  const isRecentlyStreamed = lastStreamedMessageIndexRef.current === existingIndex && 
                                           Date.now() - lastStreamCompleteTimeRef.current < 10000;
                  const backendIsEmpty = !backendMsg.content || backendMsg.content.trim().length === 0;
                  const existingIsLonger = existingMsg.content.length > backendMsg.content.length;
                  
                  const contentToUse = (isRecentlyStreamed || backendIsEmpty || existingIsLonger)
                    ? existingMsg.content 
                    : backendMsg.content;
                  
                  mergedMessages[existingIndex] = {
                    ...backendMsg,
                    content: contentToUse
                  };
                }
              }
            });
            
            // Sort by created_at to maintain order
            mergedMessages.sort((a, b) => {
              const timeA = new Date(a.created_at).getTime();
              const timeB = new Date(b.created_at).getTime();
              return timeA - timeB;
            });
            
            return mergedMessages;
          });
        }
        loadedChatIdRef.current = chatId; // Track that we've loaded this chat
      } else {
        // History doesn't match chatId or is empty - clear messages to prevent showing wrong chat's messages
        if (!historyMatches) {
          console.warn(`⚠️ [loadMessages] History ID (${historyId}) doesn't match chatId (${targetId}) - clearing messages to prevent cross-chat contamination`);
        }
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
  const startOrContinueStreaming = (assistantMsgIndex: number, isTransition: boolean = false) => {
    console.log('🎬 startOrContinueStreaming called, isStreaming:', isStreamingRef.current, 'contentBuffer length:', contentBufferRef.current.length, 'displayedChars:', displayedCharsRef.current, 'isFakeStreaming:', isFakeStreamingRef.current, 'isTransition:', isTransition);
    
    // CRITICAL: During transitions (preview→refinement, fake→preview), don't clear interval
    // Just update the buffer and let the existing interval seamlessly continue
    // This prevents idle gaps on screen
    if (isTransition && streamingIntervalRef.current) {
      console.log('🔄 Transition detected - keeping existing interval running, just updating buffer');
      // Interval is already running, it will automatically pick up the new buffer content
      // Just ensure displayedChars is reset if buffer was replaced
      if (displayedCharsRef.current > contentBufferRef.current.length) {
        displayedCharsRef.current = 0; // Reset to start streaming new content
      }
      return; // Don't restart interval, let it continue
    }
    
    // If already streaming with an interval and NOT a transition, clear it first to restart
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
    
    // CRITICAL: When refinement starts, displayedChars might be 0 while buffer has content
    // Always start streaming if buffer has content, even if displayedChars is 0
    // This ensures refinement content starts displaying immediately
    if (displayedCharsRef.current >= contentBufferRef.current.length && !isFakeStreamingRef.current) {
      // All current content is displayed, but if we're in refinement phase and buffer might grow, keep interval running
      if (!isPreviewPhaseRef.current && !isStreamCompleteRef.current) {
        // Refinement phase - keep interval running to wait for more chunks
        console.log('⏸️ All current refinement content displayed, waiting for more chunks...');
        return;
      }
      console.log('⏸️ All content already displayed, skipping');
      return;
    }
    
    console.log('🚀 Starting new streaming interval...');
    isStreamingRef.current = true;
    
    streamingIntervalRef.current = setInterval(() => {
      // Check if we have more content to display
      if (displayedCharsRef.current >= contentBufferRef.current.length) {
        // All current content is displayed
        if (isStreamCompleteRef.current) {
          // Stream is complete and all content is displayed - stop streaming
          console.log('✅ All content displayed and stream complete - stopping streaming interval');
          stopStreaming(assistantMsgIndex, true);
          return;
        }
        // Keep interval running to wait for more chunks (they might arrive)
        return;
      }
      
      // MATCH WEB: Display next 2-3 characters for smooth flow (upload.tsx line 4407)
      const charsToAdd = Math.min(3, contentBufferRef.current.length - displayedCharsRef.current);
      displayedCharsRef.current = displayedCharsRef.current + charsToAdd;
      
      // CRITICAL: Stop fake streaming AFTER we've incremented displayedCharsRef and are about to update the message
      // This ensures we're actively displaying content before stopping fake streaming (no blank gap)
      if (isFakeStreamingRef.current && contentBufferRef.current.length > 0) {
        console.log('🔄 Disabling fake streaming - real content is now displaying (', displayedCharsRef.current, '/', contentBufferRef.current.length, 'chars visible)');
        isFakeStreamingRef.current = false;
      }
      
      // MATCH WEB: Extract display text using substring (upload.tsx line 4408)
      const displayText = contentBufferRef.current.substring(0, displayedCharsRef.current);
      
      console.log(`📝 Streaming ${isPreviewPhaseRef.current ? 'PREVIEW' : 'REFINEMENT'}: ${displayedCharsRef.current}/${contentBufferRef.current.length} chars`);
      
      // Update UI with current content (like web: flushSync update)
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages[assistantMsgIndex]) {
          newMessages[assistantMsgIndex] = {
            ...newMessages[assistantMsgIndex],
            content: displayText,
            is_preview: isPreviewPhaseRef.current,
          };
          console.log(`🔄 Updated message ${assistantMsgIndex} with content: "${displayText.substring(0, 50)}..."`);
        } else {
          // Create new assistant message if it doesn't exist
          const assistantMessage: ChatMessage = {
            id: generateUniqueMessageId(),
            content: displayText,
            sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
            is_own_message: false,
            created_at: new Date().toISOString(),
            is_preview: isPreviewPhaseRef.current,
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
    
    // Keep isStreamCompleteRef set for a bit longer to prevent loadMessages from overwriting streamed content
    // Reset after a delay to allow any pending loadMessages calls to detect it
    if (isFinal) {
      lastStreamCompleteTimeRef.current = Date.now();
      lastStreamedMessageIndexRef.current = assistantMsgIndex;
      setTimeout(() => {
        isStreamCompleteRef.current = false; // Reset for next stream after delay
      }, 10000); // 10 second delay to protect streamed content (backend needs time to save)
    } else {
      isStreamCompleteRef.current = false; // Reset immediately if not final
    }
    
    if (isFinal) {
      console.log(`✅ Streaming complete - displayed ${displayedCharsRef.current}/${contentBufferRef.current.length} characters`);
      // Final update: always use full content buffer, never clear already-shown content (fix mobile response clearing)
      const finalContent = (contentBufferRef.current && contentBufferRef.current.length > 0)
        ? contentBufferRef.current
        : '';
      
      // Ensure displayedChars matches buffer length for final update
      displayedCharsRef.current = finalContent.length;
      
      console.log(`✅ Finalizing message with content length: ${finalContent.length}`);
      setMessages(prev => {
        const newMessages = [...prev];
        // Always use the full content buffer, never clear it
        const keepContent = finalContent || newMessages[assistantMsgIndex]?.content || '';
        if (newMessages[assistantMsgIndex]) {
          newMessages[assistantMsgIndex] = {
            ...newMessages[assistantMsgIndex],
            content: keepContent,
            is_preview: false, // Final text - show in normal color
            citations: citationsFromStreamRef.current ?? undefined,
          };
          citationsFromStreamRef.current = null;
          console.log(`✅ Updated message ${assistantMsgIndex} with final content: "${keepContent.substring(0, 50)}${keepContent.length > 50 ? '...' : ''}"`);
        } else {
          const assistantMessage: ChatMessage = {
            id: generateUniqueMessageId(),
            content: keepContent,
            sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
            is_own_message: false,
            created_at: new Date().toISOString(),
            is_preview: false,
            citations: citationsFromStreamRef.current ?? undefined,
          };
          citationsFromStreamRef.current = null;
          newMessages.push(assistantMessage);
          console.log(`✅ Created new assistant message with final content: "${keepContent.substring(0, 50)}${keepContent.length > 50 ? '...' : ''}"`);
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
      isStreamCompleteRef.current = false;
      citationsFromStreamRef.current = null;
      isFakeStreamingRef.current = false;
      lastStreamedMessageIndexRef.current = null;
      lastStreamCompleteTimeRef.current = 0;

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
        isStreamCompleteRef.current = false;
        lastStreamedMessageIndexRef.current = null;
        lastStreamCompleteTimeRef.current = 0;
        
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
          
          // CRITICAL: Set streamingMessageIndex INSIDE setMessages callback AND update ref immediately
          // This ensures ProcessingMessageDisplay can immediately show fake streaming
          streamingMessageIndexRef.current = assistantMessageIndex; // Set ref immediately for synchronous access
          setStreamingMessageIndex(assistantMessageIndex); // Set state for re-render
          console.log('🎬 Started fake streaming for message index:', assistantMessageIndex, 'isFakeStreaming:', isFakeStreamingRef.current, 'sendingMessage:', true);
          
          return [...prev, placeholderMessage];
        });
        
        // Fake streaming is now active - ProcessingMessageDisplay will show until preview arrives
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

        // Use chunked polling for AI chat (resilient alternative to streaming)
        // Polling works better on mobile networks and survives app backgrounding
        await (api as any).sendChatMessagePolling(
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
                // Status events: do NOT update message.content. Placeholder already exists.
                // Only preview_chunk / chunk / instant_preview drive first non-empty content.
                break;

              case 'instant_preview': {
                // Web flow: do NOT set message.content here. Buffer chunk, start display timer.
                // Fake streaming stops when the interval first writes 2–3 chars to message.content.
                const instantContent = data.content || data.response || '';
                if (!instantContent || instantContent.length === 0) {
                  console.warn('⚠️ instant_preview received but content is empty');
                  break;
                }
                contentBufferRef.current = instantContent;
                displayedCharsRef.current = 0;
                isPreviewPhaseRef.current = true;
                startOrContinueStreaming(assistantMessageIndex);
                break;
              }

              case 'fallback_response':
                // Handle non-streaming response - replace fake streaming with real content
                console.log('📝 Received fallback response:', data.content);
                // CRITICAL: DON'T stop fake streaming here - let it continue until content actually starts displaying
                // Fake streaming will be stopped automatically in the streaming interval when displayedCharsRef.current > 0
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
                setSendingMessage(false);
                stopBounceAnimation();
                break;

              case 'chunk':
              case 'preview_chunk': {
                // TEMPLATE PREVIEW: Show after search completes (replaces instant preview)
                // Matches web: upload.tsx lines 4671-4706
                const previewChunkContent = data.content || data.response || '';
                const previewStarted = data.preview_started || false;
                const isPreviewPhase = data.is_preview_phase !== undefined ? data.is_preview_phase : true;
                
                // CRITICAL: Check if phase transition detected (is_preview_phase changed from true to false)
                // This handles the case where a chunk arrives with is_preview_phase: false
                const phaseTransitionDetected = isPreviewPhaseRef.current === true && isPreviewPhase === false;
                
                if (phaseTransitionDetected) {
                  console.log('🔄 [FRONTEND] Phase transition detected in preview_chunk handler: preview -> refinement');
                  console.log('🔄 [FRONTEND] This chunk is actually refinement - will be handled by refinement_chunk case');
                  // Don't process as preview - this should be handled as refinement
                  // The polling code should send this as refinement_chunk, but handle it here as fallback
                  break; // Skip preview processing, wait for refinement_chunk event
                }
                
                console.log('📦 Template preview chunk received:', {
                  chunk_index: data.chunk_index,
                  contentLength: previewChunkContent.length,
                  preview: previewChunkContent.substring(0, 50),
                  preview_started: previewStarted,
                  is_preview_phase: isPreviewPhase
                });
                
                // CRITICAL: Process preview chunk if we have content, regardless of preview_started flag
                // The preview_started flag might not be reliable, but actual content is
                if (!previewChunkContent || previewChunkContent.length === 0) {
                  console.log('⏳ Preview chunk has no content - keeping fake streaming active');
                  // Don't process empty chunks - wait for content
                  break;
                }
                
                // CRITICAL: Don't stop fake streaming here - let it continue until preview actually starts displaying
                // Fake streaming will be stopped in startOrContinueStreaming when content actually starts showing
                
                console.log('📦 Processing preview chunk - content length:', previewChunkContent.length, 'buffer will be:', contentBufferRef.current.length + previewChunkContent.length);
                
                // Preview has started - process the chunk
                if (data.chunk_index === 0 || contentBufferRef.current.length === 0 || contentBufferRef.current.includes('Searching for')) {
                  // First chunk - REPLACE instant preview (like web)
                  console.log('📦 First preview chunk - replacing instant preview');
                  
                  // CRITICAL: Don't stop streaming interval - seamlessly transition to preview
                  // Keep the interval running, just update the buffer and let it continue displaying
                  // This ensures no idle gap between fake streaming and preview
                  
                  // Reset buffer and display (like web: contentBuffer = previewChunkContent; displayedContent = '')
                  contentBufferRef.current = previewChunkContent;
                  displayedCharsRef.current = 0; // Start from 0 - let interval handle all display from the start
                  isPreviewPhaseRef.current = isPreviewPhase;
                  
                  // CRITICAL: DON'T stop fake streaming here - let it continue until preview actually starts displaying
                  // Fake streaming will be stopped automatically in the streaming interval AFTER we've incremented displayedCharsRef
                  // This ensures no idle gap - fake streaming continues until content is actively streaming
                  
                  // Mark as recently streamed to protect from loadMessages
                  lastStreamedMessageIndexRef.current = assistantMessageIndex;
                  lastStreamCompleteTimeRef.current = Date.now();
                  
                  // Start streaming interval immediately - it will display content from 0 and stop fake streaming once content is visible
                  console.log('📦 Starting preview streaming - buffer length:', contentBufferRef.current.length);
                  startOrContinueStreaming(assistantMessageIndex);
                } else {
                  // Subsequent chunks - append (like web: contentBuffer += previewChunkContent)
                  contentBufferRef.current += previewChunkContent;
                  console.log('📦 Appended preview chunk', data.chunk_index, '- buffer now:', contentBufferRef.current.length);
                  
                  // Mark as recently streamed to protect from loadMessages
                  lastStreamedMessageIndexRef.current = assistantMessageIndex;
                  lastStreamCompleteTimeRef.current = Date.now();
                  
                  // Display with smooth typing effect (like web: displayContentImmediately)
                  console.log('📦 Starting preview streaming - buffer length:', contentBufferRef.current.length);
                  startOrContinueStreaming(assistantMessageIndex);
                }
                break;
              }

              case 'preview_complete':
                console.log('✅ Preview complete - phase transition detected');
                console.log('📊 Preview content length:', data.preview_length || contentBufferRef.current.length);
                // Mark preview as complete - refinement will start next
                // Don't reset anything here - wait for first refinement_chunk to reset
                // This signal just indicates that the next chunk will be refinement
                break;

              case 'refinement_chunk': {
                // REFINEMENT (main response): Replace preview immediately
                // Matches web: upload.tsx lines 4714-4739
                const refinementChunkContent = data.content || data.response || '';
                
                // CRITICAL: Skip empty refinement chunks
                if (!refinementChunkContent || refinementChunkContent.length === 0) {
                  console.log('⏳ Refinement chunk has no content - skipping');
                  break;
                }
                
                const isPreviewPhaseFromData = data.is_preview_phase !== undefined ? data.is_preview_phase : false;
                
                // CRITICAL: Check is_preview_phase flag from polling response
                // If flag changed from true to false, this is the phase transition
                const phaseTransitionDetected = isPreviewPhaseRef.current === true && isPreviewPhaseFromData === false;
                
                // CRITICAL: Detect first refinement chunk
                // This can happen in two scenarios:
                // 1. Preview was shown, then refinement arrives (phase transition)
                // 2. Preview was skipped, refinement arrives directly (fake streaming still active)
                // Preview was skipped if: fake streaming is active AND we're receiving refinement (is_preview_phase: false)
                // OR if fake streaming is active AND contentBuffer is empty (no preview content was ever set)
                const previewWasSkipped = isFakeStreamingRef.current && (
                  isPreviewPhaseFromData === false || 
                  contentBufferRef.current.length === 0
                );
                const isFirstRefinement = data.is_first_refinement || phaseTransitionDetected || previewWasSkipped || (data.chunk_index === 0 && (isPreviewPhaseRef.current || isFakeStreamingRef.current));
                
                console.log('🔄 Refinement chunk received', { 
                  chunk_index: data.chunk_index, 
                  contentLength: refinementChunkContent.length, 
                  preview: refinementChunkContent.substring(0, 40),
                  is_first_refinement: isFirstRefinement,
                  is_preview_phase_flag: isPreviewPhaseFromData,
                  current_phase: isPreviewPhaseRef.current ? 'preview' : 'refinement',
                  phase_transition_detected: phaseTransitionDetected,
                  preview_was_skipped: previewWasSkipped,
                  fake_streaming_active: isFakeStreamingRef.current
                });
                
                // CRITICAL: Handle first refinement chunk - covers all cases:
                // 1. Preview was shown, then refinement arrives (phaseTransitionDetected)
                // 2. Preview was skipped, refinement arrives directly (previewWasSkipped)
                // 3. First chunk of refinement (chunk_index === 0)
                if (isFirstRefinement) {
                  // First refinement chunk - IMMEDIATE transition
                  if (previewWasSkipped) {
                    console.log('🔄 First refinement chunk - backend skipped preview, transitioning directly from fake streaming');
                    console.log('🔄 Fake streaming active:', isFakeStreamingRef.current, 'Content buffer empty:', contentBufferRef.current.length === 0);
                  } else {
                    console.log('🔄 First refinement chunk - IMMEDIATE cutover from preview');
                    console.log('🔄 Replacing preview content with refinement content');
                  }
                  
                  // CRITICAL: Don't stop streaming interval - seamlessly transition from preview to refinement
                  // Keep the interval running, just update the buffer and let it continue displaying
                  // This ensures no idle gap between preview and refinement
                  
                  // CRITICAL: DON'T stop fake streaming here - let it continue until refinement characters actually start displaying
                  // If preview was skipped, we're transitioning from fake streaming to refinement
                  // Fake streaming will be stopped automatically in the streaming interval when displayedCharsRef.current > 0
                  // This prevents the idle gap between fake streaming stopping and refinement characters appearing
                  // The check at line 2847-2849 will handle stopping fake streaming when content actually displays
                  
                  // CRITICAL: Always reset for refinement phase - replace preview completely
                  // The backend provides refinement content separately from preview
                  // We need to replace the preview buffer with refinement content
                  contentBufferRef.current = refinementChunkContent;
                  displayedCharsRef.current = 0; // Reset counter, but display immediately below
                  isPreviewPhaseRef.current = false;
                  
                  // CRITICAL: Display first characters IMMEDIATELY to prevent gap
                  // Don't wait for interval - show content right away for seamless transition
                  const initialCharsToShow = Math.min(30, refinementChunkContent.length);
                  displayedCharsRef.current = initialCharsToShow;
                  const initialDisplayText = refinementChunkContent.substring(0, initialCharsToShow);
                  
                  // If streaming interval is not running, start it (seamless transition)
                  // If it's already running, it will automatically pick up the new buffer content
                  
                  console.log('🔄 Reset complete - refinement buffer:', refinementChunkContent.length, 'chars, showing', initialCharsToShow, 'immediately');
                  
                  // Ensure message exists and update with initial content IMMEDIATELY
                  setMessages(prev => {
                    const newMessages = [...prev];
                    if (!newMessages[assistantMessageIndex]) {
                      const assistantMessage: ChatMessage = {
                        id: generateUniqueMessageId(),
                        content: initialDisplayText,
                        sender: { id: 1, username: 'ChatGD Assistant', email: 'ai@grabdocs.com' },
                        is_own_message: false,
                        created_at: new Date().toISOString()
                      };
                      newMessages.push(assistantMessage);
                      console.log(`🔄 Created message ${assistantMessageIndex} for refinement with initial content`);
                    } else {
                      // Update existing message with initial content immediately
                      newMessages[assistantMessageIndex] = {
                        ...newMessages[assistantMessageIndex],
                        content: initialDisplayText
                      };
                      console.log(`🔄 Updated message ${assistantMessageIndex} with initial refinement content`);
                    }
                    return newMessages;
                  });
                  
                  // Mark as recently streamed to protect from loadMessages
                  lastStreamedMessageIndexRef.current = assistantMessageIndex;
                  lastStreamCompleteTimeRef.current = Date.now();
                  
                  // Ensure streaming continues seamlessly (like web: displayContentImmediately)
                  // Smooth transition: fake streaming → refinement (when preview skipped)
                  // Or: preview → refinement (when preview was shown)
                  // CRITICAL: Use transition flag to keep interval running seamlessly
                  // If interval is already running, it will pick up the new buffer automatically
                  // If not running, start it
                  console.log('🔄 Ensuring refinement streaming continues - smooth transition from', previewWasSkipped ? 'fake streaming' : 'preview');
                  startOrContinueStreaming(assistantMessageIndex, true); // true = transition from preview/fake streaming
                } else {
                  // Subsequent chunks - append (like web: contentBuffer += refinementChunkContent)
                  // CRITICAL: DON'T stop fake streaming here either - let the streaming interval handle it
                  // Fake streaming will be stopped automatically when characters actually start displaying
                  // This ensures seamless transition even if first chunk was missed
                  
                  contentBufferRef.current += refinementChunkContent;
                  console.log('🔄 Appended refinement chunk', data.chunk_index, '- buffer now:', contentBufferRef.current.length);
                  
                  // Ensure streaming continues (like web: displayContentImmediately)
                  // Not a transition - just appending, so keep existing interval if running
                  startOrContinueStreaming(assistantMessageIndex, true); // true = keep interval running if exists
                }
                break;
              }

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
                    
                    // CRITICAL: Update loadedChatIdRef FIRST to prevent loadMessages from reloading
                    // This must happen before setSelectedChat to prevent message clearing
                    loadedChatIdRef.current = returnedChatId;
                    console.log('✅ Updated loadedChatIdRef to prevent message reload:', returnedChatId);
                    
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
                        
                        // CRITICAL: Update the chat in the chats list, removing old ID and adding new ID
                        // This transfers context from temporary ID (-2) to real ID
                        setChats(prevChats => {
                          // Remove old chat with temp ID (-2) and add new chat with real ID
                          const chatsWithoutOld = prevChats.filter(chat => chat.id !== currentChatId);
                          
                          // Ensure ChatGD Assistant stays first, then add updated chat
                          const chatAssistant = chatsWithoutOld.find(chat => chat.id === -1);
                          const otherChats = chatsWithoutOld.filter(chat => chat.id !== -1);
                          
                          let updatedChats: Chat[];
                          if (chatAssistant) {
                            updatedChats = [chatAssistant, updatedChat, ...otherChats];
                          } else {
                            updatedChats = [updatedChat, ...otherChats];
                          }
                          
                          console.log('🔄 [ID UPDATE] Updated chats list with new ID:', {
                            removedId: currentChatId,
                            addedId: returnedChatId,
                            totalChats: updatedChats.length,
                            hasBookmarkContext: !!updatedChat.bookmark_context,
                            bookmarkName: updatedChat.bookmark_context?.name,
                            hasDocumentContext: !!updatedChat.document_context,
                            type: updatedChat.type
                          });
                          
                          // CRITICAL: Persist the updated chat context with NEW ID
                          // This transfers context from old ID (-2) to new ID (real ID)
                          // Also need to remove old ID from AsyncStorage
                          savePersistedChatContexts(updatedChats).then(async () => {
                            // CRITICAL: Remove old ID (-2) from AsyncStorage if it exists
                            if (currentChatId === -2) {
                              try {
                                const stored = await AsyncStorage.getItem(CHAT_CONTEXTS_KEY);
                                if (stored) {
                                  const parsed = JSON.parse(stored);
                                  if (parsed['-2']) {
                                    delete parsed['-2'];
                                    await AsyncStorage.setItem(CHAT_CONTEXTS_KEY, JSON.stringify(parsed));
                                    console.log('🗑️ Removed old temporary chat ID -2 from AsyncStorage, context transferred to', returnedChatId);
                                  }
                                }
                              } catch (error) {
                                console.error('❌ Failed to remove old chat ID from AsyncStorage:', error);
                              }
                            }
                          });
                          
                          return updatedChats;
                        });
                        
                        return updatedChat;
                      }
                      return prev;
                    });
                    
                    // CRITICAL: Don't reload chat list immediately after updating ID - it clears messages
                    // The chat list is already updated locally, so we don't need to reload everything
                    // This prevents messages from being cleared when the chat ID is updated
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
                // Mark stream as complete so interval knows to stop when all content is displayed
                isStreamCompleteRef.current = true;
                citationsFromStreamRef.current = (data.citations && data.citations.length > 0) ? data.citations : null;
                
                // Buffer already has full content from chunks, just ensure phase is correct
                if (data.response != null && String(data.response).length > 0) {
                  // Backend included full response in complete event - use it
                  const resp = String(data.response);
                  console.log('✅ Complete with final response', { length: resp.length });
                  
                  // CRITICAL: Only reset displayedChars if:
                  // 1. We're transitioning from preview to refinement (content is different)
                  // 2. OR refinement phase already started (isPreviewPhaseRef.current === false)
                  // 3. OR content is actually different from what's in the buffer
                  const isContentDifferent = resp !== contentBufferRef.current;
                  const isRefinementPhase = !isPreviewPhaseRef.current;
                  
                  if (isContentDifferent && isRefinementPhase) {
                    // Refinement content is different - replace and restart streaming
                    console.log('🔄 Complete: Refinement content differs, replacing preview');
                    contentBufferRef.current = resp;
                    displayedCharsRef.current = 0;
                    isPreviewPhaseRef.current = false;
                    startOrContinueStreaming(assistantMessageIndex);
                  } else if (isContentDifferent && !isRefinementPhase) {
                    // Content is different but we're still in preview - this shouldn't happen
                    // But if it does, update buffer without resetting displayedChars
                    console.log('⚠️ Complete: Content differs but still in preview phase - updating buffer only');
                    contentBufferRef.current = resp;
                    // Don't reset displayedChars - continue from where we are
                    isPreviewPhaseRef.current = false;
                    // Continue streaming if not already complete
                    if (displayedCharsRef.current < contentBufferRef.current.length) {
                      startOrContinueStreaming(assistantMessageIndex);
                    }
                  } else {
                    // Content is the same - just finalize, don't restart streaming
                    console.log('✅ Complete: Content matches buffer - finalizing without restart');
                    contentBufferRef.current = resp;
                    isPreviewPhaseRef.current = false;
                    // Don't reset displayedChars - content is already being displayed
                    // Just ensure we display the full content if not already complete
                    if (displayedCharsRef.current < contentBufferRef.current.length) {
                      startOrContinueStreaming(assistantMessageIndex);
                    } else {
                      // All content already displayed - finalize immediately
                      stopStreaming(assistantMessageIndex, true);
                    }
                  }
                } else {
                  // No response in complete - buffer already has content from chunks
                  console.log('✅ Complete without response - buffer has', contentBufferRef.current.length, 'chars');
                  isPreviewPhaseRef.current = false;
                  // Don't stop streaming if buffer is empty (complete arrived before any chunks - keep fake streaming)
                  if (contentBufferRef.current.length === 0) {
                    console.log('⏳ Complete with empty buffer - keeping fake streaming until chunks arrive');
                  } else if (displayedCharsRef.current >= contentBufferRef.current.length) {
                    console.log('✅ All content already displayed - stopping streaming immediately');
                    stopStreaming(assistantMessageIndex, true);
                  }
                }
                
                // Let streaming finish naturally (like web)
                // The streaming interval will stop automatically when displayedChars >= buffer.length AND isStreamCompleteRef is true
                // CRITICAL: Clear sending state only when stream actually completes (not in finally – polling returns immediately)
                setSendingMessage(false);
                stopBounceAnimation();
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
          const chatIdToUpdate = currentChatIdRef.current || selectedChatRef.current?.id;
          if (!chatIdToUpdate || chatIdToUpdate === -1) return;
          
          setChats(prev => {
            // Check if chat exists in list
            const existingChat = prev.find(chat => chat.id === chatIdToUpdate);
            if (existingChat) {
              // Update existing chat - CRITICAL: Preserve bookmark_context, document_context, workspace, and type
              // This ensures bookmark chats stay purple and document chats stay green after sending messages
              return prev.map(chat => 
                chat.id === chatIdToUpdate 
                  ? { 
                      ...chat, 
                      last_message: (contentBufferRef.current || '').substring(0, 50) + '...', 
                      updated_at: new Date().toISOString(),
                      // Preserve context and type - don't lose bookmark/document context
                      bookmark_context: chat.bookmark_context,
                      document_context: chat.document_context,
                      workspace: chat.workspace,
                      type: chat.type
                    }
                  : chat
              );
            } else {
              // Chat doesn't exist in list yet (might be a new chat)
              // CRITICAL: Don't reload chat list - it clears messages!
              // Instead, just add the chat to the list with the current content
              console.log('⚠️ Chat not found in list, but NOT reloading to preserve messages. Chat ID:', chatIdToUpdate);
              // The chat was already added to the list when ID was updated, so this shouldn't happen
              // But if it does, preserve messages by not calling loadChats()
              return prev;
            }
          });
        }, 600); // Wait a bit longer than the complete handler to ensure selectedChat is updated
      } else if (selectedChat.type === 'user_direct') {
        console.log('📤 [CHATS-WEB] ===== SENDING USER DIRECT MESSAGE =====');
        console.log('📤 [CHATS-WEB] Chat ID:', selectedChat.id);
        console.log('📤 [CHATS-WEB] Message text:', messageText);
        // Get user ID from ref to ensure we have latest value
        const userId = userProfileRef.current?.data?.id || userProfileRef.current?.id;
        console.log('📤 [CHATS-WEB] User ID:', userId);
        
        // Emit typing stopped (validate all required fields)
        if (socketRef.current && 
            userId && 
            selectedChat.id != null) {
          console.log('📤 [CHATS-WEB] Emitting typing stopped event');
          socketRef.current.emit('user_typing', { 
            chat_id: selectedChat.id,
            user_id: userId,
            is_typing: false
          });
        }
        
        // Reserve message ID immediately to prevent WebSocket duplicates
        // We'll use a temporary ID that will be replaced with the real ID from API response
        const tempMessageId = Date.now(); // Temporary ID to track this send operation
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
          
          // CRITICAL: Add message ID to recently sent set IMMEDIATELY to prevent WebSocket duplicates
          // This must happen before setMessages to ensure WebSocket handler sees it
          recentlySentMessageIdsRef.current.add(newMsg.id);
          lastMessageSentTimeRef.current = Date.now();
          
          // Add message only if it doesn't already exist (prevent duplicates from WebSocket)
          setMessages(prev => {
            // FIRST CHECK: Is this message ID in recently sent set?
            if (recentlySentMessageIdsRef.current.has(newMsg.id)) {
              // Double-check: verify message isn't already in the list
              const alreadyExists = prev.find(msg => msg.id === newMsg.id);
              if (alreadyExists) {
                console.log('📤 [CHATS-WEB] Duplicate detected - message already in list, skipping:', newMsg.id);
                return prev;
              }
              // If not in list but in ref, it means WebSocket already added it - skip
              console.log('📤 [CHATS-WEB] Duplicate detected - message ID in recently sent set, skipping:', newMsg.id);
              return prev;
            }
            
            // SECOND CHECK: Exact ID match in current messages
            const existingIndex = prev.findIndex(msg => msg.id === newMsg.id);
            if (existingIndex !== -1) {
              console.log('📤 [CHATS-WEB] Message already exists, updating if needed:', newMsg.id);
              // Update existing message to ensure is_own_message is correct
              const existingMsg = prev[existingIndex];
              if (existingMsg.is_own_message !== true) {
                console.log('🔄 [CHATS-WEB] Fixing message ownership flag:', newMsg.id);
                const updated = [...prev];
                updated[existingIndex] = { ...existingMsg, is_own_message: true };
                return updated;
              }
              // Add to recently sent set to prevent future duplicates
              recentlySentMessageIdsRef.current.add(newMsg.id);
              setTimeout(() => {
                recentlySentMessageIdsRef.current.delete(newMsg.id);
              }, 10000);
              return prev;
            }
            
            // THIRD CHECK: Content + timestamp match (for duplicates with different IDs)
            // Use larger time window (30 seconds) to account for timezone differences (EST vs UTC)
            const duplicateByContent = prev.find(msg => {
              if (msg.content !== newMsg.content) {
                return false;
              }
              // Check if it's our own message (either flag is true or in recently sent set)
              const isOwnMessage = msg.is_own_message === true || recentlySentMessageIdsRef.current.has(msg.id);
              if (!isOwnMessage) {
                return false;
              }
              // Normalize timestamps - ensure UTC parsing by appending Z if missing
              const msgTimeStr = msg.created_at + (msg.created_at.includes('T') && !msg.created_at.match(/[Z+-]/) ? 'Z' : '');
              const newMsgTimeStr = (newMsg.created_at || new Date().toISOString()) + ((newMsg.created_at || '').includes('T') && !(newMsg.created_at || '').match(/[Z+-]/) ? 'Z' : '');
              const msgTime = new Date(msgTimeStr).getTime();
              const newMsgTime = new Date(newMsgTimeStr).getTime();
              const timeDiff = Math.abs(msgTime - newMsgTime);
              // Use 30 second window to account for EST/UTC differences and network delays
              return timeDiff < 30000;
            });
            
            if (duplicateByContent) {
              const msgTimeStr = duplicateByContent.created_at + (duplicateByContent.created_at.includes('T') && !duplicateByContent.created_at.match(/[Z+-]/) ? 'Z' : '');
              const newMsgTimeStr = (newMsg.created_at || new Date().toISOString()) + ((newMsg.created_at || '').includes('T') && !(newMsg.created_at || '').match(/[Z+-]/) ? 'Z' : '');
              const timeDiff = Math.abs(new Date(msgTimeStr).getTime() - new Date(newMsgTimeStr).getTime());
              console.log('📤 [CHATS-WEB] Duplicate message detected by content+time, skipping:', newMsg.id, 'existing:', duplicateByContent.id, 'timeDiff:', timeDiff, 'ms');
              // Add to recently sent set to prevent future duplicates
              recentlySentMessageIdsRef.current.add(newMsg.id);
              setTimeout(() => {
                recentlySentMessageIdsRef.current.delete(newMsg.id);
              }, 10000);
              return prev;
            }
            
            console.log('📤 [CHATS-WEB] Adding optimistic message:', newMsg.id, 'is_own_message: true');
            // Message ID already added to ref above, just need to clear it after timeout
            // Clear it after 10 seconds to prevent memory leak
            setTimeout(() => {
              recentlySentMessageIdsRef.current.delete(newMsg.id);
            }, 10000);
            
            return [...prev, {
              id: newMsg.id,
              content: newMsg.content,
              sender: newMsg.sender,
              is_own_message: true,
              sender_id: (response as any).message?.sender_id ?? currentUserIdRef.current ?? undefined,
              created_at: newMsg.created_at || new Date().toISOString()
            }];
          });
          
          // Update chat list (set last_message_sender_id so unread badge stays hidden for sender)
          const userId = currentUserIdRef.current ?? userProfileRef.current?.data?.id ?? userProfileRef.current?.id;
          setChats(prev => prev.map(chat => 
            chat.id === selectedChat.id 
              ? { ...chat, last_message: newMsg.content.substring(0, 50), updated_at: newMsg.created_at || new Date().toISOString(), last_message_sender_id: userId ?? undefined }
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
        // Get user ID from ref to ensure we have latest value
        const userId = userProfileRef.current?.data?.id || userProfileRef.current?.id;
        console.log('📤 [CHATS-WEB] User ID:', userId);
        
        // Emit typing stopped (validate all required fields)
        if (socketRef.current && 
            userId && 
            selectedChat.id != null) {
          console.log('📤 [CHATS-WEB] Emitting typing stopped event');
          socketRef.current.emit('user_typing', { 
            chat_id: selectedChat.id,
            user_id: userId,
            is_typing: false
          });
        }
        
        // Reserve message ID immediately to prevent WebSocket duplicates
        const tempMessageId = Date.now(); // Temporary ID to track this send operation
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
          
          // CRITICAL: Add message ID to recently sent set IMMEDIATELY to prevent WebSocket duplicates
          // This must happen before setMessages to ensure WebSocket handler sees it
          recentlySentMessageIdsRef.current.add(newMsg.id);
          lastMessageSentTimeRef.current = Date.now();
          
          // Add message only if it doesn't already exist (prevent duplicates from WebSocket)
          setMessages(prev => {
            // FIRST CHECK: Is this message ID in recently sent set?
            if (recentlySentMessageIdsRef.current.has(newMsg.id)) {
              // Double-check: verify message isn't already in the list
              const alreadyExists = prev.find(msg => msg.id === newMsg.id);
              if (alreadyExists) {
                console.log('📤 [CHATS-WEB] Duplicate detected - message already in list, skipping:', newMsg.id);
                return prev;
              }
              // If not in list but in ref, it means WebSocket already added it - skip
              console.log('📤 [CHATS-WEB] Duplicate detected - message ID in recently sent set, skipping:', newMsg.id);
              return prev;
            }
            
            // SECOND CHECK: Exact ID match in current messages
            const existingIndex = prev.findIndex(msg => msg.id === newMsg.id);
            if (existingIndex !== -1) {
              console.log('📤 [CHATS-WEB] Message already exists, updating if needed:', newMsg.id);
              // Update existing message to ensure is_own_message is correct
              const existingMsg = prev[existingIndex];
              if (existingMsg.is_own_message !== true) {
                console.log('🔄 [CHATS-WEB] Fixing message ownership flag:', newMsg.id);
                const updated = [...prev];
                updated[existingIndex] = { ...existingMsg, is_own_message: true };
                return updated;
              }
              // Add to recently sent set to prevent future duplicates
              recentlySentMessageIdsRef.current.add(newMsg.id);
              setTimeout(() => {
                recentlySentMessageIdsRef.current.delete(newMsg.id);
              }, 10000);
              return prev;
            }
            
            // THIRD CHECK: Content + timestamp match (for duplicates with different IDs)
            // Use larger time window (30 seconds) to account for timezone differences (EST vs UTC)
            const duplicateByContent = prev.find(msg => {
              if (msg.content !== newMsg.content) {
                return false;
              }
              // Check if it's our own message (either flag is true or in recently sent set)
              const isOwnMessage = msg.is_own_message === true || recentlySentMessageIdsRef.current.has(msg.id);
              if (!isOwnMessage) {
                return false;
              }
              // Normalize timestamps - ensure UTC parsing by appending Z if missing
              const msgTimeStr = msg.created_at + (msg.created_at.includes('T') && !msg.created_at.match(/[Z+-]/) ? 'Z' : '');
              const newMsgTimeStr = (newMsg.created_at || new Date().toISOString()) + ((newMsg.created_at || '').includes('T') && !(newMsg.created_at || '').match(/[Z+-]/) ? 'Z' : '');
              const msgTime = new Date(msgTimeStr).getTime();
              const newMsgTime = new Date(newMsgTimeStr).getTime();
              const timeDiff = Math.abs(msgTime - newMsgTime);
              // Use 30 second window to account for EST/UTC differences and network delays
              return timeDiff < 30000;
            });
            
            if (duplicateByContent) {
              const msgTimeStr = duplicateByContent.created_at + (duplicateByContent.created_at.includes('T') && !duplicateByContent.created_at.match(/[Z+-]/) ? 'Z' : '');
              const newMsgTimeStr = (newMsg.created_at || new Date().toISOString()) + ((newMsg.created_at || '').includes('T') && !(newMsg.created_at || '').match(/[Z+-]/) ? 'Z' : '');
              const timeDiff = Math.abs(new Date(msgTimeStr).getTime() - new Date(newMsgTimeStr).getTime());
              console.log('📤 [CHATS-WEB] Duplicate message detected by content+time, skipping:', newMsg.id, 'existing:', duplicateByContent.id, 'timeDiff:', timeDiff, 'ms');
              // Add to recently sent set to prevent future duplicates
              recentlySentMessageIdsRef.current.add(newMsg.id);
              setTimeout(() => {
                recentlySentMessageIdsRef.current.delete(newMsg.id);
              }, 10000);
              return prev;
            }
            
            console.log('📤 [CHATS-WEB] Adding optimistic message:', newMsg.id, 'is_own_message: true');
            // Message ID already added to ref above, just need to clear it after timeout
            // Clear it after 10 seconds to prevent memory leak
            setTimeout(() => {
              recentlySentMessageIdsRef.current.delete(newMsg.id);
            }, 10000);
            
            return [...prev, {
              id: newMsg.id,
              content: newMsg.content,
              sender: newMsg.sender,
              is_own_message: true,
              sender_id: (response as any).message?.sender_id ?? currentUserIdRef.current ?? undefined,
              created_at: newMsg.created_at || new Date().toISOString()
            }];
          });
          
          // Update chat list (set last_message_sender_id so unread badge stays hidden for sender)
          setChats(prev => prev.map(chat => 
            chat.id === selectedChat.id 
              ? { ...chat, last_message: newMsg.content.substring(0, 50), updated_at: newMsg.created_at || new Date().toISOString(), last_message_sender_id: userId ?? undefined }
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
        if (isFakeStreamingRef.current) {
          stopStreaming(assistantMessageIndex, false);
          isFakeStreamingRef.current = false;
        }
        setSendingMessage(false);
        stopBounceAnimation();
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
        userId: userProfileRef.current?.data?.id || userProfileRef.current?.id
      });

      // Send to backend so we can see chat failures (e.g. Android prod) in error_logs
      const status = (error as any)?.response?.status;
      const detail = (error as any)?.response?.data;
      const summary = [error?.message, status != null ? `status=${status}` : '', detail ? JSON.stringify(detail).slice(0, 200) : ''].filter(Boolean).join(' | ');
      errorLogger.logError(new Error(summary), {
        severity: 'error',
        screenName: 'Chats',
        userAction: 'SendMessage',
        errorType: 'ChatSendFailed',
        userId: userProfileRef.current?.data?.id ?? userProfileRef.current?.id,
      });
      
      // Determine user-friendly error message based on error type
      let fallbackResponse = "I apologize, but I'm experiencing some technical difficulties right now. Let me try to help you with a general response based on your question.\n\n" +
        "Based on your query, I can provide some general guidance, though I may not have access to your specific documents at the moment. " +
        "Please try again in a moment, or feel free to rephrase your question if you'd like to continue our conversation.";
      
      if (error.message?.includes('429') || error.message?.includes('Rate limit') || error.message?.includes('rate limit')) {
        fallbackResponse = "⏱️ Rate limit exceeded. Please wait a moment before trying again.\n\n" +
          "You've sent too many requests in a short period. This helps ensure fair usage for all users.\n\n" +
          "Please wait a few seconds and try again.";
        
        // Stop fake streaming immediately for rate limit errors
        if (isFakeStreamingRef.current) {
          stopStreaming(assistantMessageIndex, false);
          isFakeStreamingRef.current = false;
        }
      } else if (error.message?.includes('Network request timed out') || 
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
      // CRITICAL: DON'T stop fake streaming here - let it continue until error content actually starts displaying
      // Fake streaming will be stopped automatically in the streaming interval when displayedCharsRef.current > 0
      contentBufferRef.current = fallbackResponse;
      displayedCharsRef.current = 0;
      isPreviewPhaseRef.current = true;
      isStreamingRef.current = true;
      
      // Continue streaming with error message
      startOrContinueStreaming(assistantMessageIndex);
      
      // Stop streaming after content is fully displayed; then clear sending state
      setTimeout(() => {
        stopStreaming(assistantMessageIndex, true);
        setSendingMessage(false);
        stopBounceAnimation();
      }, fallbackResponse.length * 50 + 1000); // 50ms per character + 1 second buffer
      
    } finally {
      console.log('📤 [CHATS-WEB] Send operation completed (success or error)');
      abortControllerRef.current = null;
      // Do NOT set setSendingMessage(false) here: with polling, the promise resolves immediately after the first poll is sent,
      // so that would hide fake streaming before any chunk arrives. It is cleared in 'complete' / 'error' handlers or in catch above.
    }
  };

  // Helper function to restore context for a chat (reusable)
  const restoreChatContext = (chat: Chat) => {
    // Check if user explicitly removed context for this chat
    // CRITICAL: Don't check for temporary chats (id -2) - they're newly created and context should always be restored
    const isTemporaryChat = chat.id === -2;
    const explicitlyRemoved = !isTemporaryChat && chat.id != null && chat.id !== -1 && contextRemovedChatIdsRef.current.has(Number(chat.id));
    if (explicitlyRemoved) {
      console.log('🚫 Context explicitly removed by user for chat:', chat.id);
      setSelectedMention(null);
      return;
    }
    
    // CRITICAL: Check chat object's context FIRST (most reliable - from chats list)
    // This ensures context is restored even if backend doesn't have it yet
    const bookmarkContext = chat.bookmark_context;
    const documentContext = chat.document_context;
    const workspaceContext = chat.workspace;
    
    if (bookmarkContext) {
      console.log('📖 [RESTORE] Restoring bookmark context from chat object:', {
        chatId: chat.id,
        bookmarkId: bookmarkContext.id,
        bookmarkName: bookmarkContext.name
      });
      setSelectedMention({ 
        type: 'bookmark', 
        id: bookmarkContext.id, 
        name: bookmarkContext.name, 
        data: bookmarkContext 
      });
      return;
    }
    
    if (documentContext) {
      console.log('📖 Restoring document context from chat object:', documentContext.name);
      setSelectedMention({ 
        type: 'file', 
        id: documentContext.id, 
        name: documentContext.name, 
        data: documentContext 
      });
      return;
    }
    
    if (workspaceContext) {
      console.log('📖 Restoring workspace context from chat object:', workspaceContext.name);
      setSelectedMention({ 
        type: 'workspace', 
        id: workspaceContext.id, 
        name: workspaceContext.name, 
        data: workspaceContext 
      });
      return;
    }
    
    // Fallback: try to restore from persistent_context (from backend - most up-to-date)
    // This code only runs if chat object doesn't have context
    const { currentHistory } = useChatStore.getState();
    const persistentContext = currentHistory?.persistent_context;
    
    // Verify currentHistory matches this chat
    const historyId = currentHistory ? (typeof currentHistory.id === 'string' ? parseInt(String(currentHistory.id), 10) : Number(currentHistory.id)) : null;
    const chatId = typeof chat.id === 'string' ? parseInt(String(chat.id), 10) : Number(chat.id);
    const historyMatches = historyId !== null && !isNaN(historyId) && !isNaN(chatId) && historyId === chatId;
    
    if (persistentContext && historyMatches) {
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
      
      // No context found anywhere - clear selectedMention
      // This prevents context from one chat showing up in another chat
      console.log('ℹ️ No context found for chat:', chat.id, '- clearing selectedMention');
      setSelectedMention(null);
  };

  // CRITICAL: Update chat object when bookmark/document context is selected
  // This ensures the chat type and context are preserved in the chats list
  useEffect(() => {
    if (!selectedChat || !selectedMention) return;
    
    // Only update if we have a bookmark or document context
    if (selectedMention.type === 'bookmark' && selectedMention.data) {
      const bookmarkData = selectedMention.data;
      // Check if chat already has this bookmark context
      if (selectedChat.bookmark_context?.id !== bookmarkData.id || selectedChat.type !== 'bookmark_focused') {
        console.log('🔄 [BOOKMARK] Updating chat with bookmark context:', {
          chatId: selectedChat.id,
          bookmarkName: bookmarkData.name,
          bookmarkId: bookmarkData.id,
          currentType: selectedChat.type,
          currentBookmarkId: selectedChat.bookmark_context?.id
        });
        
        const updatedChat = {
          ...selectedChat,
          type: 'bookmark_focused' as const,
          bookmark_context: bookmarkData,
          title: `Chat about ${bookmarkData.name}`
        };
        
        setSelectedChat(updatedChat);
        
        // Also update the chat in the chats list and persist IMMEDIATELY
        setChats(prev => {
          const updated = prev.map(chat => 
            chat.id === selectedChat.id ? updatedChat : chat
          );
          
          // CRITICAL: Save immediately to AsyncStorage
          console.log('💾 [BOOKMARK] Saving bookmark context to AsyncStorage for chat', selectedChat.id);
          savePersistedChatContexts(updated).then(() => {
            console.log('✅ [BOOKMARK] Successfully saved bookmark context to AsyncStorage');
          }).catch(error => {
            console.error('❌ [BOOKMARK] Failed to save bookmark context:', error);
          });
          
          return updated;
        });
      } else {
        console.log('⏭️ [BOOKMARK] Chat already has bookmark context, skipping update');
      }
    } else if (selectedMention.type === 'file' && selectedMention.data) {
      const fileData = selectedMention.data;
      // Check if chat already has this document context
      if (selectedChat.document_context?.id !== fileData.id || selectedChat.type !== 'document_focused') {
        console.log('🔄 Updating chat with document context:', fileData.name);
        // Use a helper to truncate filename safely (defined later in component)
        const truncateName = (name: string, maxLength: number = 40) => {
          const nameWithoutExt = name.replace(/\.[^/.]+$/, '');
          return nameWithoutExt.length <= maxLength 
            ? nameWithoutExt 
            : nameWithoutExt.substring(0, maxLength - 3) + '...';
        };
        
        const updatedChat = {
          ...selectedChat,
          type: 'document_focused' as const,
          document_context: fileData,
          title: `Document: ${truncateName(fileData.name)}`
        };
        
        setSelectedChat(updatedChat);
        
        // Also update the chat in the chats list and persist
        setChats(prev => {
          const updated = prev.map(chat => 
            chat.id === selectedChat.id ? updatedChat : chat
          );
          savePersistedChatContexts(updated);
          return updated;
        });
      }
    }
  }, [selectedMention, selectedChat?.id]); // Only depend on selectedMention and chat ID

  const selectChat = (chat: Chat) => {
    // Reset going back flag when selecting a chat
    setIsGoingBack(false);
    
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
    
    // CRITICAL: Reset all streaming state when switching chats to ensure messages load correctly
    isStreamingRef.current = false;
    isStreamCompleteRef.current = false;
    lastStreamCompleteTimeRef.current = 0; // Reset completion time so streaming guard doesn't block
    lastStreamedMessageIndexRef.current = null; // Reset last streamed message index
    contentBufferRef.current = '';
    displayedCharsRef.current = 0;
    isPreviewPhaseRef.current = true;
    isFakeStreamingRef.current = false;
    streamingMessageIndexRef.current = null;
    setStreamingMessageIndex(null);
    
    setSendingMessage(false);
    stopBounceAnimation();
    
    // CRITICAL: Clear messages immediately when switching to a different chat
    // This prevents messages from one chat appearing in another
    const previousChatId = selectedChat?.id;
    const newChatId = chat.id;
    if (previousChatId !== newChatId) {
      console.log(`🔄 Switching from chat ${previousChatId} to ${newChatId} - clearing messages and context`);
      setMessages([]); // Clear messages immediately to prevent cross-chat contamination
      loadedChatIdRef.current = null; // Reset loaded chat ID so loadMessages will reload
      // CRITICAL: Clear context when switching to a different chat
      // restoreChatContext will restore the correct context for the new chat
      setSelectedMention(null);
    }
    
    // CRITICAL: Chat Assistant (ID -1) should NEVER have context
    // Always clear context and selectedMention when selecting Chat Assistant
    if (chat.id === -1) {
      console.log('🔵 [SELECT] Selecting Chat Assistant - clearing all context');
      setSelectedMention(null);
      // Ensure Chat Assistant has no context
      const chatAssistantClean: Chat = {
        ...chat,
        document_context: undefined,
        bookmark_context: undefined,
        workspace: undefined,
        type: 'ai_assistant',
        title: chat.title || 'ChatGD Assistant'
      };
      setSelectedChat(chatAssistantClean);
      
      // Also update in chats list to ensure it doesn't have context
      setChats(prev => {
        const updated = prev.map(c => 
          c.id === -1 ? chatAssistantClean : c
        );
        savePersistedChatContexts(updated);
        return updated;
      });
      
      // Load messages for Chat Assistant
      loadMessages(-1, true).then(() => {
        console.log('🔵 [SELECT] Chat Assistant messages loaded');
      }).catch((error: any) => {
        console.error('❌ Error loading Chat Assistant messages:', error);
      });
      
      return; // Early return - don't process Chat Assistant like other chats
    }
    
    // CRITICAL: Ensure chat's document_context, bookmark_context, and type are preserved from chats list
    // This ensures document_focused chats maintain their green icon and context
    const chatWithContext = chats.find(c => c.id === chat.id);
    
    // CRITICAL: Always check if chat has context and preserve it, even if type is wrong
    let chatToSelect: Chat;
    if (chatWithContext && (chatWithContext.document_context || chatWithContext.bookmark_context || chatWithContext.workspace)) {
      // Chat has context in the list - use it
      chatToSelect = {
        ...chat,
        document_context: chatWithContext.document_context || chat.document_context,
        bookmark_context: chatWithContext.bookmark_context || chat.bookmark_context,
        workspace: chatWithContext.workspace || chat.workspace,
        // ALWAYS set type based on context, not what backend says
        type: chatWithContext.bookmark_context ? 'bookmark_focused' :
              chatWithContext.document_context ? 'document_focused' :
              chatWithContext.workspace ? 'workspace' :
              chatWithContext.type === 'bookmark_focused' || chatWithContext.type === 'document_focused' || chatWithContext.type === 'workspace' ? chatWithContext.type :
              chat.type === 'bookmark_focused' || chat.type === 'document_focused' || chat.type === 'workspace' ? chat.type :
              'ai_assistant' // Fallback only if no context
      };
      console.log(`🔍 Selecting chat ${chat.id} with context:`, {
        type: chatToSelect.type,
        hasBookmark: !!chatToSelect.bookmark_context,
        hasDocument: !!chatToSelect.document_context,
        title: chatToSelect.title
      });
    } else if (chat.bookmark_context || chat.document_context || chat.workspace) {
      // Chat object itself has context (from backend or elsewhere) - use it
      chatToSelect = {
        ...chat,
        type: chat.bookmark_context ? 'bookmark_focused' :
              chat.document_context ? 'document_focused' :
              chat.workspace ? 'workspace' :
              chat.type
      };
      console.log(`🔍 Selecting chat ${chat.id} with context from chat object:`, {
        type: chatToSelect.type,
        hasBookmark: !!chatToSelect.bookmark_context,
        hasDocument: !!chatToSelect.document_context
      });
    } else {
      // No context found - use chat as-is
      chatToSelect = chat;
    }
    
    setSelectedChat(chatToSelect);
    // Set ref immediately so loadMessages can use it (state update is async; ref is sync)
    selectedChatRef.current = chatToSelect;
    
    // CRITICAL: Restore context IMMEDIATELY before loading messages
    // This ensures context is set even if loadMessages fails or takes time
    console.log('🔍 [SELECT] Restoring context immediately for chat:', {
      chatId: chatToSelect.id,
      type: chatToSelect.type,
      hasBookmark: !!chatToSelect.bookmark_context,
      bookmarkName: chatToSelect.bookmark_context?.name
    });
    restoreChatContext(chatToSelect);
    
    // Load messages first, then restore context again (persistent_context is loaded with messages)
    loadMessages(chatToSelect.id, true).then(() => { // Force reload when switching chats
      // Restore context again after messages load (in case backend has updated context)
      console.log('🔍 [SELECT] Restoring context after messages loaded');
      restoreChatContext(chatToSelect);
    }).catch((error: any) => {
      console.error('Failed to load messages and restore context:', error);
      // On error, still try to restore from local chat object
      restoreChatContext(chatToSelect);
    });
  };

  const goBackToChats = () => {
    // CRITICAL: Set going back flag FIRST to immediately switch to chat list view
    // This prevents showing chat messages view with null selectedChat (which shows "Chat" in header)
    setIsGoingBack(true);
    
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
    
    // CRITICAL: Reset ALL streaming state when leaving chat
    // This ensures messages reload properly when returning
    isStreamingRef.current = false;
    isStreamCompleteRef.current = false;
    isFakeStreamingRef.current = false;
    lastStreamCompleteTimeRef.current = 0; // Reset completion time so streaming guard doesn't block reload
    lastStreamedMessageIndexRef.current = null;
    contentBufferRef.current = '';
    displayedCharsRef.current = 0;
    isPreviewPhaseRef.current = true;
    streamingMessageIndexRef.current = null;
    setStreamingMessageIndex(null);
    
    setSendingMessage(false);
    stopBounceAnimation();
    
    // CRITICAL: Preserve chat's document_context and type in the chats list before clearing selectedChat
    // This ensures the chat maintains its document_focused type and green icon when selected again
    // ALSO: If chat doesn't exist in list (temporary id -2), add it so it appears when going back
    // IMPORTANT: Chat Assistant (ID -1) should NEVER have context preserved
    if (selectedChat && selectedChat.id !== -1 && (selectedChat.document_context || selectedChat.bookmark_context || selectedChat.workspace)) {
      console.log('🔙 [GOBACK] Going back - preserving context for chat:', {
        chatId: selectedChat.id,
        type: selectedChat.type,
        hasBookmark: !!selectedChat.bookmark_context,
        hasDocument: !!selectedChat.document_context,
        bookmarkName: selectedChat.bookmark_context?.name
      });
      
      // CRITICAL: Set flag to prevent loadChats from overwriting context
      isPreservingContextRef.current = true;
      contextPreservationTimeRef.current = Date.now();
      
      // CRITICAL: Use functional update to ensure we have the latest state
      // Also save to AsyncStorage immediately to prevent race conditions with useFocusEffect
      setChats(prev => {
        const existingChat = prev.find(chat => chat.id === selectedChat.id);
        
        console.log('🔙 [GOBACK] Found existing chat in list:', {
          chatId: selectedChat.id,
          exists: !!existingChat,
          currentType: existingChat?.type,
          currentHasBookmark: !!existingChat?.bookmark_context
        });
        
        let updatedChats: Chat[];
        
        if (existingChat) {
          // Update existing chat - CRITICAL: Always preserve bookmark/document context from selectedChat
          updatedChats = prev.map(chat => {
            if (chat.id === selectedChat.id) {
              // ALWAYS use selectedChat's context and type - it's the most up-to-date
              const updatedChat = {
                ...chat,
                // Preserve context from selectedChat (most recent)
                document_context: selectedChat.document_context || chat.document_context,
                bookmark_context: selectedChat.bookmark_context || chat.bookmark_context,
                workspace: selectedChat.workspace || chat.workspace,
                // ALWAYS use selectedChat's type if it's a context chat, otherwise preserve existing
                type: selectedChat.bookmark_context ? 'bookmark_focused' :
                      selectedChat.document_context ? 'document_focused' :
                      selectedChat.workspace ? 'workspace' :
                      selectedChat.type === 'bookmark_focused' || selectedChat.type === 'document_focused' || selectedChat.type === 'workspace' ? selectedChat.type :
                      chat.type,
                // Preserve title from selectedChat if it's more descriptive
                title: selectedChat.title || chat.title
              };
              
              console.log(`💾 [GOBACK] Preserving context for chat ${chat.id} when going back:`, {
                oldType: chat.type,
                newType: updatedChat.type,
                hasBookmarkContext: !!updatedChat.bookmark_context,
                bookmarkName: updatedChat.bookmark_context?.name,
                hasDocumentContext: !!updatedChat.document_context,
                title: updatedChat.title
              });
              
              return updatedChat;
            }
            return chat;
          });
        } else {
          // Chat doesn't exist in list (temporary id -2 or new chat) - add it
          console.log(`📋 Adding chat ${selectedChat.id} to list (preserving context):`, {
            type: selectedChat.type,
            hasBookmarkContext: !!selectedChat.bookmark_context,
            hasDocumentContext: !!selectedChat.document_context
          });
          
          const chatAssistant = prev.find(chat => chat.id === -1);
          const otherChats = prev.filter(chat => chat.id !== -1);
          
          if (chatAssistant) {
            updatedChats = [chatAssistant, selectedChat, ...otherChats];
          } else {
            updatedChats = [selectedChat, ...prev];
          }
        }
        
        // CRITICAL: Save to AsyncStorage immediately and wait for it to complete
        // This prevents race conditions where useFocusEffect calls loadChats() before save completes
        console.log(`💾 Saving ${updatedChats.length} chats to AsyncStorage, including chat ${selectedChat.id} with bookmark context:`, {
          chatId: selectedChat.id,
          type: updatedChats.find(c => c.id === selectedChat.id)?.type,
          hasBookmark: !!updatedChats.find(c => c.id === selectedChat.id)?.bookmark_context
        });
        
        // CRITICAL: Save to AsyncStorage and keep flag set for 3 seconds
        savePersistedChatContexts(updatedChats).then(() => {
          console.log('✅ Successfully saved chat contexts to AsyncStorage, including bookmark context for chat', selectedChat.id);
          // Keep flag set for 3 seconds to prevent loadChats from overwriting
          setTimeout(() => {
            isPreservingContextRef.current = false;
            console.log('🔓 Context preservation flag cleared');
          }, 3000);
        }).catch(error => {
          console.error('❌ Failed to save chat contexts when going back:', error);
          isPreservingContextRef.current = false;
        });
        
        return updatedChats;
      });
    }
    
    // Clear fileId params to ensure params are cleared (even if it doesn't update immediately)
    router.setParams({});
    
    // CRITICAL: If Chat Assistant had context somehow, clear it before going back
    // This prevents Chat Assistant from inheriting context from previous chats
    if (selectedChat && selectedChat.id === -1 && (selectedChat.bookmark_context || selectedChat.document_context || selectedChat.workspace)) {
      console.log('⚠️ [GOBACK] Chat Assistant had context, clearing it before going back');
      setChats(prev => {
        const updated: Chat[] = prev.map(chat => 
          chat.id === -1 ? {
            ...chat,
            document_context: undefined,
            bookmark_context: undefined,
            workspace: undefined,
            type: 'ai_assistant' as const,
            title: 'ChatGD Assistant'
          } : chat
        );
        savePersistedChatContexts(updated);
        return updated;
      });
    }
    
    setSelectedChat(null);
    setMessages([]);
    loadedChatIdRef.current = null; // Clear loaded chat ID when leaving chat
    
    // CRITICAL: Clear selectedMention if we're leaving Chat Assistant
    // This prevents context from persisting when switching to Chat Assistant
    if (selectedChat && selectedChat.id === -1) {
      console.log('🔵 [GOBACK] Clearing selectedMention when leaving Chat Assistant');
      setSelectedMention(null);
    }
    // For other chats, DO NOT clear selectedMention when going back - context should persist
    // The context will be restored when the chat is selected again via restoreChatContext
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
    const userId = userProfileRef.current?.data?.id || userProfileRef.current?.id;
    if (selectedChat && 
        (selectedChat.type === 'user_direct' || selectedChat.type === 'workspace') && 
        socketRef.current && 
        userId && 
        selectedChat.id != null) {
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Emit typing started
      socketRef.current.emit('user_typing', { 
        chat_id: selectedChat.id,
        user_id: userId,
        is_typing: true
      });
      
      // Auto-stop typing after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        const userIdForTyping = userProfileRef.current?.data?.id || userProfileRef.current?.id;
        if (socketRef.current && 
            selectedChat && 
            userIdForTyping && 
            selectedChat.id != null) {
          socketRef.current.emit('user_typing', { 
            chat_id: selectedChat.id,
            user_id: userIdForTyping,
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
    // User and workspace context are bound to the conversation and cannot be removed
    if (selectedMention?.type === 'user' || selectedMention?.type === 'workspace') {
      return;
    }
    // If this is the chat's built-in context (document/bookmark only; workspace is bound), mark as explicitly removed so we don't restore on reload
    const chatId = selectedChat?.id != null && selectedChat.id !== -1 ? Number(selectedChat.id) : null;
    const isBuiltInContext = selectedChat && selectedMention && (
      (selectedChat.document_context && selectedMention.type === 'file' && selectedMention.id === selectedChat.document_context.id) ||
      (selectedChat.bookmark_context && selectedMention.type === 'bookmark' && selectedMention.id === selectedChat.bookmark_context.id)
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
      case 'user': return '#FF3B30'; // Match user_direct color from getChatTypeInfo
      case 'bookmark': return '#AF52DE'; // Match bookmark_focused color from getChatTypeInfo
      case 'file': return '#34C759'; // Match document_focused color from getChatTypeInfo
      case 'workspace': return '#FF9500'; // Match workspace color from getChatTypeInfo
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
      
      // Check if a chat with the same context already exists (for bookmark/document chats)
      // This prevents creating duplicate chats when user creates the same bookmark/document chat multiple times
      if (newChat.bookmark_context || newChat.document_context) {
        setChats(prev => {
          // Check if a chat with the same bookmark/document context already exists
          const existingContextChat = prev.find(chat => 
            (newChat.bookmark_context && chat.bookmark_context?.id === newChat.bookmark_context.id) ||
            (newChat.document_context && chat.document_context?.id === newChat.document_context.id)
          );
          
          if (existingContextChat) {
            // Chat with same context already exists, select it instead of creating duplicate
            console.log(`⚠️ Chat with same context already exists (${existingContextChat.id}), selecting existing chat`);
            setSelectedChat(existingContextChat);
            setShowNewChatModal(false);
            // Restore context for the existing chat
            restoreChatContext(existingContextChat);
            return prev;
          }
          
          // No existing chat with same context, add new chat
          const chatAssistant = prev.find(chat => chat.id === -1);
          const otherChats = prev.filter(chat => chat.id !== -1);
          
          let updatedChats: Chat[];
          if (chatAssistant) {
            updatedChats = [chatAssistant, newChat, ...otherChats];
          } else {
            updatedChats = [newChat, ...prev];
          }
          
          // Persist chat context immediately for user_direct, workspace, document, and bookmark chats
          savePersistedChatContexts(updatedChats);
          return updatedChats;
        });
      } else {
        // For other chat types, check by ID
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
      }
      setShowNewChatModal(false);
      setSelectedChat(newChat);
      
      // Set selectedMention based on the context type so it appears in the conversation window
      if (newChat.document_context) {
        setSelectedMention({
          type: 'file',
          id: newChat.document_context.id,
          name: newChat.document_context.name,
          data: newChat.document_context
        });
      } else if (newChat.bookmark_context) {
        setSelectedMention({
          type: 'bookmark',
          id: newChat.bookmark_context.id,
          name: newChat.bookmark_context.name,
          data: newChat.bookmark_context
        });
      } else if (newChat.workspace) {
        setSelectedMention({
          type: 'workspace',
          id: newChat.workspace.id,
          name: newChat.workspace.name,
          data: newChat.workspace
        });
      } else if (newChat.type === 'user_direct' && selectedUser) {
        setSelectedMention({
          type: 'user',
          id: selectedUser.id,
          name: selectedUser.username,
          data: selectedUser
        });
      }
      
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
      if (!dateString) {
        return '';
      }
      
      // Dates from backend are stored in UTC
      // Ensure we parse as UTC if no timezone indicator is present
      let date: Date;
      
      // Check if timestamp has timezone indicator
      const hasTimezone = dateString.endsWith('Z') || dateString.match(/[+-]\d{2}:\d{2}$/);
      
      if (!hasTimezone && dateString.includes('T')) {
        // Timestamp is in ISO format but missing timezone - treat as UTC
        // Parse the UTC components explicitly
        const isoString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
        date = new Date(isoString);
      } else if (!hasTimezone) {
        // Not ISO format - try parsing as-is, but log warning
        date = new Date(dateString);
        if (__DEV__) {
          console.warn('⚠️ Timestamp without timezone indicator:', dateString);
        }
      } else {
        // Has timezone indicator - parse normally
        date = new Date(dateString);
      }
      
      if (isNaN(date.getTime())) {
        if (__DEV__) {
          console.log('❌ Failed to parse timestamp:', dateString);
        }
        return 'Invalid Date';
      }
      
      // Format using local time (JavaScript automatically converts UTC to local timezone)
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
      if (!dateString) {
        return 'Unknown';
      }
      
      // Dates from backend are stored in UTC
      // Ensure we parse as UTC if no timezone indicator is present
      let date: Date;
      
      // Check if timestamp has timezone indicator
      const hasTimezone = dateString.endsWith('Z') || dateString.match(/[+-]\d{2}:\d{2}$/);
      
      if (!hasTimezone && dateString.includes('T')) {
        // Timestamp is in ISO format but missing timezone - treat as UTC
        // Parse the UTC components explicitly
        const isoString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
        date = new Date(isoString);
      } else if (!hasTimezone) {
        // Not ISO format - try parsing as-is, but log warning
        date = new Date(dateString);
        if (__DEV__) {
          console.warn('⚠️ Timestamp without timezone indicator:', dateString);
        }
      } else {
        // Has timezone indicator - parse normally
        date = new Date(dateString);
      }
      
      if (isNaN(date.getTime())) {
        if (__DEV__) {
          console.log('❌ Failed to parse chat timestamp:', dateString);
        }
        return 'Unknown';
      }
      
      // Format using local time (JavaScript automatically converts UTC to local timezone)
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
      // Priority 1: Check direct context properties FIRST (most reliable)
      // This ensures we get the right icon even if type wasn't set correctly
      if (item.bookmark_context) {
        return { name: 'bookmark' as const, color: '#AF52DE' };
      }
      if (item.document_context && item.document_context.id) {
        return { name: 'document-text' as const, color: '#34C759' };
      }
      if (item.workspace && item.workspace.id) {
        return { name: 'business' as const, color: '#FF9500' };
      }
      
      // Priority 2: Check chat type (fallback if no direct context)
      switch (item.type) {
        case 'document_focused':
          return { name: 'document-text' as const, color: '#34C759' };
        case 'bookmark_focused':
          return { name: 'bookmark' as const, color: '#AF52DE' };
        case 'workspace':
          return { name: 'business' as const, color: '#FF9500' };
        case 'user_direct':
          return { name: 'person' as const, color: '#FF3B30' };
        case 'ai_assistant':
          // Continue to check chatStore
          break;
        default:
          return { name: 'chatbubble' as const, color: '#007AFF' };
      }
      
      // Priority 3: Check persistent_context and top-level properties from chatStore
      // This handles cases where context exists but isn't set on the chat item
      if (item.id > 0) {
        try {
          const { histories } = useChatStore.getState();
          const chatHistory = histories?.find(h => {
            const historyId = typeof h.id === 'string' ? parseInt(String(h.id), 10) : Number(h.id);
            const targetId = typeof item.id === 'string' ? parseInt(String(item.id), 10) : Number(item.id);
            return !isNaN(historyId) && !isNaN(targetId) && historyId === targetId;
          });
          
          if (chatHistory) {
            const historyData = chatHistory as any;
            const persistentContext = historyData.persistent_context || historyData.persistentContext;
            
            // Check top-level properties first (these are set when chat is created)
            if (historyData.selected_bookmarks?.length > 0) {
              return { name: 'bookmark' as const, color: '#AF52DE' };
            }
            if (historyData.selected_files?.length > 0) {
              return { name: 'document-text' as const, color: '#34C759' };
            }
            if (historyData.selected_workspaces?.length > 0) {
              return { name: 'business' as const, color: '#FF9500' };
            }
            if (historyData.selected_users?.length > 0) {
              return { name: 'person' as const, color: '#FF3B30' };
            }
            
            // Then check persistent_context (this is updated as chat progresses)
            if (persistentContext) {
              // Check for bookmark context
              if (persistentContext.context_bookmark_ids?.length > 0 || persistentContext.selected_bookmarks?.length > 0) {
                return { name: 'bookmark' as const, color: '#AF52DE' };
              }
              // Check for document context
              if (persistentContext.context_file_ids?.length > 0 || persistentContext.selected_files?.length > 0) {
                return { name: 'document-text' as const, color: '#34C759' };
              }
              // Check for workspace context
              if (persistentContext.context_workspace_ids?.length > 0 || persistentContext.selected_workspaces?.length > 0) {
                return { name: 'business' as const, color: '#FF9500' };
              }
              // Check for user context
              if (persistentContext.context_user_ids?.length > 0 || persistentContext.selected_users?.length > 0) {
                return { name: 'person' as const, color: '#FF3B30' };
              }
            }
          }
        } catch (error) {
          // Silently fail if chatStore check fails
        }
      }
      
      // Priority 4: Final fallback - default ai_assistant icon
      return { name: 'chatbubbles' as const, color: '#007AFF' };
    };

    const { name: iconName, color } = getChatIcon();

    // Ensure all text values are properly stringified
    const safeTitle = String(item.title || 'Untitled Chat');
    const safeLastMessage = String(item.last_message || 'No messages');
    const safeUpdatedAt = String(item.updated_at || new Date().toISOString());
    const safeUnreadCount = Number(item.unread_count || 0);
    // Unread badge only for receiver: for user/workspace chats, hide when last message was sent by current user
    const currentUserId = userProfileRef.current?.data?.id ?? userProfileRef.current?.id;
    const isUserOrWorkspaceChat = item.type === 'user_direct' || item.type === 'workspace';
    const lastMessageIsFromMe = item.last_message_sender_id != null && currentUserId != null && item.last_message_sender_id === currentUserId;
    const showUnreadBadge = safeUnreadCount > 0 && (!isUserOrWorkspaceChat || !lastMessageIsFromMe);

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) {
            chatSwipeableRefs.current.set(item.id, ref);
          } else {
            chatSwipeableRefs.current.delete(item.id);
          }
        }}
        renderRightActions={() => renderChatMenuAction(item.id)}
        onSwipeableWillOpen={() => {
          swipingChatId.current = item.id;
          // Close other swipeables when one opens
          chatSwipeableRefs.current.forEach((ref, id) => {
            if (id !== item.id && ref) {
              ref.close();
            }
          });
        }}
        onSwipeableClose={() => {
          // Reset swipe flag immediately when closing
          if (swipingChatId.current === item.id) {
            swipingChatId.current = null;
          }
        }}
        overshootRight={false}
        rightThreshold={40}
        friction={2}
        overshootFriction={8}
        containerStyle={{ backgroundColor: 'transparent' }}
      >
        <View style={{ backgroundColor: colors.card || '#fff', width: '100%' }}>
          <TouchableOpacity 
            style={dynamicStyles.chatItem}
            activeOpacity={0.7}
            onPress={() => {
              // Don't open chat if we just swiped this specific chat
              if (swipingChatId.current !== item.id) {
                selectChat(item);
              }
            }}
          >
          <View style={[dynamicStyles.chatAvatar, { backgroundColor: `${color}20` }]}>
            <Ionicons name={iconName} size={24} color={color} />
          </View>
          <View style={dynamicStyles.chatContent}>
            <View style={dynamicStyles.chatItemHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={dynamicStyles.chatTitle} numberOfLines={1} ellipsizeMode="tail">
                  {safeTitle}
                </Text>
                {favoriteChatIds.has(item.id) && (
                  <Ionicons name="star" size={16} color="#FFD700" style={{ marginLeft: 6 }} />
                )}
              </View>
              <Text style={dynamicStyles.chatTime}>
                {formatChatTime(safeUpdatedAt)}
              </Text>
            </View>
            <View style={dynamicStyles.chatFooter}>
              <Text style={dynamicStyles.lastMessage} numberOfLines={2}>
                {safeLastMessage}
              </Text>
              {showUnreadBadge && (
                <View style={dynamicStyles.unreadBadge}>
                  <Text style={dynamicStyles.unreadText}>
                    {String(safeUnreadCount)}
                  </Text>
                </View>
              )}
            </View>
          </View>
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };

  // Helper function to render message content with proper list formatting
  const renderMessageContent = (content: string, isOwnMessage: boolean, isPreview?: boolean) => {
    // Simple rendering - just display text as-is without complex parsing
    if (!content || content.trim().length === 0) {
      return null;
    }
    
    return (
      <Text 
        style={[
          dynamicStyles.messageText,
          isOwnMessage ? dynamicStyles.ownMessageText : dynamicStyles.otherMessageText,
          isPreview && dynamicStyles.previewMessageText
        ]}
      >
        {content}
      </Text>
    );
  };

  // Delete chat handler
  const handleDeleteChat = async (chatId: number) => {
    Alert.alert(
      'Delete Chat',
      'Are you sure you want to delete this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Don't allow deleting the default ChatGD Assistant chat
              if (chatId === -1) {
                Alert.alert('Error', 'Cannot delete the ChatGD Assistant chat');
                return;
              }
              
              // Use chatStore to delete
              const success = await useChatStore.getState().deleteChatHistory(chatId);
              
              if (success) {
                // Remove from local chats list
                setChats(prev => prev.filter(chat => chat.id !== chatId));
                
                // If this was the selected chat, clear selection
                if (selectedChat?.id === chatId) {
                  setSelectedChat(null);
                  setMessages([]);
                }
                
                // Close any open swipeables
                chatSwipeableRefs.current.forEach(ref => {
                  if (ref) {
                    ref.close();
                  }
                });
              } else {
                Alert.alert('Error', 'Failed to delete chat');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete chat');
            }
          }
        }
      ]
    );
  };

  // Handle add/remove favorite
  const handleToggleFavorite = async (chatId: number) => {
    try {
      const isFavorite = favoriteChatIds.has(chatId);
      const newFavorites = new Set(favoriteChatIds);
      
      if (isFavorite) {
        newFavorites.delete(chatId);
        await AsyncStorage.setItem(FAVORITE_CHATS_KEY, JSON.stringify(Array.from(newFavorites)));
        setFavoriteChatIds(newFavorites);
      } else {
        newFavorites.add(chatId);
        await AsyncStorage.setItem(FAVORITE_CHATS_KEY, JSON.stringify(Array.from(newFavorites)));
        setFavoriteChatIds(newFavorites);
      }
      
      setMenuChatId(null);
      // Close swipeable
      const swipeableRef = chatSwipeableRefs.current.get(chatId);
      if (swipeableRef) {
        swipeableRef.close();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update favorite');
    }
  };

  // Render menu action for chat swipeable
  const renderChatMenuAction = (chatId: number) => {
    return (
      <View style={dynamicStyles.menuActionContainer}>
        <RectButton
          style={dynamicStyles.menuActionButton}
          onPress={() => {
            setMenuChatId(chatId);
          }}
        >
          <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
          <Text style={dynamicStyles.menuActionText}>More</Text>
        </RectButton>
      </View>
    );
  };

  const renderMessageItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    // Determine if assistant responses should use bubbles based on chat type
    // User messages always have bubbles, but assistant responses don't need bubbles in document/bookmark chats
    const isDocumentOrBookmarkChat = selectedChat && (
      selectedChat.type === 'document_focused' || 
      selectedChat.type === 'bookmark_focused' ||
      selectedChat.type === 'ai_assistant'
    );
    // For user/workspace chats: derive from sender_id vs current user so alignment is correct even before profile loads
    const currentUserId = currentUserIdRef.current;
    const isOwnMessage = isDocumentOrBookmarkChat
      ? item.is_own_message
      : (currentUserId != null && item.sender_id != null)
        ? String(item.sender_id) === String(currentUserId)
        : item.is_own_message;

    // User messages always have bubbles (right); others on left
    if (isOwnMessage) {
      return (
        <View style={[
          dynamicStyles.messageContainer,
          dynamicStyles.ownMessage
        ]}>
          <View style={[
            dynamicStyles.messageBubble,
            dynamicStyles.ownBubble
          ]}>
            {renderMessageContent(item.content, true, item.is_preview)}
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
      // Other person's messages (left side): no bubbles for document/bookmark/ai_assistant, bubbles for user/workspace
      const hasContent = item.content && item.content.trim().length > 0;
      // Check if this is the message being streamed by finding its index in the messages array
      const currentMessageIndex = messages.findIndex(m => m.id === item.id);
      // Use ref for immediate check, fallback to state for re-renders
      const streamingIndex = streamingMessageIndexRef.current !== null ? streamingMessageIndexRef.current : streamingMessageIndex;
      const isStreamingThisMessage = streamingIndex !== null && currentMessageIndex === streamingIndex;
      // Fake streaming is active only if: sending is active, this is the streaming message, and fake streaming ref is true
      const isFakeStreamingActive = sendingMessage && isStreamingThisMessage && isFakeStreamingRef.current;
      // Real streaming is active if this message is being streamed and streaming ref is true
      const isRealStreamingActive = isStreamingThisMessage && isStreamingRef.current;
      // Hide time during fake or real streaming
      const isStreamingActive = isFakeStreamingActive || isRealStreamingActive;
      
      if (isDocumentOrBookmarkChat) {
        // No bubbles (ChatGPT style). Fake streaming runs IN THIS SAME SLOT (above the time), then preview/refinement replace it.
        // Footer (copy, thumbs, timestamp) shows only after streaming is done, below the response.
        const messagePairIndex = Math.floor(index / 2);
        const queryText = index > 0 ? messages[index - 1]?.content : undefined;
        const showFooter = hasContent && !isStreamingActive && !item.is_preview;
        return (
          <View style={[
            dynamicStyles.messageContainerNoBubble,
            dynamicStyles.otherMessageNoBubble
          ]}>
            <View style={{ flexDirection: 'column', width: '100%' }}>
              {(isFakeStreamingActive && !hasContent)
                ? (
                    <ProcessingMessageDisplay
                      isProcessing={true}
                      hasRealData={!!item.content}
                      processingType="general"
                      onComplete={() => {}}
                    />
                  )
                : hasContent
                  ? renderMessageContent(item.content, false, item.is_preview)
                  : null}
              {showFooter && (
                <ChatMessageFooter
                  chatHistoryId={selectedChat?.id}
                  messagePairIndex={messagePairIndex}
                  queryText={queryText}
                  responseText={item.content}
                  createdAt={item.created_at}
                  citations={item.citations}
                  showActions={true}
                />
              )}
            </View>
          </View>
        );
      } else {
        // User/workspace: we never add an empty assistant message, but guard anyway.
        // Footer shows only after streaming is done, below the bubble. No copy/like/dislike/citation for user/workspace.
        if (!hasContent) return null;
        const messagePairIndex = Math.floor(index / 2);
        const queryText = index > 0 ? messages[index - 1]?.content : undefined;
        const showFooter = !isStreamingActive && !item.is_preview;
        return (
          <View style={[
            dynamicStyles.messageContainer,
            dynamicStyles.otherMessage
          ]}>
            <View style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <View style={[
                dynamicStyles.messageBubble,
                dynamicStyles.otherBubble
              ]}>
                {renderMessageContent(item.content, false, item.is_preview)}
              </View>
              {showFooter && (
                <ChatMessageFooter
                  chatHistoryId={selectedChat?.id}
                  messagePairIndex={messagePairIndex}
                  queryText={queryText}
                  responseText={item.content}
                  createdAt={item.created_at}
                  citations={item.citations}
                  showActions={false}
                />
              )}
            </View>
          </View>
        );
      }
    }
  };

  const renderChatsList = () => {
    return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <TapToToggleHeaderView style={dynamicStyles.container}>
      <AnimatedHeaderContainer>
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
                size={26} 
                color={refreshing ? "#999" : "#007AFF"} 
              />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.newChatButton} onPress={() => setShowNewChatModal(true)}>
              <Ionicons name="add" size={26} color="#007AFF" />
            </TouchableOpacity>
          </View>
        </View>
      </AnimatedHeaderContainer>

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
      </TapToToggleHeaderView>
    </SafeAreaView>
    );
  };

  const renderChatMessages = () => (
    <SafeAreaView style={dynamicStyles.container} edges={['top', 'bottom']}>
      <TapToToggleHeaderView style={dynamicStyles.container}>
      {/* Chat Header */}
      <AnimatedHeaderContainer height={64}>
        <View style={dynamicStyles.chatHeader}>
        <TouchableOpacity 
          style={dynamicStyles.backButton} 
          onPress={() => {
            // Go back to chat list, or previous screen if no chat selected
            if (selectedChat) {
              // Use goBackToChats to properly handle cleanup without clearing context
              goBackToChats();
            } else {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        
        <View style={dynamicStyles.chatHeaderInfo}>
          <Text style={dynamicStyles.chatTitle} numberOfLines={1} ellipsizeMode="tail">
            {(() => {
              // CRITICAL: Always use document_context/bookmark_context name if available
              // This ensures the title doesn't change when chat is refreshed or reloaded
              if (selectedChat?.document_context?.name) {
                return `Document: ${truncateFilename(selectedChat.document_context.name)}`;
              }
              if (selectedChat?.bookmark_context?.name) {
                return `Bookmark: ${selectedChat.bookmark_context.name}`;
              }
              if (selectedChat?.workspace?.name) {
                return selectedChat.workspace.name;
              }
              // Fallback to title property
              return selectedChat?.title || 'Chat';
            })()}
          </Text>
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
              size={26} 
              color={refreshing || !selectedChat ? "#999" : "#007AFF"} 
            />
          </TouchableOpacity>
          {/* + opens same chat types as listing page (New Chat modal) */}
          <TouchableOpacity 
            style={dynamicStyles.searchTypeButton} 
            onPress={() => setShowNewChatModal(true)}
          >
            <Ionicons name="add" size={26} color="#007AFF" />
          </TouchableOpacity>
          {/* Search Type Menu for AI Assistant */}
          {selectedChat?.type === 'ai_assistant' && (
            <TouchableOpacity 
              style={dynamicStyles.searchTypeButton} 
              onPress={handleSearchTypeMenuPress}
            >
              <Ionicons name="ellipsis-vertical" size={26} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      </AnimatedHeaderContainer>

      <KeyboardAvoidingView 
        style={dynamicStyles.chatContainer}
        behavior={undefined}
        keyboardVerticalOffset={0}
      >
        {messagesLoading ? (
          <View style={dynamicStyles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={dynamicStyles.loadingText}>Loading messages...</Text>
          </View>
        ) : (
          <>
            <SectionList
              ref={messagesRef}
              sections={messageSections}
              renderItem={({ item, index }) => renderMessageItem({ item, index })}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              renderSectionHeader={({ section: { title } }) => (
                <View style={dynamicStyles.messageDateSectionHeader}>
                  <Text style={dynamicStyles.messageDateSectionHeaderText}>{title}</Text>
                </View>
              )}
              stickySectionHeadersEnabled={false}
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
              onScrollToIndexFailed={() => {}}
              onContentSizeChange={() => {
                const list = messagesRef.current;
                if (!list || !messageSections.length) return;
                const lastSection = messageSections[messageSections.length - 1];
                if (!lastSection.data.length) return;
                list.scrollToLocation({
                  sectionIndex: messageSections.length - 1,
                  itemIndex: lastSection.data.length - 1,
                  viewPosition: 1,
                  animated: true,
                });
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onTouchStart={() => setShowQuickChatTypes(false)}
              scrollEnabled={true}
              nestedScrollEnabled={true}
              removeClippedSubviews={false}
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
              {/* User and workspace context are bound to the conversation and cannot be removed */}
              {(selectedMention.type !== 'user' && selectedMention.type !== 'workspace') ? (
                <TouchableOpacity 
                  onPress={(e) => {
                    e.stopPropagation();
                    removeMention();
                  }} 
                  style={dynamicStyles.removeMentionButton}
                >
                  <Ionicons name="close" size={16} color="#666" />
                </TouchableOpacity>
              ) : null}
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
          style={[
            dynamicStyles.inputContainer,
            {
              paddingBottom: 8,
              marginBottom: keyboardTop != null
                ? Math.max(0, Dimensions.get('window').height - insets.bottom - keyboardTop)
                : 0,
            },
          ]}
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
                (!newMessage.trim() && !sendingMessage) && { opacity: 0.5 }
              ]}
              onPress={sendingMessage ? stopProcessing : sendMessage}
              disabled={!newMessage.trim() && !sendingMessage}
            >
              {sendingMessage ? (
                <Ionicons name="close" size={20} color="#fff" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      </TapToToggleHeaderView>
    </SafeAreaView>
  );

  // New Chat Modal Component
  const renderNewChatModal = () => (
    <Modal
      visible={showNewChatModal}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
    >
      <View style={[dynamicStyles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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
                {usersLoading ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: '#666', fontStyle: 'italic', textAlign: 'center' }}>
                      Loading users...
                    </Text>
                  </View>
                ) : modalFilteredUsers.length === 0 ? (
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
      </View>
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
      padding: 10,
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
    chatListSectionHeader: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      paddingTop: 16,
      backgroundColor: colors.background,
    },
    chatListSectionHeaderText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary || '#666',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    messageDateSectionHeader: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    messageDateSectionHeaderText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary || '#666',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    chatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card || '#fff',
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
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
      minHeight: 64,
    },
    backButton: {
      padding: 6,
      marginRight: 6,
    },
    chatHeaderInfo: {
      flex: 1,
      justifyContent: 'center',
      minWidth: 0,
    },
    chatSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    searchTypeButton: {
      padding: 8,
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
      width: '100%',
      flexDirection: 'row',
    },
    messageContainerNoBubble: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      maxWidth: '100%',
      flexShrink: 1,
      flexDirection: 'row',
    },
    ownMessage: {
      justifyContent: 'flex-end',
    },
    otherMessage: {
      justifyContent: 'flex-start',
    },
    ownMessageNoBubble: {
      justifyContent: 'flex-end',
      paddingLeft: 60,
    },
    otherMessageNoBubble: {
      justifyContent: 'flex-start',
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
    previewMessageText: {
      color: '#9ca3af', // Lighter grey to indicate preview / not final response
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
  menuActionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  menuActionButton: {
    backgroundColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 4,
  },
  menuActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  chatMenuModal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  chatMenuContent: {
    backgroundColor: colors.card || '#fff',
    borderRadius: 12,
    padding: 8,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  chatMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  chatMenuItemText: {
    fontSize: 16,
    color: colors.text || '#000',
    marginLeft: 12,
  },
  chatMenuItemDanger: {
    color: '#FF3B30',
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
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
  // Render chat menu modal
  const renderChatMenuModal = () => {
    if (!menuChatId) return null;
    
    return (
      <Modal
        visible={menuChatId !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuChatId(null)}
      >
        <TouchableOpacity
          style={dynamicStyles.chatMenuModal}
          activeOpacity={1}
          onPress={() => setMenuChatId(null)}
        >
          <View style={dynamicStyles.chatMenuContent} onStartShouldSetResponder={() => true}>
            <TouchableOpacity
              style={dynamicStyles.chatMenuItem}
              onPress={() => {
                handleToggleFavorite(menuChatId);
              }}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={favoriteChatIds.has(menuChatId) ? "star" : "star-outline"} 
                size={20} 
                color={favoriteChatIds.has(menuChatId) ? "#FFD700" : "#007AFF"} 
              />
              <Text style={dynamicStyles.chatMenuItemText}>
                {favoriteChatIds.has(menuChatId) ? "Remove from Favorite" : "Add to Favorite"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={dynamicStyles.chatMenuItem}
              onPress={() => {
                setMenuChatId(null);
                // Close swipeable first
                const swipeableRef = chatSwipeableRefs.current.get(menuChatId);
                if (swipeableRef) {
                  swipeableRef.close();
                }
                // Then show delete confirmation
                setTimeout(() => {
                  handleDeleteChat(menuChatId);
                }, 300);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              <Text style={[dynamicStyles.chatMenuItemText, dynamicStyles.chatMenuItemDanger]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  // If fileId param is present, show chat messages view immediately (will be set by useEffect)
  // This prevents showing the chat list first when navigating from files screen
  // BUT: If user is going back, always show chat list (even if params haven't updated yet)
  const hasFileIdParam = !!params.fileId;
  const shouldShowChatMessages = !isGoingBack && (selectedChat || hasFileIdParam);
  
  return (
    <>
      {shouldShowChatMessages ? renderChatMessages() : renderChatsList()}
      {renderNewChatModal()}
      {renderChatMenuModal()}
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
    padding: 10,
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
  chatListSectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 16,
    backgroundColor: '#f8f9fa',
  },
  chatListSectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageDateSectionHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  messageDateSectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
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
    minHeight: 64,
  },
  backButton: {
    padding: 6,
    marginRight: 6,
  },
  chatHeaderInfo: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  chatHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  chatSubtitle: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  searchTypeButton: {
    padding: 8,
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
    flexDirection: 'row',
  },
  ownMessage: {
    justifyContent: 'flex-end',
  },
  otherMessage: {
    justifyContent: 'flex-start',
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
  previewMessageText: {
    color: '#9ca3af', // Lighter grey to indicate preview / not final response
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