/**
 * PreparePageCanvas — ScrollView with fixed-size page container.
 *
 * - Pinch zoom (disabled during gestureLock)
 * - Debug alignment overlays when EXPO_PUBLIC_DEBUG_ALIGNMENT=1
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { PrepareEditorState, PrepareEditorActions } from '../../../hooks/usePrepareEditor';
import {
  buildAlignmentOverlays,
  fieldToPixelRect,
  isDebugAlignmentEnabled,
  clampZoom,
  computeRenderedSize,
  preserveScrollCenter,
} from '../../../utils/fillable';
import AlignmentDebugOverlay from './AlignmentDebugOverlay';
import PrepareFieldOverlay from './PrepareFieldOverlay';

const CANVAS_PAD_V = 16;
const KEYBOARD_SCROLL_MARGIN = 32;

interface Props {
  editor: PrepareEditorState & PrepareEditorActions;
  scrollRef?: React.RefObject<ScrollView | null>;
  fillMode?: boolean;
  fieldValues?: Record<string, unknown>;
  onFieldValueChange?: (fieldId: string, value: unknown) => void;
  onSignatureRequest?: (fieldId: string, label: string) => void;
  onDateFieldPress?: (fieldId: string, currentValue?: string) => void;
}

export default function PreparePageCanvas({
  editor,
  scrollRef,
  fillMode = false,
  fieldValues = {},
  onFieldValueChange,
  onSignatureRequest,
  onDateFieldPress,
}: Props) {
  const colors = useThemeColors();
  const internalScrollRef = useRef<ScrollView>(null);
  const usedScrollRef = scrollRef ?? internalScrollRef;
  const isPinchingRef = useRef(false);
  const [pinchScrollLocked, setPinchScrollLocked] = useState(false);
  const zoomShared = useSharedValue(editor.zoomLevel);
  const pinchBaseZoom = useSharedValue(editor.zoomLevel);
  const liveZoomRef = useRef(editor.zoomLevel);
  const groupDragX = useSharedValue(0);
  const groupDragY = useSharedValue(0);
  const isGroupDragging = useSharedValue(false);
  const scrollOffsetRef = useRef({ x: 0, y: 0 });
  const keyboardHeightRef = useRef(0);
  const pendingTextFocusRef = useRef<string | null>(null);
  const lastTextFieldFocusRef = useRef<string | null>(null);

  const {
    pageImages,
    currentPage,
    renderedSize,
    sortedPageFields,
    currentPageFields,
    selectedFieldIds,
    primarySelectedFieldId,
    zoomLevel,
    overlayRenderVersion,
    gestureLock,
    setGestureLocked,
    pageDimensions,
    scrollPos,
    scrollCommandNonce,
    viewportSize,
    setPageDimensions,
    setViewportSize,
    reportScrollOffset,
    clearSelection,
    selectField,
    softDeletePrimary,
    commitDrag,
    commitResize,
    setZoomLevelDuringPinch,
    commitPinchZoom,
    isGestureLocked,
    setScrollPos,
    fitScale,
  } = editor;

  const setGestureLockedWithScroll = useCallback(
    (locked: boolean) => {
      // Imperatively toggle scroll before React re-renders so the ScrollView
      // does not compete with the field pan for the first few frames.
      const enableScroll = !locked && !isPinchingRef.current;
      usedScrollRef.current?.setNativeProps?.({ scrollEnabled: enableScroll });
      setGestureLocked(locked);
    },
    [setGestureLocked, usedScrollRef],
  );

  useEffect(() => {
    if (!isPinchingRef.current) {
      zoomShared.value = zoomLevel;
      liveZoomRef.current = zoomLevel;
    }
  }, [zoomLevel, zoomShared]);

  // Programmatic scroll only (zoom / jump-to-field) — never echo user pans back into ScrollView.
  useEffect(() => {
    if (isPinchingRef.current) return;
    const sv = usedScrollRef.current;
    if (!sv) return;
    sv.scrollTo({ x: scrollPos.x, y: scrollPos.y, animated: false });
  }, [scrollCommandNonce, scrollPos.x, scrollPos.y, usedScrollRef]);

  const { renderedW, renderedH } = renderedSize;
  const pageImage = pageImages[currentPage];
  const hasValidDimensions = (pageDimensions[currentPage]?.w ?? 0) > 0;
  const showDebug = isDebugAlignmentEnabled();
  // Show scrollbars when zoomed content exceeds the visible canvas area.
  const showVerticalScrollIndicator =
    viewportSize.h > 0 && renderedH + 32 > viewportSize.h;
  const showHorizontalScrollIndicator =
    viewportSize.w > 0 && renderedW + 16 > viewportSize.w;

  const debugOverlays = useMemo(() => {
    if (!showDebug || !hasValidDimensions) return [];
    return buildAlignmentOverlays(
      sortedPageFields
        .filter((f) => f.x != null && f.y != null && f.w != null && f.h != null)
        .map((f) => ({
          id: f.id,
          rect: { x: f.x!, y: f.y!, w: f.w!, h: f.h! },
        })),
      renderedW,
      renderedH,
      'prepare',
    );
  }, [showDebug, hasValidDimensions, sortedPageFields, renderedW, renderedH]);

  const handleLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      setViewportSize({ w: width, h: height });
    },
    [setViewportSize],
  );

  const resolvePageDimensions = useCallback(
    (width: number, height: number) => {
      if (width > 0 && height > 0) {
        setPageDimensions(currentPage, { w: width, h: height });
      }
    },
    [currentPage, setPageDimensions],
  );

  const handleImageLoad = useCallback(
    (e: { nativeEvent: { source: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.source;
      resolvePageDimensions(width, height);
    },
    [resolvePageDimensions],
  );

  // onLoad source dimensions are sometimes 0 for remote URIs — fall back to getSize.
  useEffect(() => {
    if (!pageImage || hasValidDimensions) return;
    Image.getSize(pageImage, resolvePageDimensions, () => {});
  }, [pageImage, hasValidDimensions, resolvePageDimensions]);

  const handleBlankTap = useCallback(() => {
    if (gestureLock.current) return;
    if (!hasValidDimensions) return;
    Keyboard.dismiss();
    clearSelection();
  }, [gestureLock, hasValidDimensions, clearSelection]);

  const scrollTextFieldIntoView = useCallback(
    (fieldId: string, keyboardHeight: number) => {
      if (!fillMode || !hasValidDimensions || viewportSize.h <= 0) return;

      const field =
        currentPageFields.find((f) => f.id === fieldId) ??
        sortedPageFields.find((f) => f.id === fieldId);
      if (
        !field ||
        field.x == null ||
        field.y == null ||
        field.w == null ||
        field.h == null
      ) {
        return;
      }

      const pixelRect = fieldToPixelRect(
        { x: field.x, y: field.y, w: field.w, h: field.h },
        renderedW,
        renderedH,
      );
      const fieldTop = CANVAS_PAD_V + pixelRect.top;
      const fieldBottom = fieldTop + pixelRect.height;
      const availableHeight = Math.max(
        120,
        viewportSize.h - keyboardHeight - KEYBOARD_SCROLL_MARGIN,
      );
      const currentY = scrollOffsetRef.current.y;
      const fieldTopInViewport = fieldTop - currentY;
      const fieldBottomInViewport = fieldBottom - currentY;

      let targetY = currentY;
      if (fieldBottomInViewport > availableHeight) {
        targetY = fieldBottom - availableHeight;
      } else if (fieldTopInViewport < KEYBOARD_SCROLL_MARGIN) {
        targetY = fieldTop - KEYBOARD_SCROLL_MARGIN;
      }

      if (Math.abs(targetY - currentY) > 2) {
        setScrollPos({ x: scrollOffsetRef.current.x, y: Math.max(0, targetY) });
      }
    },
    [
      fillMode,
      hasValidDimensions,
      viewportSize.h,
      currentPageFields,
      sortedPageFields,
      renderedW,
      renderedH,
      setScrollPos,
    ],
  );

  const handleTextFieldFocus = useCallback(
    (fieldId: string) => {
      if (!fillMode) return;
      lastTextFieldFocusRef.current = fieldId;
      if (keyboardHeightRef.current > 0) {
        scrollTextFieldIntoView(fieldId, keyboardHeightRef.current);
        return;
      }
      pendingTextFocusRef.current = fieldId;
    },
    [fillMode, scrollTextFieldIntoView],
  );

  useEffect(() => {
    if (!fillMode) return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      keyboardHeightRef.current = e.endCoordinates.height;
      const pending = pendingTextFocusRef.current ?? lastTextFieldFocusRef.current;
      if (pending) {
        pendingTextFocusRef.current = null;
        // Defer until keyboard + layout settle (avoids layout thrash with KeyboardAvoidingView).
        requestAnimationFrame(() => {
          scrollTextFieldIntoView(pending, e.endCoordinates.height);
        });
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      pendingTextFocusRef.current = null;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [fillMode, scrollTextFieldIntoView]);

  const applyPinchUpdate = useCallback(
    (nextZoom: number) => {
      if (gestureLock.current || !isPinchingRef.current) return;

      const prevZoom = liveZoomRef.current;
      const clamped = clampZoom(nextZoom);
      if (Math.abs(clamped - prevZoom) < 0.004) return;

      const pageDim = pageDimensions[currentPage] ?? { w: 0, h: 0 };
      if (!pageDim.w || !pageDim.h || viewportSize.w <= 0 || viewportSize.h <= 0) {
        setZoomLevelDuringPinch(clamped);
        liveZoomRef.current = clamped;
        return;
      }

      const oldSize = computeRenderedSize(
        { width: pageDim.w, height: pageDim.h },
        fitScale,
        prevZoom,
      );
      const newSize = computeRenderedSize(
        { width: pageDim.w, height: pageDim.h },
        fitScale,
        clamped,
      );
      const { newScrollX, newScrollY } = preserveScrollCenter(
        scrollOffsetRef.current.x,
        scrollOffsetRef.current.y,
        viewportSize.w,
        viewportSize.h,
        oldSize.renderedW,
        oldSize.renderedH,
        newSize.renderedW,
        newSize.renderedH,
      );

      liveZoomRef.current = clamped;
      setZoomLevelDuringPinch(clamped);

      const sv = usedScrollRef.current;
      if (sv) {
        sv.scrollTo({ x: newScrollX, y: newScrollY, animated: false });
      }
      scrollOffsetRef.current = { x: newScrollX, y: newScrollY };
    },
    [
      gestureLock,
      pageDimensions,
      currentPage,
      viewportSize.w,
      viewportSize.h,
      fitScale,
      setZoomLevelDuringPinch,
      usedScrollRef,
    ],
  );

  const beginPinch = useCallback(() => {
    if (gestureLock.current) return;
    isPinchingRef.current = true;
    setPinchScrollLocked(true);
    liveZoomRef.current = zoomShared.value;
  }, [gestureLock, zoomShared]);

  const endPinch = useCallback(
    (finalZoom?: number) => {
      if (!isPinchingRef.current) return;
      isPinchingRef.current = false;
      setPinchScrollLocked(false);
      const enableScroll = !gestureLock.current;
      usedScrollRef.current?.setNativeProps?.({ scrollEnabled: enableScroll });
      const clamped = clampZoom(finalZoom ?? liveZoomRef.current);
      liveZoomRef.current = clamped;
      commitPinchZoom(clamped, scrollOffsetRef.current);
    },
    [commitPinchZoom, usedScrollRef],
  );

  const pinchHandlersRef = useRef({ beginPinch, applyPinchUpdate, endPinch });
  pinchHandlersRef.current = { beginPinch, applyPinchUpdate, endPinch };

  const runBeginPinch = useCallback(() => {
    pinchHandlersRef.current.beginPinch();
  }, []);
  const runApplyPinchUpdate = useCallback((nextZoom: number) => {
    pinchHandlersRef.current.applyPinchUpdate(nextZoom);
  }, []);
  const runEndPinch = useCallback((finalZoom?: number) => {
    pinchHandlersRef.current.endPinch(finalZoom);
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          'worklet';
          pinchBaseZoom.value = zoomShared.value;
          runOnJS(runBeginPinch)();
        })
        .onUpdate((e) => {
          'worklet';
          runOnJS(runApplyPinchUpdate)(pinchBaseZoom.value * e.scale);
        })
        .onEnd((e) => {
          'worklet';
          runOnJS(runEndPinch)(pinchBaseZoom.value * e.scale);
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(runEndPinch)();
        }),
    [pinchBaseZoom, runApplyPinchUpdate, runBeginPinch, runEndPinch, zoomShared],
  );

  return (
    <ScrollView
      ref={usedScrollRef}
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        viewportSize.w > 0 && renderedW + 16 > viewportSize.w
          ? { minWidth: renderedW + 16 }
          : null,
        viewportSize.h > 0 && renderedH + 32 > viewportSize.h
          ? { minHeight: renderedH + 32 }
          : null,
      ]}
      onLayout={handleLayout}
      scrollEventThrottle={16}
      onScroll={(e) => {
        const { x, y } = e.nativeEvent.contentOffset;
        scrollOffsetRef.current = { x, y };
        reportScrollOffset(x, y);
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={showVerticalScrollIndicator}
      showsHorizontalScrollIndicator={showHorizontalScrollIndicator}
      persistentScrollbar={showVerticalScrollIndicator || showHorizontalScrollIndicator}
      scrollEnabled={!isGestureLocked && !pinchScrollLocked}
      bounces={!isGestureLocked && !pinchScrollLocked}
    >
      {!pageImage ? (
        <View style={[styles.emptyState, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.textSecondary }}>No page loaded</Text>
        </View>
      ) : (
        <GestureDetector gesture={pinchGesture}>
          <View
            style={[styles.pageContainer, { width: renderedW, height: renderedH }]}
          >
            <Image
              source={{ uri: pageImage }}
              style={{ width: renderedW, height: renderedH }}
              resizeMode="stretch"
              pointerEvents="none"
              onLoad={handleImageLoad}
            />

            {!hasValidDimensions && (
              <View style={[styles.skeleton, { backgroundColor: colors.background }]}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.skeletonText, { color: colors.textSecondary }]}>
                  Loading page…
                </Text>
              </View>
            )}

            {hasValidDimensions && (
              <Pressable style={StyleSheet.absoluteFill} onPress={handleBlankTap} />
            )}

            {hasValidDimensions &&
              sortedPageFields.map((field, idx) => (
                <PrepareFieldOverlay
                  key={field.id}
                  field={field}
                  pageFields={currentPageFields}
                  selectedFieldIds={selectedFieldIds}
                  renderedW={renderedW}
                  renderedH={renderedH}
                  isSelected={selectedFieldIds.includes(field.id)}
                  isPrimary={field.id === primarySelectedFieldId}
                  zIndex={100 + idx}
                  zoomLevel={zoomLevel}
                  overlayRenderVersion={overlayRenderVersion}
                  gestureLock={gestureLock}
                  setGestureLocked={setGestureLockedWithScroll}
                  groupDragX={groupDragX}
                  groupDragY={groupDragY}
                  isGroupDragging={isGroupDragging}
                  onSelect={selectField}
                  onDragEnd={commitDrag}
                  onResizeEnd={commitResize}
                  onDelete={softDeletePrimary}
                  fillMode={fillMode}
                  fieldValue={fieldValues[field.id]}
                  onValueChange={onFieldValueChange}
                  onSignatureRequest={onSignatureRequest}
                  onTextFieldFocus={handleTextFieldFocus}
                  onDateFieldPress={onDateFieldPress}
                />
              ))}

            {showDebug && <AlignmentDebugOverlay overlays={debugOverlays} />}
          </View>
        </GestureDetector>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  pageContainer: {
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    backgroundColor: '#fff',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 400,
  },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 50,
  },
  skeletonText: { fontSize: 13 },
});
