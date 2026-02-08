import React from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { useHeaderVisibility } from '../../contexts/HeaderVisibilityContext';

interface AnimatedHeaderContainerProps {
  children: React.ReactNode;
  /** Optional height for the header (default from context, typically 72) */
  height?: number;
  style?: ViewStyle;
}

/**
 * Wraps the header content and animates it with a slide (up when hiding, down when showing).
 * Use this instead of conditionally rendering the header so the slide animation runs.
 */
export function AnimatedHeaderContainer({ children, height, style }: AnimatedHeaderContainerProps) {
  const { headerAnimValue, headerHeight: defaultHeight } = useHeaderVisibility();
  const h = height ?? defaultHeight;

  const containerHeight = headerAnimValue.interpolate({
    inputRange: [0, 1],
    outputRange: [h, 0],
  });

  const translateY = headerAnimValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -h],
  });

  return (
    <Animated.View style={[styles.outer, { height: containerHeight }, style]}>
      <Animated.View style={[styles.inner, { transform: [{ translateY }] }]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    overflow: 'hidden',
  },
  inner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});
