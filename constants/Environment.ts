import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getBackendUrl, getNetworkFallbacks } from '../utils/networkUtils';
import { LOCAL_DEV_IP, LOCAL_DEV_PORT, LOCAL_DEV_URL, API_BASE_URL as CONFIG_API_BASE_URL } from './Config';

// Fix for EXPO_OS warning by providing proper platform detection
export const EXPO_OS = Platform.OS;
export const EXPO_PLATFORM = Platform.OS;

// Environment configuration
export const Environment = {
  isDevelopment: __DEV__,
  isProduction: !__DEV__,
  platform: Platform.OS,
  isWeb: Platform.OS === 'web',
  isIOS: Platform.OS === 'ios',
  isAndroid: Platform.OS === 'android',
  DEBUG_API_URL: true, // Enable debug logging
};

// Detect if we're in Expo Go vs standalone app
const isExpoGo = Constants.appOwnership === 'expo';
const isStandaloneApp = Constants.appOwnership !== 'expo';

// Network configuration for different environments
const getNetworkConfig = () => {
  // Use dynamic backend URL detection with multiple fallbacks
  const primaryUrl = getBackendUrl();
  const fallbackUrls = getNetworkFallbacks();
  
  console.log('🔧 Environment: Using dynamic network configuration');
  console.log('🔧 Primary URL:', primaryUrl);
  console.log('🔧 Fallback URLs:', fallbackUrls);
  
  // For Expo Go (local testing), try multiple IPs
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) {
    const allUrls = [
      primaryUrl,
      'http://127.0.0.1:5000',     // localhost fallback
      LOCAL_DEV_URL,                // Machine IP fallback (from Config.ts)
    ];
    
    return {
      primary: primaryUrl,
      fallbacks: allUrls.filter(url => url !== primaryUrl)
    };
  }
  
  return {
    primary: primaryUrl,
    fallbacks: fallbackUrls
  };
};

// API URL configuration based on environment
export const getApiBaseUrl = () => {
  const config = getNetworkConfig();
  return config.primary;
};

// Debug logging to see which URL is being used
export const DEBUG_API_URL = true;

// Use API_BASE_URL from Config.ts as the single source of truth
// This avoids duplication and ensures consistency across the app
export const API_BASE_URL = CONFIG_API_BASE_URL;

// Network fallback configuration
export const NETWORK_FALLBACKS = getNetworkConfig().fallbacks;

export default Environment; 