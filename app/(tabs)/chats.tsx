import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
  
  const [chats, setChats] = useState<Chat[]>([DEFAULT_CHAT_ASSISTANT]); // Initialize with Chat Assistant
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  
  // Streaming state for fake character-by-character animation
  const [streamingMessageIndex, setStreamingMessageIndex] = useState<number | null>(null);
  const streamingIntervalRef = useRef<number | null>(null);
  const contentBufferRef = useRef<string>('');
  const displayedCharsRef = useRef<number>(0);
  const isPreviewPhaseRef = useRef<boolean>(true);
  const isStreamingRef = useRef<boolean>(false);
  

  
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
  const [textInputHeight, setTextInputHeight] = useState(20);
  
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
              id: 1,
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
            id: 1,
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
      // Refresh chat list when screen comes into focus
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

  // Filter data based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      // Sort chats by date (most recent first) but keep Chat Assistant at the top
      const validChats = chats.filter(chat => chat && typeof chat === 'object');
      
      // Separate Chat Assistant from other chats
      const chatAssistant = validChats.find(chat => chat.id === -1);
      const otherChats = validChats.filter(chat => chat.id !== -1);
      
      // Sort other chats by date (most recent first)
      const sortedOtherChats = [...otherChats].sort((a, b) => {
        const aDate = new Date(a.updated_at || new Date()).getTime();
        const bDate = new Date(b.updated_at || new Date()).getTime();
        return bDate - aDate;
      });
      
      // Always put Chat Assistant first, then other chats
      const finalChats = chatAssistant ? [chatAssistant, ...sortedOtherChats] : [DEFAULT_CHAT_ASSISTANT, ...sortedOtherChats];
      
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
      
      // Separate Chat Assistant from filtered chats
      const chatAssistant = filteredChatsList.find(chat => chat.id === -1);
      const otherFilteredChats = filteredChatsList.filter(chat => chat.id !== -1);
      
      // Sort other filtered chats by date (most recent first)
      const sortedOtherFilteredChats = [...otherFilteredChats].sort((a, b) => {
        const aDate = new Date(a.updated_at || new Date()).getTime();
        const bDate = new Date(b.updated_at || new Date()).getTime();
        return bDate - aDate;
      });
      
      // Always put Chat Assistant first, then other filtered chats
      const finalFilteredChats = chatAssistant ? [chatAssistant, ...sortedOtherFilteredChats] : [DEFAULT_CHAT_ASSISTANT, ...sortedOtherFilteredChats];
      
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

  const loadChats = async () => {
    try {
      setLoading(true);
      
      // Try to load chat histories from backend
      const { fetchChatHistories } = useChatStore.getState();
      await fetchChatHistories();
      
      // Get the loaded histories from the store
      const { histories, error } = useChatStore.getState();
      
      if (error) {
        console.error('Chat store error:', error);
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
      
      // Sort chats by updated_at date (most recent first), but keep Chat Assistant at top
      const sortedChats = convertedChats.sort((a, b) => {
        const dateA = new Date(a.updated_at).getTime();
        const dateB = new Date(b.updated_at).getTime();
        return dateB - dateA; // Most recent first
      });
      
      // Always put default Chat Assistant first, followed by other chats sorted by date
      const allChats = [DEFAULT_CHAT_ASSISTANT, ...sortedChats];
      
      // console.log('📱 Loaded chats:', {
      //   total: allChats.length,
      //   defaultChat: DEFAULT_CHAT_ASSISTANT,
      //   otherChats: sortedChats.length,
      //   chatIds: sortedChats.map(c => c.id),
      //   chatTitles: sortedChats.map(c => c.title),
      //   chatTypes: allChats.slice(0, 5).map(c => ({ id: c.id, type: c.type, title: c.title }))
      // });
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
      const response = await (api as any).getWorkspaceUsers();
      if (response.success && response.data) {
        setUsers(response.data.users || []);
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
      const response = await (api as any).getBookmarks();
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
    } catch (error) {
      console.log('Failed to load bookmarks:', error);
      setBookmarks([]);
    }
  };

  const loadMessages = async (chatId: number) => {
    try {
      setMessagesLoading(true);
      
      // If it's the Chat Assistant (id: -1), show welcome message
      if (chatId === -1) {
        const welcomeMessage: ChatMessage = {
          id: 1,
          content: 'Hello! I\'m your Chat Assistant. I can help you with questions about your documents, analyze files, and provide insights. How can I help you today?',
          sender: { id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' },
          is_own_message: false,
          created_at: new Date().toISOString(), // This is fine for Chat Assistant as it's always current
        };
        setMessages([welcomeMessage]);
        return;
      }
      
      // Use the chat store to load the specific conversation
      // console.log('🔄 Loading messages for chat ID:', chatId);
      const { fetchChatConversation } = useChatStore.getState();
      await fetchChatConversation(chatId);
      
      // Get the current history from the store
      const { currentHistory } = useChatStore.getState();
      console.log('📋 Current history from store:', currentHistory);
      
      if (currentHistory && currentHistory.messages.length > 0) {
        // Convert chat store messages to the expected format
        const convertedMessages: ChatMessage[] = currentHistory.messages.map((msg, index) => {
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
          
          // Generate unique ID for messages (backend messages don't have IDs)
          const messageId = Date.now() + index + Math.random() * 1000;
          
          return {
            id: Math.floor(messageId), // Ensure it's an integer
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
    } catch (error) {
      console.error('Failed to load messages:', error);
      
      // Show error message
      const errorMessage: ChatMessage = {
        id: 1,
        content: 'Hello! I\'m your Chat Assistant. How can I help you today?',
        sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
        is_own_message: false,
        created_at: new Date().toISOString(), // This is fine for error messages as they're current
      };
      setMessages([errorMessage]);
    } finally {
      setMessagesLoading(false);
    }
  };

  // Helper function to start/continue character streaming
  const startOrContinueStreaming = (assistantMsgIndex: number) => {
    console.log('🎬 startOrContinueStreaming called, isStreaming:', isStreamingRef.current, 'contentBuffer length:', contentBufferRef.current.length);
    
    // If already streaming, just return (the interval will pick up new content)
    if (isStreamingRef.current) {
      console.log('📝 Streaming already active, new content will be picked up automatically');
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
        // No more content available yet, keep waiting
        console.log(`⏸️ Caught up: displayed ${displayedCharsRef.current}/${contentBufferRef.current.length} chars, waiting for more...`);
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
            id: Date.now() + 1,
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
    }, 5); // Fixed interval - speed is controlled by charsPerInterval
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
            id: Date.now() + 1,
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

    try {
      setSendingMessage(true);
      startBounceAnimation();
      
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();
      
      // Add user message immediately for better UX
      const userMessage: ChatMessage = {
        id: Date.now(),
        content: newMessage.trim(),
        sender: null,
        is_own_message: true,
        created_at: new Date().toISOString(),
      };
      
      // Save message text before clearing
      const messageText = newMessage.trim();
      setMessages(prev => [...prev, userMessage]);
      setNewMessage('');

      // Don't add placeholder message - the processing message will be handled by the FlatList data prop
      const assistantMessageIndex = messages.length; // Index of assistant message (no placeholder added)
      
      // Reset streaming state
      contentBufferRef.current = '';
      displayedCharsRef.current = 0;
      isPreviewPhaseRef.current = true;
      isStreamingRef.current = false;

      // For AI assistant chats, use streaming
      if (selectedChat.type === 'ai_assistant' || selectedChat.type === 'document_focused' || selectedChat.type === 'bookmark_focused') {
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
        let streamFilters = {};
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
                // Create assistant message if it doesn't exist, or update if it does
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages[assistantMessageIndex]) {
                    // Update existing message
                    newMessages[assistantMessageIndex] = {
                      ...newMessages[assistantMessageIndex],
                      content: data.message || '...'
                    };
                  } else {
                    // Create new assistant message
                    const assistantMessage: ChatMessage = {
                      id: Date.now() + 1,
                      content: data.message || '...',
                      sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
                      is_own_message: false,
                      created_at: new Date().toISOString()
                    };
                    newMessages.push(assistantMessage);
                  }
                  return newMessages;
                });
                break;

              case 'instant_preview':
                // Instant preview received - start streaming immediately
                const instantContent = data.content || '';
                console.log('⚡ INSTANT preview received:', instantContent.substring(0, 50));
                
                // Set content buffer and start streaming
                contentBufferRef.current = instantContent;
                displayedCharsRef.current = 0;
                isPreviewPhaseRef.current = true;
                
                // Display first chunk immediately
                const initialCharsToShow = Math.min(20, instantContent.length);
                const initialContent = instantContent.slice(0, initialCharsToShow);
                displayedCharsRef.current = initialCharsToShow;
                
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages[assistantMessageIndex]) {
                    newMessages[assistantMessageIndex] = {
                      ...newMessages[assistantMessageIndex],
                      content: initialContent
                    };
                  } else {
                    // Create new assistant message
                    const assistantMessage: ChatMessage = {
                      id: Date.now() + 1,
                      content: initialContent,
                      sender: { id: 1, username: 'Chat Assistant', email: 'ai@grabdocs.com' },
                      is_own_message: false,
                      created_at: new Date().toISOString()
                    };
                    newMessages.push(assistantMessage);
                  }
                  return newMessages;
                });
                
                // Start streaming remaining content
                startOrContinueStreaming(assistantMessageIndex);
                break;

              case 'fallback_response':
                // Handle non-streaming response
                console.log('📝 Received fallback response:', data.content);
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages[assistantMessageIndex]) {
                    newMessages[assistantMessageIndex] = {
                      ...newMessages[assistantMessageIndex],
                      content: data.content
                    };
                  }
                  return newMessages;
                });
                break;

              case 'error':
                // Handle streaming errors gracefully with user-friendly messages
                console.error('❌ Streaming error:', data.error);
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages[assistantMessageIndex]) {
                    newMessages[assistantMessageIndex] = {
                      ...newMessages[assistantMessageIndex],
                      content: data.content || 'Sorry, there was an error processing your request. Please try again.'
                    };
                  }
                  return newMessages;
                });
                break;

              case 'chunk':
              case 'preview_chunk':
                // Template preview chunk
                const previewChunkContent = data.content || '';
                console.log('📦 Template preview chunk received');
                
                // Check if first chunk or append
                if (data.chunk_index === 0 || contentBufferRef.current.includes('Searching')) {
                  // First chunk - replace instant preview
                  contentBufferRef.current = previewChunkContent;
                  displayedCharsRef.current = 0;
                } else {
                  // Subsequent chunks - append
                  contentBufferRef.current += previewChunkContent;
                }
                
                // Start streaming if not already started
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
      } else if (selectedChat.type === 'workspace') {
        // Send to workspace endpoint (non-streaming)
        const response = await (api as any).sendChatMessageToChat(messageText, selectedChat.workspace?.id);
        
        if (response.success && (response.response || response.data?.response)) {
          const responseText = response.response || response.data?.response || 'No response received';
          
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[assistantMessageIndex] = {
              ...newMessages[assistantMessageIndex],
              content: responseText
            };
            return newMessages;
          });
        }
      } else if (selectedChat.type === 'user_direct') {
        // Send direct message (non-streaming)
        const response = await (api as any).sendChatMessageToChat(messageText, selectedChat.id);
        
        if (response.success && (response.response || response.data?.response)) {
          const responseText = response.response || response.data?.response || 'No response received';
          
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[assistantMessageIndex] = {
              ...newMessages[assistantMessageIndex],
              content: responseText
            };
            return newMessages;
          });
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
              content: responseText
            };
            return newMessages;
          });
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request was aborted');
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
      
      // Start fake streaming with fallback content
      contentBufferRef.current = fallbackResponse;
      displayedCharsRef.current = 0;
      isPreviewPhaseRef.current = true;
      isStreamingRef.current = true;
      
      // Start the streaming animation
      startOrContinueStreaming(messages.length);
      
      // Stop streaming after content is fully displayed
      setTimeout(() => {
        stopStreaming(messages.length, true);
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
    setChats(prev => {
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
          newChat = {
            id: Date.now(),
            title: `${selectedWorkspace.name} Team Chat`,
            type: 'workspace',
            participants: [], // Will be populated with workspace members
            last_message: 'Start a team conversation',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            unread_count: 0,
            workspace: selectedWorkspace
          };
          break;
          
        case 'user_direct':
          if (!selectedUser) {
            Alert.alert('Error', 'Please select a user to message');
            return;
          }
          newChat = {
            id: Date.now(),
            title: `Chat with ${selectedUser.username}`,
            type: 'user_direct',
            participants: [selectedUser],
            last_message: 'Start a conversation',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            unread_count: 0
          };
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
      
      setChats(prev => [newChat, ...prev]);
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
      // Handle different timestamp formats from backend
      let timestamp = dateString;
      
      // Debug: Log the original timestamp
      if (__DEV__) {
        // console.log('🕐 Formatting message time:', { original: dateString, type: typeof dateString });
      }
      
      // If timestamp doesn't have timezone info, treat as local time
      if (timestamp && !timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
        // Don't add Z - treat as local time to avoid timezone conversion issues
        // The backend timestamps might already be in local time
      }
      
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        // Fallback: try parsing as ISO string without timezone
        const fallbackDate = new Date(dateString);
        if (isNaN(fallbackDate.getTime())) {
          if (__DEV__) {
            console.log('❌ Failed to parse timestamp:', dateString);
          }
          return 'Invalid Date';
        }
        return fallbackDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      
      // Debug: Log the parsed date
      if (__DEV__) {
        // console.log('🕐 Parsed message date:', {
        //   original: dateString,
        //   parsed: date.toISOString(),
        //   local: date.toLocaleString(),
        //   formatted: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        // });
      }
      
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
      // Handle different timestamp formats from backend
      let timestamp = dateString;
      
      // Debug: Log the original timestamp
      if (__DEV__) {
        // console.log('🕐 Formatting chat time:', { original: dateString, type: typeof dateString });
      }
      
      // If timestamp doesn't have timezone info, treat as local time
      if (timestamp && !timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
        // Don't add Z - treat as local time to avoid timezone conversion issues
        // The backend timestamps might already be in local time
      }
      
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        // Fallback: try parsing as ISO string without timezone
        const fallbackDate = new Date(dateString);
        if (isNaN(fallbackDate.getTime())) {
          if (__DEV__) {
            console.log('❌ Failed to parse chat timestamp:', dateString);
          }
          return 'Unknown';
        }
        return formatRelativeDate(fallbackDate);
      }
      
      // Debug: Log the parsed date
      if (__DEV__) {
        // console.log('🕐 Parsed chat date:', {
        //   original: dateString,
        //   parsed: date.toISOString(),
        //   local: date.toLocaleString()
        // });
      }
      
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
    
    // Debug: Log the dates being compared
    if (__DEV__) {
      // console.log('🕐 Comparing dates:', {
      //   now: now.toISOString(),
      //   date: date.toISOString(),
      //   nowLocal: now.toLocaleString(),
      //   dateLocal: date.toLocaleString()
      // });
    }
    
    // Check if the date is in the future (which would indicate a timezone issue)
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    // If the date is in the future, it might be a timezone issue
    if (diffInMinutes < 0) {
      if (__DEV__) {
        console.log('⚠️ Date is in the future, possible timezone issue:', {
          date: date.toISOString(),
          diffInMinutes: diffInMinutes
        });
      }
      // For future dates, show the actual date instead of relative time
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
      <TouchableOpacity style={styles.chatItem} onPress={() => selectChat(item)}>
        <View style={[styles.chatAvatar, { backgroundColor: `${color}20` }]}>
          <Ionicons name={iconName} size={24} color={color} />
        </View>
        <View style={styles.chatContent}>
          <View style={styles.chatItemHeader}>
            <Text style={styles.chatTitle} numberOfLines={1}>
              {safeTitle}
            </Text>
            <Text style={styles.chatTime}>
              {formatChatTime(safeUpdatedAt)}
            </Text>
          </View>
          <View style={styles.chatFooter}>
            <Text style={styles.lastMessage} numberOfLines={2}>
              {safeLastMessage}
            </Text>
            {safeUnreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {String(safeUnreadCount)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    // Handle processing message (negative ID indicates processing)
    if (item.id === -1) {
      return (
        <View style={[
          styles.messageContainer,
          styles.otherMessage
        ]}>
          <View style={[
            styles.messageBubble,
            styles.otherBubble
          ]}>
            <ProcessingMessageDisplay
              isProcessing={true}
              hasRealData={false}
              processingType="general"
              onComplete={() => {}}
            />
            <Text style={[
              styles.messageTime,
              styles.otherMessageTime
            ]}>
              {formatMessageTime(item.created_at)}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[
        styles.messageContainer,
        item.is_own_message ? styles.ownMessage : styles.otherMessage
      ]}>
        <View style={[
          styles.messageBubble,
          item.is_own_message ? styles.ownBubble : styles.otherBubble
        ]}>
          <Text style={[
            styles.messageText,
            item.is_own_message ? styles.ownMessageText : styles.otherMessageText
          ]}>
            {item.content}
          </Text>
          <Text style={[
            styles.messageTime,
            item.is_own_message ? styles.ownMessageTime : styles.otherMessageTime
          ]}>
            {formatMessageTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  const renderChatsList = () => {
    return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Quick Chat</Text>
        <TouchableOpacity style={styles.newChatButton} onPress={() => setShowNewChatModal(true)}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Search Box with Quick Chat Types */}
      <View style={styles.searchInputContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search chats..."
            placeholderTextColor="#999"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchIcon}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          renderItem={renderChatItem}
          keyExtractor={(item) => String(item?.id || Math.random())}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          style={styles.chatsList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
          onTouchStart={() => setShowQuickChatTypes(false)}
        />
      )}
    </SafeAreaView>
    );
  };

  const renderChatMessages = () => (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Chat Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => setSelectedChat(null)}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        
        <View style={styles.chatHeaderInfo}>
          <Text style={styles.chatTitle}>{selectedChat?.title || 'Chat'}</Text>
          <Text style={styles.chatSubtitle}>
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
            style={styles.searchTypeButton} 
            onPress={handleSearchTypeMenuPress}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView 
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {messagesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading messages...</Text>
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
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContent}
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
          <View style={styles.mentionDisplay}>
            <View style={styles.mentionChip}>
              <Ionicons 
                name={getMentionIcon(selectedMention.type) as keyof typeof Ionicons.glyphMap} 
                size={16} 
                color={getMentionColor(selectedMention.type)} 
              />
              <Text style={styles.mentionText}>
                {selectedMention.type}: {selectedMention.type === 'file' ? truncateFilename(selectedMention.name) : selectedMention.name}
              </Text>
              <TouchableOpacity onPress={removeMention} style={styles.removeMentionButton}>
                <Ionicons name="close" size={16} color="#666" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Quick Chat Types Dropdown */}
        {showQuickChatTypes && selectedChat?.type === 'ai_assistant' && (
          <View style={styles.quickChatTypesContainer}>
            {(['ai_assistant', 'workspace', 'user_direct', 'bookmark_focused'] as const).map((type, index, array) => {
              const typeInfo = getChatTypeInfo(type);
              const isLastItem = index === array.length - 1;
              return (
                <TouchableOpacity
                  key={`quick-chat-${type}`}
                  style={[
                    styles.quickChatTypeItem,
                    isLastItem && { borderBottomWidth: 0 }
                  ]}
                  onPress={() => createQuickChat(type)}
                >
                  <View style={[styles.quickChatTypeIcon, { backgroundColor: `${typeInfo.color}20` }]}>
                    <Ionicons name={typeInfo.icon} size={20} color={typeInfo.color} />
                  </View>
                  <View style={styles.quickChatTypeContent}>
                    <Text style={styles.quickChatTypeName}>{typeInfo.name}</Text>
                    <Text style={styles.quickChatTypeDescription}>{typeInfo.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.inputContainer}>
          {/* Inline Mention Dropdown - Above text input */}
          {showMentionModal && (
            <View style={styles.mentionDropdown}>
              <FlatList
                data={mentionResults}
                keyExtractor={(item, index) => `${item.type}-${item.id}-${index}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.mentionDropdownItem}
                    onPress={() => selectMention(item)}
                  >
                    <View style={[styles.mentionDropdownIcon, { backgroundColor: `${getMentionColor(item.type)}20` }]}>
                      <Ionicons 
                        name={getMentionIcon(item.type) as keyof typeof Ionicons.glyphMap} 
                        size={16} 
                        color={getMentionColor(item.type)} 
                      />
                    </View>
                    <View style={styles.mentionDropdownContent}>
                      <Text style={styles.mentionDropdownTitle}>
                        {item.type === 'file' ? truncateFilename(item.name) : item.name}
                      </Text>
                      <Text style={styles.mentionDropdownSubtitle}>{item.subtitle}</Text>
                    </View>
                    <Text style={styles.mentionDropdownType}>{item.type}</Text>
                  </TouchableOpacity>
                )}
                style={styles.mentionDropdownList}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.mentionDropdownEmpty}>
                    <Text style={styles.mentionDropdownEmptyText}>
                      {mentionQuery.trim() ? 'No results found' : 'Type to search...'}
                    </Text>
                  </View>
                }
              />
            </View>
          )}
          
          {/* Text input and send button row */}
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.messageInput, { height: Math.max(20, Math.min(80, textInputHeight)) }]}
              value={newMessage}
              onChangeText={handleMentionInput}
              placeholder="Ask about documents, meeting transcripts, or @ to mention..."
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
                  styles.sendButton, 
                  sendingMessage ? styles.sendButtonProcessing : styles.sendButtonNormal,
                  (!newMessage.trim() && !sendingMessage) && styles.sendButtonDisabled
                ]}
                onPress={sendingMessage ? stopProcessing : sendMessage}
                disabled={!newMessage.trim() && !sendingMessage}
              >
                {sendingMessage ? (
                  <Ionicons name="stop" size={20} color="#fff" />
                ) : (
                  <Ionicons name="send" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
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
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowNewChatModal(false)}>
            <Text style={{ color: '#007AFF', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Chat</Text>
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
            style={[styles.optionItem, newChatType === 'ai_assistant' && styles.selectedOption]}
            onPress={() => setNewChatType('ai_assistant')}
          >
            <Ionicons name="chatbubbles" size={24} color="#007AFF" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.optionTitle}>Chat Assistant</Text>
              <Text style={styles.optionSubtitle}>Chat with AI about your documents and meeting transcripts</Text>
            </View>
            {newChatType === 'ai_assistant' && (
              <Ionicons name="checkmark" size={24} color="#007AFF" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.optionItem, newChatType === 'document_focused' && styles.selectedOption]}
            onPress={() => setNewChatType('document_focused')}
          >
            <Ionicons name="document-text" size={24} color="#34C759" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.optionTitle}>Document Focus</Text>
              <Text style={styles.optionSubtitle}>Ask questions about a specific document</Text>
            </View>
            {newChatType === 'document_focused' && (
              <Ionicons name="checkmark" size={24} color="#34C759" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.optionItem, newChatType === 'workspace' && styles.selectedOption]}
            onPress={() => setNewChatType('workspace')}
          >
            <Ionicons name="people" size={24} color="#FF9500" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.optionTitle}>Workspace Chat</Text>
              <Text style={styles.optionSubtitle}>Message all team members in a workspace</Text>
            </View>
            {newChatType === 'workspace' && (
              <Ionicons name="checkmark" size={24} color="#FF9500" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.optionItem, newChatType === 'user_direct' && styles.selectedOption]}
            onPress={() => setNewChatType('user_direct')}
          >
            <Ionicons name="person" size={24} color="#FF3B30" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.optionTitle}>Direct Message</Text>
              <Text style={styles.optionSubtitle}>Send a private message to another user</Text>
            </View>
            {newChatType === 'user_direct' && (
              <Ionicons name="checkmark" size={24} color="#FF3B30" />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.optionItem, newChatType === 'bookmark_focused' && styles.selectedOption]}
            onPress={() => setNewChatType('bookmark_focused')}
          >
            <Ionicons name="bookmark" size={24} color="#AF52DE" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.optionTitle}>Bookmark Collection</Text>
              <Text style={styles.optionSubtitle}>Chat about a specific bookmark collection</Text>
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
              <View style={styles.searchInputContainer}>
                <Ionicons name="search" size={16} color="#666" style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { fontSize: 14 }]}
                  placeholder="Search documents..."
                  placeholderTextColor="#999"
                />
              </View>
              
              <ScrollView style={{ maxHeight: 200, marginTop: 8 }}>
                {filteredDocuments.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={[styles.optionItem, selectedDocument?.id === doc.id && styles.selectedOption]}
                    onPress={() => setSelectedDocument(doc)}
                  >
                    <Ionicons name="document" size={20} color="#666" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.optionTitle}>{doc.name}</Text>
                      <Text style={styles.optionSubtitle}>{doc.type} • {doc.size}</Text>
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
              <View style={styles.searchInputContainer}>
                <Ionicons name="search" size={16} color="#666" style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { fontSize: 14 }]}
                  placeholder="Search workspaces..."
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={{ marginTop: 8 }}>
                {filteredWorkspaces.map((workspace) => (
                  <TouchableOpacity
                    key={workspace.id}
                    style={[styles.optionItem, selectedWorkspace?.id === workspace.id && styles.selectedOption]}
                    onPress={() => setSelectedWorkspace(workspace)}
                  >
                    <Ionicons name="business" size={20} color="#FF9500" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.optionTitle}>{workspace.name}</Text>
                      <Text style={styles.optionSubtitle}>{workspace.member_count} members</Text>
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
              <View style={styles.searchInputContainer}>
                <Ionicons name="search" size={16} color="#666" style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { fontSize: 14 }]}
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
                      style={[styles.optionItem, selectedUser?.id === user.id && styles.selectedOption]}
                      onPress={() => setSelectedUser(user)}
                    >
                      <Ionicons name="person-circle" size={20} color="#FF3B30" />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.optionTitle}>{user.username}</Text>
                        <Text style={styles.optionSubtitle}>{user.email}</Text>
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
              <View style={styles.searchInputContainer}>
                <Ionicons name="search" size={16} color="#666" style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { fontSize: 14 }]}
                  placeholder="Search bookmarks..."
                  placeholderTextColor="#999"
                />
              </View>
              
              <ScrollView style={{ maxHeight: 200, marginTop: 8 }}>
                {filteredBookmarks.map((bookmark) => (
                  <TouchableOpacity
                    key={bookmark.id}
                    style={[styles.optionItem, selectedBookmark?.id === bookmark.id && styles.selectedOption]}
                    onPress={() => setSelectedBookmark(bookmark)}
                  >
                    <Ionicons name="bookmark" size={20} color="#AF52DE" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.optionTitle}>{bookmark.name}</Text>
                      <Text style={styles.optionSubtitle}>{bookmark.file_count} files • {bookmark.description}</Text>
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
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSearchTypeMenu(false)}
        >
          <View style={styles.searchTypeMenuContainer}>
            {(['exact', 'refined', 'expanded'] as const).map((type) => {
              const isSelected = selectedSearchType === type;
              
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.searchTypeMenuItem, isSelected && styles.selectedSearchTypeItem]}
                  onPress={() => handleSearchTypeSelect(type)}
                >
                  <Text style={[styles.searchTypeText, isSelected && styles.selectedSearchTypeText]}>
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
    padding: 6,
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
    fontSize: 12,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginVertical: 1,
    overflow: 'hidden', // Ensure content stays within bubble
    flexShrink: 1, // Allow bubble to shrink if needed
  },
  ownBubble: {
    backgroundColor: '#007AFF',
  },
  otherBubble: {
    backgroundColor: '#f0f0f0',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 18,
    flexWrap: 'wrap',
    wordWrap: 'break-word',
    maxWidth: '100%', // Don't exceed bubble width
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
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherMessageTime: {
    color: '#666',
  },
  inputContainer: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    minHeight: 48,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 2,
    fontSize: 14,
    backgroundColor: '#f8f8f8',
    minHeight: 20,
    maxHeight: 80,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
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
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  progressSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  progressPercentage: {
    fontSize: 12,
    color: '#333',
    marginLeft: 8,
  },
  progressMessage: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
}); 