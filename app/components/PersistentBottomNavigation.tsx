import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

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
    name: 'settings',
    label: 'Settings',
    icon: 'settings',
    route: '/(tabs)/settings',
  },
];

export default function PersistentBottomNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme();

  // Hide navigation on auth screens
  const isAuthScreen = pathname.startsWith('/(auth)');
  if (isAuthScreen) {
    return null;
  }

  const isActive = (route: string) => {
    if (route === '/(tabs)') {
      return pathname === '/(tabs)' || pathname === '/(tabs)/';
    }
    return pathname.startsWith(route);
  };

  const handleTabPress = (route: string) => {
    router.push(route as any);
  };

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
        borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0',
      }
    ]}>
      {tabs.map((tab) => {
        const active = isActive(tab.route);
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => handleTabPress(tab.route)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab.icon as any}
              size={24}
              color={active 
                ? (colorScheme === 'dark' ? '#fff' : '#007AFF')
                : (colorScheme === 'dark' ? '#666' : '#999')
              }
            />
            <Text style={[
              styles.label,
              {
                color: active 
                  ? (colorScheme === 'dark' ? '#fff' : '#007AFF')
                  : (colorScheme === 'dark' ? '#666' : '#999')
              }
            ]}>
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
    paddingBottom: 5,
    paddingTop: 5,
    height: 60,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});
