import { create } from 'zustand';
import { apiService } from '../services/api';
import { ChatHistory, ChatMessage, ChatRequest, ChatState } from '../types';

interface ChatStore extends ChatState {
  // Actions
  fetchChatHistories: () => Promise<void>;
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
  fetchChatHistories: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await apiService.getChatHistory();
      
      if (response.success && response.data) {
        set({
          histories: response.data,
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
      const response = await apiService.getChatConversation(id);
      
      if (response.success && response.data) {
        set({
          currentHistory: response.data,
          isLoading: false,
          error: null,
        });
      } else {
        set({
          isLoading: false,
          error: response.message || 'Failed to fetch conversation',
        });
      }
    } catch (error: any) {
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