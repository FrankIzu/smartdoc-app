// Polyfill for URL in React Native (required for socket.io)
import 'react-native-url-polyfill/auto';

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { useThemeColors } from '../hooks/useThemeColors';
import { apiService as api } from '../services/api';
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
  const params = useLocalSearchParams();
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
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ [userId: number]: string }>({}); // userId -> username

  // Initialize socket connection
  useEffect(() => {
    initializeSocket();
    return () => {
      // Clean up typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Join user room when socket is connected and userProfile is available
  useEffect(() => {
    if (socketRef.current && isConnected && userProfile?.id) {
      console.log('🔌 [USER-CHAT] Joining user room:', userProfile.id);
      socketRef.current.emit('join_user_room', { user_id: userProfile.id });
      console.log('🔌 [USER-CHAT] Emitted join_user_room for user:', userProfile.id);
    }
  }, [isConnected, userProfile?.id]);

  // Join chat room when chat is selected
  useEffect(() => {
    if (selectedChat && socketRef.current && !isNewChat && isConnected) {
      // Leave previous room
      socketRef.current.emit('leave_chat_room', { chat_id: selectedChat.id });
      // Reset online status when leaving
      setOtherUserOnline(false);
      // Join new room
      console.log('🔌 [USER-CHAT] Joining chat room:', selectedChat.id, 'socket connected:', socketRef.current.connected);
      socketRef.current.emit('join_chat_room', { chat_id: selectedChat.id });
      console.log('🔌 [USER-CHAT] Emitted join_chat_room event for chat:', selectedChat.id);
      // Request participant online status
      socketRef.current.emit('get_chat_participants_status', { chatId: selectedChat.id });
    } else {
      console.log('⚠️ [USER-CHAT] Cannot join chat room:', {
        hasSelectedChat: !!selectedChat,
        isNewChat,
        hasSocket: !!socketRef.current,
        isConnected,
        socketConnected: socketRef.current?.connected
      });
      // Reset when no chat is selected
      setOtherUserOnline(false);
    }
  }, [selectedChat, isNewChat, isConnected]);

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
        // Explicitly use default namespace to match backend
        path: '/socket.io/',
      });

      // TEST: Add a direct listener to catch ALL events (before other handlers)
      const originalOnevent = (socket as any).onevent;
      if (originalOnevent) {
        (socket as any).onevent = function(packet: any) {
          if (packet && packet.data && packet.data[0]) {
            const eventName = packet.data[0];
            if (eventName === 'new_chat_message') {
              console.log('🔍 [USER-CHAT] ===== RAW onevent DETECTED new_chat_message =====', packet.data[1]);
            }
          }
          return originalOnevent.call(this, packet);
        };
      }

      socket.on('connect', () => {
        console.log('✅ [USER-CHAT] Socket connected');
        setIsConnected(true);
        
        // Join user room first (required for receiving messages)
        // Use state setter to get latest userProfile
        setUserProfile(currentProfile => {
          if (currentProfile?.id) {
            console.log('🔌 [USER-CHAT] Joining user room:', currentProfile.id);
            socket.emit('join_user_room', { user_id: currentProfile.id });
            console.log('🔌 [USER-CHAT] Emitted join_user_room for user:', currentProfile.id);
          } else {
            console.log('⚠️ [USER-CHAT] Cannot join user room - userProfile not loaded yet');
          }
          return currentProfile;
        });
        
        // Use state setter to get latest selectedChat
        setSelectedChat(currentChat => {
          // Rejoin chat room if we have a selected chat
          if (currentChat && !isNewChat) {
            console.log('🔌 [USER-CHAT] Rejoining chat room after reconnect:', currentChat.id);
            socket.emit('join_chat_room', { chat_id: currentChat.id });
            console.log('🔌 [USER-CHAT] Emitted join_chat_room for chat:', currentChat.id);
          }
          return currentChat;
        });
      });

      socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
        setIsConnected(false);
      });

      // Register new_chat_message handler
      console.log('📨 [USER-CHAT] Registering new_chat_message event handler...');
      socket.on('new_chat_message', (data: any) => {
        console.log('📨 [USER-CHAT] ===== NEW MESSAGE EVENT TRIGGERED =====');
        console.log('📨 [USER-CHAT] Event handler called with data:', data);
        console.log('📨 [USER-CHAT] New message received:', JSON.stringify(data, null, 2));
        // Always update chat list first
        setChats(prev => prev.map(chat => 
          chat.id === data.chat_id 
            ? { ...chat, last_message: data.message.content.substring(0, 50), updated_at: data.message.created_at }
            : chat
        ));
        
        // Use state setters with function form to access latest values
        setSelectedChat(currentChat => {
          setUserProfile(currentProfile => {
            // Only add to messages if this is the currently selected chat
            if (data.chat_id === currentChat?.id) {
              // Check if this message is from the current user
              const isOwnMessage = !!(currentProfile?.id && data.message.sender_id && data.message.sender_id === currentProfile.id);
              
              console.log('🔍 [USER-CHAT] Message ownership check:', {
                chat_id: data.chat_id,
                current_chat_id: currentChat?.id,
                sender_id: data.message.sender_id,
                userProfile_id: currentProfile?.id,
                isOwnMessage,
                message_id: data.message.id
              });
              
              const newMsg: ChatMessage = {
                id: data.message.id,
                content: data.message.content,
                sender: data.message.sender,
                is_own_message: isOwnMessage,
                created_at: data.message.created_at,
              };
              
              // Prevent duplicates and update existing messages with correct ownership
              setMessages(prev => {
                const existingIndex = prev.findIndex(msg => msg.id === newMsg.id);
                if (existingIndex !== -1) {
                  // Message exists - update it if ownership changed
                  const existing = prev[existingIndex];
                  if (existing.is_own_message !== newMsg.is_own_message) {
                    const updated = [...prev];
                    updated[existingIndex] = newMsg;
                    console.log('🔄 [USER-CHAT] Updating existing message with correct ownership:', newMsg.id);
                    return updated;
                  }
                  console.log('⚠️ [USER-CHAT] Duplicate message detected, skipping:', newMsg.id);
                  return prev;
                }
                console.log('✅ [USER-CHAT] Adding new message:', newMsg.id);
                return [...prev, newMsg];
              });
              scrollToBottom();
              
              // If message is from another user, they're definitely online
              if (!isOwnMessage) {
                setOtherUserOnline(true);
              }
            } else {
              console.log('⚠️ [USER-CHAT] Message for different chat:', {
                message_chat_id: data.chat_id,
                current_chat_id: currentChat?.id
              });
            }
            return currentProfile;
          });
          return currentChat;
        });
      });

      socket.on('chat_typing', (data: any) => {
        console.log('⌨️ [USER-CHAT] Typing event received:', data);
        // Use state setter with function form to access latest selectedChat
        setSelectedChat(currentChat => {
          if (data.chat_id === currentChat?.id && data.user_id !== userProfile?.id) {
            // If user is typing, they're definitely online
            setOtherUserOnline(true);
            
            // Update typing users
            if (data.is_typing) {
              // Try to get username from multiple sources (same as web)
              let displayName: string | null = null;
              
              // 1. Check participants first
              const participant = currentChat?.participants?.find((p: any) => 
                p.id === data.user_id || p.user_id === data.user_id
              );
              
              if (participant) {
                const user = participant.user || participant;
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
              
              const username = displayName || 'Someone';
              console.log('⌨️ [USER-CHAT] Setting typing user:', username, 'for user_id:', data.user_id);
              setTypingUsers(prev => ({ ...prev, [data.user_id]: username }));
            } else {
              console.log('⌨️ [USER-CHAT] Removing typing user:', data.user_id);
              setTypingUsers(prev => {
                const updated = { ...prev };
                delete updated[data.user_id];
                return updated;
              });
            }
          }
          return currentChat;
        });
      });

      // Listen for user online/offline events
      socket.on('user_online', (data: any) => {
        if (selectedChat && data.chat_id === selectedChat.id && data.user_id !== userProfile?.id) {
          console.log('✅ User came online:', data.username);
          setOtherUserOnline(true);
        }
      });

      socket.on('user_offline', (data: any) => {
        if (selectedChat && data.chat_id === selectedChat.id && data.user_id !== userProfile?.id) {
          console.log('❌ User went offline:', data.username);
          setOtherUserOnline(false);
        }
      });

      // Listen for participant online status when joining chat
      socket.on('chat_participants_status', (data: any) => {
        if (selectedChat && data.chat_id === selectedChat.id) {
          // Check if any other participant is online
          const hasOnlineParticipant = data.participants?.some((p: any) => 
            p.user_id !== userProfile?.id && p.is_online
          );
          setOtherUserOnline(hasOnlineParticipant || false);
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
      
      // Debug: Log all socket events (if available)
      if (typeof (socket as any).onAny === 'function') {
        (socket as any).onAny((eventName: string, ...args: any[]) => {
          // Log ALL events including new_chat_message for debugging
          if (eventName === 'new_chat_message') {
            console.log(`🔍 [USER-CHAT] ===== onAny DETECTED new_chat_message =====`, args.length > 0 ? args[0] : '');
          }
          if (eventName !== 'connect' && eventName !== 'disconnect' && eventName !== 'connect_error' && eventName !== 'error') {
            console.log(`🔍 [USER-CHAT] Socket event received: ${eventName}`, args.length > 0 ? args[0] : '');
          }
        });
        console.log('✅ [USER-CHAT] onAny handler registered for debugging');
      } else {
        console.warn('⚠️ [USER-CHAT] socket.onAny is not available - cannot debug all events');
      }
      
      // Verify handlers are registered
      const listeners = (socket as any)._callbacks || (socket as any).listeners || {};
      console.log('📋 [USER-CHAT] Registered event handlers:', Object.keys(listeners));
      console.log('📋 [USER-CHAT] Has new_chat_message handler:', !!(listeners['new_chat_message'] || (socket as any)._events?.['new_chat_message']));
      
      console.log('✅ [USER-CHAT] Socket initialized and event handlers registered');
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

  // Handle route params to open specific chat (e.g., from workspace screen)
  useEffect(() => {
    if (!params.chatId && !params.workspaceId) {
      return; // No params to handle
    }

    const handleRouteParams = async () => {
      // If chatId is provided, find and select it
      if (params.chatId) {
        const chatId = parseInt(params.chatId as string);
        const chat = chats.find(c => c.id === chatId);
        
        if (chat) {
          setSelectedChat(chat);
          loadMessages(chatId);
          // Clear params to prevent re-triggering
          router.setParams({});
          return;
        }
      }
      
      // If workspace params exist, start/find the workspace chat
      if (params.workspaceId && params.workspaceName) {
        const workspaceId = parseInt(params.workspaceId as string);
        const workspaceName = params.workspaceName as string;
        
        try {
          const response = await api.startUserChat({
            type: 'workspace',
            workspace_id: workspaceId
          });
          
          if (response.success && (response as any).chat) {
            const chatData = (response as any).chat;
            
            // Format title as #{workspace.name} like web version
            const title = chatData.display_name?.startsWith('#') 
              ? chatData.display_name 
              : `#${workspaceName}`;
            
            const newChat: Chat = {
              id: chatData.id,
              title: title,
              type: 'workspace' as const,
              participants: chatData.participants || [],
              last_message: chatData.latest_message?.content || 'No messages yet',
              updated_at: chatData.last_message_at || new Date().toISOString(),
              created_at: chatData.created_at || new Date().toISOString(),
              unread_count: chatData.unread_count || 0,
              workspace: chatData.workspace_id ? { 
                id: chatData.workspace_id, 
                name: workspaceName, 
                slug: chatData.workspace?.slug || '' 
              } : undefined,
            };
            
            // Add to chats list if not already there
            setChats(prev => {
              const exists = prev.find(c => c.id === newChat.id);
              if (exists) {
                return prev;
              }
              return [newChat, ...prev];
            });
            
            setSelectedChat(newChat);
            loadMessages(chatData.id);
          }
        } catch (error: any) {
          console.error('Error starting workspace chat:', error);
          Alert.alert('Error', error.message || 'Failed to start workspace chat');
        } finally {
          // Clear params
          router.setParams({});
        }
      }
    };

    // Wait for chats to load if we need chatId, otherwise proceed immediately for workspace
    if (params.chatId && chats.length === 0) {
      // Wait for chats to load
      return;
    }
    
    handleRouteParams();
  }, [params.chatId, params.workspaceId, params.workspaceName, chats.length]);

  const loadUserProfile = async () => {
    try {
      const response = await api.getUserProfile();
      console.log('👤 getUserProfile response:', JSON.stringify(response, null, 2));
      
      // Extract user data from response - could be response.data or response.data.data
      const userData = response.data || response;
      if (userData) {
        console.log('👤 Setting userProfile:', { id: userData.id, username: userData.username, email: userData.email });
        setUserProfile(userData);
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
        const userChats = (response as any).chats.map((chat: any) => {
          // For workspace chats, use #{workspace.name} format like web
          let title = chat.display_name || 'Untitled Chat';
          if (chat.type === 'workspace' && chat.workspace) {
            title = `#${chat.workspace.name}`;
          } else if (chat.type === 'workspace' && chat.display_name && !chat.display_name.startsWith('#')) {
            // If display_name doesn't start with #, add it
            title = `#${chat.display_name}`;
          }
          
          return {
            id: chat.id,
            title: title,
            type: chat.type === 'direct' ? 'user_direct' as const : 'workspace' as const,
            participants: chat.participants || [],
            last_message: chat.latest_message?.content || 'No messages yet',
            updated_at: chat.last_message_at || new Date().toISOString(),
            created_at: chat.created_at || new Date().toISOString(),
            unread_count: chat.unread_count || 0,
            workspace: chat.workspace_id ? { 
              id: chat.workspace_id, 
              name: chat.workspace?.name || chat.display_name?.replace(/^#/, '') || 'Workspace', 
              slug: chat.workspace?.slug || '' 
            } : undefined,
          };
        });
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
      
      // Ensure userProfile is loaded before determining message ownership
      if (!userProfile) {
        await loadUserProfile();
      }
      
      const response = await api.getChatMessages(chatId);
      if (response.success && (response as any).messages) {
        const convertedMessages: ChatMessage[] = (response as any).messages.map((msg: any) => {
          // Use the same logic as sendMessageToChat for consistency
          // Convert both to numbers for comparison in case one is string and other is number
          const isOwnMessage = !!(userProfile?.id && msg.sender_id && Number(msg.sender_id) === Number(userProfile.id));
          
          console.log(`🔍 Message ${msg.id} ownership check:`, {
            sender_id: msg.sender_id,
            sender_id_type: typeof msg.sender_id,
            userProfile_id: userProfile?.id,
            userProfile_id_type: typeof userProfile?.id,
            isOwnMessage,
            comparison: `${msg.sender_id} === ${userProfile?.id}`,
            numberComparison: `${Number(msg.sender_id)} === ${Number(userProfile?.id)}`
          });
          
          return {
            id: msg.id,
            content: msg.content || '',
            sender: msg.sender || null,
            is_own_message: isOwnMessage,
            created_at: msg.created_at || new Date().toISOString(),
          };
        });
        console.log(`✅ Loaded ${convertedMessages.length} messages for chat ${chatId}`);
        console.log(`📊 User profile ID: ${userProfile?.id}, Messages ownership summary:`, 
          convertedMessages.map(m => ({ id: m.id, is_own: m.is_own_message })));
        console.log(`📊 User profile ID: ${userProfile?.id}, Messages ownership:`, 
          convertedMessages.map(m => ({ id: m.id, is_own: m.is_own_message, sender_id: (m.sender as any)?.id })));
        setMessages(convertedMessages);
      } else {
        console.warn(`⚠️ No messages found for chat ${chatId}`);
        setMessages([]);
      }
    } catch (error: any) {
      console.error(`❌ Failed to load messages for chat ${chatId}:`, error.message || error);
      // If chat doesn't exist, clear messages, refresh chat list, and navigate back
      if (error.message?.includes('Chat not found') || 
          error.message?.includes('404') || 
          error.message?.includes('not found') ||
          error.response?.status === 404) {
        console.warn(`⚠️ Chat ${chatId} not found, refreshing chat list and clearing selection`);
        setMessages([]);
        setSelectedChat(null);
        setIsNewChat(false);
        // Refresh the chat list to remove stale chat IDs
        loadChats();
        // Show user-friendly message
        Alert.alert('Chat Not Found', 'This chat may have been deleted or you no longer have access to it.');
      } else {
        // Show error for other cases
        Alert.alert('Error', error.message || 'Failed to load messages. Please try again.');
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
    console.log('📤 [USER-CHAT] ===== handleSendMessage CALLED =====');
    console.log('📤 [USER-CHAT] isNewChat:', isNewChat);
    console.log('📤 [USER-CHAT] selectedRecipient:', selectedRecipient);
    console.log('📤 [USER-CHAT] selectedChat:', selectedChat);
    console.log('📤 [USER-CHAT] newMessage:', newMessage);
    
    // If in new chat mode and no recipient selected, try to start chat
    if (isNewChat && !selectedRecipient) {
      console.log('⚠️ [USER-CHAT] Cannot send - new chat but no recipient selected');
      Alert.alert('Select Recipient', 'Type @ and select a user or workspace to start the chat');
      return;
    }

    // If in new chat mode with recipient, start the chat first
    if (isNewChat && selectedRecipient) {
      console.log('📤 [USER-CHAT] Starting new chat first, then sending message');
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
    if (!selectedChat || !newMessage.trim()) {
      console.log('⚠️ [USER-CHAT] Cannot send - missing chat or empty message:', {
        hasSelectedChat: !!selectedChat,
        hasMessage: !!newMessage.trim(),
        messageLength: newMessage.trim().length
      });
      return;
    }
    console.log('📤 [USER-CHAT] Proceeding with normal message send');
    await sendMessageToChat(selectedChat.id, newMessage.trim());
  };

  const sendMessageToChat = async (chatId: number, messageText: string) => {
    console.log('📤 [USER-CHAT] ===== SENDING MESSAGE =====');
    console.log('📤 [USER-CHAT] Chat ID:', chatId);
    console.log('📤 [USER-CHAT] Message text:', messageText);
    console.log('📤 [USER-CHAT] User ID:', userProfile?.id);
    console.log('📤 [USER-CHAT] User profile:', userProfile);
    
    setSendingMessage(true);

    // Emit typing stopped
    if (socketRef.current && userProfile?.id) {
      console.log('📤 [USER-CHAT] Emitting typing stopped event');
      socketRef.current.emit('user_typing', { 
        chat_id: chatId,
        user_id: userProfile.id,
        is_typing: false
      });
    }

    try {
      console.log('📤 [USER-CHAT] Calling API to send message...');
      const response = await api.sendChatMessageToChat(messageText, chatId);
      console.log('📤 [USER-CHAT] API response received:', {
        success: response.success,
        hasMessage: !!(response as any).message,
        messageId: (response as any).message?.id,
        messageContent: (response as any).message?.content,
        senderId: (response as any).message?.sender_id
      });
      
      if (response.success && (response as any).message) {
        const newMsg = (response as any).message;
        // Use the same logic as loadMessages to determine is_own_message
        // This ensures consistency between sent messages and loaded messages
        // Convert both to numbers for comparison in case one is string and other is number
        const isOwnMessage = !!(userProfile?.id && newMsg.sender_id && Number(newMsg.sender_id) === Number(userProfile.id));
        const messageObj: ChatMessage = {
          id: newMsg.id,
          content: newMsg.content,
          sender: newMsg.sender,
          is_own_message: isOwnMessage,
          created_at: newMsg.created_at || new Date().toISOString()
        };
        
        console.log('📤 Sent message ownership check:', {
          sender_id: newMsg.sender_id,
          sender_id_type: typeof newMsg.sender_id,
          userProfile_id: userProfile?.id,
          userProfile_id_type: typeof userProfile?.id,
          isOwnMessage,
          message_id: newMsg.id,
          comparison: `${newMsg.sender_id} === ${userProfile?.id}`,
          numberComparison: `${Number(newMsg.sender_id)} === ${Number(userProfile?.id)}`
        });
        
        // Add message locally (socket will also broadcast it, but we prevent duplicates)
        setMessages(prev => {
          const messageExists = prev.some(msg => msg.id === messageObj.id);
          if (messageExists) {
            console.log('⚠️ Message already exists, skipping duplicate:', messageObj.id);
            return prev;
          }
          return [...prev, messageObj];
        });
        scrollToBottom();
        
        setChats(prev => prev.map(chat => 
          chat.id === chatId 
            ? { ...chat, last_message: newMsg.content.substring(0, 50), updated_at: newMsg.created_at || new Date().toISOString() }
            : chat
        ));
      }
      setNewMessage('');
      console.log('📤 [USER-CHAT] Message sent successfully, cleared input');
    } catch (error: any) {
      console.error('❌ [USER-CHAT] Failed to send message:', error);
      console.error('❌ [USER-CHAT] Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        chatId,
        messageText,
        userId: userProfile?.id
      });
      const errorMessage = error?.message || 'Failed to send message. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setSendingMessage(false);
      console.log('📤 [USER-CHAT] Send operation completed (success or error)');
    }
  };

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleTyping = (text: string) => {
    setNewMessage(text);
    
    // Emit typing event (only if in existing chat)
    if (selectedChat && !isNewChat && socketRef.current && userProfile?.id) {
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      const chatId = selectedChat.id;
      const userId = userProfile.id;
      
      // Emit typing started
      socketRef.current.emit('user_typing', { 
        chat_id: chatId,
        user_id: userId,
        is_typing: true
      });
      
      // Auto-stop typing after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        if (socketRef.current && userProfile?.id) {
          socketRef.current.emit('user_typing', { 
            chat_id: chatId,
            user_id: userId,
            is_typing: false
          });
        }
      }, 3000);
    }
  };


  const formatMessageTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      
      if (isNaN(date.getTime())) {
        return '';
      }
      
      // Format as HH:MM (e.g., "2:30 PM" or "14:30")
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return '';
    }
  };

  const formatChatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      
      if (isNaN(date.getTime())) {
        return 'Unknown';
      }
      
      return formatRelativeDate(date);
    } catch (error) {
      return 'Unknown';
    }
  };

  const formatRelativeDate = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < -1) {
      const currentYear = now.getFullYear();
      const dateYear = date.getFullYear();
      
      if (dateYear === currentYear) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }
    
    if (diffInMinutes < 1) return 'Now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    if (date > weekAgo) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    
    const currentYear = now.getFullYear();
    const dateYear = date.getFullYear();
    
    if (dateYear === currentYear) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    headerSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
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
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      padding: 0,
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
    chatItemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 3,
    },
    chatTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    chatTime: {
      fontSize: 11,
      color: colors.textSecondary,
      marginLeft: 8,
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
      paddingVertical: 1, // Minimal vertical padding
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
      borderRadius: 18,
      marginVertical: 0, // Minimal vertical margin
    },
    myMessageBubble: {
      backgroundColor: '#007AFF',
    },
    otherMessageBubble: {
      backgroundColor: colors.surface,
    },
    messageText: {
      fontSize: 16, // WhatsApp standard size
      lineHeight: 24, // 1.5x line height for better readability
      flexWrap: 'wrap',
      wordWrap: 'break-word',
      maxWidth: '100%',
      includeFontPadding: false, // Remove extra padding on Android
      textAlignVertical: 'top', // Align text to top for better multi-line display
    },
    myMessageText: {
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
    myMessageTime: {
      color: 'rgba(255, 255, 255, 0.7)',
    },
    otherMessageTime: {
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
    typingIndicator: {
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    typingText: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textSecondary,
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
  }), [colors, insets]);

  if (isNewChat || selectedChat) {
    return (
      <SafeAreaView style={dynamicStyles.container} edges={['top', 'bottom']}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity onPress={() => {
            if (selectedChat || isNewChat) {
              // If in a chat, go back to chat list
              setSelectedChat(null);
              setIsNewChat(false);
              setSelectedRecipient(null);
              setNewMessage('');
            } else {
              // If on chat list, go back to previous screen
              router.back();
            }
          }} style={dynamicStyles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          {!isNewChat && selectedChat && selectedChat.participants !== undefined ? (
            <TouchableOpacity
              style={{ flex: 1, alignItems: 'center' }}
              onPress={() => {
                router.push({
                  pathname: '/user-chat/participants',
                  params: {
                    chatId: selectedChat.id.toString(),
                  },
                });
              }}
              activeOpacity={0.7}
            >
              <Text style={dynamicStyles.headerTitle}>
                {selectedChat?.title || ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={dynamicStyles.headerSubtitle}>
                  {selectedChat.participants.length} participant{selectedChat.participants.length !== 1 ? 's' : ''}
                </Text>
                {isConnected && otherUserOnline && (
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>• Connected</Text>
                )}
              </View>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={dynamicStyles.headerTitle}>
                {isNewChat ? 'New Message' : selectedChat?.title || ''}
              </Text>
              {isNewChat && selectedRecipient && (
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  {selectedRecipient.type === 'user' ? selectedRecipient.data.username : selectedRecipient.data.name}
                </Text>
              )}
            </View>
          )}
          {!isNewChat && selectedChat && (
            <TouchableOpacity 
              onPress={() => {
                setRefreshing(true);
                loadMessages(selectedChat.id).finally(() => setRefreshing(false));
              }}
              style={dynamicStyles.newChatButton}
              disabled={refreshing}
            >
              <Ionicons 
                name="refresh" 
                size={20} 
                color={refreshing ? "#999" : "#007AFF"} 
              />
            </TouchableOpacity>
          )}
          {isNewChat && <View style={{ width: 40 }} />}
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
                      <Text style={[dynamicStyles.messageTime, item.is_own_message ? dynamicStyles.myMessageTime : dynamicStyles.otherMessageTime]}>
                        {formatMessageTime(item.created_at)}
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
          
          {/* Typing Indicator */}
          {!isNewChat && Object.keys(typingUsers).length > 0 && (
            <View style={dynamicStyles.typingIndicator}>
              <Text style={dynamicStyles.typingText}>
                {Object.values(typingUsers).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing...
              </Text>
            </View>
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

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
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
        <TouchableOpacity onPress={() => {
          // Navigate back to home
          router.back();
        }} style={dynamicStyles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Messages</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity 
            onPress={() => {
              setRefreshing(true);
              loadChats();
            }}
            style={dynamicStyles.newChatButton}
            disabled={refreshing}
          >
            <Ionicons 
              name="refresh" 
              size={20} 
              color={refreshing ? "#999" : "#007AFF"} 
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNewChat} style={dynamicStyles.newChatButton}>
            <Ionicons name="add" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={dynamicStyles.searchContainer}>
        <View style={dynamicStyles.searchInputContainer}>
          <Ionicons name="search" size={20} color={colors.textSecondary} style={dynamicStyles.searchIcon} />
          <TextInput
            style={dynamicStyles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={dynamicStyles.searchIcon}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
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
                <View style={dynamicStyles.chatItemHeader}>
                  <Text style={dynamicStyles.chatTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={dynamicStyles.chatTime}>{formatChatTime(item.updated_at)}</Text>
                </View>
                <View style={dynamicStyles.chatFooter}>
                  <Text style={dynamicStyles.lastMessage} numberOfLines={2}>{item.last_message}</Text>
                </View>
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

