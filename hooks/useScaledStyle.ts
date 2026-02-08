import { useMemo } from 'react';
import { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import { useDisplayScale } from '../contexts/DisplayScaleContext';

type Style = TextStyle | ViewStyle | ImageStyle;

/**
 * Hook to create scaled styles dynamically
 * 
 * Usage:
 * const styles = useScaledStyle(() => ({
 *   title: { fontSize: 24, lineHeight: 32 },
 *   body: { fontSize: 16, lineHeight: 24 },
 * }));
 * 
 * Font sizes and line heights will be automatically scaled
 */
export function useScaledStyle<T extends Record<string, Style>>(
  styleFactory: (scale: (size: number) => number) => T
): T {
  const { scale } = useDisplayScale();
  
  return useMemo(() => {
    const scaleFn = (size: number): number => {
      return Math.round(size * scale);
    };
    
    const baseStyles = styleFactory(scaleFn);
    const scaled: any = {};
    
    // Apply scaling to fontSize and lineHeight in all styles
    for (const [key, style] of Object.entries(baseStyles)) {
      const scaledStyle: any = { ...style };
      
      if ('fontSize' in style && typeof style.fontSize === 'number') {
        scaledStyle.fontSize = scaleFn(style.fontSize);
      }
      
      if ('lineHeight' in style && typeof style.lineHeight === 'number') {
        scaledStyle.lineHeight = scaleFn(style.lineHeight);
      }
      
      scaled[key] = scaledStyle;
    }
    
    return scaled as T;
  }, [styleFactory, scale]);
}
