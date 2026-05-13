import { useMemo } from 'react';
import { Platform } from 'react-native';
import { Colors } from '../constants/Colors';
import { useDisplayScale } from '../contexts/DisplayScaleContext';
import { useTheme } from '../contexts/ThemeContext';

export function useThemeColors() {
  const { resolvedTheme } = useTheme();
  const { scale } = useDisplayScale();

  return useMemo(() => {
    const themeColors = Colors[resolvedTheme];
    const isDark = resolvedTheme === 'dark';
    const scaledFontSize = (fontSize: number): number => Math.round(fontSize * scale);
    const tint = themeColors.tint;

    /** Default RN Switch styling is faint in light mode — reuse everywhere via useThemeColors(). */
    const switchTrackOff = isDark ? '#3f444a' : '#64748b';
    const switchTrackOn = isDark ? 'rgba(59, 130, 246, 0.6)' : tint;

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
      scale,
      scaledFontSize,
      /** `<Switch ios_backgroundColor={colors.switchTrackOff} />`, `trackColor` false branch */
      switchTrackOff,
      /** `trackColor` true branch — app accent when “on”. */
      switchTrackOn,
      /** Android knob only — pass `thumbColor={colors.switchThumbAndroid(value)}`; omit on iOS. */
      switchThumbAndroid: (on: boolean) =>
        Platform.OS === 'android' ? (on ? '#ffffff' : '#e2e8f0') : undefined,
    };
  }, [resolvedTheme, scale]);
}

