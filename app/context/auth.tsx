import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiService } from '../../services/api';
import { secureStorage } from '../../utils/storage';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  forceReset: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Using real API - no mock authentication needed

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const userData = await secureStorage.getItem('user');
      console.log('🔍 Checking stored user data:', userData);
      if (userData) {
        // Verify session with backend before setting user
        try {
          const response = await apiService.checkAuth();
          if (response.success && response.data) {
            // Backend confirms authentication, use stored user data
            const parsedUser = JSON.parse(userData);
            console.log('✅ Restoring user from storage:', parsedUser);
            setUser(parsedUser);
          } else {
            // Backend says not authenticated, clear stored data
            console.log('🔄 Backend auth check failed, clearing stored user');
            await forceReset();
          }
        } catch (error) {
          console.warn('⚠️ Auth check failed, clearing stored user:', error);
          await forceReset();
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
      await forceReset();
    } finally {
      setLoading(false);
    }
  };

  const forceReset = async () => {
    console.log('🧹 Performing complete authentication reset');
    
    // Clear user state immediately
    setUser(null);
    
    // Clear all possible storage locations
    const storageKeys = [
      'user',
      'auth_token', 
      'session_id',
      'auth-storage', // Zustand persistence
      'user_data',
      'authentication',
      'login_data',
    ];
    
    try {
      // Clear SecureStore
      for (const key of storageKeys) {
        try {
          await secureStorage.removeItem(key);
        } catch (error) {
          console.warn(`Failed to clear SecureStore key: ${key}`, error);
        }
      }
      
      // Clear AsyncStorage 
      for (const key of storageKeys) {
        try {
          await AsyncStorage.removeItem(key);
        } catch (error) {
          console.warn(`Failed to clear AsyncStorage key: ${key}`, error);
        }
      }
      
      console.log('✅ Complete storage reset completed');
    } catch (error) {
      console.error('❌ Error during force reset:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      
      // Use real API only - no fallback
      const response = await apiService.login({ 
        username: email, // API expects username, not email
        password 
      });
      
      console.log('🔍 Full API response in auth:', JSON.stringify(response, null, 2));
      console.log('🔍 Response success:', response.success);
      console.log('🔍 Response user:', response.user);
      console.log('🔍 Response session_info:', response.session_info);
      
      if (response.success) {
        // Case 1: Direct user data in response (older API format)
        if (response.user) {
          console.log('✅ Using direct user data from response');
          
          // Create a proper name from the user data
          const fullName = `${response.user.first_name || ''} ${response.user.last_name || ''}`.trim();
          const displayName = fullName || response.user.username || response.user.email || email;
          
          const localUser = {
            id: response.user.id.toString(),
            email: response.user.email || email,
            name: displayName,
          };
          
          console.log('💾 Storing user data:', localUser);
          await secureStorage.setItem('user', JSON.stringify(localUser));
          await secureStorage.setItem('auth_token', response.token || 'session_token');
          setUser(localUser);
          console.log('✅ Sign in successful for:', localUser.name);
          return;
        }
        
        // Case 2: Session info format (current backend response)
        if (response.session_info && response.session_info.user_id) {
          console.log('✅ Using session_info - creating user from login data');
          
          // Create user object from the login info we have
          const localUser = {
            id: response.session_info.user_id.toString(),
            email: email, // Use the login email/username
            name: email, // Use email as display name for now (can be updated later)
          };
          
          console.log('💾 Storing user data:', localUser);
          await secureStorage.setItem('user', JSON.stringify(localUser));
          await secureStorage.setItem('auth_token', 'session_token');
          setUser(localUser);
          console.log('✅ Sign in successful with session info for:', localUser.name);
          return;
        }
        
        console.error('❌ Login successful but no user data or session info received');
        throw new Error('Login successful but no user data received');
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (error) {
      console.error('❌ Sign in failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      setLoading(true);
      
      // Use real API for signup
      const [firstName, ...lastNameParts] = name.split(' ');
      const lastName = lastNameParts.join(' ') || '';
      
      const response = await apiService.signup({
        username: email, // Using email as username
        email,
        password,
        first_name: firstName,
        last_name: lastName,
      });
      
      if (response.success) {
        // After successful signup, we could auto-login or require manual login
        // For now, let's require manual login for security
        throw new Error('Signup successful! Please log in with your credentials.');
      } else {
        throw new Error(response.message || 'Signup failed');
      }
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      console.log('🔄 signOut function called');
      console.log('🔍 Current user before logout:', user);
      setLoading(true);
      console.log('🔄 Starting sign out process...');
      
      // Call backend logout API
      try {
        console.log('📡 Calling backend logout API...');
        await apiService.logout();
        console.log('✅ Successfully logged out from backend');
      } catch (apiError) {
        console.warn('⚠️ Backend logout failed, continuing with local logout:', apiError);
      }
      
      // Clear user state FIRST
      console.log('🧹 Clearing user state...');
      setUser(null);
      console.log('✅ User state set to null');
      
      // Small delay to ensure state propagation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Then perform complete reset
      console.log('🧹 Clearing all local storage...');
      await forceReset();
      
      console.log('✅ Sign out completed - user should be null:', user);
      
    } catch (error) {
      console.error('❌ Error during sign out:', error);
      // Force reset even if there are errors
      setUser(null);
      await forceReset();
    } finally {
      setLoading(false);
      console.log('🔄 signOut loading set to false');
      console.log('🔍 Final user state after logout:', user);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, forceReset }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Default export for Expo Router compatibility
export default AuthProvider; 