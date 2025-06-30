import React from 'react';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colorScheme === 'dark' ? '#fff' : '#000',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Documents',
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
        }}
      />
    </Tabs>
  );
}
