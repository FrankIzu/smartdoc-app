import { useTheme } from '../contexts/ThemeContext';
import { Colors } from '../constants/Colors';

export function useThemeColors() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const themeColors = Colors[resolvedTheme];
  
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
  };
}

