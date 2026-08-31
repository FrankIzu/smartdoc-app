import { Stack } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraftsListPane from './DraftsListPane';
import SidebarResizeHandle from './SidebarResizeHandle';
import { useDraftsSplit } from '../../contexts/DraftsSplitContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { clampSidebarWidth } from '../../hooks/useNotesSplitLayout';

export default function DraftsSplitLayout() {
  const colors = useThemeColors();
  const {
    isSplit,
    canResizeSidebar,
    screenWidth,
    sidebarWidth,
    setSidebarWidth,
    persistSidebarWidth,
  } = useDraftsSplit();
  const dragStartWidthRef = useRef(sidebarWidth);

  const onResizeDragStart = useCallback(() => {
    dragStartWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const onResizeDrag = useCallback(
    (translationX: number) => {
      setSidebarWidth(dragStartWidthRef.current + translationX);
    },
    [setSidebarWidth],
  );

  const onResizeDragEnd = useCallback(
    (translationX: number) => {
      const finalWidth = clampSidebarWidth(dragStartWidthRef.current + translationX, screenWidth);
      persistSidebarWidth(finalWidth);
    },
    [persistSidebarWidth, screenWidth],
  );

  const stackScreenOptions = {
    headerShown: false,
    // Avoid default white card behind the status bar (light icons become invisible in dark mode).
    contentStyle: { backgroundColor: colors.background },
  } as const;

  if (!isSplit) {
    return (
      <Stack screenOptions={stackScreenOptions}>
        <Stack.Screen name="index" options={{ title: 'Notes', headerShown: false }} />
        <Stack.Screen name="recent" options={{ title: 'Deleted & shared', headerShown: false }} />
        <Stack.Screen name="edit/[id]" options={{ presentation: 'card', headerShown: false }} />
      </Stack>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.headerBackground }]} edges={['top']}>
      <View style={styles.row}>
        <DraftsListPane mode="split" width={sidebarWidth} />
        {canResizeSidebar ? (
          <SidebarResizeHandle
            onDragStart={onResizeDragStart}
            onDrag={onResizeDrag}
            onDragEnd={onResizeDragEnd}
          />
        ) : (
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        )}
        <View style={styles.detail}>
          <Stack screenOptions={stackScreenOptions}>
            <Stack.Screen name="index" options={{ title: 'Notes', headerShown: false }} />
            <Stack.Screen name="recent" options={{ title: 'Deleted & shared', headerShown: false }} />
            <Stack.Screen name="edit/[id]" options={{ presentation: 'card', headerShown: false }} />
          </Stack>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  divider: { width: StyleSheet.hairlineWidth },
  detail: { flex: 1, minWidth: 0 },
});
