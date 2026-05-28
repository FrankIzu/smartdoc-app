import React from 'react';
import { StyleProp, StyleSheet, Text, TextProps, TextStyle } from 'react-native';
import { sanitizeDisplayFilename } from '../utils/displayFilename';

export interface FileNameTextProps extends Omit<TextProps, 'numberOfLines' | 'ellipsizeMode'> {
  name: string | null | undefined;
  style?: StyleProp<TextStyle>;
  /** When true (default), decode URL-encoded path segments via sanitizeDisplayFilename */
  sanitize?: boolean;
}

/** Single-line filename label with tail ellipsis. Parent flex rows should use minWidth: 0. */
export default function FileNameText({
  name,
  style,
  sanitize = true,
  ...rest
}: FileNameTextProps) {
  const display = sanitize ? sanitizeDisplayFilename(name) : (name || 'Document').trim() || 'Document';

  return (
    <Text
      {...rest}
      style={[styles.text, style]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {display}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    flexShrink: 1,
    minWidth: 0,
  },
});
