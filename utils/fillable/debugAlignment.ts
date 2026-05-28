/**
 * DEBUG_SIGNATURE_ALIGNMENT visual diff tool (dev/QA only).
 *
 * When enabled, renders colored outlines on field rects during prepare and fill
 * to verify that prepare, fill, and composited output all agree.
 *
 * Not required for v1 ship — implement during Phase 6/7 QA.
 * Enable via Config.DEBUG_SIGNATURE_ALIGNMENT or __DEV__ flag.
 */

import type { NormalizedRect, PixelRect } from './types';
import { fieldToPixelRect } from './transforms';

export interface AlignmentOverlay {
  fieldId: string;
  pixelRect: PixelRect;
  source: 'prepare' | 'fill' | 'composite';
  color: string;
}

const SOURCE_COLORS = {
  prepare: 'rgba(37,99,235,0.7)',    // blue — prepare editor
  fill: 'rgba(220,38,38,0.7)',        // red — fill renderer
  composite: 'rgba(5,150,105,0.7)',   // green — composited output
};

/**
 * Build debug overlay descriptors for a set of normalized rects.
 * These are rendered as absolute-positioned thin borders on top of the page.
 */
export function buildAlignmentOverlays(
  rects: Array<{ id: string; rect: NormalizedRect }>,
  renderedW: number,
  renderedH: number,
  source: keyof typeof SOURCE_COLORS,
): AlignmentOverlay[] {
  return rects.map(({ id, rect }) => ({
    fieldId: id,
    pixelRect: fieldToPixelRect(rect, renderedW, renderedH),
    source,
    color: SOURCE_COLORS[source],
  }));
}

/**
 * Returns true if debug alignment mode is active.
 * Check this before rendering any alignment overlays.
 */
export function isDebugAlignmentEnabled(): boolean {
  return __DEV__ && typeof process !== 'undefined' &&
    process.env['EXPO_PUBLIC_DEBUG_ALIGNMENT'] === '1';
}
