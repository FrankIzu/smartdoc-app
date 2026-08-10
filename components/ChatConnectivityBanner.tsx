import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

type ChatConnectivityBannerProps = {
  visible: boolean;
  text: string | null;
  tintColor?: string;
  textColor?: string;
  borderColor?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export default function ChatConnectivityBanner({
  visible,
  text,
  tintColor = '#007AFF',
  textColor,
  borderColor,
  style,
  textStyle,
}: ChatConnectivityBannerProps) {
  if (!visible || !text) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: `${tintColor}18`,
          borderColor: borderColor ?? `${tintColor}40`,
        },
        style,
      ]}
      accessibilityRole="text"
    >
      <Ionicons name="cloud-offline-outline" size={18} color={tintColor} />
      <Text style={[styles.text, textColor ? { color: textColor } : null, textStyle]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
