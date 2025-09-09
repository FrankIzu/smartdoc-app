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
  
  // For development, always try multiple IPs
  if (__DEV__) {
    const allUrls = [
      primaryUrl,
      'http://127.0.0.1:5000',     // localhost fallback
      'http://192.168.62.96:5000',  // Machine IP fallback
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
  
  // HARDCODED FOR DEVELOPMENT: Use the actual machine IP for mobile devices
  if (__DEV__ && Constants.appOwnership === 'expo') {
    const hardcodedUrl = 'http://192.168.62.96:5000';
    console.log('🔧 FORCED API URL (hardcoded for development):', hardcodedUrl);
    console.log('🔧 This overrides all other detection logic');
    return hardcodedUrl;
  }
  
  // Otherwise, use environment-based logic
  const url = getApiBaseUrl();
  console.log('🔧 Using API URL from environment detection:', url);
  return url;
})();

// Network fallback configuration
export const NETWORK_FALLBACKS = getNetworkConfig().fallbacks;

export default Environment; 