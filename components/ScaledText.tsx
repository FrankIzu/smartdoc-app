import React from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';
import { useDisplayScale } from '../contexts/DisplayScaleContext';

interface ScaledTextProps extends TextProps {
  /**
   * Base font size (will be scaled according to user preference)
   */
  fontSize?: number;
  /**
   * Base line height (will be scaled according to user preference)
   */
  lineHeight?: number;
}

/**
 * Text component that automatically applies display scaling to fontSize and lineHeight
 * 
 * Usage:
 * <ScaledText fontSize={16}>This text will be scaled</ScaledText>
 * 
 * Or use with style prop:
 * <ScaledText style={{ fontSize: 16 }}>This will also be scaled</ScaledText>
 */
export function ScaledText({ style, fontSize, lineHeight, ...props }: ScaledTextProps) {
  const { scale } = useDisplayScale();
  
  const scaledStyle = React.useMemo(() => {
    const baseStyle = StyleSheet.flatten(style);
    const scaled: any = { ...baseStyle };
    
    if (fontSize !== undefined) {
      scaled.fontSize = Math.round(fontSize * scale);
    } else if (baseStyle?.fontSize) {
      scaled.fontSize = Math.round(baseStyle.fontSize * scale);
    }
    
    if (lineHeight !== undefined) {
      scaled.lineHeight = Math.round(lineHeight * scale);
    } else if (baseStyle?.lineHeight && typeof baseStyle.lineHeight === 'number') {
      scaled.lineHeight = Math.round(baseStyle.lineHeight * scale);
    }
    
    return scaled;
  }, [style, fontSize, lineHeight, scale]);
  
  return <Text style={scaledStyle} {...props} />;
}
