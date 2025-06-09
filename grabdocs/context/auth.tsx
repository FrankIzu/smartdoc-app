import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface AuthUser {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  signup: (userData: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      
      // Try to get user data directly from /api/user endpoint
      try {
        const userResponse = await apiClient.getUserProfile();
        console.log('✅ User profile fetched:', userResponse);
        
        if (userResponse && userResponse.id) {
          setUser({
            id: userResponse.id,
            username: userResponse.username,
            email: userResponse.email,
            firstName: userResponse.firstName || userResponse.first_name,
            lastName: userResponse.lastName || userResponse.last_name,
          });
          return;
        }
      } catch (userError) {
        console.log('User profile endpoint failed, trying auth-check:', userError);
      }
      
      // Fallback to auth-check endpoint
      try {
        const authResponse = await apiClient.checkAuth();
        console.log('✅ Auth check response:', authResponse);
        
        if (authResponse.success && authResponse.user) {
          setUser({
            id: authResponse.user.id,
            username: authResponse.user.username,
            email: authResponse.user.email,
            firstName: authResponse.user.first_name,
            lastName: authResponse.user.last_name,
          });
        } else {
          console.log('Auth check failed or no user data');
          setUser(null);
        }
      } catch (authError) {
        console.log('Auth check endpoint failed:', authError);
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      console.log('🔄 Starting login process for:', username);
      
      const response = await apiClient.login({ username, password });
      
      console.log('🔍 Full API response in auth:', response);
      console.log('🔍 Response success:', response.success);
      console.log('🔍 Response user:', response.user);
      console.log('🔍 Response session_info:', response.session_info);
      
      if (response && response.success) {
        // Case 1: User data is directly in the response (newer backend format)
        if (response.user) {
          console.log('✅ Using user data from response');
          setUser({
            id: response.user.id,
            username: response.user.username,
            email: response.user.email,
            firstName: response.user.first_name,
            lastName: response.user.last_name,
          });
          console.log('✅ Login successful with user data');
          return true;
        }
        
        // Case 2: Session info format (newer backend) - fetch user separately
        if (response.session_info && response.session_info.user_id) {
          console.log('🔄 Session info received, fetching user data from /api/user');
          try {
            const userResponse = await apiClient.getUserProfile();
            console.log('✅ User data fetched after login:', userResponse);
            
            if (userResponse && userResponse.id) {
              setUser({
                id: userResponse.id,
                username: userResponse.username,
                email: userResponse.email,
                firstName: userResponse.firstName || userResponse.first_name,
                lastName: userResponse.lastName || userResponse.last_name,
              });
              console.log('✅ Login successful with fetched user data');
              return true;
            } else {
              console.warn('⚠️ /api/user returned no user data');
            }
          } catch (userError) {
            console.error('❌ Failed to fetch user data after login:', userError);
          }
          
          // Fallback: Create minimal user from session info
          console.log('🔄 Using session_info fallback for user data');
          setUser({
            id: response.session_info.user_id,
            username: username, // Use the username they logged in with
            email: '', // Will be empty until we can fetch it
            firstName: '',
            lastName: '',
          });
          console.log('✅ Login successful with minimal user data');
          return true;
        }
        
        // Case 3: Success but no user data and no session info
        console.warn('⚠️ Login successful but no user data or session info available');
        console.log('❌ Cannot proceed without user identification');
        return false;
      } else {
        console.log('❌ Login response indicates failure:', response.message || 'Unknown error');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Login failed with error:', error);
      
      // Show user-friendly error messages based on error type
      let errorMessage = 'Login failed. Please try again.';
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. Please try again in a moment.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Invalid username or password.';
      } else if (!error.response) {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      console.error('❌ Final error message:', errorMessage);
      // You might want to throw the error here if you want the UI to show the error
      // throw new Error(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (userData: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<boolean> => {
    try {
      setIsLoading(true);
      const response = await apiClient.signup({
        username: userData.username,
        email: userData.email,
        password: userData.password,
        first_name: userData.firstName,
        last_name: userData.lastName,
      });
      
      console.log('✅ Signup response:', response);
      
      if (response && response.success) {
        console.log('✅ Signup successful, attempting auto-login');
        // After successful signup, automatically log in
        return await login(userData.username, userData.password);
      } else {
        console.log('❌ Signup failed:', response?.message || 'Unknown error');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Signup failed:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      console.log('🔄 Starting logout process');
      await apiClient.logout();
      console.log('✅ Backend logout successful');
    } catch (error) {
      console.error('⚠️ Backend logout failed:', error);
      // Continue with local logout even if backend fails
    } finally {
      console.log('🔄 Clearing local user state');
      setUser(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const value = {
    user,
    isLoading,
    login,
    signup,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 