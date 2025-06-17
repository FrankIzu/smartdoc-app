import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
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
    View,
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
  participants: ChatParticipant[];
  last_message: string;
  updated_at: string;
  created_at: string;
}

interface ChatMessage {
  id: number;
  content: string;
  sender: ChatParticipant | null;
  is_own_message: boolean;
  created_at: string;
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

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      console.log('🔍 API object:', api);
      console.log('🔍 API getChatHistory method:', api?.getChatHistory);
      
      if (!api || typeof api.getChatHistory !== 'function') {
        console.error('❌ API service not properly imported');
        // Create mock data for now
        const mockChats: Chat[] = [
          {
            id: 1,
            title: 'Welcome Chat',
            participants: [{ id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' }],
            last_message: 'Hello! How can I help you today?',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          }
        ];
        setChats(mockChats);
        return;
      }
      
      const response = await api.getChatHistory();
      if (response.success) {
        // Transform the chat history data to match our Chat interface
        const transformedChats: Chat[] = response.data?.map((chat: any) => ({
          id: chat.id || Math.random(),
          title: chat.title || `Chat ${chat.id}`,
          participants: chat.participants || [{ id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' }],
          last_message: chat.last_message || chat.message || 'No messages yet',
          updated_at: chat.updated_at || chat.created_at || new Date().toISOString(),
          created_at: chat.created_at || new Date().toISOString(),
        })) || [];
        setChats(transformedChats);
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
      // Fallback to mock data
      const mockChats: Chat[] = [
        {
          id: 1,
          title: 'Welcome Chat',
          participants: [{ id: 1, username: 'AI Assistant', email: 'ai@grabdocs.com' }],
          last_message: 'Hello! How can I help you today?',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }
      ];
      setChats(mockChats);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMessages = async (chatId: number) => {
    try {
      // For now, create mock messages since we don't have individual chat message endpoints
      // In the future, this would load messages for a specific chat
      const mockMessages: ChatMessage[] = [
        {
          id: 1,
          content: 'Hello! How can I help you today?',
          sender: { id: 0, username: 'AI Assistant', email: 'ai@grabdocs.com' },
          is_own_message: false,
          created_at: new Date().toISOString(),
        }
      ];
      setMessages(mockMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
      Alert.alert('Error', 'Failed to load messages');
    }
  };

  const sendMessage = async () => {
    if (!selectedChat || !newMessage.trim()) return;

    try {
      setSendingMessage(true);
      const response = await api.sendChatMessage(newMessage.trim());

      if (response.success) {
        // Add the new message to the current messages
        const newMsg: ChatMessage = {
          id: Date.now(),
          content: newMessage.trim(),
          sender: null,
          is_own_message: true,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, newMsg]);
        
        // Add AI response if available
        if (response.response) {
          const aiMsg: ChatMessage = {
            id: Date.now() + 1,
            content: response.response,
            sender: { id: 0, username: 'AI Assistant', email: 'ai@grabdocs.com' },
            is_own_message: false,
            created_at: new Date().toISOString(),
          };
          setMessages(prev => [...prev, aiMsg]);
        }
        
        setNewMessage('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const selectChat = (chat: Chat) => {
    setSelectedChat(chat);
    loadMessages(chat.id);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadChats();
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

  const renderChatItem = ({ item }: { item: Chat }) => (
    <TouchableOpacity
      style={[
        styles.chatItem,
        selectedChat?.id === item.id && styles.selectedChatItem
      ]}
      onPress={() => selectChat(item)}
    >
      <View style={styles.chatIcon}>
        <Ionicons name="chatbubbles" size={24} color="#fff" />
      </View>
      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.chatTime}>
            {formatChatTime(item.updated_at)}
          </Text>
        </View>
        <Text style={styles.lastMessage} numberOfLines={2}>
          {item.last_message}
        </Text>
        <Text style={styles.participants}>
          {item.participants.map(p => p.username).join(', ')}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderMessageItem = ({ item }: { item: ChatMessage }) => (
    <View style={[
      styles.messageContainer,
      item.is_own_message ? styles.ownMessage : styles.otherMessage
    ]}>
      {!item.is_own_message && (
        <Text style={styles.senderName}>
          {item.sender?.username || 'Unknown'}
        </Text>
      )}
      <Text style={styles.messageText}>{item.content}</Text>
      <Text style={styles.messageTime}>
        {formatMessageTime(item.created_at)}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Team Chat</Text>
      </View>

      <View style={styles.mainContent}>
        {/* Chat List */}
        <View style={styles.chatListContainer}>
          <Text style={styles.sectionTitle}>Conversations</Text>
          <FlatList
            data={chats}
            renderItem={renderChatItem}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#007AFF']}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyChatList}>
                <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No conversations yet</Text>
                <Text style={styles.emptySubtext}>
                  Start chatting with your team members
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Chat Messages */}
        <View style={styles.chatContainer}>
          {selectedChat ? (
            <>
              <View style={styles.chatHeader}>
                <View style={styles.chatHeaderInfo}>
                  <Text style={styles.chatHeaderTitle}>{selectedChat.title}</Text>
                  <Text style={styles.chatHeaderSubtitle}>
                    {selectedChat.participants.map(p => p.username).join(', ')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setSelectedChat(null)}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <FlatList
                data={messages}
                renderItem={renderMessageItem}
                keyExtractor={(item) => item.id.toString()}
                style={styles.messagesList}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
                inverted={false}
              />

              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.messageInputContainer}
              >
                <TextInput
                  style={styles.messageInput}
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder="Type a message..."
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    (!newMessage.trim() || sendingMessage) && styles.sendButtonDisabled
                  ]}
                  onPress={sendMessage}
                  disabled={!newMessage.trim() || sendingMessage}
                >
                  {sendingMessage ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </KeyboardAvoidingView>
            </>
          ) : (
            <View style={styles.noChatSelected}>
              <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
              <Text style={styles.noChatText}>Select a conversation</Text>
              <Text style={styles.noChatSubtext}>
                Choose a chat from the list to start messaging
              </Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  chatListContainer: {
    width: '40%',
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  chatItem: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectedChatItem: {
    backgroundColor: '#E3F2FD',
  },
  chatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  chatTime: {
    fontSize: 12,
    color: '#999',
  },
  lastMessage: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  participants: {
    fontSize: 10,
    color: '#999',
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  chatHeaderSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageContainer: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderRadius: 16,
    padding: 12,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    padding: 12,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageInputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  noChatSelected: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  noChatText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  noChatSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyChatList: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
}); 