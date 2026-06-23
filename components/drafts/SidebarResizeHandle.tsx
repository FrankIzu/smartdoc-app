import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PanGestureHandler, State, type PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import { useThemeColors } from '../../hooks/useThemeColors';

interface SidebarResizeHandleProps {
  onDragStart: () => void;
  onDrag: (translationX: number) => void;
  onDragEnd: (translationX: number) => void;
}

export default function SidebarResizeHandle({ onDragStart, onDrag, onDragEnd }: SidebarResizeHandleProps) {
  const colors = useThemeColors();

  const onGestureEvent = (event: PanGestureHandlerGestureEvent) => {
    onDrag(event.nativeEvent.translationX);
  };

  const onHandlerStateChange = (event: PanGestureHandlerGestureEvent) => {
    const { state } = event.nativeEvent;
    if (state === State.BEGAN) {
      onDragStart();
    }
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      onDragEnd(event.nativeEvent.translationX);
    }
  };

  return (
    <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange}>
      <View
        style={[styles.handle, { backgroundColor: colors.border }]}
        accessibilityLabel="Resize notes list"
        accessibilityRole="adjustable"
      />
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 8,
  },
});
