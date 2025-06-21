import { Ionicons } from '@expo/vector-icons';
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
  member_count: number;
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

export default function ChatsScreen() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  
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
  const [filteredChats, setFilteredChats] = useState<Chat[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [filteredWorkspaces, setFilteredWorkspaces] = useState<Workspace[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<ChatParticipant[]>([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState<Bookmark[]>([]);
  
  // Quick chat type selector
  const [showQuickChatTypes, setShowQuickChatTypes] = useState(false);
  
  // Mention functionality state
  const [showMentionModal, setShowMentionModal] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  const [selectedMention, setSelectedMention] = useState<{
    type: 'user' | 'bookmark' | 'file' | 'workspace';
    id: number;
    name: string;
    data: any;
  } | null>(null);
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  
  // Animation and abort controller refs
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const messagesRef = useRef<FlatList>(null);

  // Animation states for bouncing balls
  const ball1Anim = useRef(new Animated.Value(0)).current;
  const ball2Anim = useRef(new Animated.Value(0)).current;
  const ball3Anim = useRef(new Animated.Value(0)).current;

  const startBounceAnimation = () => {
    // Start bouncing balls animation
    const createBounceAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: -10,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
    };

    // Start animations with different delays for each ball
    Animated.parallel([
      createBounceAnimation(ball1Anim, 0),
      createBounceAnimation(ball2Anim, 133),
      createBounceAnimation(ball3Anim, 266),
    ]).start();

    // Keep existing button bounce animation
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
    // Stop all animations
    ball1Anim.stopAnimation();
    ball2Anim.stopAnimation();
    ball3Anim.stopAnimation();
    bounceAnim.stopAnimation();
    
    // Reset values
    ball1Anim.setValue(0);
    ball2Anim.setValue(0);
    ball3Anim.setValue(0);
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

  useEffect(() => {
    loadChats();
    loadWorkspaces();
    loadDocuments();
    loadUsers();
    loadBookmarks();
  }, []);

  // Cleanup effect to abort any ongoing requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      stopBounceAnimation();
    };
  }, []);

  // Filter data based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredChats(chats);
      setFilteredDocuments(documents);
      setFilteredWorkspaces(workspaces);
      setFilteredUsers(users);
      setFilteredBookmarks(bookmarks);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredChats(chats.filter(chat => 
        chat.title.toLowerCase().includes(query) ||
        chat.last_message.toLowerCase().includes(query)
      ));
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

      const recentUsers = users.slice(0, 2).map(user => ({
        type: 'user',
        id: user.id,
        name: user.username,
        subtitle: user.email,
        data: user
      }));

      const recentWorkspaces = workspaces.slice(0, 2).map(ws => ({
        type: 'workspace',
        id: ws.id,
        name: ws.name,
        subtitle: `${ws.member_count} members`,
        data: ws
      }));

      const recentBookmarks = bookmarks.slice(0, 2).map(bookmark => ({
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
      
      // Create AI Assistant chat that will always be first
      const aiAssistantChat: Chat = {
        id: 1,
        title: 'AI Assistant',
        type: 'ai_assistant',
        participants: [{ id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' }],
        last_message: 'Ask me anything about your documents',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        unread_count: 0
      };
      
      // Try the mobile chats endpoint first
      try {
        const response = await api.getChats();
        
        if (response.success) {
          const chatData = response.chats || [];
          
          // Filter out any existing AI Assistant chats to avoid duplicates
          const otherChats = chatData.filter(chat => chat.type !== 'ai_assistant');
          
          // Always put AI Assistant first, followed by other chats
          setChats([aiAssistantChat, ...otherChats]);
          return;
        }
      } catch (chatError) {
        console.log('Mobile chats endpoint not available, using AI Assistant only');
      }
      
      // Fallback: just show AI Assistant
      setChats([aiAssistantChat]);
    } catch (error) {
      console.error('Failed to load chats:', error);
      
      // Fallback to AI Assistant only
      const aiAssistantChat: Chat = {
        id: 1,
        title: 'AI Assistant',
        type: 'ai_assistant',
        participants: [{ id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' }],
        last_message: 'Ask me anything about your documents',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        unread_count: 0
      };
      setChats([aiAssistantChat]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadWorkspaces = async () => {
    try {
      const response = await api.getMobileWorkspaces();
      if (response.success) {
        setWorkspaces(response.workspaces || []);
      } else {
        // Add test data if API fails
        setWorkspaces([
          { id: 1, name: 'General', description: 'Main workspace', slug: 'general', member_count: 5 },
          { id: 2, name: 'Development', description: 'Dev team workspace', slug: 'dev', member_count: 3 }
        ]);
      }
    } catch (error) {
      console.log('Failed to load workspaces:', error);
      // Add test data if API fails
      setWorkspaces([
        { id: 1, name: 'General', description: 'Main workspace', slug: 'general', member_count: 5 },
        { id: 2, name: 'Development', description: 'Dev team workspace', slug: 'dev', member_count: 3 }
      ]);
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await api.getFiles(1, 50); // Get up to 50 recent files for mentions
      if (response.success) {
        const docs = response.files?.map((file: any) => ({
          id: file.id,
          name: file.original_filename || file.filename,
          type: file.file_type,
          category: file.file_kind || file.category,
          size: file.file_size
        })) || [];
        setDocuments(docs);
        console.log(`📄 Loaded ${docs.length} documents for mentions:`, docs.map(d => d.name));
      }
    } catch (error) {
      console.log('Failed to load documents:', error);
      // Add test data if API fails
      setDocuments([
        { id: 167, name: 'test_upload.txt', type: 'text/plain', category: 'Document', size: '43 bytes' },
        { id: 166, name: 'FrancisOnodueze_22_resume_ML_3.pdf', type: 'application/pdf', category: 'Document', size: '1.2 MB' }
      ]);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await api.getWorkspaceUsers();
      if (response.success) {
        setUsers(response.users || []);
      } else {
        // Add test data if API fails
        setUsers([
          { id: 1, username: 'francis', email: 'francis@example.com' },
          { id: 2, username: 'testuser', email: 'test@example.com' }
        ]);
      }
    } catch (error) {
      console.log('Failed to load users:', error);
      // Add test data if API fails
      setUsers([
        { id: 1, username: 'francis', email: 'francis@example.com' },
        { id: 2, username: 'testuser', email: 'test@example.com' }
      ]);
    }
  };

  const loadBookmarks = async () => {
    try {
      const response = await api.getBookmarks();
      
      if (response.success) {
        setBookmarks(response.bookmarks || []);
      } else {
        console.log('Failed to load bookmarks:', response.message);
        // Add test data if API fails
        setBookmarks([
          { id: 1, name: 'Important Docs', description: 'Key documents', file_count: 10, documents: [] },
          { id: 2, name: 'Receipts', description: 'Expense receipts', file_count: 25, documents: [] }
        ]);
      }
    } catch (error) {
      console.log('Failed to load bookmarks:', error);
      // Add test data if API fails
      setBookmarks([
        { id: 1, name: 'Important Docs', description: 'Key documents', file_count: 10, documents: [] },
        { id: 2, name: 'Receipts', description: 'Expense receipts', file_count: 25, documents: [] }
      ]);
    }
  };

  const loadMessages = async (chatId: number) => {
    try {
      setMessagesLoading(true);
      
      // Try the mobile messages endpoint first, but fall back to welcome message
      try {
        const response = await api.getChatMessages(chatId);
        
        if (response.success) {
          const messageData = response.messages || [];
          if (messageData.length > 0) {
            setMessages(messageData);
            return;
          }
        }
      } catch (messageError) {
        console.log('Mobile messages endpoint not available, using welcome message');
      }
      
      // Show welcome message for new/empty chats
      const welcomeMessage: ChatMessage = {
        id: 1,
        content: 'Hello! I\'m your AI assistant. I can help you with questions about your documents, analyze files, and provide insights. How can I help you today?',
        sender: { id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' },
        is_own_message: false,
        created_at: new Date().toISOString(),
      };
      setMessages([welcomeMessage]);
    } catch (error) {
      console.error('Failed to load messages:', error);
      
      // Show error message
      const errorMessage: ChatMessage = {
        id: 1,
        content: 'Hello! I\'m your AI assistant. How can I help you today?',
        sender: { id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' },
        is_own_message: false,
        created_at: new Date().toISOString(),
      };
      setMessages([errorMessage]);
    } finally {
      setMessagesLoading(false);
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
      setMessages(prev => [...prev, userMessage]);
      setNewMessage('');

      // Send message based on chat type
      let response;
      
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
          
          if (selectedMention.type === 'bookmark' && selectedMention.data.file_count) {
            chatContext += ` This bookmark contains ${selectedMention.data.file_count} files.`;
            // Add specific instruction for bookmark-focused search
            chatContext += ` IMPORTANT: Search and provide answers ONLY from documents within the "${selectedMention.name}" bookmark collection. Do not use information from other bookmarks or documents.`;
          } else if (selectedMention.type === 'user' && selectedMention.data.email) {
            chatContext += ` User email: ${selectedMention.data.email}.`;
            // Focus on user-related content
            chatContext += ` IMPORTANT: Focus on information related to this specific user when searching documents.`;
          } else if (selectedMention.type === 'workspace' && selectedMention.data.member_count) {
            chatContext += ` This workspace has ${selectedMention.data.member_count} members.`;
            // Focus on workspace-specific content
            chatContext += ` IMPORTANT: Search and provide answers ONLY from documents within the "${selectedMention.name}" workspace. Do not use information from other workspaces.`;
          } else if (selectedMention.type === 'file' && selectedMention.data.category) {
            chatContext += ` File category: ${selectedMention.data.category}.`;
            // Focus on specific file
            chatContext += ` IMPORTANT: Search and provide answers ONLY from the "${selectedMention.name}" document. Do not use information from other files.`;
          }
        }
        
        // Prepare filters for context-aware search
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
        }
        
        // Use general chat endpoint for AI assistant with context filters
        response = await api.sendChatMessage(chatContext, searchFilters, abortControllerRef.current?.signal);
      } else if (selectedChat.type === 'workspace') {
        // Send to workspace endpoint (to be implemented)
        response = await api.client.post(`/api/v1/mobile/workspace/${selectedChat.workspace?.id}/message`, {
          message: newMessage.trim()
        }, {
          signal: abortControllerRef.current?.signal
        });
        response = response.data;
      } else if (selectedChat.type === 'user_direct') {
        // Send direct message (to be implemented)
        response = await api.client.post(`/api/v1/mobile/chats/${selectedChat.id}/send`, {
          message: newMessage.trim()
        }, {
          signal: abortControllerRef.current?.signal
        });
        response = response.data;
      } else {
        // Fallback to general chat
        response = await api.sendChatMessage(newMessage.trim(), {}, abortControllerRef.current?.signal);
      }

      if (response.success && response.response) {
        // Add AI response
        const aiMessage: ChatMessage = {
          id: Date.now() + 1,
          content: response.response,
          sender: { id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' },
          is_own_message: false,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, aiMessage]);
        
        // Auto-scroll to bottom
        setTimeout(() => {
          messagesRef.current?.scrollToEnd({ animated: true });
        }, 100);

        // Update the chat's last message in the chat list
        setChats(prev => prev.map(chat => 
          chat.id === selectedChat.id 
            ? { ...chat, last_message: response.response, updated_at: new Date().toISOString() }
            : chat
        ));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request was aborted');
        // Don't show error for aborted requests
        return;
      }
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
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
      case 'file': return 'document';
      case 'workspace': return 'business';
      default: return 'at';
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
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength) + '...';
  };

  const createQuickChat = (type: 'ai_assistant' | 'user_direct' | 'workspace' | 'document_focused' | 'bookmark_focused') => {
    setShowQuickChatTypes(false);
    
    if (type === 'ai_assistant') {
      // Create AI assistant chat immediately
      const newChat: Chat = {
        id: Date.now(),
        title: 'AI Assistant',
        type: 'ai_assistant',
        participants: [{ id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' }],
        last_message: 'Ask me anything about your documents',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        unread_count: 0
      };
      
      setChats(prev => [newChat, ...prev]);
      setSelectedChat(newChat);
      setMessages([]);
    } else {
      // For other types, open the new chat modal with preselected type
      setNewChatType(type);
      setShowNewChatModal(true);
    }
  };

  const getChatTypeInfo = (type: string) => {
    switch (type) {
      case 'ai_assistant':
        return { 
          name: 'Start AI Chat', 
          icon: 'sparkles' as const, 
          color: '#007AFF',
          description: 'Chat with AI about your documents'
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
    if (selectedChat) {
      loadMessages(selectedChat.id);
    } else {
      loadChats();
    }
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatChatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return date.toLocaleDateString();
  };

  const renderChatItem = ({ item }: { item: Chat }) => {
    const getChatIcon = () => {
      switch (item.type) {
        case 'ai_assistant':
          return { name: 'sparkles' as const, color: '#007AFF' };
        case 'document_focused':
          return { name: 'document-text' as const, color: '#34C759' };
        case 'workspace':
          return { name: 'people' as const, color: '#FF9500' };
        case 'user_direct':
          return { name: 'person' as const, color: '#FF3B30' };
        case 'bookmark_focused':
          return { name: 'bookmark' as const, color: '#AF52DE' };
        default:
          return { name: 'chatbubble' as const, color: '#007AFF' };
      }
    };

    const { name: iconName, color } = getChatIcon();

    return (
      <TouchableOpacity style={styles.chatItem} onPress={() => selectChat(item)}>
        <View style={[styles.chatAvatar, { backgroundColor: `${color}20` }]}>
          <Ionicons name={iconName} size={24} color={color} />
        </View>
      <View style={styles.chatContent}>
        <View style={styles.chatItemHeader}>
          <Text style={styles.chatTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.chatTime}>{formatChatTime(item.updated_at)}</Text>
        </View>
        <View style={styles.chatFooter}>
          <Text style={styles.lastMessage} numberOfLines={2}>{item.last_message}</Text>
          {item.unread_count && item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
    );
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => (
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

  const renderChatsList = () => (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity style={styles.newChatButton} onPress={() => setShowNewChatModal(true)}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Search Box with Quick Chat Types */}
      <View style={styles.searchContainer}>
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
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
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
          keyExtractor={(item) => item.id.toString()}
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

  const renderChatMessages = () => (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.chatHeader}>
        <TouchableOpacity style={styles.backButton} onPress={goBackToChats}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.chatHeaderContent}>
          <Text style={styles.chatHeaderTitle}>{selectedChat?.title}</Text>
          <Text style={styles.chatHeaderSubtitle}>
            {selectedChat?.type === 'ai_assistant' && 'AI Assistant'}
            {selectedChat?.type === 'document_focused' && selectedChat.document_context && 
              `Document: ${selectedChat.document_context.name}`}
            {selectedChat?.type === 'workspace' && selectedChat.workspace && 
              `Workspace: ${selectedChat.workspace.name}`}
            {selectedChat?.type === 'user_direct' && selectedChat.participants.length > 0 && 
              `Direct message with ${selectedChat.participants[0].username}`}
            {selectedChat?.type === 'bookmark_focused' && selectedChat.bookmark_context && 
              `Bookmark: ${selectedChat.bookmark_context.name} (${selectedChat.bookmark_context.file_count} files)`}
            {(!selectedChat?.type || !['ai_assistant', 'document_focused', 'workspace', 'user_direct', 'bookmark_focused'].includes(selectedChat.type)) &&
              'AI Assistant'
            }
          </Text>
        </View>
        <TouchableOpacity style={styles.chatMenuButton}>
          <Ionicons name="ellipsis-vertical" size={20} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 25}
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
              data={messages}
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
            
            {/* Bouncing balls animation when AI is processing */}
            {sendingMessage && (
              <View style={styles.bouncingBallsContainer}>
                <View style={styles.bouncingBallsWrapper}>
                  <Animated.View
                    style={[
                      styles.bouncingBall,
                      {
                        transform: [{ translateY: ball1Anim }],
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.bouncingBall,
                      {
                        transform: [{ translateY: ball2Anim }],
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.bouncingBall,
                      {
                        transform: [{ translateY: ball3Anim }],
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </>
        )}

        {/* Selected Mention Display */}
        {selectedMention && (
          <View style={styles.mentionDisplay}>
            <View style={styles.mentionChip}>
              <Ionicons 
                name={getMentionIcon(selectedMention.type) as any} 
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
                  key={type}
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

        {/* Inline Mention Dropdown - Above input */}
        {showMentionModal && (
          <View style={styles.mentionDropdown}>
            <FlatList
              data={mentionResults}
              keyExtractor={(item) => `${item.type}-${item.id}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.mentionDropdownItem}
                  onPress={() => selectMention(item)}
                >
                  <View style={[styles.mentionDropdownIcon, { backgroundColor: `${getMentionColor(item.type)}20` }]}>
                    <Ionicons 
                      name={getMentionIcon(item.type) as any} 
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

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.messageInput}
            value={newMessage}
            onChangeText={handleMentionInput}
            placeholder="Type a message or @ to mention..."
            multiline
            maxLength={1000}
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
            <Ionicons name="sparkles" size={24} color="#007AFF" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.optionTitle}>AI Assistant</Text>
              <Text style={styles.optionSubtitle}>Chat with AI about your documents</Text>
            </View>
            {newChatType === 'ai_assistant' && <Ionicons name="checkmark" size={24} color="#007AFF" />}
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
            {newChatType === 'document_focused' && <Ionicons name="checkmark" size={24} color="#34C759" />}
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
            {newChatType === 'workspace' && <Ionicons name="checkmark" size={24} color="#FF9500" />}
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
            {newChatType === 'user_direct' && <Ionicons name="checkmark" size={24} color="#FF3B30" />}
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
            {newChatType === 'bookmark_focused' && <Ionicons name="checkmark" size={24} color="#AF52DE" />}
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
                    {selectedDocument?.id === doc.id && <Ionicons name="checkmark" size={20} color="#34C759" />}
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
                    {selectedWorkspace?.id === workspace.id && <Ionicons name="checkmark" size={20} color="#FF9500" />}
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
                      {selectedUser?.id === user.id && <Ionicons name="checkmark" size={20} color="#FF3B30" />}
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
                    {selectedBookmark?.id === bookmark.id && <Ionicons name="checkmark" size={20} color="#AF52DE" />}
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

  // Show chat list or individual chat based on selection
  return (
    <>
      {selectedChat ? renderChatMessages() : renderChatsList()}
      {renderNewChatModal()}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  newChatButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#666',
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
    borderBottomColor: '#f0f0f0',
  },
  chatAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatContent: {
    flex: 1,
  },
  chatItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  chatTime: {
    fontSize: 12,
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
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  chatHeaderContent: {
    flex: 1,
  },
  chatHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  chatHeaderSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  chatMenuButton: {
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
    paddingVertical: 8,
  },
  messageContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
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
  },
  ownBubble: {
    backgroundColor: '#007AFF',
  },
  otherBubble: {
    backgroundColor: '#f0f0f0',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#000',
  },
  messageTime: {
    fontSize: 12,
    marginTop: 4,
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherMessageTime: {
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    minHeight: 64,
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    maxHeight: 100,
    fontSize: 16,
    backgroundColor: '#f8f8f8',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
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
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f8f8f8',
    marginBottom: 8,
  },
  selectedOption: {
    backgroundColor: '#e7f3ff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  clearSearchButton: {
    marginLeft: 8,
  },
  quickChatButton: {
    padding: 8,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickChatTypesContainer: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1000,
  },
  quickChatTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  quickChatTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  quickChatTypeContent: {
    flex: 1,
  },
  quickChatTypeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  quickChatTypeDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },

  // Inline mention dropdown styles
  mentionDropdown: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    maxHeight: 150,
    marginHorizontal: 8,
    marginBottom: 8,
  },
  mentionDropdownList: {
    borderRadius: 12,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  mentionDropdownContent: {
    flex: 1,
  },
  mentionDropdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  mentionDropdownSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 1,
  },
  mentionDropdownType: {
    fontSize: 11,
    color: '#999',
    textTransform: 'capitalize',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mentionDropdownEmpty: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  mentionDropdownEmptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  // Selected mention display styles
  mentionDisplay: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  mentionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignSelf: 'flex-start',
  },
  mentionText: {
    marginLeft: 8,
    marginRight: 8,
    fontSize: 14,
    color: '#333',
  },
  removeMentionButton: {
    padding: 2,
  },
  
  // Bouncing balls animation styles
  bouncingBallsContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
  },
  bouncingBallsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bouncingBall: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginHorizontal: 3,
  },
  processingText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
}); 