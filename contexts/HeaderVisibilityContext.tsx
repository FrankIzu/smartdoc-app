import { usePathname } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

const HEADER_SLIDE_DURATION = 250;
const HEADER_DEFAULT_HEIGHT = 72;

interface HeaderVisibilityContextValue {
  /** Whether the header section is currently visible */
  headerVisible: boolean;
  /** Toggle header visibility with slide animation (no-op on screens where toggle is disabled, e.g. home) */
  toggleHeader: () => void;
  /** Whether tap-to-toggle is enabled on the current screen */
  toggleEnabled: boolean;
  /** Animated value 0 = visible, 1 = hidden - use for slide animation */
  headerAnimValue: Animated.Value;
  /** Default header height used for slide (can override in AnimatedHeaderContainer) */
  headerHeight: number;
}

const HeaderVisibilityContext = createContext<HeaderVisibilityContextValue | null>(null);

function isToggleDisabled(pathname: string): boolean {
  const normalized = (pathname || '').replace(/\/$/, '') || '/';
  return normalized === '/(tabs)';
}

export function HeaderVisibilityProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [headerVisible, setHeaderVisible] = useState(true);
  const headerAnimValue = useRef(new Animated.Value(0)).current;

  const toggleEnabled = useMemo(() => !isToggleDisabled(pathname ?? ''), [pathname]);
  const visibleRef = useRef(true);
  React.useEffect(() => {
    visibleRef.current = headerVisible;
  }, [headerVisible]);

  // Reset header to visible when navigating to a new screen
  React.useEffect(() => {
    setHeaderVisible(true);
    visibleRef.current = true;
    headerAnimValue.setValue(0);
  }, [pathname, headerAnimValue]);

  const toggleHeader = useCallback(() => {
    if (!toggleEnabled) return;
    visibleRef.current = !visibleRef.current;
    const nextVisible = visibleRef.current;
    setHeaderVisible(nextVisible);
    Animated.timing(headerAnimValue, {
      toValue: nextVisible ? 0 : 1,
      duration: HEADER_SLIDE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [toggleEnabled, headerAnimValue]);

  const value = useMemo<HeaderVisibilityContextValue>(
    () => ({
      headerVisible,
      toggleHeader,
      toggleEnabled,
      headerAnimValue,
      headerHeight: HEADER_DEFAULT_HEIGHT,
    }),
    [headerVisible, toggleHeader, toggleEnabled, headerAnimValue]
  );

  return (
    <HeaderVisibilityContext.Provider value={value}>
      {children}
    </HeaderVisibilityContext.Provider>
  );
}

export function useHeaderVisibility(): HeaderVisibilityContextValue {
  const ctx = useContext(HeaderVisibilityContext);
  if (!ctx) {
    return {
      headerVisible: true,
      toggleHeader: () => {},
      toggleEnabled: false,
      headerAnimValue: new Animated.Value(0),
      headerHeight: HEADER_DEFAULT_HEIGHT,
    };
  }
  return ctx;
}
