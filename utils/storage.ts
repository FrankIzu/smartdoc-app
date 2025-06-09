import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Cross-platform secure storage utility
 * Uses SecureStore on native platforms and localStorage on web
 */
class SecureStorage {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(key);
      } else {
        return await SecureStore.getItemAsync(key);
      }
    } catch (error) {
      console.warn('SecureStorage.getItem error:', error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    } catch (error) {
      console.warn('SecureStorage.setItem error:', error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(key);
      } else {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      console.warn('SecureStorage.removeItem error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.clear();
      } else {
        // For native platforms, we'd need to track keys or clear specific ones
        // This is a simplified implementation
        console.warn('SecureStorage.clear: Not fully implemented for native platforms');
      }
    } catch (error) {
      console.warn('SecureStorage.clear error:', error);
    }
  }
}

export const secureStorage = new SecureStorage(); 