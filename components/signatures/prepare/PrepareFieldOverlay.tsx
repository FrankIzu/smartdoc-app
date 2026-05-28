/**
 * PrepareFieldOverlay — single draggable/resizable field in the prepare editor.
 *
 * Architecture:
 * - Uses RNGH PanGestureHandler for drag and resize
 * - Visual movement during drag uses Reanimated shared values (no React churn)
 * - React state committed only on gesture end
 * - gestureLock set true on pan grant, false on end
 * - Render token compared at gesture start; stale events discarded
 * - Affordances (handles, delete ×) scale with zoom, clamped 14–28px
 * - hitSlop 8px on all interactive affordances
 *
 * NOTE: All hooks must be called unconditionally (Rules of Hooks).
 * Null-guard is done in the return, not before hooks.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { WizardField } from '../../../types/signature';
import {
  fieldToPixelRect,
  FIELD_COLORS,
  FIELD_ICONS,
  FIELD_DEFAULTS,
  RESIZE_HANDLE_MIN,
  RESIZE_HANDLE_MAX,
  DELETE_BUTTON_MIN,
  DELETE_BUTTON_MAX,
  FIELD_LABEL_FONT_MIN,
  FIELD_LABEL_FONT_MAX,
  HIT_SLOP,
  clamp,
  snapshotRects,
} from '../../../utils/fillable';
import type { FieldType } from '../../../types/signature';
import { fieldImageUri } from '../../../utils/signatureRuntime';
import { formatFillDate } from '../../../utils/fillDate';

interface Props {
  field: WizardField;
  pageFields: WizardField[];
  selectedFieldIds: string[];
  renderedW: number;
  renderedH: number;
  isSelected: boolean;
  isPrimary: boolean;
  zIndex: number;
  zoomLevel: number;
  overlayRenderVersion: string;
  gestureLock: React.MutableRefObject<boolean>;
  setGestureLocked: (locked: boolean) => void;
  onSelect: (fieldId: string, multi: boolean) => void;
  onDragEnd: (
    fieldIds: string[],
    dxPx: number,
    dyPx: number,
    before: Record<string, { x: number; y: number; w: number; h: number }>,
  ) => void;
  onResizeEnd: (
    fieldId: string,
    dwPx: number,
    dhPx: number,
    before: Record<string, { x: number; y: number; w: number; h: number }>,
  ) => void;
  onDelete: () => void;
  /** Shared across overlays so multi-select drag moves all selected fields together. */
  groupDragX: SharedValue<number>;
  groupDragY: SharedValue<number>;
  isGroupDragging: SharedValue<boolean>;
  /** When true, fields accept fill values (text, signature, checkbox) instead of prepare labels only. */
  fillMode?: boolean;
  fieldValue?: unknown;
  onValueChange?: (fieldId: string, value: unknown) => void;
  onSignatureRequest?: (fieldId: string, label: string) => void;
  onTextFieldFocus?: (fieldId: string) => void;
  onDateFieldPress?: (fieldId: string, currentValue?: string) => void;
}

function affordanceSize(base: number, zoom: number, min: number, max: number): number {
  return clamp(base / zoom, min, max);
}

