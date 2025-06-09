import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../constants/Config';
import { apiService } from '../services/api';
import { AuthState, LoginCredentials, SignupData, User } from '../types';

interface AuthStore extends AuthState {
  // Actions
  login: (credentials: LoginCredentials) => Promise<boolean>;
  signup: (data: SignupData) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<boolean>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await apiService.login(credentials);
          
          if (response.success && response.user) {
            // Store user data securely
            await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(response.user));
            
            set({
              user: response.user,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
            
            return true;
          } else {
            set({
              isLoading: false,
              error: response.message || 'Login failed',
            });
            return false;
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Login failed',
          });
          return false;
        }
      },

      signup: async (data: SignupData) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await apiService.signup(data);
          
          if (response.success) {
            set({
              isLoading: false,
              error: null,
            });
            return true;
          } else {
            set({
              isLoading: false,
              error: response.message || 'Signup failed',
            });
            return false;
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Signup failed',
          });
          return false;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        
        try {
          await apiService.logout();
        } catch (error) {
          console.warn('Logout API call failed:', error);
        }
        
        // Clear local storage regardless of API call result
        try {
          await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
          await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
        } catch (error) {
          console.warn('Failed to clear secure storage:', error);
        }
        
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      },

      checkAuth: async () => {
        set({ isLoading: true });
        
        try {
          // First check if we have stored user data
          const storedUser = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
          
          if (storedUser) {
            const userData = JSON.parse(storedUser);
            
            // Verify with backend
            const response = await apiService.checkAuth();
            
            if (response.success && response.data) {
              set({
                user: response.data,
                isAuthenticated: true,
                isLoading: false,
                error: null,
              });
            } else {
              // Clear invalid stored data
              await get().logout();
            }
          } else {
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            });
          }
        } catch (error: any) {
          console.warn('Auth check failed:', error);
          // Clear potentially corrupted data
          await get().logout();
        }
      },

      updateUser: async (data: Partial<User>) => {
        const currentUser = get().user;
        if (!currentUser) return false;
        
        set({ isLoading: true, error: null });
        
        try {
          const response = await apiService.updateUser(data);
          
          if (response.success && response.data) {
            const updatedUser = response.data;
            
            // Update secure storage
            await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));
            
            set({
              user: updatedUser,
              isLoading: false,
              error: null,
            });
            
            return true;
          } else {
            set({
              isLoading: false,
              error: response.message || 'Update failed',
            });
            return false;
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Update failed',
          });
          return false;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist non-sensitive data
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        // Don't persist user data in AsyncStorage - use SecureStore instead
      }),
    }
  )
); 