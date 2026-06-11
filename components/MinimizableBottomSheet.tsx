import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BackHandler,
    Keyboard,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
    type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../hooks/useThemeColors';

const MINIMIZED_PEEK = 68;
const SPRING = { damping: 24, stiffness: 320 };

export interface MinimizableBottomSheetHeaderProps {
  minimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  onClose: () => void;
}

export interface MinimizableBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Fraction of screen height when expanded. Ignored if sheetHeight is set. */
  heightRatio?: number;
  /** Explicit sheet height in px. */
  sheetHeight?: number;
  expandNonce?: number;
  minimizable?: boolean;
  minimizedPeek?: number;
  paddingBottom?: number;
  showHandle?: boolean;
  /** When false, only the drag handle is shown (content supplies its own header). */
  showHeader?: boolean;
  title?: string;
  subtitle?: string;
  minimizedSubtitle?: string;
  headerRight?: React.ReactNode | ((ctx: MinimizableBottomSheetHeaderProps) => React.ReactNode);
  renderHeader?: (ctx: MinimizableBottomSheetHeaderProps) => React.ReactNode;
  sheetStyle?: ViewStyle;
  onMinimizedChange?: (minimized: boolean) => void;
  /** Renders above sheet content (same Modal — use instead of nesting another Modal on iOS). */
  overlay?: React.ReactNode;
}