export default function PrepareFieldOverlay({
  field,
  pageFields,
  selectedFieldIds,
  renderedW,
  renderedH,
  isSelected,
  isPrimary,
  zIndex,
  zoomLevel,
  overlayRenderVersion,
  gestureLock,
  setGestureLocked,
  onSelect,
  onDragEnd,
  onResizeEnd,
  onDelete,
  groupDragX,
  groupDragY,
  isGroupDragging,
  fillMode = false,
  fieldValue,
  onValueChange,
  onSignatureRequest,
  onTextFieldFocus,
  onDateFieldPress,
}: Props) {
  // ── All hooks must be called unconditionally ──────────────────────────────
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scaleW = useSharedValue(0);
  const scaleH = useSharedValue(0);
  const isLocked = useSharedValue(false);
  const capturedVersion = useRef('');
  const beforeRects = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const dragIdsRef = useRef<string[]>([field.id]);
  const [isEditingText, setIsEditingText] = useState(false);

  const resolveDragIds = useCallback((): string[] => {
    if (isSelected && selectedFieldIds.length > 1) {
      return selectedFieldIds.filter((id) => pageFields.some((f) => f.id === id));
    }
    return [field.id];
  }, [isSelected, selectedFieldIds, pageFields, field.id]);

  const acquireLock = useCallback(() => {
    if (gestureLock.current) {
      isLocked.value = false;
      return false;
    }
    setGestureLocked(true);
    isLocked.value = true;
    isGroupDragging.value = true;
    const dragIds = resolveDragIds();
    dragIdsRef.current = dragIds;
    capturedVersion.current = overlayRenderVersion;
    beforeRects.current = snapshotRects(pageFields, dragIds);
    return true;
  }, [gestureLock, isLocked, isGroupDragging, overlayRenderVersion, pageFields, resolveDragIds, setGestureLocked]);

  const releaseLock = useCallback(() => {
    setGestureLocked(false);
    isLocked.value = false;
    isGroupDragging.value = false;
    groupDragX.value = 0;
    groupDragY.value = 0;
  }, [setGestureLocked, isLocked, isGroupDragging, groupDragX, groupDragY]);

  const handleDragEnd = useCallback(
    (dxPx: number, dyPx: number) => {
      if (capturedVersion.current !== overlayRenderVersion) { releaseLock(); return; }
      releaseLock();
      onDragEnd(dragIdsRef.current, dxPx, dyPx, beforeRects.current);
    },
    [overlayRenderVersion, onDragEnd, releaseLock],
  );

  const handleResizeEnd = useCallback(
    (dwPx: number, dhPx: number) => {
      if (capturedVersion.current !== overlayRenderVersion) { releaseLock(); return; }
      releaseLock();
      onResizeEnd(field.id, dwPx, dhPx, beforeRects.current);
    },
    [field.id, overlayRenderVersion, onResizeEnd, releaseLock],
  );

  const handleTap = useCallback(() => {
    if (fillMode) {
      if (field.type === 'signature' || field.type === 'initials') {
        const hasSignature = fieldImageUri(fieldValue) != null;
        if (!hasSignature || isPrimary) {
          onSignatureRequest?.(
            field.id,
            field.label || (FIELD_DEFAULTS[field.type as FieldType]?.label ?? field.type),
          );
          return;
        }
        onSelect(field.id, false);
        return;
      }
      if (field.type === 'checkbox') {
        onValueChange?.(field.id, !Boolean(fieldValue));
        return;
      }
      if (field.type === 'date') {
        onDateFieldPress?.(
          field.id,
          typeof fieldValue === 'string' && fieldValue ? fieldValue : undefined,
        );
        return;
      }
    }
    onSelect(field.id, false);
  }, [field.id, field.label, field.type, fieldValue, fillMode, isPrimary, onSelect, onSignatureRequest, onDateFieldPress, onValueChange]);

  const handleLongPress = useCallback(() => {
    onSelect(field.id, true);
  }, [field.id, onSelect]);

  const dragDisabled = fillMode && field.type === 'text' && isEditingText;

  const dragGesture = Gesture.Pan()
    .enabled(!dragDisabled)
    .minDistance(6)
    .onStart(() => {
      'worklet';
      isLocked.value = true;
      translateX.value = 0;
      translateY.value = 0;
      groupDragX.value = 0;
      groupDragY.value = 0;
      runOnJS(acquireLock)();
    })
    .onUpdate((e) => {
      'worklet';
      if (!isLocked.value) return;
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      groupDragX.value = e.translationX;
      groupDragY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (!isLocked.value) return;
      const dx = e.translationX;
      const dy = e.translationY;
      translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      runOnJS(handleDragEnd)(dx, dy);
    })
    .onFinalize(() => {
      'worklet';
      translateX.value = 0;
      translateY.value = 0;
      runOnJS(releaseLock)();
    });

  const resizeGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      isLocked.value = true;
      scaleW.value = 0;
      scaleH.value = 0;
      runOnJS(acquireLock)();
    })
    .onUpdate((e) => {
      'worklet';
      if (!isLocked.value) return;
      scaleW.value = e.translationX;
      scaleH.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (!isLocked.value) return;
      const dw = e.translationX;
      const dh = e.translationY;
      scaleW.value = 0;
      scaleH.value = 0;
      runOnJS(handleResizeEnd)(dw, dh);
    })
    .onFinalize(() => {
      'worklet';
      scaleW.value = 0;
      scaleH.value = 0;
      runOnJS(releaseLock)();
    });

  const animatedFieldStyle = useAnimatedStyle(() => {
    const useGroup = isGroupDragging.value && isSelected;
    const tx = useGroup ? groupDragX.value : translateX.value;
    const ty = useGroup ? groupDragY.value : translateY.value;
    return {
      transform: [{ translateX: tx }, { translateY: ty }],
      width: (field.w != null && renderedW > 0 ? field.w * renderedW : 0) + scaleW.value,
      height: (field.h != null && renderedH > 0 ? field.h * renderedH : 0) + scaleH.value,
    };
  });

  // ── Guard: skip render if rect is incomplete ──────────────────────────────
  if (field.x == null || field.y == null || field.w == null || field.h == null) {
    return null;
  }

  const pixelRect = fieldToPixelRect(
    { x: field.x, y: field.y, w: field.w, h: field.h },
    renderedW,
    renderedH,
  );

  const color = FIELD_COLORS[(field.type as FieldType)] ?? '#2563EB';
  const iconName = FIELD_ICONS[(field.type as FieldType)] ?? 'document-outline';
  const handleSize = affordanceSize(20, zoomLevel, RESIZE_HANDLE_MIN, RESIZE_HANDLE_MAX);
  const deleteBtnSize = affordanceSize(24, zoomLevel, DELETE_BUTTON_MIN, DELETE_BUTTON_MAX);
  const fontSize = affordanceSize(11, zoomLevel, FIELD_LABEL_FONT_MIN, FIELD_LABEL_FONT_MAX);
  const fieldLabel = field.label || (FIELD_DEFAULTS[field.type as FieldType]?.label ?? field.type);
  const signatureImageUri = fillMode ? fieldImageUri(fieldValue) : null;

  const renderFillContent = () => {
    if (!fillMode) return null;

    if (field.type === 'text') {
      return (
        <TextInput
          style={[styles.fillTextInput, { color, fontSize }]}
          value={typeof fieldValue === 'string' ? fieldValue : ''}
          onChangeText={(t) => onValueChange?.(field.id, t)}
          placeholder={fieldLabel}
          placeholderTextColor={`${color}99`}
          multiline
          underlineColorAndroid="transparent"
          onFocus={() => {
            setIsEditingText(true);
            onSelect(field.id, false);
            onTextFieldFocus?.(field.id);
          }}
          onBlur={() => setIsEditingText(false)}
        />
      );
    }

    if (field.type === 'date') {
      const display =
        typeof fieldValue === 'string' && fieldValue.trim()
          ? fieldValue
          : formatFillDate(new Date());
      return (
        <Text style={[styles.fillDateText, { color, fontSize }]} numberOfLines={1}>
          {display}
        </Text>
      );
    }

    if (field.type === 'checkbox') {
      return (
        <Text style={{ fontSize: Math.max(fontSize + 4, 14), color }}>
          {Boolean(fieldValue) ? '☑' : '☐'}
        </Text>
      );
    }

    if (field.type === 'signature' || field.type === 'initials') {
      if (signatureImageUri) {
        return (
          <Image
            source={{ uri: signatureImageUri }}
            style={styles.fillSignatureImage}
            resizeMode="contain"
          />
        );
      }
      return (
        <Text style={[styles.fillSignHint, { color, fontSize }]}>
          Tap to {field.type === 'initials' ? 'initial' : 'sign'}
        </Text>
      );
    }

    return null;
  };

  const fillContent = renderFillContent();

  return (
    <Animated.View
      style={[
        styles.fieldRoot,
        { left: pixelRect.left, top: pixelRect.top, zIndex },
        animatedFieldStyle,
      ]}
    >
      <GestureDetector gesture={dragGesture}>
        <Animated.View
          style={[
            styles.fieldBody,
            {
              backgroundColor: 'transparent',
              borderColor: isSelected ? color : `${color}88`,
              borderWidth: isSelected ? 2 : 1.5,
              borderStyle: isSelected ? 'solid' : 'dashed',
              borderRadius: 4,
              width: '100%',
              height: '100%',
            },
          ]}
        >
          {fillContent ? (
            field.type === 'text' ? (
              <View style={styles.fieldContent}>{fillContent}</View>
            ) : (
              <TouchableOpacity
                style={styles.fieldContent}
                onPress={handleTap}
                onLongPress={handleLongPress}
                delayLongPress={400}
                activeOpacity={0.8}
                hitSlop={{ top: HIT_SLOP, bottom: HIT_SLOP, left: HIT_SLOP, right: HIT_SLOP }}
              >
                {fillContent}
              </TouchableOpacity>
            )
          ) : (
            <TouchableOpacity
              style={styles.fieldContent}
              onPress={handleTap}
              onLongPress={handleLongPress}
              delayLongPress={400}
              activeOpacity={0.8}
              hitSlop={{ top: HIT_SLOP, bottom: HIT_SLOP, left: HIT_SLOP, right: HIT_SLOP }}
            >
              <Ionicons
                name={iconName as keyof typeof Ionicons.glyphMap}
                size={Math.max(fontSize + 2, 10)}
                color={color}
              />
              <Text
                style={[styles.fieldLabel, { color, fontSize }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {fieldLabel}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Delete × — primary only */}
      {isPrimary && (
        <TouchableOpacity
          style={[
            styles.deleteBtn,
            {
              width: deleteBtnSize,
              height: deleteBtnSize,
              borderRadius: deleteBtnSize / 2,
              top: -deleteBtnSize / 2,
              right: -deleteBtnSize / 2,
              backgroundColor: '#EF4444',
            },
          ]}
          onPress={onDelete}
          hitSlop={{ top: HIT_SLOP, bottom: HIT_SLOP, left: HIT_SLOP, right: HIT_SLOP }}
        >
          <Ionicons name="close" size={deleteBtnSize * 0.55} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Resize handle — primary only */}
      {isPrimary && (
        <GestureDetector gesture={resizeGesture}>
          <View
            style={[
              styles.resizeHandle,
              {
                width: handleSize,
                height: handleSize,
                borderRadius: 3,
                bottom: -handleSize / 2,
                right: -handleSize / 2,
                backgroundColor: color,
              },
            ]}
            hitSlop={{ top: HIT_SLOP, bottom: HIT_SLOP, left: HIT_SLOP, right: HIT_SLOP }}
          >
            <Ionicons name="resize-outline" size={handleSize * 0.6} color="#fff" />
          </View>
        </GestureDetector>
      )}

      {/* Selection dot — non-primary selected */}
      {isSelected && !isPrimary && (
        <View style={[styles.selectedDot, { backgroundColor: color }]} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fieldRoot: {
    position: 'absolute',
  },
  fieldBody: {
    flex: 1,
    overflow: 'hidden',
  },
  fieldContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  fieldLabel: {
    fontWeight: '600',
    flexShrink: 1,
  },
  fillTextInput: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 4,
    paddingVertical: 2,
    textAlignVertical: 'center',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {} : { includeFontPadding: false }),
  },
  fillSignatureImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  fillSignHint: {
    fontWeight: '600',
    textAlign: 'center',
  },
  fillDateText: {
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
  },
  deleteBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  resizeHandle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  selectedDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 9,
  },
});
