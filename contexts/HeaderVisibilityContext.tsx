import { usePathname } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

const HEADER_SLIDE_DURATION = 250;
const HEADER_DEFAULT_HEIGHT = 72;
/** Pixel slack for “at top / bottom / left / right” when restoring the header after scroll stops. */
const HEADER_RESTORE_SCROLL_EDGE_EPS = 12;

/**
 * True when scroll is at the end of its range in every scrollable axis (or content fits with no scroll).
 * Used to show the header only after the user stops scrolling at an edge, not while dragging through the middle.
 */
export function shouldRestoreHeaderAfterScrollToEdge(ne: NativeScrollEvent): boolean {
  const { contentOffset, layoutMeasurement, contentSize } = ne;
  const ox = contentOffset.x;
  const oy = contentOffset.y;
  const vw = layoutMeasurement.width;
  const vh = layoutMeasurement.height;
  const cw = contentSize.width;
  const ch = contentSize.height;

  const canScrollVert = ch > vh + HEADER_RESTORE_SCROLL_EDGE_EPS;
  const canScrollHorz = cw > vw + HEADER_RESTORE_SCROLL_EDGE_EPS;

  if (!canScrollVert && !canScrollHorz) {
    return true;
  }

  if (canScrollVert) {
    const atTop = oy <= HEADER_RESTORE_SCROLL_EDGE_EPS;
    const atBottom = oy + vh >= ch - HEADER_RESTORE_SCROLL_EDGE_EPS;
    if (atTop || atBottom) return true;
  }
  if (canScrollHorz) {
    const atLeft = ox <= HEADER_RESTORE_SCROLL_EDGE_EPS;
    const atRight = ox + vw >= cw - HEADER_RESTORE_SCROLL_EDGE_EPS;
    if (atLeft || atRight) return true;
  }
  return false;
}

interface HeaderVisibilityContextValue {
  /** Whether the header section is currently visible */
  headerVisible: boolean;
  /** Toggle header visibility with slide animation (no-op on screens where toggle is disabled, e.g. home) */
  toggleHeader: () => void;
  /** Show the header if it was hidden (e.g. after double-tap to hide). No-op if already visible or toggle disabled. */
  showHeader: () => void;
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

  const showHeader = useCallback(() => {
    if (!toggleEnabled) return;
    if (visibleRef.current) return;
    visibleRef.current = true;
    setHeaderVisible(true);
    Animated.timing(headerAnimValue, {
      toValue: 0,
      duration: HEADER_SLIDE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [toggleEnabled, headerAnimValue]);

  const value = useMemo<HeaderVisibilityContextValue>(
    () => ({
      headerVisible,
      toggleHeader,
      showHeader,
      toggleEnabled,
      headerAnimValue,
      headerHeight: HEADER_DEFAULT_HEIGHT,
    }),
    [headerVisible, toggleHeader, showHeader, toggleEnabled, headerAnimValue]
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
      showHeader: () => {},
      toggleEnabled: false,
      headerAnimValue: new Animated.Value(0),
      headerHeight: HEADER_DEFAULT_HEIGHT,
    };
  }
  return ctx;
}

/** Spread onto ScrollView / FlatList: when the header was hidden (double-tap), it comes back after scroll ends at top/bottom (or left/right for horizontal lists), not while scrolling through the middle. */
export function useScrollRestoresHeaderProps(): Pick<
  ScrollViewProps,
  'onScrollEndDrag' | 'onMomentumScrollEnd'
> {
  const { showHeader, toggleEnabled } = useHeaderVisibility();
  const onScrollRestEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!toggleEnabled) return;
      if (shouldRestoreHeaderAfterScrollToEdge(e.nativeEvent)) showHeader();
    },
    [showHeader, toggleEnabled]
  );
  return useMemo(() => {
    if (!toggleEnabled) return {};
    return {
      onScrollEndDrag: onScrollRestEnd,
      onMomentumScrollEnd: onScrollRestEnd,
    };
  }, [onScrollRestEnd, toggleEnabled]);
}
