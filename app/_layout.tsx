// Import polyfills for mobile compatibility
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, LogBox, StyleSheet } from 'react-native';
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

import { SplashScreen, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import GlobalProgressBar from '../components/GlobalProgressBar';
import NetworkIndicator from '../components/NetworkIndicator';
import { AppLockProvider, useAppLock } from '../contexts/AppLockContext';
import { DisplayScaleProvider } from '../contexts/DisplayScaleContext';
import { Enhanced2FAAuthProvider } from '../contexts/Enhanced2FAAuthContext';
import { HeaderVisibilityProvider } from '../contexts/HeaderVisibilityContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';
import { useProgressStore } from '../services/progressService';
import { checkMinVersion, checkOtaAndFetch, checkSoftStoreUpdate, fetchAppConfig, reportUpdateTelemetry, setDismissedStoreUpdateVersion } from '../services/updateService';
import AppLockScreen from './components/AppLockScreen';
import OtaUpdateBanner from './components/OtaUpdateBanner';
import PersistentBottomNavigation from './components/PersistentBottomNavigation';
import UpdateRequiredScreen from './components/UpdateRequiredScreen';
import { AuthProvider, useAuth } from './context/auth';
import { getNotificationScreen, parseNotificationPath, initializePushNotifications, pushNotificationService } from './services/pushNotifications';

// Prevent the splash screen from auto-hiding (ignore if native splash not ready yet)
SplashScreen.preventAutoHideAsync().catch((err) => {
  if (!err?.message?.includes('No native splash screen registered')) {
    console.warn('SplashScreen.preventAutoHideAsync failed:', err);
  }
});

function RootLayoutNav() {
  const { visible, minimized, progressData, minimizeProgress, expandProgress, closeProgress } = useProgressStore();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { isLocked, appLockEnabled } = useAppLock();
  const router = useRouter();
  const segments = useSegments();
  const pushListenerRef = useRef<{ remove: () => void } | null>(null);
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  // Hide top bar (NetworkIndicator) on meeting screen to avoid black banner and full-screen meeting UX
  const isMeetingScreen = segments.some((s) => String(s).includes('hms-meeting-interface'));

  const APP_LOCK_REMINDER_KEY = '@grabdocs_app_lock_reminder_last_shown';
  const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

  // Remind user to enable app lock periodically until they do (GrabDocs PIN hidden; unlock via biometric + device passcode)
  // Do not show when user opened the app from an external link (deep link / universal link)
  const openedViaLinkRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!user || appLockEnabled) return;

    const maybeShowReminder = async () => {
      try {
        if (openedViaLinkRef.current === null) {
          const initialUrl = await Linking.getInitialURL();
          openedViaLinkRef.current = !!(initialUrl && initialUrl.trim().length > 0);
        }
        if (openedViaLinkRef.current) return;

        const lastStr = await AsyncStorage.getItem(APP_LOCK_REMINDER_KEY);
        const lastShown = lastStr ? parseInt(lastStr, 10) : 0;
        if (lastShown && Date.now() - lastShown < REMINDER_INTERVAL_MS) return;

        Alert.alert(
          'Set up app lock',
          'For better security, lock the app 10 minutes after you leave it. You can unlock with Face ID, Touch ID, or your device passcode.\n\nGo to Settings → Security & 2FA to turn it on.',
          [
            { text: 'Later' },
            {
              text: 'Open Settings',
              onPress: () => router.push('/(tabs)/settings'),
            },
          ]
        );
        await AsyncStorage.setItem(APP_LOCK_REMINDER_KEY, String(Date.now()));
      } catch {
        // ignore storage/alert errors
      }
    };

    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') maybeShowReminder();
    });

    // Show once on mount if they're logged in and no PIN (e.g. first open), unless opened via link
    maybeShowReminder();

    return () => sub.remove();
  }, [user, appLockEnabled, router]);

  const navigateFromNotificationData = useCallback(
    (data: Record<string, unknown>) => {
      const path = getNotificationScreen(data as Record<string, any>);
      try {
        const { pathname, params } = parseNotificationPath(path);
        if (params && Object.keys(params).length > 0) {
          router.push({ pathname, params } as any);
        } else {
          router.push(pathname as any);
        }
      } catch {
        router.push('/notifications');
      }
    },
    [router]
  );

  // When user taps a notification and app was killed, listener is not registered yet — use last response
  useEffect(() => {
    if (
      !lastNotificationResponse ||
      lastNotificationResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
    )
      return;
    const data = lastNotificationResponse.notification.request.content.data || {};
    navigateFromNotificationData(data as Record<string, unknown>);
  }, [lastNotificationResponse, navigateFromNotificationData]);

  // When user taps a push notification (app already running), open the right screen
  useEffect(() => {
    pushNotificationService.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      navigateFromNotificationData(data as Record<string, unknown>);
    }).then((subscription) => {
      pushListenerRef.current = subscription;
    });
    return () => {
      pushListenerRef.current?.remove();
    };
  }, [navigateFromNotificationData]);

  const showLock = !!user && appLockEnabled && isLocked;

  return (
    <>
      {showLock && <AppLockScreen />}
      <StatusBar style={isMeetingScreen ? "light" : isDark ? "light" : "dark"} />
      {/* Persistent Network Indicator - hidden on meeting screen for full-screen UX */}
      {!isMeetingScreen && (
        <SafeAreaView style={styles.networkIndicatorContainer} edges={['top']}>
          <NetworkIndicator compact persistent />
        </SafeAreaView>
      )}
      <View style={[styles.mainContainer, { backgroundColor: isDark ? '#151718' : '#fff' }]}>
        <HeaderVisibilityProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="login-success" options={{ headerShown: false }} />
          <Stack.Screen name="login-error" options={{ headerShown: false }} />
          {/* Match file routes: app/analytics/dashboard.tsx — not "analytics" */}
          <Stack.Screen name="analytics/dashboard" options={{ headerShown: false }} />
          <Stack.Screen name="bookmarks" options={{ headerShown: false }} />
          <Stack.Screen name="drafts" options={{ headerShown: false }} />
          {/* Documents tab lives under (tabs)/documents — no root app/documents */}
          <Stack.Screen name="forms" options={{ headerShown: false }} />
          <Stack.Screen name="quick-reach" options={{ headerShown: false }} />
          <Stack.Screen name="join-meeting" options={{ headerShown: false }} />
          <Stack.Screen name="upload-links" options={{ headerShown: false }} />
          <Stack.Screen name="workspaces" options={{ headerShown: false }} />
          <Stack.Screen name="scanner" options={{ headerShown: false }} />
          <Stack.Screen name="public-upload" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
        </Stack>
        </HeaderVisibilityProvider>
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
  const [updateRequired, setUpdateRequired] = useState<{ storeUrl: string; message?: string } | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  // Track which version/key the soft-update alert was last shown for, so we don't re-show it within
  // the same session for the same version, but do show it again if a newer version becomes available.
  const softAlertShownForRef = useRef<string>('');
  const lastUpdateCheckRef = useRef(0);
  const UPDATE_CHECK_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch((err) => {
        if (!err?.message?.includes('No native splash screen registered')) {
          console.warn('SplashScreen.hideAsync failed:', err);
        }
      });
    }
  }, [loading]);

  const showSoftUpdateAlert = useCallback((message: string, storeUrl: string, latestVersion?: string) => {
    const key = latestVersion ?? 'softWarning';
    if (softAlertShownForRef.current === key) return;
    softAlertShownForRef.current = key;
    Alert.alert(
      'Update Available',
      message,
      [
        {
          text: 'Later',
          style: 'cancel',
          onPress: () => {
            if (latestVersion) {
              // Persist dismiss so we don't prompt again for this exact version
              setDismissedStoreUpdateVersion(latestVersion).catch(() => {});
            }
          },
        },
        {
          text: 'Update Now',
          onPress: () => {
            reportUpdateTelemetry('soft_update_tapped', { latestVersion }).catch(() => {});
            Linking.openURL(storeUrl).catch(() => {});
          },
        },
      ],
      { cancelable: false },
    );
  }, []);

  const runUpdateChecks = useCallback(async () => {
    const config = await fetchAppConfig();
    const minResult = await checkMinVersion(undefined, config);
    if (minResult.mustUpdate) {
      reportUpdateTelemetry('min_version_blocked', {}).catch(() => {});
      setUpdateRequired({ storeUrl: minResult.storeUrl, message: minResult.message });
      return;
    }
    setUpdateRequired(null);
    if (minResult.softWarning) {
      showSoftUpdateAlert(minResult.softWarning.message, minResult.softWarning.storeUrl);
      return;
    }
    const soft = await checkSoftStoreUpdate(undefined, config);
    if (soft.updateAvailable) {
      showSoftUpdateAlert(
        `A new version of GrabDocs (${soft.latestVersion}) is available. Update for the latest features and fixes.`,
        soft.storeUrl,
        soft.latestVersion,
      );
    }
  }, [showSoftUpdateAlert]);

  // Min version + soft store update: fetch config once, then run both checks.
  useEffect(() => {
    if (loading) return;
    runUpdateChecks();
  }, [loading, runUpdateChecks]);

  // Re-check when app comes to foreground, but throttle to once per 10 minutes
  // to avoid hitting the config endpoint on every app switch.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (Date.now() - lastUpdateCheckRef.current < UPDATE_CHECK_COOLDOWN_MS) return;
      lastUpdateCheckRef.current = Date.now();
      runUpdateChecks();
    });
    return () => sub.remove();
  }, [runUpdateChecks]);

  // OTA: check and fetch silently; show banner when ready (user restarts when they want)
  useEffect(() => {
    if (loading || updateRequired) return;
    let mounted = true;
    checkOtaAndFetch().then(({ updateReady: ready }) => {
      if (mounted && ready) setUpdateReady(true);
    });
    return () => { mounted = false; };
  }, [loading, updateRequired]);

  if (loading) {
    return null;
  }

  if (updateRequired) {
    return <UpdateRequiredScreen storeUrl={updateRequired.storeUrl} message={updateRequired.message} />;
  }

  return (
    <>
      {updateReady && <OtaUpdateBanner />}
      <RootLayoutNav />
    </>
  );
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
          <DisplayScaleProvider>
            <AuthProvider>
              <Enhanced2FAAuthProvider>
                <AppLockProvider>
                  <AuthWrapper />
                </AppLockProvider>
              </Enhanced2FAAuthProvider>
            </AuthProvider>
          </DisplayScaleProvider>
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