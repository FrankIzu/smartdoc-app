import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useThemeColors } from '../hooks/useThemeColors';
import LinkifiedText from './LinkifiedText';

type LinkifiedMultilineInputProps = Omit<TextInputProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  linkColor?: string;
};

/**
 * Multiline field: editable TextInput while focused or empty; linkified preview when blurred with content.
 */
export default function LinkifiedMultilineInput({
  style,
  textStyle,
  linkColor,
  value = '',
  onChangeText,
  placeholder,
  placeholderTextColor,
  multiline,
  ...rest
}: LinkifiedMultilineInputProps) {
  const colors = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const [editing, setEditing] = useState(false);
  const text = String(value ?? '');
  const showInput = editing || !text.trim();

  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [editing]);

  if (showInput) {
    return (
      <TextInput
        ref={inputRef}
        style={style}
        value={text}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        multiline={multiline}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        {...rest}
      />
    );
  }

  const flat = StyleSheet.flatten(style);

  return (
    <Pressable
      style={flat}
      onPress={() => setEditing(true)}
      accessibilityRole="button"
      accessibilityLabel="Edit text"
    >
      <LinkifiedText
        style={[{ color: colors.text }, textStyle]}
        linkColor={linkColor ?? colors.primary ?? '#007AFF'}
      >
        {text}
      </LinkifiedText>
    </Pressable>
  );
}
