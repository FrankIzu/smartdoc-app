// This is a shim for web and Android where the tab bar is generally opaque.
// Removed invalid import
import React from 'react';
import { View } from 'react-native';
import { COLORS } from '../../constants/Config';

export default function TabBarBackground() {
  const colorScheme = useColorScheme();
  
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        backgroundColor: colorScheme === 'dark' ? COLORS.surface : COLORS.white,
        opacity: 0.95,
      }}
    />
  );
}

export function useBottomTabOverflow() {
  return 0;
}
