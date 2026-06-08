import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useThemeColors } from '../../../hooks/useThemeColors';

/** Light mode — iOS-style purple capsule */
const REACH_LIGHT = {
  bg: 'rgba(88, 86, 214, 0.14)',
  icon: '#5856D6',
  border: 'transparent',
  borderWidth: 0 as number,
} as const;

/** Dark mode — brighter lavender on dark surfaces */
const REACH_DARK = {
  bg: 'rgba(167, 139, 250, 0.28)',
  icon: '#EDE9FE',
  border: 'rgba(196, 181, 253, 0.55)',
  borderWidth: StyleSheet.hairlineWidth,
} as const;

const ICON_SIZE = 16;

const base = StyleSheet.create({
  capsule: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

type Props = {
  onPress?: () => void;
};

export function CalendarReachPill({ onPress }: Props) {
  const { isDark } = useThemeColors();
  const token = isDark ? REACH_DARK : REACH_LIGHT;

  const capsule = (
    <View
      accessible={false}
      style={[
        base.capsule,
        {
          backgroundColor: token.bg,
          borderColor: token.border,
          borderWidth: token.borderWidth,
        },
      ]}
    >
      <Ionicons name="videocam" size={ICON_SIZE} color={token.icon} importantForAccessibility="no" />
    </View>
  );

  if (!onPress) {
    return (
      <View accessibilityRole="image" accessibilityLabel="Video meeting">
        {capsule}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Join video meeting"
      hitSlop={8}
    >
      {capsule}
    </Pressable>
  );
}
