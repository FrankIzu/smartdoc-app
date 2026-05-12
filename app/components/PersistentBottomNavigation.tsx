import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TabItem {
  name: string;
  label: string;
  icon: string;
  route: string;
}

const tabs: TabItem[] = [
  {
    name: 'home',
    label: 'Home',
    icon: 'home',
    route: '/(tabs)',
  },
  {
    name: 'documents',
    label: 'Documents',
    icon: 'document-text',
    route: '/(tabs)/documents',
  },
  {
    name: 'chats',
    label: 'Chats',
    icon: 'chatbubbles',
    route: '/(tabs)/chats',
  },
  {
    name: 'calendar',
    label: 'Calendar',
    icon: 'calendar-outline',
    route: '/calendar',
  },
  {
    name: 'help',
    label: 'Help',
    icon: 'help-circle',
    route: '/(tabs)/help',
  },
];

/** Bottom bar on main tab routes only — calendar stack has its own header/back navigation. */
function shouldShowPersistentBottomNav(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname;
  if (p === '/calendar' || p === '/calendar/' || p.startsWith('/calendar/')) return false;
  if (!p.startsWith('/(tabs)')) return false;
  const rest = p.replace(/^\/\(tabs\)\/?/, '') || 'index';
  const root = rest.split('/')[0];
  return ['index', 'documents', 'chats', 'help', 'settings'].includes(root);
}

export default function PersistentBottomNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  if (!shouldShowPersistentBottomNav(pathname)) {
    return null;
  }

  const isActive = (route: string) => {
    if (route === '/(tabs)') {
      return pathname === '/(tabs)' || pathname === '/(tabs)/' || pathname === '/(tabs)/index';
    }
    if (route === '/calendar') {
      return pathname === '/calendar' || pathname === '/calendar/';
    }
    return pathname.startsWith(route);
  };

  const handleTabPress = (route: string) => {
    router.push(route as any);
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
          borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0',
          paddingBottom: Math.max(insets.bottom, 5),
        },
      ]}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.route);
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => handleTabPress(tab.route)}
            activeOpacity={0.7}
            accessibilityLabel={`${tab.label}, tab`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Ionicons
              name={tab.icon as any}
              size={22}
              color={active ? (colorScheme === 'dark' ? '#fff' : '#007AFF') : colorScheme === 'dark' ? '#666' : '#999'}
            />
            <Text
              style={[
                styles.label,
                {
                  color: active ? (colorScheme === 'dark' ? '#fff' : '#007AFF') : colorScheme === 'dark' ? '#666' : '#999',
                },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 5,
    minHeight: 56,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
});
