// Import polyfills for mobile compatibility
import React, { useEffect } from 'react';
import 'react-native-url-polyfill/auto';

// Import polyfills for mobile compatibility
import { LogBox } from 'react-native';

// Only suppress specific development warnings that are known and non-critical
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'expo-notifications functionality is not fully supported',
  'Linking requires a build-time setting',
]);

import { Slot, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Enhanced2FAAuthProvider } from '../contexts/Enhanced2FAAuthContext';
import { AuthProvider, useAuth } from './context/auth';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  if (loading) {
    return null;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Slot />
      <Toast />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Enhanced2FAAuthProvider>
          <RootLayoutNav />
        </Enhanced2FAAuthProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
} 