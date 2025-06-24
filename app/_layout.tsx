// Import polyfills for mobile compatibility
import 'react-native-url-polyfill/auto';

// Import polyfills for mobile compatibility
import { LogBox } from 'react-native';

// Only suppress specific development warnings that are known and non-critical
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'expo-notifications functionality is not fully supported',
  'Linking requires a build-time setting',
  'Warning: Text strings must be rendered within a <Text> component',
]);

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { AuthProvider, useAuth } from './context/auth';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  if (loading) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen 
            name="(tabs)" 
            options={{ 
              headerShown: false,
              title: 'Main'
            }} 
          />
        ) : (
          <Stack.Screen 
            name="(auth)" 
            options={{ 
              headerShown: false,
              title: 'Auth' 
            }} 
          />
        )}

        <Stack.Screen 
          name="public-upload" 
          options={{ 
            headerShown: false,
            title: 'Upload' 
          }} 
        />
        <Stack.Screen 
          name="forms" 
          options={{ 
            headerShown: false,
            title: 'Forms' 
          }} 
        />
        <Stack.Screen 
          name="upload-links" 
          options={{ 
            headerShown: false,
            title: 'Upload Links' 
          }} 
        />
        <Stack.Screen 
          name="workspaces" 
          options={{ 
            headerShown: false,
            title: 'Workspaces' 
          }} 
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
} 