/**
 * Zoom and fit-scale computation.
 *
 * fitScale = min(viewportW / pageW, viewportH / pageH, MAX_FIT_SCALE)
 * scaleVal = fitScale * zoomLevel  (range: 0.5–3)
 * renderedW = pageW * scaleVal
 * renderedH = pageH * scaleVal
 */

import type { PdfSpace } from './types';
import { MIN_ZOOM, MAX_ZOOM, MAX_FIT_SCALE, DEFAULT_ZOOM } from './constants';
import { clamp } from './constraints';

/**
 * Compute the fit scale that makes the page fill the viewport,
 * capped at MAX_FIT_SCALE to prevent over-scaling huge PDFs.
 */
export function computeFitScale(
  pageDim: PdfSpace,
  viewportW: number,
  viewportH: number,
): number {
  if (!pageDim.width || !pageDim.height || !viewportW || !viewportH) return 1;
  const scaleW = viewportW / pageDim.width;
  const scaleH = viewportH / pageDim.height;
  return Math.min(scaleW, scaleH, MAX_FIT_SCALE);
}

/**
 * Compute rendered pixel dimensions for the page.
 * This is the ONLY place that converts page→pixel.
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
 * Clamp a zoom level to the allowed range.
 */
export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

/**
 * Compute the new scroll offset to preserve the center of the viewport
 * when the zoom level changes.
 *
 * @param scrollX   Current horizontal scroll position
 * @param scrollY   Current vertical scroll position
 * @param viewportW Viewport width in layout px
 * @param viewportH Viewport height in layout px
 * @param oldRenderedW Page rendered width before zoom change
 * @param oldRenderedH Page rendered height before zoom change
 * @param newRenderedW Page rendered width after zoom change
 * @param newRenderedH Page rendered height after zoom change
 */
export function preserveScrollCenter(
  scrollX: number,
  scrollY: number,
  viewportW: number,
  viewportH: number,
  oldRenderedW: number,
  oldRenderedH: number,
  newRenderedW: number,
  newRenderedH: number,
): { newScrollX: number; newScrollY: number } {
  // Center of viewport in old content space
  const centerX = scrollX + viewportW / 2;
  const centerY = scrollY + viewportH / 2;
  // Normalized center (0..1) in old content
  const cx = centerX / oldRenderedW;
  const cy = centerY / oldRenderedH;
  // Translate to new content space
  const newScrollX = Math.max(0, cx * newRenderedW - viewportW / 2);
  const newScrollY = Math.max(0, cy * newRenderedH - viewportH / 2);
  return { newScrollX, newScrollY };
}

/** Step zoom in or out by a fixed increment. */
export function stepZoom(current: number, direction: 'in' | 'out'): number {
  const step = 0.25;
  return clampZoom(direction === 'in' ? current + step : current - step);
}

export { DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM };
