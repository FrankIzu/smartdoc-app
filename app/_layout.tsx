// Import polyfills for mobile compatibility
import React, { useEffect, useRef } from 'react';
import { LogBox, StyleSheet } from 'react-native';
import 'react-native-url-polyfill/auto';
import { errorLogger } from '../services/errorLogger';

// ErrorUtils might be a global in some React Native versions, or imported
// Try to get it from global if not available as import
const ErrorUtils = (global as any).ErrorUtils || require('react-native').ErrorUtils;

// Only suppress specific development warnings that are known and non-critical
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'expo-notifications functionality is not fully supported',
  'Linking requires a build-time setting',
  'react-native-hms module was not found', // HMS is native-only, expected in Expo Go
  '@100mslive/react-native-hms', // HMS module errors
]);

import { SplashScreen, Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import GlobalProgressBar from '../components/GlobalProgressBar';
import NetworkIndicator from '../components/NetworkIndicator';
import { Enhanced2FAAuthProvider } from '../contexts/Enhanced2FAAuthContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';
import { useProgressStore } from '../services/progressService';
import PersistentBottomNavigation from './components/PersistentBottomNavigation';
import { AuthProvider, useAuth } from './context/auth';
import { initializePushNotifications, pushNotificationService } from './services/pushNotifications';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { visible, minimized, progressData, minimizeProgress, expandProgress, closeProgress } = useProgressStore();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const pushListenerRef = useRef<{ remove: () => void } | null>(null);

  // Register for push and send token to backend when user is logged in
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    initializePushNotifications().then((token) => {
      if (mounted && token) {
        apiClient.registerPushToken(token).catch(() => {});
      }
    });
    return () => { mounted = false; };
  }, [user]);

  // When user taps a push notification, open notifications screen or deep link
  useEffect(() => {
    pushNotificationService.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.screen === 'notifications' || data?.type === 'workspace_invite') {
        router.push('/notifications');
      } else if (data?.screen) {
        try {
          router.push(data.screen as any);
        } catch {
          router.push('/notifications');
        }
      } else {
        router.push('/notifications');
      }
    }).then((subscription) => {
      pushListenerRef.current = subscription;
    });
    return () => {
      pushListenerRef.current?.remove();
    };
  }, [router]);

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      {/* Persistent Network Indicator */}
      <SafeAreaView style={styles.networkIndicatorContainer} edges={['top']}>
        <NetworkIndicator compact persistent />
      </SafeAreaView>
      <View style={[styles.mainContainer, { backgroundColor: isDark ? '#151718' : '#fff' }]}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="login-success" options={{ headerShown: false }} />
          <Stack.Screen name="login-error" options={{ headerShown: false }} />
          <Stack.Screen name="analytics" options={{ headerShown: false }} />
          <Stack.Screen name="bookmarks" options={{ headerShown: false }} />
          <Stack.Screen name="documents" options={{ headerShown: false }} />
          <Stack.Screen name="forms" options={{ headerShown: false }} />
          <Stack.Screen name="quick-reach" options={{ headerShown: false }} />
          <Stack.Screen name="upload-links" options={{ headerShown: false }} />
          <Stack.Screen name="workspaces" options={{ headerShown: false }} />
          <Stack.Screen name="scanner" options={{ headerShown: false }} />
          <Stack.Screen name="public-upload" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
        </Stack>
        <View style={styles.bottomNavContainer}>
          <PersistentBottomNavigation />
        </View>
      </View>
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
  useEffect(() => {
    // Check if ErrorUtils is available (may not be in all React Native versions)
    if (typeof ErrorUtils === 'undefined' || !ErrorUtils) {
      console.warn('⚠️ ErrorUtils is not available - skipping global error handler setup');
      return;
    }

    // Set up global error handler for unhandled errors
    let originalErrorHandler: ((error: Error, isFatal?: boolean) => void) | undefined;
    
    try {
      originalErrorHandler = ErrorUtils.getGlobalHandler?.();
    } catch (err) {
      console.warn('⚠️ Could not get original error handler:', err);
    }
    
    try {
      ErrorUtils.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
        // Try to log to backend, but don't let it crash the app
        try {
          errorLogger.logError(error, {
            severity: isFatal ? 'critical' : 'error',
            screenName: 'Global',
            userAction: 'Unhandled Error',
            errorType: 'UnhandledError',
          });
        } catch (logError) {
          // If error logging fails, just log to console
          console.error('Failed to log error to backend:', logError);
        }
        
        // Call original handler
        if (originalErrorHandler) {
          originalErrorHandler(error, isFatal);
        }
      });
    } catch (err) {
      console.warn('⚠️ Could not set global error handler:', err);
    }

    // Set up global promise rejection handler
    const unhandledRejectionHandler = (reason: any) => {
      try {
        const error = reason instanceof Error 
          ? reason 
          : new Error(String(reason || 'Unhandled Promise Rejection'));
        
        errorLogger.logError(error, {
          severity: 'error',
          screenName: 'Global',
          userAction: 'Unhandled Promise Rejection',
          errorType: 'UnhandledPromiseRejection',
        });
      } catch (logError) {
        // If error logging fails, just log to console
        console.error('Failed to log promise rejection to backend:', logError);
      }
    };

    // Handle unhandled promise rejections
    if (typeof global !== 'undefined' && global.Promise) {
      const originalUnhandledRejection = global.onunhandledrejection;
      global.onunhandledrejection = (event: any) => {
        unhandledRejectionHandler(event?.reason);
        if (originalUnhandledRejection && typeof originalUnhandledRejection === 'function') {
          (originalUnhandledRejection as any).call(global as any, event);
        }
      };
    }

    // Cleanup on unmount
    return () => {
      try {
        if (ErrorUtils && ErrorUtils.setGlobalHandler && originalErrorHandler) {
          ErrorUtils.setGlobalHandler(originalErrorHandler);
        }
      } catch (err) {
        console.warn('⚠️ Could not restore original error handler:', err);
      }
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <Enhanced2FAAuthProvider>
              <AuthWrapper />
            </Enhanced2FAAuthProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
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
  bottomNavContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
}); 