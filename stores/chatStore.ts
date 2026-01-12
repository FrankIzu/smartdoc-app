import { create } from 'zustand';
import { apiService } from '../services/api';
import { ChatHistory, ChatMessage, ChatRequest, ChatState } from '../types';

interface ChatStore extends ChatState {
  // Actions
  fetchChatHistories: (limit?: number, offset?: number) => Promise<void>;
  fetchChatConversation: (id: number) => Promise<void>;
  sendMessage: (request: ChatRequest) => Promise<boolean>;
  createNewChat: (title?: string) => Promise<number | null>;
  updateChatTitle: (id: number, title: string) => Promise<boolean>;
  deleteChatHistory: (id: number) => Promise<boolean>;
  setCurrentHistory: (history: ChatHistory | null) => void;
  addMessageToCurrentHistory: (message: ChatMessage) => void;
  clearError: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // Initial state
  histories: [],
  currentHistory: null,
  isLoading: false,
  error: null,

  // Actions
  fetchChatHistories: async (limit: number = 50, offset: number = 0) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await apiService.getChatHistory(limit, offset);
      
      if (response.success && response.data) {
        // Handle pagination: if offset is 0, replace; otherwise append
        const currentHistories = get().histories;
        const newHistories = offset === 0 
          ? response.data 
          : [...currentHistories, ...response.data];
        
        set({
          histories: newHistories,
          isLoading: false,
          error: null,
        });
      } else {
        set({
          isLoading: false,
          error: response.message || 'Failed to fetch chat histories',
        });
      }
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to fetch chat histories',
      });
    }
  },

  fetchChatConversation: async (id: number) => {
    set({ isLoading: true, error: null });
    
    try {
      console.log('🔍 Fetching chat conversation for ID:', id);

      let messages: any[] | null = null;

      // Primary: use the existing chat history endpoint
      // CRITICAL: This function is only called for AI assistant chats from /api/v1/mobile/chat/history
      // DO NOT use getChatMessages fallback as it calls the user-chat endpoint which will return 404 for AI chats
      try {
        const historyResponse = await apiService.getChatHistory();
        console.log('📜 Chat history response loaded');
        if (historyResponse && (historyResponse as any).success) {
          const histories = (historyResponse as any).data || [];
          console.log(`📋 Total histories loaded: ${histories.length}`);
          
          const match = histories.find((h: any) => {
            // Compare IDs robustly to handle string/number mismatches
            const historyId = typeof h.id === 'string' ? parseInt(String(h.id), 10) : Number(h.id);
            const targetId = typeof id === 'string' ? parseInt(String(id), 10) : Number(id);
            return !isNaN(historyId) && !isNaN(targetId) && historyId === targetId;
          });
          
          if (match) {
            // Handle both new format (messages array) and existing format (conversation_data)
            // Also check for nested data structures
            let rawMessages = (match as any).messages || 
                             (match as any).conversation_data || 
                             (match as any).data?.messages ||
                             (match as any).data?.conversation_data ||
                             null;
            
            // If conversation_data is a string, try to parse it as JSON
            if (typeof rawMessages === 'string' && rawMessages.trim().startsWith('[')) {
              try {
                rawMessages = JSON.parse(rawMessages);
              } catch (e) {
                console.warn('⚠️ Failed to parse conversation_data as JSON:', e);
              }
            }
            
            messages = Array.isArray(rawMessages) ? rawMessages : [];
            
            console.log(`✅ Found chat ${id} in history:`, {
              hasMessages: !!(match as any).messages,
              hasConversationData: !!(match as any).conversation_data,
              hasDataMessages: !!(match as any).data?.messages,
              rawMessagesType: typeof rawMessages,
              rawMessagesIsArray: Array.isArray(rawMessages),
              messagesCount: messages.length,
              matchKeys: Object.keys(match),
              sampleMatch: {
                id: match.id,
                title: (match as any).title,
                hasMessages: !!(match as any).messages,
                messagesLength: Array.isArray((match as any).messages) ? (match as any).messages.length : 'not array',
                conversationDataType: typeof (match as any).conversation_data
              }
            });
          } else {
            console.log(`⚠️ Chat ${id} not found in history response. Available IDs:`, histories.slice(0, 10).map((h: any) => h.id));
          }
        } else {
          console.error('❌ Chat history response invalid:', historyResponse);
        }
      } catch (e) {
        console.error('❌ getChatHistory failed:', e);
        // Don't use user-chat endpoint fallback - this is an AI chat
      }

      console.log('💬 Messages found:', Array.isArray(messages) ? messages.length : 0);

      const chatHistory: ChatHistory = {
        id,
        title: `Chat ${id}`,
        messages: messages || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      set({
        currentHistory: chatHistory,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      console.error('Failed to fetch chat conversation:', error);
      set({
        isLoading: false,
        error: error.message || 'Failed to fetch conversation',
      });
    }
  },

  sendMessage: async (request: ChatRequest) => {
    const currentHistory = get().currentHistory;
    
    // Add user message to current history immediately
    const userMessage: ChatMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: request.message,
      timestamp: new Date().toISOString(),
      file_references: request.context_files,
    };
    
    get().addMessageToCurrentHistory(userMessage);
    
    try {
      const response = await apiService.sendChatMessage(request);
      
      if (response.success && response.data) {
        // Replace temporary user message and add assistant response
        const assistantMessage = response.data;
        
        if (currentHistory) {
          const updatedMessages = currentHistory.messages.map((msg) =>
            msg.id === userMessage.id ? { ...userMessage, id: assistantMessage.id + '_user' } : msg
          );
          
          const updatedHistory: ChatHistory = {
            ...currentHistory,
            messages: [...updatedMessages, assistantMessage],
            updated_at: new Date().toISOString(),
          };
          
          set({
            currentHistory: updatedHistory,
            error: null,
          });
          
          // Update the history in the histories list
          const histories = get().histories;
          const updatedHistories = histories.map((h) =>
            h.id === updatedHistory.id ? updatedHistory : h
          );
          
          set({ histories: updatedHistories });
        }
        
        return true;
      } else {
        set({ error: response.message || 'Failed to send message' });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Failed to send message' });
      return false;
    }
  },

  createNewChat: async (title?) => {
    try {
      const response = await apiService.createNewChat(title);
      
      if (response.success && response.data) {
        const newHistory = response.data;
        
        // Add to histories list
        const currentHistories = get().histories;
        set({
          histories: [newHistory, ...currentHistories],
          currentHistory: newHistory,
          error: null,
        });
        
        return newHistory.id;
      } else {
        set({ error: response.message || 'Failed to create new chat' });
        return null;
      }
    } catch (error: any) {
      set({ error: error.message || 'Failed to create new chat' });
      return null;
    }
  },

  updateChatTitle: async (id: number, title: string) => {
    try {
      const response = await apiService.updateChatHistory(id, title);
      
      if (response.success && response.data) {
        const updatedHistory = response.data;
        
        // Update in histories list
        const currentHistories = get().histories;
        const updatedHistories = currentHistories.map((h) =>
          h.id === id ? updatedHistory : h
        );
        
        set({
          histories: updatedHistories,
          error: null,
        });
        
        // Update current history if it's the same one
        const currentHistory = get().currentHistory;
        if (currentHistory && currentHistory.id === id) {
          set({ currentHistory: updatedHistory });
        }
        
        return true;
      } else {
        set({ error: response.message || 'Failed to update chat title' });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Failed to update chat title' });
      return false;
    }
  },

  deleteChatHistory: async (id: number) => {
    try {
      const response = await apiService.deleteChatHistory(id);
      
      if (response.success) {
        // Remove from histories list
        const currentHistories = get().histories;
        const updatedHistories = currentHistories.filter((h) => h.id !== id);
        
        set({
          histories: updatedHistories,
          error: null,
        });
        
        // Clear current history if it's the deleted one
        const currentHistory = get().currentHistory;
        if (currentHistory && currentHistory.id === id) {
          set({ currentHistory: null });
        }
        
        return true;
      } else {
        set({ error: response.message || 'Failed to delete chat' });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Failed to delete chat' });
      return false;
    }
  },

  setCurrentHistory: (history: ChatHistory | null) => {
    set({ currentHistory: history });
  },

  addMessageToCurrentHistory: (message: ChatMessage) => {
    const currentHistory = get().currentHistory;
    
    if (currentHistory) {
      const updatedHistory: ChatHistory = {
        ...currentHistory,
        messages: [...currentHistory.messages, message],
        updated_at: new Date().toISOString(),
      };
      
      set({ currentHistory: updatedHistory });
    }
  },

  clearError: () => {
    set({ error: null });
  },
})); 