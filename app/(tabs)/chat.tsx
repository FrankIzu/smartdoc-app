import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatMessage as ApiChatMessage, apiClient } from '../../services/api';
import { useAuth } from '../context/auth';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: Citation[];
}

interface Citation {
  source_type: string;
  source_name: string;
  excerpt?: string;
  confidence?: number;
}

export default function ChatScreen() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your AI assistant. I can help you analyze your documents, answer questions about your files, and provide intelligent insights. What would you like to know?',
      timestamp: new Date(),
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const loadChatHistory = async () => {
    try {
      const response = await apiClient.getChatHistory();
      if (response.success && response.messages) {
        const transformedMessages: ChatMessage[] = response.messages.map((msg: ApiChatMessage) => ({
          id: msg.id,
          role: 'user' as const,
          content: msg.message,
          timestamp: new Date(msg.timestamp),
        }));
        
        // Add assistant responses
        const allMessages: ChatMessage[] = [];
        response.messages.forEach((msg: ApiChatMessage) => {
          allMessages.push({
            id: msg.id,
            role: 'user',
            content: msg.message,
            timestamp: new Date(msg.timestamp),
          });
          
          if (msg.response) {
            allMessages.push({
              id: `${msg.id}_response`,
              role: 'assistant',
              content: msg.response,
              timestamp: new Date(msg.timestamp),
              citations: msg.citations,
            });
          }
        });
        
        setMessages(prev => [...prev, ...allMessages]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  useEffect(() => {
    if (user) {
      loadChatHistory();
    }
  }, [user]);

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = inputText;
    setInputText('');
    setIsLoading(true);

    try {
      const response = await apiClient.sendChatMessage(messageText);
      
      if (response.success) {
        const assistantMessage: ChatMessage = {
          id: response.chat_id || (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.response || 'I received your message but couldn\'t generate a response.',
          timestamp: new Date(),
          citations: response.citations || [],
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(response.message || 'Failed to get response');
      }
    } catch (error) {
      console.error('Chat error:', error);
      
      // Fallback response for when API is not available
      const fallbackMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I understand you're asking about "${messageText}". I can help you analyze your documents and provide insights. To give you the most accurate response, please upload some documents first through the Documents tab.`,
        timestamp: new Date(),
        citations: [
          {
            source_type: 'document',
            source_name: 'Sample Document.pdf',
            excerpt: 'Relevant information from your documents...',
            confidence: 0.85,
          }
        ],
      };
      setMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={[
      styles.messageContainer,
      item.role === 'user' ? styles.userMessage : styles.assistantMessage
    ]}>
      <View style={[
        styles.messageBubble,
        item.role === 'user' ? styles.userBubble : styles.assistantBubble
      ]}>
        <Text style={[
          styles.messageText,
          item.role === 'user' ? styles.userText : styles.assistantText
        ]}>
          {item.content}
        </Text>
        
        {item.citations && item.citations.length > 0 && (
          <View style={styles.citationsContainer}>
            <Text style={styles.citationsTitle}>Sources:</Text>
            {item.citations.map((citation, index) => (
              <View key={index} style={styles.citation}>
                <Ionicons name="document" size={12} color="#666" />
                <Text style={styles.citationText}>
                  {citation.source_name}
                  {citation.confidence && (
                    <Text style={styles.confidence}>
                      {' '}({Math.round(citation.confidence * 100)}% confidence)
                    </Text>
                  )}
                </Text>
              </View>
            ))}
          </View>
        )}
        
        <Text style={styles.timestamp}>
          {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );

  useEffect(() => {
    // Auto-scroll to bottom when new messages are added
    flatListRef.current?.scrollToEnd();
  }, [messages]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={24} color="#007AFF" />
        <Text style={styles.headerTitle}>AI Chat Assistant</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.loadingText}>AI is thinking...</Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask me anything about your documents..."
            multiline
            maxLength={1000}
            editable={!isLoading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isLoading}
          >
            <Ionicons name="send" size={20} color={!inputText.trim() || isLoading ? "#ccc" : "#fff"} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
    color: '#333',
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messageContainer: {
    marginVertical: 4,
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  assistantMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 18,
    marginVertical: 2,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#333',
  },
  citationsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  citationsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  citation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  citationText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
    flex: 1,
  },
  confidence: {
    color: '#007AFF',
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    textAlign: 'right',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  loadingText: {
    marginLeft: 8,
    color: '#666',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#f0f0f0',
  },
}); 