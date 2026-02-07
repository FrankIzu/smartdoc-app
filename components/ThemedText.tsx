import React from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '../hooks/useThemeColor';
import { useDisplayScale } from '../contexts/DisplayScaleContext';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const { scale } = useDisplayScale();

  const scaledStyles = React.useMemo(() => {
    const scaleFn = (size: number) => Math.round(size * scale);
    return {
      default: { ...styles.default, fontSize: scaleFn(16), lineHeight: scaleFn(24) },
      defaultSemiBold: { ...styles.defaultSemiBold, fontSize: scaleFn(16), lineHeight: scaleFn(24) },
      title: { ...styles.title, fontSize: scaleFn(32), lineHeight: scaleFn(32) },
      subtitle: { ...styles.subtitle, fontSize: scaleFn(20) },
      link: { ...styles.link, fontSize: scaleFn(16), lineHeight: scaleFn(30) },
    };
  }, [scale]);

  return (
    <Text
      style={[
        { color },
        type === 'default' ? scaledStyles.default : undefined,
        type === 'title' ? scaledStyles.title : undefined,
        type === 'defaultSemiBold' ? scaledStyles.defaultSemiBold : undefined,
        type === 'subtitle' ? scaledStyles.subtitle : undefined,
        type === 'link' ? scaledStyles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
});
