import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useHeaderVisibility } from '../../contexts/HeaderVisibilityContext';

interface TapToToggleHeaderViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Wraps screen content so that double-tapping on the screen toggles header visibility (with slide animation).
 * Uses gesture-handler's Tap gesture so scroll/drag still work in ScrollViews and FlatLists.
 * runOnJS is required because gesture callbacks run on the UI thread and toggleHeader uses setState/Animated.
 * Only has an effect when the current screen has toggle enabled (e.g. not on home).
 * Use with AnimatedHeaderContainer to wrap the header for slide animation.
 */
export function TapToToggleHeaderView({ children, style }: TapToToggleHeaderViewProps) {
  const { toggleHeader, toggleEnabled } = useHeaderVisibility();

  const doubleTapGesture = React.useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          runOnJS(toggleHeader)();
        }),
    [toggleHeader]
  );

  if (!toggleEnabled) {
    return <View style={[{ flex: 1 }, style]}>{children}</View>;
  }

  return (
    <GestureDetector gesture={doubleTapGesture}>
      <View style={[{ flex: 1 }, style]} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}
