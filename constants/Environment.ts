import { Platform } from 'react-native';

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
};

export default Environment; 