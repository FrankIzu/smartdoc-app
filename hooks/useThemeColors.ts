import { Colors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { useDisplayScale } from '../contexts/DisplayScaleContext';

export function useThemeColors() {
  const { resolvedTheme } = useTheme();
  const { scale } = useDisplayScale();
  const isDark = resolvedTheme === 'dark';
  const themeColors = Colors[resolvedTheme];
  
  /**
   * Helper function to scale font sizes based on user preference
   */
  const scaledFontSize = (fontSize: number): number => {
    return Math.round(fontSize * scale);
  };
  
  return {
    ...themeColors,
    // Explicitly include headerBackground for better type safety
    headerBackground: themeColors.headerBackground || themeColors.card,
    // Add theme-independent colors
    primary: Colors.primary,
    primaryLight: Colors.primaryLight,
    primaryDark: Colors.primaryDark,
    secondary: Colors.secondary,
    success: Colors.success,
    warning: Colors.warning,
    error: Colors.error,
    info: Colors.info,
    online: Colors.online,
    offline: Colors.offline,
    away: Colors.away,
    busy: Colors.busy,
    isDark,
    // Display scale helpers
    scale,
    scaledFontSize,
  };
}

