import { TextStyle, ViewStyle, ImageStyle } from 'react-native';

type Style = TextStyle | ViewStyle | ImageStyle;

/**
 * Recursively scales fontSize and lineHeight in a style object
 * This can be used before StyleSheet.create to apply scaling
 */
export function scaleStyleObject<T extends Record<string, Style>>(
  styles: T,
  scale: number
): T {
  const scaled: any = {};
  
  for (const [key, style] of Object.entries(styles)) {
    if (typeof style === 'object' && style !== null && !Array.isArray(style)) {
      const scaledStyle: any = { ...style };
      
      // Scale fontSize
      if ('fontSize' in style && typeof style.fontSize === 'number') {
        scaledStyle.fontSize = Math.round(style.fontSize * scale);
      }
      
      // Scale lineHeight if it's a number
      if ('lineHeight' in style && typeof style.lineHeight === 'number') {
        scaledStyle.lineHeight = Math.round(style.lineHeight * scale);
      }
      
      scaled[key] = scaledStyle;
    } else {
      scaled[key] = style;
    }
  }
  
  return scaled as T;
}
