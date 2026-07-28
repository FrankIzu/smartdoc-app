import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleProp,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';

export type FeedbackTouchableProps = Omit<TouchableOpacityProps, 'onPress'> & {
  onPress?: (event: any) => void | Promise<void>;
  /** Controlled busy state; when omitted, tracks Promise-returning onPress automatically. */
  loading?: boolean;
  /** Spinner color while loading. */
  spinnerColor?: string;
  /** When true (default), swap children for a spinner while loading. */
  replaceWithSpinner?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Touchable with clear press feedback and automatic loading while an async onPress runs.
 * Use for actions that otherwise only feedback via a later Alert.
 */
export function FeedbackTouchable({
  onPress,
  loading: loadingProp,
  disabled,
  children,
  activeOpacity = 0.7,
  spinnerColor = '#007AFF',
  replaceWithSpinner = true,
  style,
  ...rest
}: FeedbackTouchableProps) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const loading = loadingProp ?? pending;
  const isDisabled = !!disabled || loading;

  const handlePress = useCallback(
    async (event: any) => {
      if (isDisabled || pendingRef.current) return;
      const result = onPress?.(event);
      if (result != null && typeof (result as Promise<void>).then === 'function') {
        pendingRef.current = true;
        setPending(true);
        try {
          await result;
        } finally {
          pendingRef.current = false;
          setPending(false);
        }
      }
    },
    [isDisabled, onPress]
  );

  return (
    <TouchableOpacity
      activeOpacity={activeOpacity}
      disabled={isDisabled}
      onPress={handlePress}
      style={[style, loading && { opacity: 0.75 }]}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      {...rest}
    >
      {loading && replaceWithSpinner ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}
