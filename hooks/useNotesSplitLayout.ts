import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export const NOTES_SPLIT_BREAKPOINT = 780;
export const NOTES_RESIZE_BREAKPOINT = 1024;
export const NOTES_SIDEBAR_MIN = 280;
export const NOTES_SIDEBAR_MAX = 360;
export const NOTES_EDITOR_MIN = 500;

export function computeDefaultSidebarWidth(screenWidth: number): number {
  return Math.min(Math.max(screenWidth * 0.3, NOTES_SIDEBAR_MIN), NOTES_SIDEBAR_MAX);
}

export function clampSidebarWidth(width: number, screenWidth: number): number {
  const maxByEditor = screenWidth - NOTES_EDITOR_MIN;
  const maxAllowed = Math.min(NOTES_SIDEBAR_MAX, maxByEditor);
  return Math.min(Math.max(width, NOTES_SIDEBAR_MIN), maxAllowed);
}

export function useNotesSplitLayout() {
  const { width } = useWindowDimensions();

  return useMemo(
    () => ({
      screenWidth: width,
      isSplit: width >= NOTES_SPLIT_BREAKPOINT,
      canResizeSidebar: width >= NOTES_RESIZE_BREAKPOINT,
      defaultSidebarWidth: computeDefaultSidebarWidth(width),
    }),
    [width],
  );
}
