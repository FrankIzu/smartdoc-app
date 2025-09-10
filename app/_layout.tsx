// Import polyfills for mobile compatibility
import React, { useEffect } from 'react';
import { LogBox, StyleSheet } from 'react-native';
import 'react-native-url-polyfill/auto';

// Only suppress specific development warnings that are known and non-critical
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'expo-notifications functionality is not fully supported',
  'Linking requires a build-time setting',
]);

import { Slot, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import GlobalProgressBar from '../components/GlobalProgressBar';
import NetworkIndicator from '../components/NetworkIndicator';
import { Enhanced2FAAuthProvider } from '../contexts/Enhanced2FAAuthContext';
import { useProgressStore } from '../services/progressService';
import { AuthProvider, useAuth } from './context/auth';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { visible, minimized, progressData, minimizeProgress, expandProgress, closeProgress } = useProgressStore();

  return (
    <>
      <StatusBar style="auto" />
      {/* Persistent Network Indicator */}
      <SafeAreaView style={styles.networkIndicatorContainer} edges={['top']}>
        <NetworkIndicator compact persistent />
      </SafeAreaView>
      <Slot />
      <Toast />
      <GlobalProgressBar
        visible={visible}
        minimized={minimized}
        progressData={progressData}
        onMinimize={minimizeProgress}
        onClose={closeProgress}
      />
    </>
  );
}

function AuthWrapper() {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  if (loading) {
    return null;
  }

  return <RootLayoutNav />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <Enhanced2FAAuthProvider>
            <AuthWrapper />
          </Enhanced2FAAuthProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  networkIndicatorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: 'flex-end', // Align to the right
    paddingTop: 0, // Remove all top padding
    paddingRight: 8, // Add some padding from the right edge
  },
}); 