export default function MinimizableBottomSheet({
  visible,
  onClose,
  children,
  heightRatio = 0.55,
  sheetHeight: sheetHeightProp,
  expandNonce = 0,
  minimizable = true,
  minimizedPeek = MINIMIZED_PEEK,
  paddingBottom: paddingBottomProp,
  showHandle = true,
  showHeader = true,
  title,
  subtitle,
  minimizedSubtitle = 'Swipe up to continue',
  headerRight,
  renderHeader,
  sheetStyle,
  onMinimizedChange,
  overlay,
}: MinimizableBottomSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [minimized, setMinimized] = useState(false);

  // Match pre-Modal layout: sheet anchored to physical screen bottom (over tab bar).
  const sheetHeight = sheetHeightProp ?? Math.round(windowHeight * heightRatio);
  const paddingBottom = paddingBottomProp ?? insets.bottom;
  // Subtract paddingBottom so the minimized peek (header strip) sits above the system nav bar,
  // not partially hidden beneath it on edge-to-edge Android.
  const minimizedOffset = Math.max(0, sheetHeight - minimizedPeek - paddingBottom);

  const sheetTranslateY = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const minimizedOffsetSv = useSharedValue(0);

  useEffect(() => {
    minimizedOffsetSv.value = minimizedOffset;
  }, [minimizedOffset, minimizedOffsetSv]);

  const applyMinimizedState = useCallback(
    (next: boolean) => {
      setMinimized(next);
      onMinimizedChange?.(next);
      if (next) Keyboard.dismiss();
    },
    [onMinimizedChange]
  );

  useEffect(() => {
    if (!visible) {
      setMinimized(false);
      sheetTranslateY.value = 0;
      return;
    }
    // Always open fully — sync translateY first so a prior minimize cannot flash on reopen.
    setMinimized(false);
    onMinimizedChange?.(false);
    sheetTranslateY.value = 0;
    sheetTranslateY.value = withSpring(0, SPRING);
  }, [visible, expandNonce, onMinimizedChange, sheetTranslateY]);

  const expandSheet = useCallback(() => {
    setMinimized(false);
    onMinimizedChange?.(false);
    sheetTranslateY.value = withSpring(0, SPRING);
  }, [onMinimizedChange, sheetTranslateY]);

  const minimizeSheet = useCallback(() => {
    if (!minimizable) {
      onClose();
      return;
    }
    Keyboard.dismiss();
    setMinimized(true);
    onMinimizedChange?.(true);
    sheetTranslateY.value = withSpring(minimizedOffset, SPRING);
  }, [minimizable, minimizedOffset, onClose, onMinimizedChange, sheetTranslateY]);

  const handleClose = useCallback(() => {
    setMinimized(false);
    onMinimizedChange?.(false);
    sheetTranslateY.value = 0;
    onClose();
  }, [onClose, onMinimizedChange, sheetTranslateY]);

  const handleBackPress = useCallback(() => {
    if (minimized) {
      handleClose();
    } else if (minimizable) {
      minimizeSheet();
    } else {
      handleClose();
    }
  }, [minimized, minimizable, minimizeSheet, handleClose]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackPress();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleBackPress]);

  const panGesture = useMemo(() => {
    if (!minimizable) return Gesture.Pan();
    return Gesture.Pan()
      .activeOffsetY([-8, 8])
      .failOffsetX([-24, 24])
      .onBegin(() => {
        dragStartY.value = sheetTranslateY.value;
      })
      .onUpdate((e) => {
        const maxY = minimizedOffsetSv.value;
        const next = dragStartY.value + e.translationY;
        sheetTranslateY.value = Math.max(0, Math.min(maxY, next));
      })
      .onEnd((e) => {
        const maxY = minimizedOffsetSv.value;
        const mid = maxY * 0.45;
        let goMinimized: boolean;
        if (e.velocityY > 600) {
          goMinimized = true;
        } else if (e.velocityY < -600) {
          goMinimized = false;
        } else {
          goMinimized = sheetTranslateY.value > mid;
        }
        sheetTranslateY.value = withSpring(goMinimized ? maxY : 0, SPRING);
        runOnJS(applyMinimizedState)(goMinimized);
      });
  }, [applyMinimizedState, dragStartY, minimizable, minimizedOffsetSv, sheetTranslateY]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const headerCtx: MinimizableBottomSheetHeaderProps = {
    minimized,
    onMinimize: minimizeSheet,
    onExpand: expandSheet,
    onClose: handleClose,
  };

  const defaultHeader = (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {title ? (
          <View style={styles.headerTitles}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            {(minimized ? minimizedSubtitle : subtitle) ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {minimized ? minimizedSubtitle : subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.headerActions}>
        {typeof headerRight === 'function' ? headerRight(headerCtx) : headerRight}
        {minimizable ? (
          minimized ? (
            <TouchableOpacity onPress={expandSheet} hitSlop={12} accessibilityLabel="Expand">
              <Ionicons name="chevron-up" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={minimizeSheet} hitSlop={12} accessibilityLabel="Minimize">
              <Ionicons name="chevron-down" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          )
        ) : null}
        <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!visible) return null;

  return (
    // pointerEvents="box-none" lets touches pass through the transparent area
    // above the minimized strip so users can interact with the background screen.
    <View style={styles.root} pointerEvents="box-none">
      {!minimized ? (
        <Pressable
          style={styles.backdrop}
          onPress={minimizable ? minimizeSheet : handleClose}
          accessibilityLabel={minimizable ? 'Minimize' : 'Close'}
        />
      ) : null}
      <Animated.View
        pointerEvents={minimized ? 'box-none' : 'auto'}
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            backgroundColor: colors.card,
            paddingBottom,
          },
          sheetStyle,
          sheetAnimatedStyle,
        ]}
      >
        <GestureDetector gesture={panGesture}>
          <View pointerEvents={minimized ? 'auto' : undefined}>
            {showHandle ? (
              <View style={styles.handleRow}>
                <View style={[styles.handle, { backgroundColor: colors.border }]} />
              </View>
            ) : null}
            <Pressable
              onPress={minimized ? expandSheet : undefined}
              accessibilityRole={minimized ? 'button' : undefined}
              accessibilityLabel={minimized ? 'Expand' : undefined}
            >
              {showHeader ? (renderHeader ? renderHeader(headerCtx) : defaultHeader) : null}
            </Pressable>
          </View>
        </GestureDetector>
        <View style={styles.body} pointerEvents={minimized ? 'none' : 'auto'}>
          {children}
        </View>
        {overlay && !minimized ? (
          <View style={styles.overlay} pointerEvents="box-none">
            {overlay}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  handleRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 2 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  headerLeft: { flex: 1, minWidth: 0 },
  headerTitles: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '600' },
  subtitle: { fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  body: { flex: 1, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
});
