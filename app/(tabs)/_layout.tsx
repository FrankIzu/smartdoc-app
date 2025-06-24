import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, { memo, useMemo } from 'react';
import { Platform, Text, View } from 'react-native';
import { useAuth } from '../context/auth';

const TabBarIcon = memo(function TabBarIcon(props: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  badge?: number;
}) {
  return (
    <View style={{ position: 'relative' }}>
      <Ionicons
        size={24}
        style={{ marginBottom: -3 }}
        name={props.name}
        color={props.color}
      />
      {props.badge != null && props.badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            right: -8,
            top: -8,
            backgroundColor: '#FF3B30',
            borderRadius: 10,
            minWidth: 20,
            height: 20,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 4,
          }}>
          <Text
            style={{
              color: 'white',
              fontSize: 12,
              fontWeight: 'bold',
            }}>
            {props.badge > 99 ? '99+' : String(props.badge)}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

export default function TabLayout() {
  const { user } = useAuth();
  
  const tabConfig = useMemo(() => ({
    notificationCount: 0,
    unreadChats: 0,
  }), []);

  const screenOptions = useMemo(() => ({
    tabBarActiveTintColor: '#007AFF',
    tabBarInactiveTintColor: '#8E8E93',
    headerShown: false,
    tabBarStyle: {
      backgroundColor: '#fff',
      borderTopWidth: 1,
      borderTopColor: '#e5e5e5',
      paddingBottom: Platform.OS === 'ios' ? 20 : 8,
      paddingTop: 8,
      height: Platform.OS === 'ios' ? 88 : 68,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: -2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 8,
    },
    tabBarLabelStyle: {
      fontSize: 12,
      fontWeight: '500' as const,
    },
  }), []);

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'home' : 'home-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="documents"
        options={{
          title: 'Documents',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'folder' : 'folder-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon 
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'} 
              color={color} 
              badge={tabConfig.unreadChats}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'settings' : 'settings-outline'} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
