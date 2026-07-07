import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { splitTextByUrls } from '../utils/linkifyPlainText';
import { validateAndSanitizeUrl } from '../utils/linkSecurity';

interface LinkifiedTextProps extends TextProps {
  children: string;
  linkStyle?: TextStyle;
  linkColor?: string;
}

export default function LinkifiedText({
  children,
  style,
  linkStyle,
  linkColor = '#007AFF',
  ...textProps
}: LinkifiedTextProps) {
  const parts = useMemo(() => splitTextByUrls(children), [children]);

  const openLink = (raw: string) => {
    const result = validateAndSanitizeUrl(raw);
    if (result.valid && result.url) {
      Linking.openURL(result.url).catch(() => {});
    }
  };

  return (
    <Text style={style} {...textProps}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return part.text ? <Text key={index}>{part.text}</Text> : null;
        }

        const result = validateAndSanitizeUrl(part.raw);
        if (result.valid && result.url) {
          return (
            <Text
              key={index}
              style={[styles.link, { color: linkColor }, linkStyle]}
              onPress={() => openLink(part.raw)}
              accessibilityRole="link"
            >
              {part.raw}
            </Text>
          );
        }

        return <Text key={index}>{part.raw}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    textDecorationLine: 'underline',
  },
});
