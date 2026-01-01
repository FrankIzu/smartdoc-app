import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getBackendUrl, getNetworkFallbacks } from '../utils/networkUtils';

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
      'http://192.168.1.5:5000',  // Machine IP fallback
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

// Alternative: Use environment variable if available
export const API_BASE_URL = (() => {
  // Environment variable override (highest priority)
  if (process.env.EXPO_PUBLIC_API_URL) {
    console.log('🔧 Using API URL from environment variable:', process.env.EXPO_PUBLIC_API_URL);
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // Check if we're in Expo Go (local testing only)
  // Expo Go = local testing, use localhost
  // Standalone app (dev or prod build) = use production
  const isExpoGo = Constants.appOwnership === 'expo';
  
  if (isExpoGo) {
    // Only use localhost when running in Expo Go for local testing
    const localhostUrl = 'http://192.168.1.5:5000';
    console.log('🔧 Using localhost API URL (Expo Go detected):', localhostUrl);
    return localhostUrl;
  }
  
  // For standalone apps (dev builds or production builds), use production
  const productionUrl = 'https://api.grabdocs.com';
  console.log('🔧 Using production API URL (standalone app detected):', productionUrl);
  return productionUrl;
})();

// Network fallback configuration
export const NETWORK_FALLBACKS = getNetworkConfig().fallbacks;

export default Environment; 