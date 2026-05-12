import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../../../hooks/useThemeColors';

/** Light mode — iOS-style purple pill */
const REACH_LIGHT = {
  bg: 'rgba(88, 86, 214, 0.14)',
  text: '#5856D6',
  border: 'transparent',
  borderWidth: 0 as number,
} as const;

/** Dark mode — brighter lavender so the pill and label read on `#151718` / surfaces */
const REACH_DARK = {
  bg: 'rgba(167, 139, 250, 0.28)',
  text: '#EDE9FE',
  border: 'rgba(196, 181, 253, 0.55)',
  borderWidth: StyleSheet.hairlineWidth,
} as const;

const base = StyleSheet.create({
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    flexShrink: 0,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export function CalendarReachPill() {
  const { isDark } = useThemeColors();
  const token = isDark ? REACH_DARK : REACH_LIGHT;

  return (
    <View
      style={[
        base.pill,
        {
          backgroundColor: token.bg,
          borderColor: token.border,
          borderWidth: token.borderWidth,
        },
      ]}
    >
      <Text style={[base.text, { color: token.text }]}>Reach</Text>
    </View>
  );
}
