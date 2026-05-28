/**
 * Coordinate transform functions — the ONLY authorized conversions.
 *
 * All overlay math uses layout-space pixels (RN dp).
 * Never mix PixelRatio.get() / physical bitmap pixels into overlay positioning.
 * DPR conversion occurs only at raster export boundaries (view-shot / compositing).
 *
 * Approved public API (no other component may compute field positions):
 *   fieldToPixelRect(normalized, renderedW, renderedH) → PixelRect
 *   pixelToNormalized(left, top, renderedW, renderedH) → { x, y }
 *   computeRenderedSize(pageDim, fitScale, zoomLevel) → { renderedW, renderedH }
 *   placeFieldAtTap(tapX, tapY, renderedW, renderedH, defaultW, defaultH) → NormalizedRect
 *   placeFieldDefault(defaultW, defaultH, stackIndex) → NormalizedRect
 */

import type { NormalizedRect, PixelRect, PdfSpace } from './types';
import { PASTE_OFFSET } from './constants';
import { normalizeCoord, enforceFieldBounds } from './constraints';
import type { WizardField } from '../../types/signature';

/**
 * Convert a normalized rect to absolute layout-pixel coordinates
 * within a fixed container of renderedW × renderedH.
 */
export function fieldToPixelRect(
  norm: NormalizedRect,
  renderedW: number,
  renderedH: number,
): PixelRect {
  return {
    left: norm.x * renderedW,
    top: norm.y * renderedH,
    width: norm.w * renderedW,
    height: norm.h * renderedH,
  };
}

/**
 * Convert a layout-pixel point (top-left of a field) back to normalized coords.
 * Used when gesture ends to persist final position.
 */
export function pixelToNormalized(
  left: number,
  top: number,
  renderedW: number,
  renderedH: number,
): { x: number; y: number } {
  return {
    x: normalizeCoord(left / renderedW),
    y: normalizeCoord(top / renderedH),
  };
}

/**
 * Compute the rendered page dimensions in layout pixels.
 * renderedW = pageW * fitScale * zoomLevel
 * renderedH = pageH * fitScale * zoomLevel
 */
export function computeRenderedSize(
  pageDim: PdfSpace,
  fitScale: number,
  zoomLevel: number,
): { renderedW: number; renderedH: number } {
  const scale = fitScale * zoomLevel;
  return {
    renderedW: pageDim.width * scale,
    renderedH: pageDim.height * scale,
  };
}

/**
 * Place a new field centered on the tap point, clamped to page bounds.
 * Returns a normalized rect ready for enforceFieldBounds.
 */
export function placeFieldAtTap(
  tapX: number,
  tapY: number,
  renderedW: number,
  renderedH: number,
  defaultW: number,
  defaultH: number,
): NormalizedRect {
  const cx = tapX / renderedW;
  const cy = tapY / renderedH;
  const x = normalizeCoord(cx - defaultW / 2);
  const y = normalizeCoord(cy - defaultH / 2);
  return enforceFieldBounds({ x, y, w: defaultW, h: defaultH });
}

/**
 * Default placement for a newly added field — upper-center of the page with
 * a small diagonal stack offset so repeated adds remain visible.
 */
export function placeFieldDefault(
  defaultW: number,
  defaultH: number,
  stackIndex: number,
): NormalizedRect {
  const offset = (stackIndex % 6) * PASTE_OFFSET;
  const x = normalizeCoord(0.5 - defaultW / 2 + offset);
  const y = normalizeCoord(0.38 - defaultH / 2 + offset);
  return enforceFieldBounds({ x, y, w: defaultW, h: defaultH });
}

/**
 * Build a new WizardField at the default stacked position on a page.
 */
export function buildFieldAtDefault(
  id: string,
  type: string,
  label: string,
  page: number,
  defaultW: number,
  defaultH: number,
  stackIndex: number,
): WizardField {
  const rect = placeFieldDefault(defaultW, defaultH, stackIndex);
  return {
    id,
    type,
    label,
    required: false,
    page,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
  };
}

/**
 * Build a new WizardField at a tap position.
 */
export function buildFieldAtTap(
  id: string,
  type: string,
  label: string,
  page: number,
  tapX: number,
  tapY: number,
  renderedW: number,
  renderedH: number,
  defaultW: number,
  defaultH: number,
): WizardField {
  const rect = placeFieldAtTap(tapX, tapY, renderedW, renderedH, defaultW, defaultH);
  return {
    id,
    type,
    label,
    required: false,
    page,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
  };
}
