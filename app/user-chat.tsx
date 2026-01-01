// Polyfill for URL in React Native (required for socket.io)
import 'react-native-url-polyfill/auto';

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { useThemeColors } from '../hooks/useThemeColors';
import { apiService as api } from '../services/api';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { secureStorage } from '../utils/storage';

interface ChatParticipant {
  id: number;
  username: string;
  email: string;
}

interface Workspace {
  id: number;
  name: string;
  slug: string;
}

interface Chat {
  id: number;
  title: string;
  type: 'user_direct' | 'workspace';
  participants: ChatParticipant[];
  last_message: string;
  updated_at: string;
  created_at: string;
  unread_count?: number;
  workspace?: Workspace;
}

interface ChatMessage {
  id: number;
  content: string;
  sender: ChatParticipant | null;
  is_own_message: boolean;
  created_at: string;
}

export default function UserChatScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<ChatParticipant[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isNewChat, setIsNewChat] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionResults, setShowMentionResults] = useState(false);
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<{ type: 'user' | 'workspace'; data: any } | null>(null);
  const messageInputRef = useRef<TextInput>(null);
  const [textInputHeight, setTextInputHeight] = useState(40);

  // Socket connection
  const socketRef = useRef<Socket | null>(null);
  const messagesListRef = useRef<FlatList>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize socket connection
  useEffect(() => {
    initializeSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Join chat room when chat is selected
  useEffect(() => {
    if (selectedChat && socketRef.current && !isNewChat) {
      // Leave previous room
      socketRef.current.emit('leave_chat', { chatId: selectedChat.id });
      // Join new room
      socketRef.current.emit('join_chat', { chatId: selectedChat.id });
    }
  }, [selectedChat, isNewChat]);

  // Load users and workspaces for @ mention
  useEffect(() => {
    if (isNewChat) {
      loadMentionResults('');
    }
  }, [isNewChat]);

  // Handle @ mention in message input
  useEffect(() => {
    if (isNewChat && newMessage) {
      const lastAtIndex = newMessage.lastIndexOf('@');
      if (lastAtIndex !== -1) {
        const afterAt = newMessage.substring(lastAtIndex + 1);
        const spaceIndex = afterAt.indexOf(' ');
        if (spaceIndex === -1) {
          // Still typing after @
          const query = afterAt.toLowerCase();
          setMentionQuery(query);
          setShowMentionResults(true);
          loadMentionResults(query);
        } else {
          setShowMentionResults(false);
        }
      } else {
        setShowMentionResults(false);
      }
    } else {
      setShowMentionResults(false);
    }
  }, [newMessage, isNewChat]);

  const initializeSocket = async () => {
    try {
      const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) return;

      const socket = io(API_BASE_URL, {
        auth: { token },
        transports: ['polling', 'websocket'], // Allow polling fallback for development
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 20000,
      });

      socket.on('connect', () => {
        console.log('✅ Socket connected');
        setIsConnected(true);
      });

      socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
        setIsConnected(false);
      });

      socket.on('new_message', (data: any) => {
        console.log('📨 New message received:', data);
        if (data.chat_id === selectedChat?.id) {
          const newMsg: ChatMessage = {
            id: data.message.id,
            content: data.message.content,
            sender: data.message.sender,
            is_own_message: data.message.sender_id === userProfile?.id,
            created_at: data.message.created_at,
          };
          setMessages(prev => [...prev, newMsg]);
          scrollToBottom();
        }
        
        // Update chat list
        setChats(prev => prev.map(chat => 
          chat.id === data.chat_id 
            ? { ...chat, last_message: data.message.content.substring(0, 50), updated_at: data.message.created_at }
            : chat
        ));
      });

      socket.on('user_typing', (data: any) => {
        if (data.chat_id === selectedChat?.id && data.user_id !== userProfile?.id) {
          console.log('⌨️ User typing:', data.username);
          // You can add typing indicator here
        }
      });

      socket.on('error', (error: any) => {
        console.error('Socket error:', error);
        // Don't fail the app if socket fails - chat will still work without real-time updates
      });

      socket.on('connect_error', (error: any) => {
        console.warn('Socket connection error (chat will work without real-time updates):', error.message);
        // Gracefully handle connection errors - chat still works via polling
      });

      socketRef.current = socket;
    } catch (error) {
      console.warn('Failed to initialize socket (chat will work without real-time updates):', error);
      // Don't throw - allow chat to work without WebSocket
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  useEffect(() => {
    loadUserProfile();
    loadChats();
    loadWorkspaces();
  }, []);

  const loadUserProfile = async () => {
    try {
      const response = await api.getUserProfile();
      if (response) {
        setUserProfile(response);
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
    }
  };

  const loadChats = async () => {
    try {
      setLoading(true);
      const response = await api.getChats();
      if (response.success && (response as any).chats) {
        const userChats = (response as any).chats.map((chat: any) => ({
          id: chat.id,
          title: chat.display_name || 'Untitled Chat',
          type: chat.type === 'direct' ? 'user_direct' as const : 'workspace' as const,
          participants: chat.participants || [],
          last_message: chat.latest_message?.content || 'No messages yet',
          updated_at: chat.last_message_at || new Date().toISOString(),
          created_at: chat.created_at || new Date().toISOString(),
          unread_count: chat.unread_count || 0,
          workspace: chat.workspace_id ? { id: chat.workspace_id, name: chat.display_name, slug: '' } : undefined,
        }));
        setChats(userChats);
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMentionResults = async (query: string) => {
    try {
      const response = await api.searchUsersForChat(query);
      if (response.success) {
        const results: any[] = [];
        // Add users
        if ((response as any).users) {
          (response as any).users.forEach((user: any) => {
            results.push({ type: 'user', data: user });
          });
        }
        // Add workspaces
        if ((response as any).workspaces) {
          (response as any).workspaces.forEach((workspace: any) => {
            results.push({ type: 'workspace', data: workspace });
          });
        }
        setMentionResults(results);
      }
    } catch (error) {
      console.error('Failed to load mention results:', error);
    }
  };

  const loadWorkspaces = async () => {
    try {
      const response = await (api as any).getMobileWorkspaces();
      if (response.success && response.data) {
        const workspacesData = Array.isArray(response.data) ? response.data : (response.data.workspaces || []);
        setWorkspaces(workspacesData);
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }
  };

  const loadMessages = async (chatId: number) => {
    try {
      setMessagesLoading(true);
      console.log(`📨 Loading messages for chat_id: ${chatId}`);
      const response = await api.getChatMessages(chatId);
      if (response.success && (response as any).messages) {
        const convertedMessages: ChatMessage[] = (response as any).messages.map((msg: any) => ({
          id: msg.id,
          content: msg.content || '',
          sender: msg.sender || null,
          is_own_message: msg.sender_id === userProfile?.id,
          created_at: msg.created_at || new Date().toISOString(),
        }));
        console.log(`✅ Loaded ${convertedMessages.length} messages for chat ${chatId}`);
        setMessages(convertedMessages);
      } else {
        console.warn(`⚠️ No messages found for chat ${chatId}`);
        setMessages([]);
      }
    } catch (error: any) {
      console.error(`❌ Failed to load messages for chat ${chatId}:`, error.message || error);
      // If chat doesn't exist, clear messages and show empty state
      if (error.message?.includes('Chat not found') || error.message?.includes('404')) {
        console.warn(`⚠️ Chat ${chatId} not found, clearing messages`);
        setMessages([]);
      }
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleChatPress = (chat: Chat) => {
    setSelectedChat(chat);
    setIsNewChat(false);
    setSelectedRecipient(null);
    loadMessages(chat.id);
  };

  const handleNewChat = () => {
    setIsNewChat(true);
    setSelectedChat(null);
    setMessages([]);
    setNewMessage('');
    setSelectedRecipient(null);
    setShowMentionResults(false);
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 100);
  };

  const handleSelectRecipient = (recipient: { type: 'user' | 'workspace'; data: any }) => {
    setSelectedRecipient(recipient);
    setShowMentionResults(false);
    // Remove @ mention from message
    const lastAtIndex = newMessage.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      setNewMessage(newMessage.substring(0, lastAtIndex));
    }
  };

  const handleStartChat = async () => {
    if (!selectedRecipient) {
      Alert.alert('Error', 'Please select a user or workspace by typing @ and selecting from the list');
      return;
    }

    try {
      const response = await api.startUserChat({
        type: selectedRecipient.type === 'user' ? 'direct' : 'workspace',
        user_id: selectedRecipient.type === 'user' ? selectedRecipient.data.id : undefined,
        workspace_id: selectedRecipient.type === 'workspace' ? selectedRecipient.data.id : undefined,
      });

      if (response.success && (response as any).chat) {
        const newChat: Chat = {
          id: (response as any).chat.id,
          title: (response as any).chat.display_name || (selectedRecipient.type === 'user' ? `Chat with ${selectedRecipient.data.username}` : selectedRecipient.data.name || 'Workspace Chat'),
          type: selectedRecipient.type === 'user' ? 'user_direct' : 'workspace',
          participants: (response as any).chat.participants || [],
          last_message: 'Start a conversation',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          unread_count: 0,
          workspace: selectedRecipient.type === 'workspace' ? selectedRecipient.data : undefined,
        };
        
        setChats(prev => [newChat, ...prev]);
        setIsNewChat(false);
        setSelectedChat(newChat);
        setSelectedRecipient(null);
        setNewMessage('');
        loadMessages(newChat.id);
      }
    } catch (error) {
      console.error('Failed to create chat:', error);
      Alert.alert('Error', 'Failed to create chat');
    }
  };

  const handleSendMessage = async () => {
    // If in new chat mode and no recipient selected, try to start chat
    if (isNewChat && !selectedRecipient) {
      Alert.alert('Select Recipient', 'Type @ and select a user or workspace to start the chat');
      return;
    }

    // If in new chat mode with recipient, start the chat first
    if (isNewChat && selectedRecipient) {
      await handleStartChat();
      // After chat is created, send the message if there's one
      if (newMessage.trim()) {
        // Wait a bit for chat to be created, then send
        setTimeout(async () => {
          const chat = chats.find(c => 
            (selectedRecipient.type === 'user' && c.type === 'user_direct') ||
            (selectedRecipient.type === 'workspace' && c.type === 'workspace')
          );
          if (chat) {
            await sendMessageToChat(chat.id, newMessage.trim());
            setNewMessage('');
          }
        }, 500);
      }
      return;
    }

    // Normal message sending
    if (!selectedChat || !newMessage.trim()) return;
    await sendMessageToChat(selectedChat.id, newMessage.trim());
  };

  const sendMessageToChat = async (chatId: number, messageText: string) => {
    setSendingMessage(true);

    // Emit typing stopped
    if (socketRef.current) {
      socketRef.current.emit('stop_typing', { chatId });
    }

    try {
      const response = await api.sendChatMessageToChat(messageText, chatId);
      
      if (response.success && (response as any).message) {
        const newMsg = (response as any).message;
        const messageObj: ChatMessage = {
          id: newMsg.id,
          content: newMsg.content,
          sender: newMsg.sender,
          is_own_message: true,
          created_at: newMsg.created_at || new Date().toISOString()
        };
        
        // Add message locally (socket will also broadcast it)
        setMessages(prev => [...prev, messageObj]);
        scrollToBottom();
        
        setChats(prev => prev.map(chat => 
          chat.id === chatId 
            ? { ...chat, last_message: newMsg.content.substring(0, 50), updated_at: newMsg.created_at || new Date().toISOString() }
            : chat
        ));
      }
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleTyping = (text: string) => {
    setNewMessage(text);
    
    // Emit typing event (only if in existing chat)
    if (selectedChat && !isNewChat && socketRef.current) {
      socketRef.current.emit('typing', { chatId: selectedChat.id });
    }
  };


  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const query = searchQuery.toLowerCase();
    return chats.filter(chat => 
      chat.title.toLowerCase().includes(query) || 
      chat.last_message.toLowerCase().includes(query)
    );
  }, [chats, searchQuery]);

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    backButton: {
      padding: 8,
    },
    newChatButton: {
      padding: 8,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.card,
    },
    searchInput: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: colors.text,
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
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    chatContent: {
      flex: 1,
    },
    chatTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    lastMessage: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 16,
    },
    messagesList: {
      flex: 1,
    },
    messageItem: {
      paddingHorizontal: 16,
      paddingVertical: 4,
      width: '100%',
    },
    myMessage: {
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
    },
    otherMessage: {
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
    },
    senderName: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
      marginLeft: 0,
      paddingLeft: 4,
    },
    messageBubble: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
    },
    myMessageBubble: {
      backgroundColor: '#007AFF',
    },
    otherMessageBubble: {
      backgroundColor: colors.surface,
    },
    messageText: {
      fontSize: 14,
    },
    myMessageText: {
      color: '#fff',
    },
    otherMessageText: {
      color: colors.text,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
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
      fontSize: 14,
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
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
      width: '80%',
      maxHeight: '80%',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 16,
    },
    optionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: colors.surface,
    },
    selectedOption: {
      backgroundColor: colors.primary + '20',
    },
    optionText: {
      fontSize: 14,
      color: colors.text,
      marginLeft: 12,
    },
    createButton: {
      backgroundColor: '#007AFF',
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 16,
    },
    createButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    mentionResultsContainer: {
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      maxHeight: 200,
    },
    mentionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    mentionAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    mentionName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    mentionEmail: {
      fontSize: 12,
      color: colors.textSecondary,
    },
  }), [colors]);

  if (isNewChat || selectedChat) {
    return (
      <SafeAreaView style={dynamicStyles.container} edges={['top']}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity onPress={() => {
            setSelectedChat(null);
            setIsNewChat(false);
            setSelectedRecipient(null);
            setNewMessage('');
          }} style={dynamicStyles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={dynamicStyles.headerTitle}>
              {isNewChat ? 'New Message' : selectedChat?.title || ''}
            </Text>
            {!isNewChat && isConnected && (
              <Text style={{ fontSize: 10, color: colors.textSecondary }}>Connected</Text>
            )}
            {isNewChat && selectedRecipient && (
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                {selectedRecipient.type === 'user' ? selectedRecipient.data.username : selectedRecipient.data.name}
              </Text>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flex: 1 }}>
          {isNewChat ? (
            <View style={dynamicStyles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
              <Text style={dynamicStyles.emptyText}>
                {selectedRecipient 
                  ? `Chat with ${selectedRecipient.type === 'user' ? selectedRecipient.data.username : selectedRecipient.data.name}`
                  : 'Type @ to search for a user or workspace'}
              </Text>
            </View>
          ) : messagesLoading ? (
            <View style={dynamicStyles.emptyContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : (
            <FlatList
              ref={messagesListRef}
              data={messages}
              renderItem={({ item }) => (
                <View style={[dynamicStyles.messageItem, item.is_own_message ? dynamicStyles.myMessage : dynamicStyles.otherMessage]}>
                  <View style={{ maxWidth: '75%' }}>
                    {!item.is_own_message && item.sender && (
                      <Text style={dynamicStyles.senderName}>{item.sender.username}</Text>
                    )}
                    <View style={[dynamicStyles.messageBubble, item.is_own_message ? dynamicStyles.myMessageBubble : dynamicStyles.otherMessageBubble]}>
                      <Text style={[dynamicStyles.messageText, item.is_own_message ? dynamicStyles.myMessageText : dynamicStyles.otherMessageText]}>
                        {item.content}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              keyExtractor={(item) => item.id.toString()}
              style={dynamicStyles.messagesList}
              contentContainerStyle={{ paddingBottom: 10 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => selectedChat && loadMessages(selectedChat.id)} />}
              onContentSizeChange={() => scrollToBottom()}
              onLayout={() => scrollToBottom()}
            />
          )}
        </View>

        {/* Mention Results - Show above input */}
        {showMentionResults && mentionResults.length > 0 && (
          <View style={dynamicStyles.mentionResultsContainer}>
            <FlatList
              data={mentionResults}
              keyExtractor={(item, index) => `${item.type}-${item.data.id}-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={dynamicStyles.mentionItem}
                  onPress={() => handleSelectRecipient(item)}
                >
                  <View style={dynamicStyles.mentionAvatar}>
                    <Ionicons
                      name={item.type === 'workspace' ? 'people' : 'person'}
                      size={20}
                      color="#007AFF"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={dynamicStyles.mentionName}>
                      {item.type === 'user' ? item.data.username : item.data.name}
                    </Text>
                    {item.type === 'user' && item.data.email && (
                      <Text style={dynamicStyles.mentionEmail}>{item.data.email}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 200 }}
            />
          </View>
        )}

        {/* Mention Results - Show above input */}
        {showMentionResults && mentionResults.length > 0 && (
          <View style={dynamicStyles.mentionResultsContainer}>
            <FlatList
              data={mentionResults}
              keyExtractor={(item, index) => `${item.type}-${item.data.id}-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={dynamicStyles.mentionItem}
                  onPress={() => handleSelectRecipient(item)}
                >
                  <View style={dynamicStyles.mentionAvatar}>
                    <Ionicons
                      name={item.type === 'workspace' ? 'people' : 'person'}
                      size={20}
                      color="#007AFF"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={dynamicStyles.mentionName}>
                      {item.type === 'user' ? item.data.username : item.data.name}
                    </Text>
                    {item.type === 'user' && item.data.email && (
                      <Text style={dynamicStyles.mentionEmail}>{item.data.email}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 200 }}
            />
          </View>
        )}

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={dynamicStyles.inputContainer}>
            <TextInput
              ref={messageInputRef}
              style={[dynamicStyles.messageInput, { height: Math.max(40, Math.min(120, textInputHeight)) }]}
              placeholder={isNewChat ? "Type @ to search for a user or workspace..." : "Type a message..."}
              placeholderTextColor={colors.textSecondary}
              value={newMessage}
              onChangeText={handleTyping}
              multiline
              maxLength={4000}
              onContentSizeChange={(event) => {
                const { height } = event.nativeEvent.contentSize;
                setTextInputHeight(height);
              }}
            />
            <TouchableOpacity 
              style={[dynamicStyles.sendButton, ((!newMessage.trim() && !selectedRecipient) || sendingMessage) && { opacity: 0.5 }]} 
              onPress={handleSendMessage} 
              disabled={sendingMessage || (!newMessage.trim() && !selectedRecipient)}
            >
              {sendingMessage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity onPress={() => router.back()} style={dynamicStyles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Messages</Text>
        <TouchableOpacity onPress={handleNewChat} style={dynamicStyles.newChatButton}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <View style={dynamicStyles.searchContainer}>
        <TextInput
          style={dynamicStyles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {loading ? (
        <View style={dynamicStyles.emptyContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : filteredChats.length === 0 ? (
        <View style={dynamicStyles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
          <Text style={dynamicStyles.emptyText}>
            {searchQuery ? 'No conversations found' : 'No conversations yet\nStart a new chat to get started'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          renderItem={({ item }) => (
            <TouchableOpacity style={dynamicStyles.chatItem} onPress={() => handleChatPress(item)}>
              <View style={dynamicStyles.chatAvatar}>
                <Ionicons 
                  name={item.type === 'workspace' ? 'people' : 'person'} 
                  size={24} 
                  color="#007AFF" 
                />
              </View>
              <View style={dynamicStyles.chatContent}>
                <Text style={dynamicStyles.chatTitle}>{item.title}</Text>
                <Text style={dynamicStyles.lastMessage} numberOfLines={1}>{item.last_message}</Text>
              </View>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.id.toString()}
          style={dynamicStyles.chatsList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadChats} />}
        />
      )}

    </SafeAreaView>
  );
}

