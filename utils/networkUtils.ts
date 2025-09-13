import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Get the appropriate backend URL based on the current environment and platform
 */
export const getBackendUrl = (): string => {
  // Check if we're in Expo Go development
  const isExpoGo = Constants.appOwnership === 'expo';
  const isDevelopment = __DEV__;
  
  // Environment variable override (highest priority)
  if (process.env.EXPO_PUBLIC_API_URL) {
    console.log('🔧 Using API URL from environment variable:', process.env.EXPO_PUBLIC_API_URL);
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // Development - use the specified IP address
  if (isDevelopment) {
    console.log('🔧 Using development IP for backend');
    return 'http://192.168.62.96:5000';
  }
  
  // Production or standalone app
  console.log('🔧 Using production API URL');
  return 'https://api.grabdocs.com';
};

/**
 * Get the local network IP address
 * This is a simplified version - in a real app you might want to use a more robust solution
 */
const getLocalNetworkIP = (): string | null => {
  // For now, we'll use a simple approach
  // In a real implementation, you might want to use a library like 'react-native-network-info'
  
  // Check if we're on Android emulator
  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }
  
  // For iOS simulator, use localhost
  if (Platform.OS === 'ios') {
    // For iOS development with physical device, use machine IP
    return '192.168.62.96';
  }
  
  // For web, use localhost
  if (Platform.OS === 'web') {
    return 'localhost';
  }
  
  // For physical devices, we'll need to detect the actual IP
  // This is where you'd implement IP detection logic
  return null;
};

/**
 * Get network fallback URLs with multiple IP options
 */
export const getNetworkFallbacks = (): string[] => {
  const primaryUrl = getBackendUrl();
  
  // For development, always include multiple IP options
  if (__DEV__) {
    const allIPs = [
      '192.168.62.96',  // Primary machine IP for mobile devices
      'localhost',       // Localhost fallback
      '127.0.0.1',      // Alternative localhost
      '10.0.2.2',       // Android emulator
    ];
    
    // Remove the primary URL from fallbacks to avoid duplicates
    const fallbacks = allIPs
      .filter(ip => !primaryUrl.includes(ip))
      .map(ip => `http://${ip}:5000`);
    
    console.log('🔧 Network fallbacks for development:', fallbacks);
    return fallbacks;
  }
  
  // Production fallbacks
  return [
    'https://smartdoc-production.up.railway.app',
  ];
};

/**
 * Get all possible backend URLs for testing connectivity
 */
export const getAllBackendUrls = (): string[] => {
  const primaryUrl = getBackendUrl();
  const fallbacks = getNetworkFallbacks();
  
  return [primaryUrl, ...fallbacks];
};

/**
 * Test connectivity to a specific URL
 */
export const testBackendConnectivity = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(`${url}/api/v1/mobile/health`, {
      method: 'GET',
      headers: {
        'X-Platform': 'mobile'
      }
    });
    return response.ok;
  } catch (error) {
    console.log(`❌ Failed to connect to ${url}:`, error);
    return false;
  }
};

/**
 * Find the first working backend URL
 */
export const findWorkingBackendUrl = async (): Promise<string | null> => {
  const urls = getAllBackendUrls();
  
  console.log('🔧 Testing connectivity to multiple backend URLs...');
  
  for (const url of urls) {
    console.log(`🔧 Testing: ${url}`);
    const isWorking = await testBackendConnectivity(url);
    if (isWorking) {
      console.log(`✅ Found working backend: ${url}`);
      return url;
    }
  }
  
  console.log('❌ No working backend found');
  return null;
}; 