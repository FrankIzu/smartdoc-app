/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#2563eb';
const tintColorDark = '#3b82f6';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
  // Main color palette for components
  primary: '#2563eb',
  primaryLight: '#dbeafe',
  primaryDark: '#1d4ed8',
  secondary: '#64748b',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#0ea5e9',
  
  // Backgrounds
  background: '#ffffff',
  card: '#f8fafc',
  surface: '#ffffff',
  
  // Text colors
  text: '#1f2937',
  textSecondary: '#64748b',
  textLight: '#9ca3af',
  
  // UI colors
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  white: '#ffffff',
  black: '#000000',
  
  // Status colors
  online: '#22c55e',
  offline: '#64748b',
  away: '#f59e0b',
  busy: '#ef4444',
};
