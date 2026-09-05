import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../hooks/useThemeColors';
import { AnimatedHeaderContainer } from './components/AnimatedHeaderContainer';
import {
  NotificationsInboxContent,
  type AppNotification,
} from './components/NotificationsInboxContent';
import { TapToToggleHeaderView } from './components/TapToToggleHeaderView';
import { useAuth } from './context/auth';

import AppBackButton, { APP_BACK_BUTTON_SLOT } from '../components/AppBackButton';
import AppHeaderTitle from '../components/AppHeaderTitle';

export type { AppNotification };

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();

  const dynamicStyles = {
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.headerBackground,
    },
    headerTitle: { fontSize: 18, fontWeight: '600' as const, color: colors.text },
    emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' as const },
    empty: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingVertical: 48,
    },
  };

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <TapToToggleHeaderView style={[styles.container, { backgroundColor: colors.background }]}>
          <AnimatedHeaderContainer>
            <View style={dynamicStyles.header}>
              <AppBackButton />
              <AppHeaderTitle>Notifications</AppHeaderTitle>
              <View style={{ width: APP_BACK_BUTTON_SLOT }} />
            </View>
          </AnimatedHeaderContainer>
          <View style={dynamicStyles.empty}>
            <Text style={dynamicStyles.emptyText}>Sign in to view notifications.</Text>
          </View>
        </TapToToggleHeaderView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <TapToToggleHeaderView style={[styles.container, { backgroundColor: colors.background }]}>
        <NotificationsInboxContent variant="screen" />
      </TapToToggleHeaderView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
