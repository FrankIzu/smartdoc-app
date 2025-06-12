import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface User {
  id: string;
  username: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  signup: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Check if user data exists in storage
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        setUser(JSON.parse(userData));
      }

      // Verify with backend
      const response = await apiClient.get('/api/auth-check');
      if (response.data.authenticated) {
        const currentUser = response.data.user;
        setUser(currentUser);
        await AsyncStorage.setItem('user', JSON.stringify(currentUser));
      } else {
        // Clear stored user data if not authenticated
        setUser(null);
        await AsyncStorage.removeItem('user');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      // Clear user data on error
      setUser(null);
      await AsyncStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await apiClient.post('/api/login', {
        username,
        password,
      });

      if (response.data.success) {
        const userData = response.data.user;
        setUser(userData);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const signup = async (username: string, email: string, password: string): Promise<boolean> => {
    try {
      const response = await apiClient.post('/api/signup', {
        username,
        email,
        password,
      });

      if (response.data.success) {
        const userData = response.data.user;
        setUser(userData);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Signup failed:', error);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiClient.post('/api/logout');
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      // Clear user data regardless of API response
      setUser(null);
      await AsyncStorage.removeItem('user');
    }
  };

  const value = {
    user,
    loading,
    login,
    signup,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
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