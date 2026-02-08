import { TextStyle } from 'react-native';
import { useDisplayScale } from '../contexts/DisplayScaleContext';

/**
 * Hook that provides a helper to create scaled styles
 * Usage: const styles = useScaledStyles(() => StyleSheet.create({ ... }))
 */
export function useScaledStyles<T extends Record<string, any>>(
  styleFactory: (scale: (size: number) => number) => T
): T {
  const { scale } = useDisplayScale();
  
  const scaleFn = (size: number): number => {
    return Math.round(size * scale);
  };
  
  return styleFactory(scaleFn) as T;
}

/**
 * Helper function to scale font sizes in style objects
 * This can be used to transform existing style objects
 */
export function scaleFontSizes<T extends Record<string, any>>(
  styles: T,
  scale: number
): T {
  const scaled: any = {};
  
  for (const [key, value] of Object.entries(styles)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if ('fontSize' in value) {
        scaled[key] = {
          ...value,
          fontSize: Math.round((value as TextStyle).fontSize! * scale),
          ...(('lineHeight' in value && typeof value.lineHeight === 'number') 
            ? { lineHeight: Math.round(value.lineHeight * scale) }
            : {}),
        };
      } else {
        // Recursively scale nested objects
        scaled[key] = scaleFontSizes(value as any, scale);
      }
    } else {
      scaled[key] = value;
    }
  }
  
  return scaled as T;
}
